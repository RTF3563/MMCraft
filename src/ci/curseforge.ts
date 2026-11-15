/**
 * CurseForge 정보 함께 보기
 * - Modrinth에는 옛 버전용으로만 표시됐지만 CurseForge에는 새 버전 지원으로 올라온 파일 → 같은 파일(이름)을 Modrinth에서 받음
 * - CurseForge에만 있는 모드 → CurseForge API 키(CF_API_KEY)가 있고, 제작자가 외부 배포를 허용했을 때만 CurseForge에서 받음
 * API 키가 없으면 정보 확인은 CFWidget(api.cfwidget.com, 키 불필요)로 함
 */
import * as fs from "fs";
import { getJson } from "../core/http";
import { MrProject, MrVersion, MODRINTH_API } from "../core/modrinth";
import { Provider } from "./resolve";
import { files } from "./source";

const CF_API = "https://api.curseforge.com/v1";
const MINECRAFT = 432;
const MC_MODS = 6;
const FABRIC = 4;
const KEY = process.env.CF_API_KEY ?? "";

export const hasCfKey = () => KEY.length > 0;

export interface CfFile {
  fileId: number;
  fileName: string;
  display: string;
  gameVersions: string[]; // "26.3", "Fabric", "Client" 등 섞여 있음
  releaseType: "release" | "beta" | "alpha";
  date: string;
  sha1?: string;
  size?: number;
  downloadUrl?: string | null;
}

export interface CfMod {
  id: number;
  slug: string;
  name: string;
  allowDistribution: boolean | null; // null = 모름 (키 없음)
  files: CfFile[];
}

export interface CurseForgeConfig {
  /** Modrinth 주소 → CurseForge 주소 */
  map: Record<string, string>;
  /** CurseForge에만 있는 모드 (CurseForge 주소) */
  only: string[];
}

export function readCurseForge(): CurseForgeConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(files.curseforge(), "utf8"));
    return { map: raw.map ?? {}, only: raw.only ?? [] };
  } catch {
    return { map: {}, only: [] };
  }
}

export function writeCurseForge(c: CurseForgeConfig) {
  const sortObj = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(
    files.curseforge(),
    JSON.stringify(
      {
        _설명: "map: Modrinth 주소 → CurseForge 주소 (CurseForge 지원 버전 정보도 함께 확인). only: CurseForge에만 있는 모드 (API 키 필요)",
        map: sortObj(c.map),
        only: [...new Set(c.only)].sort(),
      },
      null,
      2,
    ) + "\n",
  );
}

const cache = new Map<string, Promise<CfMod | null>>();

async function fetchOfficial(slug: string): Promise<CfMod | null> {
  const h = { headers: { "x-api-key": KEY, Accept: "application/json" } };
  const s = await getJson<any>(`${CF_API}/mods/search?gameId=${MINECRAFT}&classId=${MC_MODS}&slug=${encodeURIComponent(slug)}`, h);
  const mod = s.data?.[0];
  if (!mod) return null;
  const out: CfFile[] = [];
  for (let index = 0; index < 200; index += 50) {
    const r = await getJson<any>(`${CF_API}/mods/${mod.id}/files?modLoaderType=${FABRIC}&pageSize=50&index=${index}`, h);
    for (const f of r.data ?? []) {
      if (f.isAvailable === false) continue;
      out.push({
        fileId: f.id,
        fileName: f.fileName,
        display: f.displayName,
        gameVersions: f.gameVersions ?? [],
        releaseType: f.releaseType === 1 ? "release" : f.releaseType === 2 ? "beta" : "alpha",
        date: f.fileDate,
        sha1: (f.hashes ?? []).find((x: any) => x.algo === 1)?.value,
        size: f.fileLength,
        downloadUrl: f.downloadUrl,
      });
    }
    if ((r.data ?? []).length < 50) break;
  }
  return { id: mod.id, slug: mod.slug, name: mod.name, allowDistribution: mod.allowModDistribution ?? null, files: out };
}

async function fetchWidget(slug: string): Promise<CfMod | null> {
  const r = await getJson<any>(`https://api.cfwidget.com/minecraft/mc-mods/${encodeURIComponent(slug)}`);
  if (!r?.id) return null;
  return {
    id: r.id,
    slug,
    name: r.title,
    allowDistribution: null,
    files: (r.files ?? []).map((f: any) => ({
      fileId: f.id,
      fileName: f.name,
      display: f.display,
      gameVersions: f.versions ?? [],
      releaseType: f.type === "beta" ? "beta" : f.type === "alpha" ? "alpha" : "release",
      date: f.uploaded_at,
    })),
  };
}

/** CurseForge 모드 정보 (실패하면 null — CurseForge 확인은 보조 정보라 업데이트를 막지 않음) */
export function getCfMod(slug: string): Promise<CfMod | null> {
  if (!cache.has(slug)) {
    cache.set(slug, (hasCfKey() ? fetchOfficial(slug) : fetchWidget(slug)).catch((e) => {
      console.log(`[curseforge] ${slug} 정보 확인 실패: ${e.message ?? e}`);
      return null;
    }));
  }
  return cache.get(slug)!;
}

