import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import { DownloadItem, downloadAll, downloadFile, getJson, Progress } from "./http";
import { Layout, mavenPath } from "./paths";
import { Platform, Rule, isAllowed, nativeClassifierMatches } from "./rules";
import { tr } from "./i18n";

export const VERSION_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
export const FABRIC_META = "https://meta.fabricmc.net/v2";
export const RESOURCES = "https://resources.download.minecraft.net";

export interface ManifestEntry {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
  sha1: string;
  releaseTime: string;
}
export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: ManifestEntry[];
}

export type Argument = string | { rules?: Rule[]; value: string | string[] };

export interface ResolvedLibrary {
  name: string;
  download?: DownloadItem; // 받을 파일 (경로 포함)
  native: boolean; // natives 압축 해제 대상
  classpath: boolean;
}

export interface ResolvedVersion {
  id: string; // 실행할 버전 ID (fabric-loader-x-y)
  minecraft: string;
  mainClass: string;
  jvmArgs: Argument[];
  gameArgs: Argument[];
  legacyGameArgs?: string;
  libraries: ResolvedLibrary[];
  clientJar: DownloadItem;
  assetIndex: { id: string; url: string; sha1: string; size: number };
  javaComponent: string;
  javaMajor: number;
  logging?: { argument: string; file: DownloadItem };
}

export async function getVersionManifest(): Promise<VersionManifest> {
  return getJson<VersionManifest>(VERSION_MANIFEST);
}

/** 정식 출시 버전 목록 (오래된 것 → 최신 순) */
export function releaseVersions(manifest: VersionManifest): ManifestEntry[] {
  return manifest.versions
    .filter((v) => v.type === "release")
    .sort((a, b) => a.releaseTime.localeCompare(b.releaseTime));
}

