/** 서버팩: 팩에서 서버용 모드만 골라 설치 + Fabric 서버 준비 (서버 런처와 자동 테스트가 같은 코드 사용) */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { downloadFile, getJson, Progress } from "./http";
import { Layout } from "./paths";
import { Platform } from "./rules";
import { compareMcVersions, FABRIC_META, fetchVanillaJson } from "./minecraft";
import { ensureJava } from "./java";
import { DEFAULT_JVM_FLAGS } from "./launch";
import { InstallState, installPath, loadState, PackIndex, PackMod, PackOverride, prefetch, saveState, syncPack } from "./pack";

/** 서버 폴더용 배치: 상태 파일·월드 백업은 서버 폴더 안에 (폴더를 옮기면 같이 따라감) */
export class ServerLayout extends Layout {
  constructor(root: string, public serverDir: string) {
    super(root, serverDir);
  }
  get state() { return path.join(this.serverDir, ".mmcraft", "state.json"); }
  get backups() { return path.join(this.serverDir, "backups"); }
  get serverJars() { return path.join(this.root, "server-jars"); }
  get fileCache() { return path.join(this.cache, "files"); }
}

export interface ServerInstallState extends InstallState {
  /** 서버에 영향을 주는 내용(서버 모드·설정·버전)의 지문. 같으면 재시작할 필요 없음 */
  fingerprint?: string;
  /** 마지막으로 쓴 Fabric 설치기 버전 (오프라인에서도 실행하려고 기억) */
  fabricInstaller?: string;
}

/** 서버에 넣을 모드: 팩 모드 중 클라이언트 전용·리소스팩을 뺀 것 + 서버 전용 모드 */
export function serverMods(index: { mods: PackMod[]; serverOnlyMods?: PackMod[] }): PackMod[] {
  return [...index.mods, ...(index.serverOnlyMods ?? [])].filter((m) => m.server !== "unsupported" && m.kind !== "resourcepack");
}

/** 서버에 넣을 설정 파일: config/ 아래만 (리소스팩·셰이더는 플레이어용) */
export function serverOverrides(index: { overrides: PackOverride[] }): PackOverride[] {
  return index.overrides.filter((o) => o.path.startsWith("config/"));
}

/** 서버 쪽 내용 지문: 클라이언트 전용 모드만 바뀐 업데이트는 서버를 재시작하지 않으려고 */
export function serverFingerprint(index: PackIndex): string {
  const data = {
    mc: index.minecraft,
    loader: index.fabricLoader,
    mods: serverMods(index).map((m) => `${installPath(m)}:${m.sha1}`).sort(),
    config: serverOverrides(index).map((o) => `${o.path}:${o.sha1}`).sort(),
  };
  return crypto.createHash("sha1").update(JSON.stringify(data)).digest("hex");
}

export type ServerUpdateKind = "install" | "none" | "pack-only" | "restart" | "minecraft-upgrade" | "downgrade";

/**
 * 서버가 해야 할 일
 * - pack-only: 팩 버전은 올랐지만 서버 쪽은 그대로 (재시작 없이 기록만)
 * - restart: 서버 모드·설정이 바뀜 → 공지·킥·재시작
 */
export function classifyServerUpdate(state: ServerInstallState, index: PackIndex): ServerUpdateKind {
  if (!state.packVersion || !state.minecraft) return "install";
  const c = compareMcVersions(index.minecraft, state.minecraft);
  if (c < 0) return "downgrade";
  if (c > 0) return "minecraft-upgrade";
  const fp = serverFingerprint(index);
  if (state.fingerprint && state.fingerprint === fp) return state.packVersion === index.packVersion ? "none" : "pack-only";
  if (!state.fingerprint && state.packVersion === index.packVersion && state.fabricLoader === index.fabricLoader) return "none";
  return "restart";
}

/** Fabric 서버 실행 파일 (처음 켤 때 바닐라 서버·라이브러리를 스스로 받음) */
export async function ensureFabricServerJar(
  layout: ServerLayout,
  mc: string,
  loader: string,
  state: ServerInstallState,
  cleanup = false,
): Promise<{ jar: string; installer: string }> {
  let installer = state.fabricInstaller;
  try {
    const list = await getJson<{ version: string; stable: boolean }[]>(`${FABRIC_META}/versions/installer`);
    installer = (list.find((i) => i.stable) ?? list[0]).version;
  } catch (e) {
    if (!installer) throw e; // 처음인데 인터넷이 안 되면 진행 불가
  }
  const jar = path.join(layout.serverJars, `fabric-server-mc.${mc}-loader.${loader}-launcher.${installer}.jar`);
  await downloadFile({
    url: `${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(loader)}/${encodeURIComponent(installer!)}/server/jar`,
    dest: jar,
  });
  // 예전 실행 파일 정리 (서버가 꺼진 뒤에만: 켜져 있으면 파일이 잠겨 있음)
  if (cleanup) {
    for (const f of await fs.promises.readdir(layout.serverJars).catch(() => [] as string[])) {
      if (f.endsWith(".jar") && path.join(layout.serverJars, f) !== jar) {
        await fs.promises.rm(path.join(layout.serverJars, f), { force: true }).catch(() => {});
      }
    }
  }
  return { jar, installer: installer! };
}

/** 서버용 Java (콘솔 프로그램 java.exe) */
export async function ensureServerJava(layout: Layout, mc: string, platform: Platform, onProgress?: Progress): Promise<string> {
  const vanilla = await fetchVanillaJson(layout, mc);
  const component = vanilla.javaVersion?.component ?? "java-runtime-delta";
  const exe = await ensureJava(layout, component, platform, onProgress);
  return exe.replace(/javaw\.exe$/i, "java.exe");
}

