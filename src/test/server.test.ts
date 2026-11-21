import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import * as crypto from "crypto";
import { emptyState, PackIndex, PackMod, prefetch, syncPack } from "../core/pack";
import {
  acceptEula, classifyServerUpdate, eulaAccepted, readProperties, serverFingerprint, serverMods, serverOverrides,
  ServerLayout, worldFolders, writeProperties,
} from "../core/server";
import { backupFolders } from "../core/backup";
import { decodeLine, LaunchSpec, ManagerDeps, Notice, ServerManager, UpdateCheck } from "../server-launcher/manager";

const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mmcs-"));

function mod(name: string, client: PackMod["client"], server: PackMod["server"], body = name, kind?: "resourcepack"): PackMod {
  return {
    projectId: name, slug: name, name, versionId: name, versionNumber: "1", versionType: "release", gameVersions: ["26.3"],
    fileName: `${name}.${kind ? "zip" : "jar"}`, url: `http://x/${name}`, sha1: sha1(body), sha512: "", size: body.length,
    client, server, ...(kind ? { kind } : {}),
  };
}
const base = (over: Partial<PackIndex> = {}): PackIndex => ({
  formatVersion: 1, name: "t", packVersion: "26.3.0.0", minecraft: "26.3", fabricLoader: "0.20.1", publishedAt: "", changelog: [],
  mods: [mod("sodium", "required", "unsupported"), mod("lithium", "optional", "optional"), mod("api", "required", "required"),
    mod("serveronly", "unsupported", "required"), mod("sides", "required", "unknown"), mod("rp", "required", "required", "rp", "resourcepack")],
  overrides: [
    { path: "config/a.toml", sha1: "1", size: 1, url: "" },
    { path: "resourcepacks/x.zip", sha1: "2", size: 1, url: "" },
    { path: "shaderpacks/y.zip", sha1: "3", size: 1, url: "" },
  ],
  ...over,
});

test("서버 모드 고르기: 클라이언트 전용·리소스팩 제외", () => {
  const idx = base();
  assert.deepEqual(serverMods(idx).map((m) => m.name), ["lithium", "api", "serveronly", "sides"]);
  assert.deepEqual(serverOverrides(idx).map((o) => o.path), ["config/a.toml"]);
});

test("서버 업데이트 판정: 클라이언트 전용만 바뀌면 재시작 안 함", () => {
  const v1 = base();
  const state = { ...emptyState(), packVersion: "26.3.0.0", minecraft: "26.3", fabricLoader: "0.20.1", fingerprint: serverFingerprint(v1) };
  assert.equal(classifyServerUpdate(emptyState(), v1), "install");
  assert.equal(classifyServerUpdate(state, v1), "none");

  // 클라이언트 전용 모드(sodium)·리소스팩·셰이더만 바뀜
  const clientOnly = base({ packVersion: "26.3.0.1", mods: v1.mods.map((m) => (m.name === "sodium" ? { ...m, sha1: "new" } : m)),
    overrides: v1.overrides.map((o) => (o.path.startsWith("config") ? o : { ...o, sha1: "new" })) });
  assert.equal(classifyServerUpdate(state, clientOnly), "pack-only");

  // 서버 모드가 바뀜
  const serverSide = base({ packVersion: "26.3.0.1", mods: v1.mods.map((m) => (m.name === "api" ? { ...m, sha1: "new" } : m)) });
  assert.equal(classifyServerUpdate(state, serverSide), "restart");
  // 설정 파일이 바뀜
  assert.equal(classifyServerUpdate(state, base({ packVersion: "26.3.0.1", overrides: [{ path: "config/a.toml", sha1: "9", size: 1, url: "" }] })), "restart");
  // Fabric이 바뀜
  assert.equal(classifyServerUpdate(state, base({ packVersion: "26.3.0.1", fabricLoader: "0.20.2" })), "restart");
  // 마크 버전
  assert.equal(classifyServerUpdate(state, base({ packVersion: "26.4.0.0", minecraft: "26.4" })), "minecraft-upgrade");
  assert.equal(classifyServerUpdate({ ...state, minecraft: "26.5" }, v1), "downgrade");
});