/** "26.3" < "26.4" < "26.10", "1.21.11" < "26.1" */
export function compareMcVersions(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((x) => parseInt(x, 10));
  const pb = b.split(/[.\-]/).map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = isNaN(pa[i]) ? 0 : pa[i] ?? 0;
    const y = isNaN(pb[i]) ? 0 : pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function readOrFetchJson(file: string, url: string, sha1?: string): Promise<any> {
  await downloadFile({ url, dest: file, sha1 });
  return JSON.parse(await fs.promises.readFile(file, "utf8"));
}

export async function fetchVanillaJson(layout: Layout, mc: string, manifest?: VersionManifest): Promise<any> {
  const file = layout.versionJson(mc);
  if (!manifest && fs.existsSync(file)) {
    try {
      return JSON.parse(await fs.promises.readFile(file, "utf8")); // 이미 받은 버전 정보 (오프라인에서도 실행 가능)
    } catch {}
  }
  const m = manifest ?? (await getVersionManifest());
  const entry = m.versions.find((v) => v.id === mc);
  if (!entry) throw new Error(tr("err.noVersion", { mc }));
  return readOrFetchJson(file, entry.url, entry.sha1);
}

export function fabricProfileId(mc: string, loader: string) {
  return `fabric-loader-${loader}-${mc}`;
}

export async function fetchFabricJson(layout: Layout, mc: string, loader: string): Promise<any> {
  const id = fabricProfileId(mc, loader);
  const file = layout.versionJson(id);
  if (fs.existsSync(file)) return JSON.parse(await fs.promises.readFile(file, "utf8"));
  const json = await getJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(loader)}/profile/json`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(json, null, 2));
  return json;
}

/** Fabric이 지원하는 게임 버전인지 (안정 버전) */
export async function fabricSupportsGame(mc: string): Promise<boolean> {
  const games = await getJson<{ version: string; stable: boolean }[]>(`${FABRIC_META}/versions/game`);
  return games.some((g) => g.version === mc);
}

/** 해당 게임 버전용 최신 안정 Fabric Loader */
export async function latestFabricLoader(mc: string): Promise<string | null> {
  const list = await getJson<{ loader: { version: string; stable: boolean } }[]>(
    `${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}`,
  );
  const stable = list.find((x) => x.loader.stable) ?? list[0];
  return stable ? stable.loader.version : null;
}

function libKey(name: string): string {
  const coord = name.split("@")[0].split(":");
  return [coord[0], coord[1], coord[3] ?? ""].join(":");
}

function resolveLibraries(libs: any[], layout: Layout, platform: Platform): ResolvedLibrary[] {
  const out: ResolvedLibrary[] = [];
  for (const lib of libs) {
    if (!isAllowed(lib.rules, platform)) continue;
    const name: string = lib.name;
    const classifier = name.split("@")[0].split(":")[3];
    const isNativeArtifact = !!classifier && classifier.startsWith("natives-");
    if (isNativeArtifact && !nativeClassifierMatches(classifier, platform)) continue;

    // 1) 일반 artifact
    if (lib.downloads?.artifact) {
      const a = lib.downloads.artifact;
      const rel = a.path || mavenPath(name);
      out.push({
        name,
        native: isNativeArtifact,
        classpath: true,
        download: a.url ? { url: a.url, dest: path.join(layout.libraries, rel), sha1: a.sha1, size: a.size } : undefined,
      });
    } else if (!lib.natives) {
      // Fabric 형식: maven url + name
      const rel = mavenPath(name);
      const base: string = lib.url || "https://libraries.minecraft.net/";
      out.push({
        name,
        native: isNativeArtifact,
        classpath: true,
        download: {
          url: base.replace(/\/?$/, "/") + rel,
          dest: path.join(layout.libraries, rel),
          sha1: lib.sha1,
          size: lib.size,
        },
      });
    }

    // 2) 옛 형식 natives (natives: {windows: "natives-windows"})
    if (lib.natives) {
      const osKey = platform.os === "osx" ? "osx" : platform.os;
      let key: string | undefined = lib.natives[osKey];
      if (key) {
        key = key.replace("${arch}", platform.arch === "x86" ? "32" : "64");
        const c = lib.downloads?.classifiers?.[key];
        if (c) {
          out.push({
            name: name + ":" + key,
            native: true,
            classpath: false,
            download: { url: c.url, dest: path.join(layout.libraries, c.path), sha1: c.sha1, size: c.size },
          });
        }
      }
    }
  }
  return out;
}

/** 바닐라 + Fabric 프로필을 합쳐 실행 정보로 만들기 */
export function mergeVersion(vanilla: any, fabric: any | null, layout: Layout, platform: Platform): ResolvedVersion {
  const libsRaw: any[] = [];
  const seen = new Set<string>();
  // Fabric 라이브러리를 우선 (같은 라이브러리는 Fabric 쪽 버전 사용)
  for (const lib of [...(fabric?.libraries ?? []), ...(vanilla.libraries ?? [])]) {
    const key = libKey(lib.name);
    if (lib.natives || key.split(":")[2]?.startsWith("natives-")) {
      libsRaw.push(lib);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    libsRaw.push(lib);
  }
  const mc = vanilla.id as string;
  const id = fabric?.id ?? mc;
  const client = vanilla.downloads.client;
  const logging = vanilla.logging?.client;
  return {
    id,
    minecraft: mc,
    mainClass: fabric?.mainClass ?? vanilla.mainClass,
    jvmArgs: [...(vanilla.arguments?.jvm ?? []), ...(fabric?.arguments?.jvm ?? [])],
    gameArgs: [...(vanilla.arguments?.game ?? []), ...(fabric?.arguments?.game ?? [])],
    legacyGameArgs: vanilla.arguments ? undefined : vanilla.minecraftArguments,
    libraries: resolveLibraries(libsRaw, layout, platform),
    clientJar: { url: client.url, sha1: client.sha1, size: client.size, dest: layout.versionJar(mc) },
    assetIndex: vanilla.assetIndex,
    javaComponent: vanilla.javaVersion?.component ?? "jre-legacy",
    javaMajor: vanilla.javaVersion?.majorVersion ?? 8,
    logging: logging
      ? {
          argument: logging.argument,
          file: {
            url: logging.file.url,
            sha1: logging.file.sha1,
            size: logging.file.size,
            dest: path.join(layout.assets, "log_configs", logging.file.id),
          },
        }
      : undefined,
  };
}

export async function resolveVersion(
  layout: Layout,
  mc: string,
  fabricLoader: string | null,
  platform: Platform,
  manifest?: VersionManifest,
): Promise<ResolvedVersion> {
  const vanilla = await fetchVanillaJson(layout, mc, manifest);
  const fabric = fabricLoader ? await fetchFabricJson(layout, mc, fabricLoader) : null;
  return mergeVersion(vanilla, fabric, layout, platform);
}

/** 라이브러리 · 클라이언트 · 에셋 · 로그 설정 받기 + natives 풀기 */
export async function installVersion(layout: Layout, v: ResolvedVersion, onProgress?: Progress): Promise<void> {
  const items: DownloadItem[] = [v.clientJar];
  for (const lib of v.libraries) if (lib.download) items.push(lib.download);
  if (v.logging) items.push(v.logging.file);
  await downloadAll(items, onProgress, 16, tr("label.libraries"));

  // 에셋
  const indexFile = path.join(layout.assets, "indexes", `${v.assetIndex.id}.json`);
  await downloadFile({ url: v.assetIndex.url, dest: indexFile, sha1: v.assetIndex.sha1, size: v.assetIndex.size });
  const index = JSON.parse(await fs.promises.readFile(indexFile, "utf8"));
  const assets: DownloadItem[] = [];
  const seen = new Set<string>();
  for (const obj of Object.values<any>(index.objects)) {
    if (seen.has(obj.hash)) continue;
    seen.add(obj.hash);
    const pre = obj.hash.slice(0, 2);
    assets.push({
      url: `${RESOURCES}/${pre}/${obj.hash}`,
      dest: path.join(layout.assets, "objects", pre, obj.hash),
      sha1: obj.hash,
      size: obj.size,
    });
  }
  // 이미 있는 파일은 크기만 빠르게 확인 (전체 해시 검사는 너무 느림)
  const missing: DownloadItem[] = [];
  for (const a of assets) {
    try {
      const st = await fs.promises.stat(a.dest);
      if (st.size === a.size) continue;
    } catch {}
    missing.push(a);
  }
  await downloadAll(missing, onProgress, 24, tr("label.assets"));

  await extractNatives(layout, v);
}

export async function extractNatives(layout: Layout, v: ResolvedVersion) {
  const dir = layout.natives(v.id);
  await fs.promises.rm(dir, { recursive: true, force: true });
  await fs.promises.mkdir(dir, { recursive: true });
  for (const lib of v.libraries) {
    if (!lib.native || !lib.download) continue;
    const zip = new AdmZip(lib.download.dest);
    for (const entry of zip.getEntries()) {
      const n = entry.entryName;
      if (entry.isDirectory || n.startsWith("META-INF/")) continue;
      if (!/\.(dll|so|dylib|jnilib)$/i.test(n)) continue;
      await fs.promises.writeFile(path.join(dir, path.basename(n)), entry.getData());
    }
  }
}