/** 서버를 끄기 전에 새 모드·설정·Java·Fabric을 미리 받아 둠 (멈춰 있는 시간 줄이기) */
export async function prefetchServer(layout: ServerLayout, index: PackIndex, platform: Platform, onProgress?: Progress) {
  await prefetch([...serverMods(index), ...serverOverrides(index)], layout.fileCache, onProgress);
  await ensureServerJava(layout, index.minecraft, platform, onProgress);
  const state = (await loadState(layout)) as ServerInstallState;
  await ensureFabricServerJar(layout, index.minecraft, index.fabricLoader, state);
}

/** 처음 설치하는데 mods 폴더에 이미 jar가 있으면(손으로 만든 서버) 겹치지 않게 옆으로 옮김 */
async function moveForeignMods(layout: ServerLayout): Promise<string | null> {
  let jars: string[] = [];
  try {
    jars = (await fs.promises.readdir(layout.mods)).filter((f) => f.toLowerCase().endsWith(".jar"));
  } catch {
    return null;
  }
  if (jars.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dest = path.join(layout.serverDir, `mods-before-mmcraft-${stamp}`);
  await fs.promises.mkdir(dest, { recursive: true });
  for (const j of jars) await fs.promises.rename(path.join(layout.mods, j), path.join(dest, j));
  return dest;
}

export interface PreparedServer {
  javaExe: string;
  jar: string;
  state: ServerInstallState;
  /** 처음 설치 때 옮긴 예전 모드 폴더 */
  movedMods: string | null;
}

/** 서버 모드·설정을 팩에 맞추고 실행 준비 (월드는 건드리지 않음) */
export async function prepareServer(layout: ServerLayout, index: PackIndex, platform: Platform, onProgress?: Progress): Promise<PreparedServer> {
  let state = (await loadState(layout)) as ServerInstallState;
  const movedMods = !state.packVersion ? await moveForeignMods(layout) : null;
  const javaExe = await ensureServerJava(layout, index.minecraft, platform, onProgress);
  const { jar, installer } = await ensureFabricServerJar(layout, index.minecraft, index.fabricLoader, state, true);
  state = await syncPack(layout, index, state, onProgress, {
    mods: serverMods(index),
    overrides: serverOverrides(index),
    cacheDir: layout.fileCache,
  });
  state = { ...state, fingerprint: serverFingerprint(index), fabricInstaller: installer };
  await saveState(layout, state);
  await fs.promises.rm(layout.fileCache, { recursive: true, force: true }); // 다 옮겼으니 비움
  return { javaExe, jar, state, movedMods };
}

/** 이미 설치된 상태로 실행만 (인터넷이 안 될 때) */
export async function installedServer(layout: ServerLayout, platform: Platform): Promise<PreparedServer | null> {
  const state = (await loadState(layout)) as ServerInstallState;
  if (!state.packVersion || !state.minecraft || !state.fabricLoader || !state.fabricInstaller) return null;
  const jar = path.join(layout.serverJars, `fabric-server-mc.${state.minecraft}-loader.${state.fabricLoader}-launcher.${state.fabricInstaller}.jar`);
  if (!fs.existsSync(jar)) return null;
  try {
    const javaExe = await ensureServerJava(layout, state.minecraft, platform);
    return { javaExe, jar, state, movedMods: null };
  } catch {
    return null;
  }
}

export interface ServerLaunchOptions {
  memoryMb: number;
  extraJvmArgs?: string[];
}

/** java 실행 인자. 출력 글자는 UTF-8로 (한국어 Windows에서도 콘솔 로그가 깨지지 않게) */
export function buildServerCommand(javaExe: string, jar: string, cwd: string, o: ServerLaunchOptions) {
  return {
    command: javaExe,
    args: [
      `-Xmx${o.memoryMb}M`,
      `-Xms${Math.min(o.memoryMb, Math.max(1024, Math.floor(o.memoryMb / 2)))}M`,
      ...DEFAULT_JVM_FLAGS,
      "-Dfile.encoding=UTF-8",
      "-Dstdout.encoding=UTF-8",
      "-Dstderr.encoding=UTF-8",
      ...(o.extraJvmArgs ?? []),
      "-jar",
      jar,
      "nogui",
    ],
    cwd,
  };
}

// ---- server.properties / eula.txt ----

export function readProperties(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1);
    }
  } catch {}
  return out;
}

/** 다른 줄(주석 포함)은 그대로 두고 지정한 값만 바꾸거나 추가 */
export function writeProperties(file: string, values: Record<string, string>) {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (lines[lines.length - 1] === "") lines.pop();
  } catch {}
  const left = { ...values };
  lines = lines.map((line) => {
    const i = line.indexOf("=");
    if (line.startsWith("#") || i <= 0) return line;
    const k = line.slice(0, i).trim();
    if (k in left) {
      const v = left[k];
      delete left[k];
      return `${k}=${v}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(left)) lines.push(`${k}=${v}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

/** 월드 폴더들 (server.properties의 level-name, 기본 world) */
export function worldFolders(serverDir: string): string[] {
  const name = readProperties(path.join(serverDir, "server.properties"))["level-name"]?.trim() || "world";
  return [path.join(serverDir, name)];
}

export function eulaAccepted(serverDir: string): boolean {
  return /^\s*eula\s*=\s*true\s*$/im.test(safeRead(path.join(serverDir, "eula.txt")));
}

export function acceptEula(serverDir: string) {
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(
    path.join(serverDir, "eula.txt"),
    `#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\n#Accepted in MMCraft Server ${new Date().toISOString()}\neula=true\n`,
  );
}

function safeRead(file: string) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
