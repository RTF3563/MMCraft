import * as fs from "fs";
import * as path from "path";
import { DownloadItem, downloadAll, getJson, hashFile, isValid, Progress } from "./http";
import { Layout } from "./paths";
import { compareMcVersions } from "./minecraft";
import { tr } from "./i18n";

/** 팩 정보 주소 (MMCRAFT_PACK_INDEX_URL: 시험용 팩을 볼 때만) */
export const PACK_INDEX_URL = process.env.MMCRAFT_PACK_INDEX_URL || "https://raw.githubusercontent.com/RTF3563/MMCraft/pack-dist/index.json";

export type Side = "required" | "optional" | "unsupported" | "unknown";

/** 팩에 들어가는 모드 1개 (Modrinth 버전 1개에 고정) */
export interface PackMod {
  projectId: string;
  slug: string;
  name: string;
  versionId: string;
  versionNumber: string;
  versionType: "release" | "beta" | "alpha";
  gameVersions: string[];
  fileName: string;
  url: string;
  sha1: string;
  sha512: string;
  size: number;
  client: Side;
  server: Side;
  /** 다른 모드가 필요로 해서 자동으로 들어온 경우 */
  dependencyOf?: string[];
  /** 모드(jar) 또는 리소스팩(zip). 없으면 모드 */
  kind?: "mod" | "resourcepack";
}

/** game 폴더 기준 설치 위치 ("mods/x.jar", "resourcepacks/y.zip") */
export function installPath(m: PackMod): string {
  return `${m.kind === "resourcepack" ? "resourcepacks" : "mods"}/${m.fileName}`;
}

export interface PackOverride {
  path: string; // game 폴더 기준, "/" 구분
  sha1: string;
  size: number;
  url: string;
}

export interface PackIndex {
  formatVersion: 1;
  name: string;
  packVersion: string;
  minecraft: string;
  fabricLoader: string;
  publishedAt: string;
  changelog: string[];
  mods: PackMod[];
  overrides: PackOverride[];
  /** 게임 실행 때 꼭 넣어야 하는 Java 옵션 (모드 호환용) */
  jvmArgs?: string[];
}

export interface InstallState {
  packVersion?: string;
  minecraft?: string;
  fabricLoader?: string;
  mods: Record<string, string>; // "mods/파일명" → sha1 (런처가 관리하는 모드·리소스팩)
  overrides: Record<string, string>; // 경로 → 마지막으로 설치한 팩 파일 sha1
}

export function emptyState(): InstallState {
  return { mods: {}, overrides: {} };
}

export async function loadState(layout: Layout): Promise<InstallState> {
  try {
    return { ...emptyState(), ...JSON.parse(await fs.promises.readFile(layout.state, "utf8")) };
  } catch {
    return emptyState();
  }
}

export async function saveState(layout: Layout, state: InstallState) {
  await fs.promises.mkdir(layout.root, { recursive: true });
  const tmp = layout.state + ".tmp";
  await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.promises.rename(tmp, layout.state);
}

