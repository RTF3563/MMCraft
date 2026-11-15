import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import * as crypto from "crypto";
import { isAllowed, nativeClassifierMatches } from "../core/rules";
import { Layout, mavenPath } from "../core/paths";
import { compareMcVersions, mergeVersion } from "../core/minecraft";
import { buildLaunchCommand } from "../core/launch";
import { classifyUpdate, emptyState, PackIndex, syncPack } from "../core/pack";
import { backupSaves } from "../core/backup";

const WIN = { os: "windows" as const, arch: "x64" as const };
const LINUX = { os: "linux" as const, arch: "x64" as const };

test("rules: OS 판정", () => {
  assert.equal(isAllowed(undefined, WIN), true);
  assert.equal(isAllowed([{ action: "allow", os: { name: "osx" } }], WIN), false);
  assert.equal(isAllowed([{ action: "allow" }, { action: "disallow", os: { name: "windows" } }], WIN), false);
  assert.equal(isAllowed([{ action: "allow", features: { is_demo_user: true } }], WIN, {}), false);
  assert.equal(isAllowed([{ action: "allow", os: { name: "windows", arch: "x86" } }], WIN), false);
});

test("rules: natives 분류자", () => {
  assert.equal(nativeClassifierMatches("natives-windows", WIN), true);
  assert.equal(nativeClassifierMatches("natives-windows-arm64", WIN), false);
  assert.equal(nativeClassifierMatches("natives-windows-x86", WIN), false);
  assert.equal(nativeClassifierMatches("natives-linux", WIN), false);
  assert.equal(nativeClassifierMatches("natives-linux", LINUX), true);
  assert.equal(nativeClassifierMatches("natives-macos-arm64", { os: "osx", arch: "arm64" }), true);
});

test("maven 경로", () => {
  assert.equal(mavenPath("net.fabricmc:fabric-loader:0.20.1"), "net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar");
  assert.equal(mavenPath("org.lwjgl:lwjgl:3.3.3:natives-windows"), "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar");
  assert.equal(mavenPath("a.b:c:1@zip"), "a/b/c/1/c-1.zip");
});

test("마크 버전 비교", () => {
  assert.ok(compareMcVersions("26.4", "26.3") > 0);
  assert.ok(compareMcVersions("26.10", "26.9") > 0);
  assert.ok(compareMcVersions("26.3.1", "26.3") > 0);
  assert.ok(compareMcVersions("1.21.11", "26.1") < 0);
  assert.equal(compareMcVersions("26.3", "26.3"), 0);
});

