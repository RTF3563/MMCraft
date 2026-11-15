import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { downloadAll, downloadFile, getJson } from "../core/http";
import { Layout } from "../core/paths";
import { currentPlatform } from "../core/rules";
import { FABRIC_META, getVersionManifest, installVersion, resolveVersion, VersionManifest } from "../core/minecraft";
import { ensureJava, javaExecutable } from "../core/java";
import { buildLaunchCommand } from "../core/launch";
import { installPath, PackMod } from "../core/pack";
import { applyInstallNames, files, readPack } from "./source";

export const CI_HOME = path.resolve(process.env.MMCRAFT_CI_HOME ?? ".ci-cache");

export interface TestInput {
  minecraft: string;
  fabricLoader: string;
  mods: PackMod[];
  label: string;
}

export interface TestResult {
  ok: boolean;
  stage: "server" | "client" | "setup" | "done";
  reason: string;
  logFile?: string;
}

let manifestCache: VersionManifest | undefined;
let counter = 0;

function log(msg: string) {
  console.log(`[test] ${msg}`);
}

async function copyDir(src: string, dest: string) {
  if (fs.existsSync(src)) await fs.promises.cp(src, dest, { recursive: true });
}

/** dir 아래에 mods/…, resourcepacks/… 로 설치 */
async function putMods(dir: string, mods: PackMod[]) {
  mods = applyInstallNames(mods);
  await downloadAll(
    mods.map((m) => ({ url: m.url, dest: path.join(CI_HOME, "mod-cache", m.sha1, m.fileName), sha1: m.sha1, size: m.size })),
    undefined,
    8,
  );
  for (const m of mods) {
    const dest = path.join(dir, ...installPath(m).split("/"));
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(path.join(CI_HOME, "mod-cache", m.sha1, m.fileName), dest);
  }
}

interface WatchOptions {
  command: string;
  args: string[];
  cwd: string;
  logFile: string;
  /** 줄마다 호출: "pass" / "fail:이유" / undefined */
  onLine?: (line: string, elapsedMs: number) => string | undefined;
  /** 주기적으로 호출 (출력이 없어도) */
  onTick?: (elapsedMs: number, sinceMarkerMs: number | null) => string | undefined;
  timeoutMs: number;
  stdinOnPass?: string;
  env?: NodeJS.ProcessEnv;
}

function crashReportExists(gameDir: string) {
  const dir = path.join(gameDir, "crash-reports");
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".txt"));
}

/** 프로세스를 띄우고 로그를 보며 통과/실패 판정 */
function watchProcess(o: WatchOptions): Promise<{ ok: boolean; reason: string }> {
  return new Promise((resolve) => {
    const out = fs.createWriteStream(o.logFile);
    const start = Date.now();
    const child = spawn(o.command, o.args, { cwd: o.cwd, env: o.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let done = false;
    let exited = false;
    let markerAt: number | null = null;
    let verdict: { ok: boolean; reason: string } | null = null;
    const close = () => {
      out.end();
      resolve(verdict!);
    };
    const finish = (ok: boolean, reason: string) => {
      if (done) return;
      done = true;
      verdict = { ok, reason };
      clearInterval(timer);
      if (exited) return close();
      if (ok && o.stdinOnPass) {
        child.stdin.write(o.stdinOnPass);
        setTimeout(() => child.kill("SIGKILL"), 60_000);
      } else {
        child.kill("SIGKILL");
      }
    };
    const handle = (buf: Buffer) => {
      out.write(buf);
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (!line) continue;
        const r = o.onLine?.(line, Date.now() - start);
        if (r === "marker") markerAt = Date.now();
        else if (r === "pass") finish(true, "통과");
        else if (r?.startsWith("fail:")) finish(false, r.slice(5));
      }
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("exit", (code) => {
      exited = true;
      if (!done) finish(false, `게임이 중간에 종료됨 (코드 ${code})`);
      else close();
    });
    child.on("error", (e) => {
      exited = true;
      if (!done) finish(false, `실행 실패: ${e.message}`);
      else close();
    });
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const r = o.onTick?.(elapsed, markerAt ? Date.now() - markerAt : null);
      if (r === "pass") finish(true, "통과");
      else if (r?.startsWith("fail:")) finish(false, r.slice(5));
      else if (elapsed > o.timeoutMs) finish(false, `시간 초과 (${Math.round(o.timeoutMs / 60000)}분)`);
    }, 2000);
  });
}

const CRASH_PATTERNS = [
  /---- Minecraft Crash Report ----/,
  /Incompatible mods? found!/i,
  /Mod resolution failed/i,
  /MixinApplyError|InvalidInjectionException|Mixin apply .* failed/i,
  /net\.fabricmc\.loader\.impl\.FormattedException/,
  /Encountered an unexpected exception/,
];

function crashLine(line: string): string | undefined {
  for (const p of CRASH_PATTERNS) if (p.test(line)) return "fail:" + line.trim().slice(0, 300);
  return undefined;
}

async function prepare(input: TestInput) {
  const platform = currentPlatform();
  const shared = new Layout(CI_HOME);
  manifestCache ??= await getVersionManifest();
  const resolved = await resolveVersion(shared, input.minecraft, input.fabricLoader, platform, manifestCache);
  const javaExe = await ensureJava(shared, resolved.javaComponent, platform);
  return { platform, shared, resolved, javaExe };
}