test("server.properties 값만 바꾸고 나머지는 그대로 · EULA", () => {
  const dir = tmp();
  try {
    const f = path.join(dir, "server.properties");
    fs.writeFileSync(f, "#Minecraft server properties\nmotd=내 서버\nserver-port=25565\nlevel-name=mmworld\n");
    writeProperties(f, { "server-port": "25570", "max-players": "10" });
    assert.equal(fs.readFileSync(f, "utf8"), "#Minecraft server properties\nmotd=내 서버\nserver-port=25570\nlevel-name=mmworld\nmax-players=10\n");
    assert.equal(readProperties(f)["server-port"], "25570");
    assert.deepEqual(worldFolders(dir), [path.join(dir, "mmworld")]);

    assert.equal(eulaAccepted(dir), false);
    fs.writeFileSync(path.join(dir, "eula.txt"), "eula=false\n");
    assert.equal(eulaAccepted(dir), false);
    acceptEula(dir);
    assert.equal(eulaAccepted(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function serve(files: Record<string, string>): Promise<{ url: string; hits: string[]; close: () => void }> {
  return new Promise((resolve) => {
    const hits: string[] = [];
    const s = http.createServer((req, res) => {
      const p = req.url!.split("?")[0];
      hits.push(p);
      const body = files[p];
      if (body === undefined) { res.writeHead(404); return res.end(); }
      res.writeHead(200);
      res.end(body);
    });
    s.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}`, hits, close: () => s.close() }));
  });
}

test("서버 동기화: 서버 모드만 · 미리 받은 파일 사용 · 월드 백업", async () => {
  const root = tmp();
  const srv = await serve({ "/api": "API", "/lithium": "LI", "/cfg": "c=1" });
  try {
    const layout = new ServerLayout(path.join(root, "data"), path.join(root, "server"));
    const m = (n: string, body: string, c: PackMod["client"], s: PackMod["server"]) => ({ ...mod(n, c, s, body), url: `${srv.url}/${n}` });
    const idx = base({
      mods: [m("api", "API", "required", "required"), m("lithium", "LI", "optional", "optional"), m("sodium", "SO", "required", "unsupported")],
      overrides: [{ path: "config/a.toml", sha1: sha1("c=1"), size: 3, url: `${srv.url}/cfg` }, { path: "resourcepacks/r.zip", sha1: "x", size: 1, url: `${srv.url}/none` }],
    });
    // 켜 둔 동안 미리 받기
    await prefetch([...serverMods(idx), ...serverOverrides(idx)], layout.fileCache);
    const before = srv.hits.length;
    const state = await syncPack(layout, idx, emptyState(), undefined, { mods: serverMods(idx), overrides: serverOverrides(idx), cacheDir: layout.fileCache });
    assert.equal(srv.hits.length, before, "미리 받은 파일을 복사 (다시 받지 않음)");
    assert.deepEqual(fs.readdirSync(layout.mods).sort(), ["api.jar", "lithium.jar"], "클라이언트 전용(sodium) 제외");
    assert.equal(fs.existsSync(path.join(layout.serverDir, "resourcepacks")), false, "리소스팩은 서버에 안 넣음");
    assert.equal(fs.readFileSync(path.join(layout.serverDir, "config/a.toml"), "utf8"), "c=1");
    assert.ok(layout.state.startsWith(layout.serverDir), "상태 파일은 서버 폴더 안");
    assert.equal(state.packVersion, "26.3.0.0");

    fs.mkdirSync(path.join(layout.serverDir, "world", "region"), { recursive: true });
    fs.writeFileSync(path.join(layout.serverDir, "world", "level.dat"), "W");
    const b = await backupFolders(layout, worldFolders(layout.serverDir), "a-to-b");
    assert.ok(b && fs.readFileSync(path.join(b, "world", "level.dat"), "utf8") === "W");
    assert.ok(b!.startsWith(path.join(layout.serverDir, "backups")));
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("콘솔 글자: UTF-8 · CP949 모두 읽기", () => {
  assert.equal(decodeLine(Buffer.from("안녕 server", "utf8")), "안녕 server");
  // "한글" in CP949
  assert.equal(decodeLine(Buffer.from([0xc7, 0xd1, 0xb1, 0xdb])), "한글");
});

// ---- 서버 관리 (가짜 서버 프로세스) ----

const FAKE = path.join(__dirname, "..", "..", "src", "test", "fake-server.js");

interface Harness {
  m: ServerManager;
  notices: Notice[];
  lines: string[];
  commands: () => string[];
  calls: string[];
  setCheck: (c: UpdateCheck) => void;
  setVersion: (v: string) => void;
  setMode: (mode: string) => void;
  cleanup: () => void;
}

function harness(): Harness {
  const dir = tmp();
  const log = path.join(dir, "cmds.txt");
  let version = "26.3.0.0";
  let mode = "normal";
  let check: UpdateCheck = { kind: "none" };
  const calls: string[] = [];
  const deps: ManagerDeps = {
    prepare: async (): Promise<LaunchSpec> => {
      calls.push(`prepare:${version}`);
      return { command: process.execPath, args: [FAKE], cwd: dir, packVersion: version, minecraft: "26.3" };
    },
    check: async () => check,
    prefetch: async () => { calls.push("prefetch"); },
    recordPackOnly: async () => { calls.push("record"); },
    backup: async (label) => { calls.push(`backup:${label}`); return path.join(dir, "backups", label); },
    text: (key, vars) => ({ announce: `업데이트 ${vars?.sec}초 후`, countdown: `${vars?.sec}초`, kick: "서버 업데이트가 있습니다. MMCraft를 재실행하여 업데이트를 진행해 주세요." })[key],
    spawn: (cmd, args, opts) => require("child_process").spawn(cmd, args, { ...opts, env: { ...process.env, FAKE_LOG: log, FAKE_MODE: mode } }),
  };
  const m = new ServerManager(deps, { countdownSec: 2, announceAt: [2, 1], restartDelayMs: 50, crashWindowMs: 60_000, maxCrashes: 3, stopTimeoutMs: 5000, retryDelayMs: 50, maxRetries: 2 });
  const notices: Notice[] = [];
  const lines: string[] = [];
  m.on("notice", (n) => notices.push(n));
  m.on("line", (l) => lines.push(l));
  return {
    m, notices, lines, calls,
    commands: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
    setCheck: (c) => (check = c),
    setVersion: (v) => (version = v),
    setMode: (x) => (mode = x),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

async function until(fn: () => boolean, ms = 8000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("시간 초과");
    await new Promise((r) => setTimeout(r, 20));
  }
}

test("시작 · 접속자 목록 · 명령어 · 정지하면 재시작 안 함", async () => {
  const h = harness();
  try {
    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.m.command("join Steve");
    h.m.command("/join Alex");
    h.m.command("chat Bob"); // 채팅 "<Bob> Bob joined the game"은 접속으로 안 봄
    h.m.command("korean");
    await until(() => h.lines.some((l) => l.includes("안녕하세요")));
    await until(() => h.m.snapshot().players.length === 2);
    assert.deepEqual(h.m.snapshot().players, ["Alex", "Steve"]);
    await h.m.stop();
    assert.equal(h.m.snapshot().phase, "stopped");
    assert.deepEqual(h.m.snapshot().players, []);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(h.m.snapshot().phase, "stopped", "직접 정지 → 재시작 안 함");
    assert.ok(h.commands().includes("stop"));
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("명령어 stop · 게임 안 /stop도 운영자 정지로 봄", async () => {
  const h = harness();
  try {
    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.m.command("stop");
    await until(() => h.m.snapshot().phase === "stopped");
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(h.m.snapshot().phase, "stopped");

    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.m.command("opstop");
    await until(() => h.m.snapshot().phase === "stopped");
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(h.m.snapshot().phase, "stopped");
    assert.ok(!h.notices.some((n) => n.key === "n.crashed"));
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("크래시 → 자동 재시작, 연속 크래시면 멈추고 알림", async () => {
  const h = harness();
  try {
    h.setMode("crash-after-start");
    await h.m.start();
    await until(() => h.notices.some((n) => n.key === "n.crashLoop"));
    assert.equal(h.notices.filter((n) => n.key === "n.crashed").length, 2, "2번 재시작 후");
    assert.equal(h.m.snapshot().phase, "stopped");
    assert.equal(h.m.snapshot().halted, true);

    // 고쳐진 뒤 직접 시작하면 다시 정상
    h.setMode("normal");
    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    assert.equal(h.m.snapshot().halted, false);
    // 한 번 크래시 → 재시작해서 다시 실행 중
    h.setMode("crash-after-start");
    const crashed = h.notices.filter((n) => n.key === "n.crashed").length;
    h.m.command("stop"); // 정상 정지 후
    await until(() => h.m.snapshot().phase === "stopped");
    assert.equal(h.notices.filter((n) => n.key === "n.crashed").length, crashed);
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("업데이트: 미리 받기 → 공지·카운트다운 → 전원 킥 → 정지 → 백업 → 새 버전으로 재시작", async () => {
  const h = harness();
  try {
    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.m.command("join Steve");
    await until(() => h.m.snapshot().players.length === 1);

    h.setCheck({ kind: "restart", from: "26.3.0.0", to: "26.3.0.1" });
    h.setVersion("26.3.0.1");
    const countdowns: number[] = [];
    h.m.on("phase", (s) => { if (s.countdown) countdowns.push(s.countdown); });
    await h.m.checkForUpdate();
    await until(() => h.m.snapshot().phase === "running" && h.m.snapshot().packVersion === "26.3.0.1");

    const cmds = h.commands();
    const iAnnounce = cmds.findIndex((c) => c.startsWith("tellraw @a") && c.includes("업데이트 2초 후"));
    const iCount = cmds.findIndex((c) => c.startsWith("tellraw @a") && c.includes("1초"));
    const iKick = cmds.indexOf("kick @a 서버 업데이트가 있습니다. MMCraft를 재실행하여 업데이트를 진행해 주세요.");
    const iStop = cmds.indexOf("stop");
    assert.ok(iAnnounce >= 0 && iCount > iAnnounce && iKick > iCount && iStop > iKick, cmds.join(" | "));
    assert.ok(!cmds.some((c) => c.startsWith("ban")), "밴 아님");
    assert.deepEqual(countdowns.slice(0, 2), [2, 1]);
    assert.deepEqual(h.calls, ["prepare:26.3.0.0", "prefetch", "backup:26.3.0.0-to-26.3.0.1", "prepare:26.3.0.1"]);
    assert.ok(h.notices.some((n) => n.key === "n.updated"));
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("업데이트: 접속자가 없으면 카운트다운·킥 없이 바로", async () => {
  const h = harness();
  try {
    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.setCheck({ kind: "minecraft-upgrade", from: "26.3.0.0", to: "26.4.0.0", fromMc: "26.3", toMc: "26.4" });
    h.setVersion("26.4.0.0");
    await h.m.checkForUpdate();
    await until(() => h.m.snapshot().packVersion === "26.4.0.0" && h.m.snapshot().phase === "running");
    assert.ok(!h.commands().some((c) => c.startsWith("kick") || c.startsWith("tellraw")));
    assert.ok(h.calls.includes("backup:26.3.0.0-to-26.4.0.0"));
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("업데이트: 카운트다운 중 정지를 누르면 업데이트하지 않고 정지", async () => {
  const h = harness();
  try {
    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.m.command("join Steve");
    await until(() => h.m.snapshot().players.length === 1);
    h.setCheck({ kind: "restart", from: "26.3.0.0", to: "26.3.0.1" });
    const p = h.m.checkForUpdate();
    await until(() => h.m.snapshot().countdown !== undefined);
    await h.m.stop();
    await p;
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(h.m.snapshot().phase, "stopped");
    assert.ok(!h.calls.some((c) => c.startsWith("backup")));
    assert.ok(!h.commands().some((c) => c.startsWith("kick")));
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("서버 쪽 변경 없는 팩 업데이트는 재시작 안 함 · 꺼져 있으면 업데이트하지 않음", async () => {
  const h = harness();
  try {
    h.setCheck({ kind: "restart", from: "a", to: "b" });
    await h.m.checkForUpdate();
    assert.equal(h.m.snapshot().phase, "stopped", "꺼져 있으면 켜지 않음 (다음 시작 때 맞춤)");
    assert.deepEqual(h.calls, []);

    await h.m.start();
    await until(() => h.m.snapshot().phase === "running");
    h.setCheck({ kind: "pack-only", from: "26.3.0.0", to: "26.3.0.1" });
    await h.m.checkForUpdate();
    assert.equal(h.m.snapshot().packVersion, "26.3.0.1");
    assert.ok(!h.commands().includes("stop"));
    assert.deepEqual(h.calls, ["prepare:26.3.0.0", "record"]);
  } finally {
    await h.m.shutdown();
    h.cleanup();
  }
});

test("서버 전용 모드: 서버에는 설치, 플레이어 목록에는 없음", async () => {
  const { clientMods } = await import("../core/pack");
  const idx = base({ serverOnlyMods: [{ ...mod("chunky", "optional", "optional"), serverOnly: true }] });
  assert.ok(serverMods(idx).some((m) => m.name === "chunky"));
  assert.ok(!clientMods(idx).some((m) => m.name === "chunky"));
  // 지문에도 들어가서 서버 전용 모드만 바뀌어도 재시작
  const state = { ...emptyState(), packVersion: "26.3.0.0", minecraft: "26.3", fabricLoader: "0.20.1", fingerprint: serverFingerprint(idx) };
  const changed = base({ packVersion: "26.3.0.1", serverOnlyMods: [{ ...mod("chunky", "optional", "optional", "new"), serverOnly: true }] });
  assert.equal(classifyServerUpdate(state, changed), "restart");
  // 팩 원본(mods.json)처럼 한 목록에 섞여 있어도 서버 전용만 플레이어에서 빠짐
  const mixed = base({ mods: [...base().mods, { ...mod("fastback", "unsupported", "required"), serverOnly: true }] });
  assert.ok(!clientMods(mixed).some((m) => m.name === "fastback"));
  assert.ok(serverMods(mixed).some((m) => m.name === "fastback"));
});