const vanilla = {
  id: "26.3",
  mainClass: "net.minecraft.client.main.Main",
  arguments: {
    game: ["--username", "${auth_player_name}", "--gameDir", "${game_directory}", "--accessToken", "${auth_access_token}",
      { rules: [{ action: "allow", features: { is_demo_user: true } }], value: "--demo" },
      { rules: [{ action: "allow", features: { has_custom_resolution: true } }], value: ["--width", "${resolution_width}", "--height", "${resolution_height}"] }],
    jvm: [{ rules: [{ action: "allow", os: { name: "osx" } }], value: ["-XstartOnFirstThread"] },
      "-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
  },
  libraries: [
    { name: "org.ow2.asm:asm:9.6", downloads: { artifact: { path: "org/ow2/asm/asm/9.6/asm-9.6.jar", url: "https://x/asm96", sha1: "a", size: 1 } } },
    { name: "org.lwjgl:lwjgl:3.3.3", downloads: { artifact: { path: "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar", url: "https://x/l", sha1: "b", size: 1 } } },
    { name: "org.lwjgl:lwjgl:3.3.3:natives-windows", downloads: { artifact: { path: "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar", url: "https://x/ln", sha1: "c", size: 1 } }, rules: [{ action: "allow", os: { name: "windows" } }] },
    { name: "org.lwjgl:lwjgl:3.3.3:natives-windows-arm64", downloads: { artifact: { path: "p", url: "https://x/la", sha1: "d", size: 1 } }, rules: [{ action: "allow", os: { name: "windows" } }] },
    { name: "org.lwjgl:lwjgl:3.3.3:natives-linux", downloads: { artifact: { path: "q", url: "https://x/lx", sha1: "e", size: 1 } }, rules: [{ action: "allow", os: { name: "linux" } }] },
  ],
  downloads: { client: { url: "https://x/client.jar", sha1: "f", size: 1 } },
  assetIndex: { id: "30", url: "https://x/30.json", sha1: "g", size: 1 },
  javaVersion: { component: "java-runtime-delta", majorVersion: 21 },
  logging: { client: { argument: "-Dlog4j.configurationFile=${path}", file: { id: "client-1.21.2.xml", url: "https://x/log.xml", sha1: "h", size: 1 } } },
};
const fabric = {
  id: "fabric-loader-0.20.1-26.3",
  inheritsFrom: "26.3",
  mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
  arguments: { game: [], jvm: ["-DFabricMcEmu= net.minecraft.client.main.Main "] },
  libraries: [
    { name: "org.ow2.asm:asm:9.9", url: "https://maven.fabricmc.net/", sha1: "z" },
    { name: "net.fabricmc:fabric-loader:0.20.1", url: "https://maven.fabricmc.net/" },
  ],
};

test("바닐라 + Fabric 합치기, 실행 인자", () => {
  const layout = new Layout("C:\\mm");
  const v = mergeVersion(vanilla, fabric, layout, WIN);
  assert.equal(v.id, "fabric-loader-0.20.1-26.3");
  assert.equal(v.mainClass, "net.fabricmc.loader.impl.launch.knot.KnotClient");
  const names = v.libraries.map((l) => l.name);
  assert.ok(names.includes("org.ow2.asm:asm:9.9"), "Fabric의 ASM 사용");
  assert.ok(!names.includes("org.ow2.asm:asm:9.6"), "바닐라 ASM 중복 제거");
  assert.ok(names.includes("org.lwjgl:lwjgl:3.3.3:natives-windows"));
  assert.ok(!names.includes("org.lwjgl:lwjgl:3.3.3:natives-windows-arm64"));
  assert.ok(!names.includes("org.lwjgl:lwjgl:3.3.3:natives-linux"));
  assert.equal(v.libraries.find((l) => l.name.startsWith("net.fabricmc:fabric-loader"))!.download!.url,
    "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar");
  assert.equal(v.javaComponent, "java-runtime-delta");

  const cmd = buildLaunchCommand(layout, v, "java.exe",
    { name: "Steve", uuid: "abc", accessToken: "TOKEN", userType: "msa" },
    { maxMemoryMb: 6144, width: 1280, height: 720 }, WIN);
  const a = cmd.args;
  assert.equal(a[0], "-Xmx6144M");
  assert.ok(!a.includes("-XstartOnFirstThread"));
  const cp = a[a.indexOf("-cp") + 1];
  assert.ok(cp.includes(";"), "Windows 구분자 ;");
  assert.ok(cp.endsWith("26.3.jar"));
  assert.ok(a.includes("-DFabricMcEmu= net.minecraft.client.main.Main"));
  assert.ok(a.some((x) => x.startsWith("-Dlog4j.configurationFile=") && x.endsWith("client-1.21.2.xml")));
  const main = a.indexOf("net.fabricmc.loader.impl.launch.knot.KnotClient");
  assert.ok(main > 0);
  assert.deepEqual(a.slice(main + 1, main + 3), ["--username", "Steve"]);
  assert.ok(!a.includes("--demo"));
  assert.ok(a.includes("--width"));
  assert.ok(!a.join(" ").includes("${"), "치환 안 된 변수 없음");
});

test("업데이트 종류 판정", () => {
  const idx = { minecraft: "26.4", packVersion: "0.2.0", fabricLoader: "0.20.4" } as PackIndex;
  assert.equal(classifyUpdate(emptyState(), idx), "install");
  assert.equal(classifyUpdate({ ...emptyState(), packVersion: "0.1.4", minecraft: "26.3", fabricLoader: "0.20.1" }, idx), "minecraft-upgrade");
  assert.equal(classifyUpdate({ ...emptyState(), packVersion: "0.1.9", minecraft: "26.4", fabricLoader: "0.20.4" }, idx), "update");
  assert.equal(classifyUpdate({ ...emptyState(), packVersion: "0.2.0", minecraft: "26.4", fabricLoader: "0.20.4" }, idx), "none");
  assert.equal(classifyUpdate({ ...emptyState(), packVersion: "0.3.0", minecraft: "26.5", fabricLoader: "0.20.4" }, idx), "downgrade");
});

// 작은 로컬 서버로 다운로드·동기화 확인
function serve(files: Record<string, string>): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const body = files[req.url!.split("?")[0]];
      if (body === undefined) { res.writeHead(404); return res.end(); }
      res.writeHead(200);
      res.end(body);
    });
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as any).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
}
const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex");