/** 해당 마크 버전 + Fabric 파일 */
export function cfFilesFor(mod: CfMod, mc: string): CfFile[] {
  return mod.files.filter((f) => f.gameVersions.includes(mc) && f.gameVersions.includes("Fabric"));
}

export const cfProjectId = (id: number) => `cf:${id}`;

function cfVersion(mod: CfMod, f: CfFile): MrVersion {
  return {
    id: `cf:${f.fileId}`,
    project_id: cfProjectId(mod.id),
    name: f.display,
    version_number: f.display.replace(/\.jar$/i, ""),
    version_type: f.releaseType,
    game_versions: f.gameVersions.filter((g) => /^\d/.test(g)),
    loaders: ["fabric"],
    files: f.downloadUrl && f.sha1
      ? [{ hashes: { sha1: f.sha1, sha512: "" }, url: f.downloadUrl, filename: f.fileName, primary: true, size: f.size ?? 0 }]
      : [],
    dependencies: [],
    date_published: f.date,
  };
}

/**
 * Provider에 CurseForge 정보 더하기
 * - Modrinth 모드: CurseForge에서 mc 지원으로 표시된 파일과 이름(또는 sha1)이 같은 Modrinth 버전을 후보에 추가
 * - "cf:" 모드: CurseForge 파일을 그대로 후보로 (API 키 + 배포 허용 필요)
 */
export interface CfDeps {
  getCf: (slug: string) => Promise<CfMod | null>;
  mrAllVersions: (projectId: string, loader: string) => Promise<MrVersion[]>;
  hasKey: () => boolean;
}

const defaultDeps: CfDeps = {
  getCf: getCfMod,
  mrAllVersions: (id, loader) =>
    getJson<MrVersion[]>(`${MODRINTH_API}/project/${id}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}`).catch(() => []),
  hasKey: hasCfKey,
};

export function withCurseForge(p: Provider, cfg: CurseForgeConfig, onNote?: (msg: string) => void, deps: CfDeps = defaultDeps): Provider {
  const allMr = new Map<string, Promise<MrVersion[]>>();
  const mrAll = (id: string, loader: string) => {
    const k = `${id}@${loader}`;
    if (!allMr.has(k)) allMr.set(k, deps.mrAllVersions(id, loader));
    return allMr.get(k)!;
  };
  const cfById = new Map<string, CfMod>();

  return {
    project: async (id) => {
      if (!id.startsWith("cf:")) return p.project(id);
      const mod = cfById.get(id) ?? (await findCfOnly(id));
      if (!mod) return null;
      return {
        id, slug: `cf-${mod.slug}`, title: mod.name, project_type: "mod",
        client_side: "optional", server_side: "optional", loaders: ["fabric"], game_versions: [],
      } as MrProject;
    },
    versions: async (id, mc, loader = "fabric") => {
      if (id.startsWith("cf:")) {
        const mod = cfById.get(id) ?? (await findCfOnly(id));
        if (!mod) return [];
        if (!deps.hasKey()) {
          onNote?.(`${mod.name}: CurseForge 전용 모드라 CurseForge API 키(CF_API_KEY)가 있어야 받을 수 있음`);
          return [];
        }
        if (mod.allowDistribution === false) {
          onNote?.(`${mod.name}: 제작자가 외부 프로그램 배포를 막아 둠 (CurseForge 앱에서만 받을 수 있음)`);
          return [];
        }
        return cfFilesFor(mod, mc).map((f) => cfVersion(mod, f)).filter((v) => v.files.length > 0);
      }
      const base = await p.versions(id, mc, loader);
      if (loader !== "fabric") return base;
      const proj = await p.project(id);
      const cfSlug = proj ? cfg.map[proj.slug] : undefined;
      if (!cfSlug) return base;
      const mod = await deps.getCf(cfSlug);
      if (!mod) return base;
      const cfOk = cfFilesFor(mod, mc);
      if (cfOk.length === 0) return base;
      const names = new Set(cfOk.map((f) => f.fileName.toLowerCase()));
      const hashes = new Set(cfOk.map((f) => f.sha1).filter(Boolean) as string[]);
      const extra = (await mrAll(id, loader)).filter(
        (v) => !base.some((b) => b.id === v.id) &&
          v.files.some((f) => names.has(f.filename.toLowerCase()) || hashes.has(f.hashes.sha1)),
      );
      if (extra.length) onNote?.(`${proj!.title}: CurseForge 기준 ${mc} 지원 확인 (${extra.map((v) => v.version_number).join(", ")})`);
      return [...base, ...extra.map((v) => ({ ...v, game_versions: [...new Set([...v.game_versions, mc])] }))]
        .sort((a, b) => b.date_published.localeCompare(a.date_published));
    },
  };

  async function findCfOnly(id: string): Promise<CfMod | null> {
    for (const slug of cfg.only) {
      const mod = await deps.getCf(slug);
      if (mod) cfById.set(cfProjectId(mod.id), mod);
    }
    return cfById.get(id) ?? null;
  }
}