export async function serverTest(input: TestInput, workDir: string, javaExe: string): Promise<TestResult> {
  const dir = path.join(workDir, "server");
  await fs.promises.mkdir(dir, { recursive: true });
  const installers = await getJson<{ version: string; stable: boolean }[]>(`${FABRIC_META}/versions/installer`);
  const installer = (installers.find((i) => i.stable) ?? installers[0]).version;
  const jar = path.join(CI_HOME, "server-jars", `${input.minecraft}-${input.fabricLoader}-${installer}.jar`);
  await downloadFile({
    url: `${FABRIC_META}/versions/loader/${input.minecraft}/${input.fabricLoader}/${installer}/server/jar`,
    dest: jar,
  });
  await putMods(dir, input.mods.filter((m) => m.server !== "unsupported" && m.kind !== "resourcepack"));
  await copyDir(path.join(files.overrides(), "config"), path.join(dir, "config"));
  await fs.promises.writeFile(path.join(dir, "eula.txt"), "eula=true\n");
  await fs.promises.writeFile(
    path.join(dir, "server.properties"),
    ["online-mode=false", "view-distance=6", "simulation-distance=6", "level-seed=mmcraft-ci", "spawn-protection=0"].join("\n") + "\n",
  );
  const logFile = path.join(workDir, "server.log");
  log(`서버 테스트 시작 (${input.label})`);
  const r = await watchProcess({
    command: javaExe.replace(/javaw\.exe$/, "java.exe"),
    args: ["-Xmx3G", "-jar", jar, "nogui"],
    cwd: dir,
    logFile,
    timeoutMs: 12 * 60_000,
    stdinOnPass: "stop\n",
    onLine: (line) => (/Done \([\d.,]+s\)!/.test(line) ? "pass" : crashLine(line)),
    onTick: () => (crashReportExists(dir) ? "fail:크래시 리포트 생성됨" : undefined),
  });
  return { ok: r.ok, stage: "server", reason: r.reason, logFile };
}

export async function clientTest(input: TestInput, workDir: string, prep: Awaited<ReturnType<typeof prepare>>): Promise<TestResult> {
  const gameDir = path.join(workDir, "client");
  const layout = new Layout(CI_HOME, gameDir);
  await installVersion(layout, prep.resolved);
  await putMods(gameDir, input.mods);
  await copyDir(files.overrides(), gameDir);
  const javaExe = javaExecutable(path.dirname(path.dirname(prep.javaExe)), prep.platform, false);
  // CI 검사 전용 오프라인 실행 (실제 런처에서는 Microsoft 로그인만 사용)
  const cmd = buildLaunchCommand(
    layout,
    prep.resolved,
    javaExe,
    { name: "MMCraftCI", uuid: "00000000000000000000000000000000", accessToken: "0", userType: "legacy" },
    { maxMemoryMb: 4096, width: 1280, height: 720, extraJvmArgs: readPack().jvmArgs ?? [] },
    prep.platform,
  );
  const logFile = path.join(workDir, "client.log");
  log(`클라이언트 테스트 시작 (${input.label})`);
  const PASS_AFTER_MARKER = 120_000;
  const PASS_WITHOUT_MARKER = 6 * 60_000;
  const r = await watchProcess({
    command: cmd.command,
    args: cmd.args,
    cwd: cmd.cwd,
    logFile,
    timeoutMs: 15 * 60_000,
    onLine: (line) => {
      const c = crashLine(line);
      if (c) return c;
      // 리소스를 다 읽고 화면을 그리기 시작했다는 표시
      if (/Created: \d+x\d+x\d+ .*atlas/.test(line) || /Sound engine started/.test(line)) return "marker";
      return undefined;
    },
    onTick: (elapsed, sinceMarker) => {
      if (crashReportExists(gameDir)) return "fail:크래시 리포트 생성됨";
      if (sinceMarker !== null && sinceMarker > PASS_AFTER_MARKER) return "pass";
      if (elapsed > PASS_WITHOUT_MARKER) return "pass";
      return undefined;
    },
  });
  if (!r.ok && crashReportExists(gameDir)) {
    const dir = path.join(gameDir, "crash-reports");
    const f = fs.readdirSync(dir).find((x) => x.endsWith(".txt"))!;
    await fs.promises.copyFile(path.join(dir, f), path.join(workDir, "crash-report.txt"));
  }
  return { ok: r.ok, stage: "client", reason: r.reason, logFile };
}

/** 서버 → 클라이언트 순서로 실제 실행 테스트 */
export async function testPack(input: TestInput): Promise<TestResult> {
  const workDir = path.join(CI_HOME, "runs", `${Date.now()}-${++counter}`);
  await fs.promises.mkdir(workDir, { recursive: true });
  let prep;
  try {
    prep = await prepare(input);
  } catch (e: any) {
    return { ok: false, stage: "setup", reason: `준비 실패: ${e.message}` };
  }
  const server = await serverTest(input, workDir, prep.javaExe);
  log(`서버: ${server.ok ? "통과" : "실패 - " + server.reason}`);
  if (!server.ok) return server;
  const client = await clientTest(input, workDir, prep);
  log(`클라이언트: ${client.ok ? "통과" : "실패 - " + client.reason}`);
  if (!client.ok) return client;
  // 통과한 실행 폴더는 지움 (실패한 것은 로그 확인용으로 남김)
  if (client.logFile) await fs.promises.copyFile(client.logFile, path.join(CI_HOME, "last-client.log")).catch(() => {});
  await fs.promises.rm(workDir, { recursive: true, force: true });
  return { ok: true, stage: "done", reason: "서버·클라이언트 모두 통과" };
}