test("팩 동기화: 모드 교체 · 설정 보존 · 월드 유지 · 백업", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mmc-"));
  const layout = new Layout(root);
  const srv = await serve({ "/a1.jar": "A1", "/a2.jar": "A2", "/b.jar": "B", "/srv.jar": "S", "/Pack.zip": "R", "/cfg1": "x=1", "/cfg2": "x=2", "/opt": "o" });
  const mod = (name: string, file: string, body: string, client = "required") => ({
    projectId: name, slug: name, name, versionId: file, versionNumber: file, versionType: "release" as const, gameVersions: ["26.3"],
    fileName: file, url: `${srv.url}/${file}`, sha1: sha1(body), sha512: "", size: body.length, client: client as any, server: "optional" as const,
  });
  const ov = (p: string, url: string, body: string) => ({ path: p, sha1: sha1(body), size: body.length, url: `${srv.url}${url}` });
  try {
    const v1: PackIndex = {
      formatVersion: 1, name: "t", packVersion: "0.1.0", minecraft: "26.3", fabricLoader: "0.20.1", publishedAt: "", changelog: [],
      mods: [mod("a", "a1.jar", "A1"), mod("b", "b.jar", "B"), mod("srv", "srv.jar", "S", "unsupported"), { ...mod("rp", "Pack.zip", "R"), kind: "resourcepack" as const }],
      overrides: [ov("config/x.toml", "/cfg1", "x=1"), ov("config/old.toml", "/opt", "o")],
    };
    let state = await syncPack(layout, v1, emptyState());
    assert.deepEqual(fs.readdirSync(layout.mods).sort(), ["a1.jar", "b.jar", "srv.jar"], "싱글플레이용으로 전부 설치");
    assert.equal(fs.readFileSync(path.join(layout.game, "resourcepacks", "Pack.zip"), "utf8"), "R", "리소스팩은 resourcepacks 폴더");
    assert.equal(fs.readFileSync(path.join(layout.game, "config/x.toml"), "utf8"), "x=1");

    // 플레이어가 설정을 바꾸고, 월드와 직접 넣은 모드가 있음
    fs.writeFileSync(path.join(layout.game, "config/x.toml"), "x=사용자");
    fs.mkdirSync(path.join(layout.saves, "내 월드"), { recursive: true });
    fs.writeFileSync(path.join(layout.saves, "내 월드", "level.dat"), "world");
    fs.writeFileSync(path.join(layout.mods, "user.jar"), "U");

    // 같은 설정 파일 그대로 → 사용자 설정 유지
    const v2: PackIndex = { ...v1, packVersion: "0.1.1", mods: [mod("a", "a2.jar", "A2"), mod("b", "b.jar", "B")], overrides: [ov("config/x.toml", "/cfg1", "x=1")] };
    state = await syncPack(layout, v2, state);
    assert.deepEqual(fs.readdirSync(layout.mods).sort(), ["a2.jar", "b.jar", "user.jar"], "옛 버전·빠진 모드 삭제, 직접 넣은 모드 유지");
    assert.equal(fs.existsSync(path.join(layout.game, "resourcepacks", "Pack.zip")), false, "빠진 리소스팩 삭제");
    assert.equal(fs.readFileSync(path.join(layout.game, "config/x.toml"), "utf8"), "x=사용자", "팩이 안 바꾼 설정은 유지");
    assert.equal(fs.existsSync(path.join(layout.game, "config/old.toml")), false, "팩에서 빠진 설정 삭제");

    // 팩이 설정을 바꾸면 덮어씀
    const v3: PackIndex = { ...v2, packVersion: "0.2.0", minecraft: "26.4", overrides: [ov("config/x.toml", "/cfg2", "x=2")] };
    assert.equal(classifyUpdate(state, v3), "minecraft-upgrade");
    const backup = await backupSaves(layout, "26.3-before-26.4");
    assert.ok(backup && fs.existsSync(path.join(backup, "saves", "내 월드", "level.dat")), "월드 백업");
    state = await syncPack(layout, v3, state);
    assert.equal(fs.readFileSync(path.join(layout.game, "config/x.toml"), "utf8"), "x=2");
    assert.equal(fs.readFileSync(path.join(layout.saves, "내 월드", "level.dat"), "utf8"), "world", "월드는 그대로");
    assert.equal(state.minecraft, "26.4");
  } finally {
    srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