export async function fetchPackIndex(url = PACK_INDEX_URL): Promise<PackIndex> {
  const index = await getJson<PackIndex>(`${url}?t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
  if (index.formatVersion !== 1) throw new Error(tr("err.oldLauncher"));
  return index;
}

/** 팩 정보 받기. 인터넷이 안 되면 마지막으로 받은 것 (online: false) */
export async function fetchPackIndexCached(layout: Layout, url = PACK_INDEX_URL): Promise<{ index: PackIndex | null; online: boolean }> {
  const cacheFile = path.join(layout.cache, "index.json");
  try {
    const index = await fetchPackIndex(url);
    await fs.promises.mkdir(layout.cache, { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(index));
    return { index, online: true };
  } catch {
    try {
      return { index: JSON.parse(await fs.promises.readFile(cacheFile, "utf8")), online: false };
    } catch {
      return { index: null, online: false };
    }
  }
}

/** 플레이어 PC에 설치할 것: 모드·리소스팩 전부 (싱글플레이는 내장 서버도 돌리므로 서버용 모드도 필요) */
export function clientMods(index: PackIndex): PackMod[] {
  return index.mods;
}

/** 예전 상태 파일은 키가 파일명만 있음 → mods/ 로 간주 */
function stateKey(k: string) {
  return k.includes("/") ? k : `mods/${k}`;
}

export type UpdateKind = "none" | "install" | "update" | "minecraft-upgrade" | "downgrade";

export function classifyUpdate(state: InstallState, index: PackIndex): UpdateKind {
  if (!state.packVersion || !state.minecraft) return "install";
  const c = compareMcVersions(index.minecraft, state.minecraft);
  if (c < 0) return "downgrade";
  if (c > 0) return "minecraft-upgrade";
  if (state.packVersion !== index.packVersion || state.fabricLoader !== index.fabricLoader) return "update";
  return "none";
}

function safeJoin(root: string, rel: string): string {
  const dest = path.resolve(root, ...rel.split("/"));
  if (!dest.startsWith(path.resolve(root) + path.sep)) throw new Error(tr("err.badPath", { path: rel }));
  return dest;
}

export interface SyncOptions {
  /** 설치할 모드 (기본: 플레이어용 전부) */
  mods?: PackMod[];
  /** 설치할 설정 파일 (기본: 전부) */
  overrides?: PackOverride[];
  /** 미리 받아 둔 파일 폴더 (<sha1> 이름). 있으면 다시 받지 않고 복사 */
  cacheDir?: string;
}

/** 미리 받아 두기: cacheDir/<sha1> (서버를 끄기 전에 받아서 멈춰 있는 시간을 줄임) */
export async function prefetch(items: { url: string; sha1: string; size: number }[], cacheDir: string, onProgress?: Progress, label?: string) {
  await downloadAll(
    items.map((i) => ({ url: i.url, dest: path.join(cacheDir, i.sha1), sha1: i.sha1, size: i.size })),
    onProgress,
    8,
    label,
  );
}

async function primeFromCache(items: DownloadItem[], cacheDir: string | undefined) {
  if (!cacheDir) return;
  for (const it of items) {
    if (!it.sha1) continue;
    const cached = path.join(cacheDir, it.sha1);
    if (!fs.existsSync(cached) || (await isValid(it))) continue;
    await fs.promises.mkdir(path.dirname(it.dest), { recursive: true });
    await fs.promises.copyFile(cached, it.dest);
  }
}

/**
 * 모드·설정 파일을 팩 목록에 맞춤.
 * - 런처가 넣은 모드 중 빠진 것은 삭제, 새 것은 받기
 * - 설정 파일은 팩 쪽 파일이 바뀌었을 때만 덮어씀 (플레이어가 바꾼 설정은 팩이 바꾸지 않는 한 유지)
 * - saves(월드)는 절대 건드리지 않음
 */
export async function syncPack(
  layout: Layout,
  index: PackIndex,
  state: InstallState,
  onProgress?: Progress,
  opts: SyncOptions = {},
): Promise<InstallState> {
  await fs.promises.mkdir(layout.mods, { recursive: true });
  const mods = opts.mods ?? clientMods(index);
  const overrides = opts.overrides ?? index.overrides;

  const downloads: DownloadItem[] = mods.map((m) => ({
    url: m.url,
    dest: safeJoin(layout.game, installPath(m)),
    sha1: m.sha1,
    size: m.size,
  }));
  await primeFromCache(downloads, opts.cacheDir);
  await downloadAll(downloads, onProgress, 8, tr("label.mods"));

  const wanted = new Set(mods.map(installPath));
  for (const key of Object.keys(state.mods).map(stateKey)) {
    if (!wanted.has(key)) await fs.promises.rm(safeJoin(layout.game, key), { force: true });
  }
  const newMods: Record<string, string> = {};
  for (const m of mods) newMods[installPath(m)] = m.sha1;

  // 설정·리소스팩 등
  const newOverrides: Record<string, string> = {};
  const toFetch: DownloadItem[] = [];
  for (const o of overrides) {
    const dest = safeJoin(layout.game, o.path);
    newOverrides[o.path] = o.sha1;
    const exists = fs.existsSync(dest);
    const packChanged = state.overrides[o.path] !== o.sha1;
    if (!exists || packChanged) {
      if (exists) await fs.promises.rm(dest, { force: true });
      toFetch.push({ url: o.url, dest, sha1: o.sha1, size: o.size });
    }
  }
  await primeFromCache(toFetch, opts.cacheDir);
  await downloadAll(toFetch, onProgress, 8, tr("label.configs"));

  // 팩에서 빠진 설정 파일: 플레이어가 안 바꿨으면 삭제
  for (const [rel, oldSha] of Object.entries(state.overrides)) {
    if (rel in newOverrides) continue;
    const dest = safeJoin(layout.game, rel);
    if (fs.existsSync(dest) && (await hashFile(dest, "sha1")) === oldSha) await fs.promises.rm(dest, { force: true });
  }

  return {
    ...state,
    packVersion: index.packVersion,
    minecraft: index.minecraft,
    fabricLoader: index.fabricLoader,
    mods: newMods,
    overrides: newOverrides,
  };
}

/** 플레이어가 직접 넣은 모드 (런처가 관리하지 않는 jar) */
export async function unmanagedMods(layout: Layout, state: InstallState): Promise<string[]> {
  try {
    const files = await fs.promises.readdir(layout.mods);
    const managed = new Set(Object.keys(state.mods).map(stateKey));
    return files.filter((f) => f.endsWith(".jar") && !managed.has(`mods/${f}`));
  } catch {
    return [];
  }
}
