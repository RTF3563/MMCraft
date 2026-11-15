import { getJson, HttpError } from "./http";
import { PackMod, Side } from "./pack";

export const MODRINTH_API = "https://api.modrinth.com/v2";

export interface MrProject {
  id: string;
  slug: string;
  title: string;
  project_type: string;
  client_side: Side;
  server_side: Side;
  loaders: string[];
  game_versions: string[];
}

export interface MrFile {
  hashes: { sha1: string; sha512: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface MrDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

export interface MrVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  game_versions: string[];
  loaders: string[];
  files: MrFile[];
  dependencies: MrDependency[];
  date_published: string;
}

const q = (v: unknown) => encodeURIComponent(JSON.stringify(v));

export async function getProject(idOrSlug: string): Promise<MrProject | null> {
  try {
    return await getJson<MrProject>(`${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function getProjects(ids: string[]): Promise<MrProject[]> {
  const out: MrProject[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    out.push(...(await getJson<MrProject[]>(`${MODRINTH_API}/projects?ids=${q(ids.slice(i, i + 100))}`)));
  }
  return out;
}

/** 특정 게임 버전 + Fabric용 버전 목록 (최신순) */
/** 리소스팩은 Modrinth에서 로더 이름이 "minecraft" */
export function loaderFor(kind?: string) {
  return kind === "resourcepack" ? "minecraft" : "fabric";
}

export async function getVersions(projectId: string, gameVersion: string, loader = "fabric"): Promise<MrVersion[]> {
  const list = await getJson<MrVersion[]>(
    `${MODRINTH_API}/project/${projectId}/version?loaders=${q([loader])}&game_versions=${q([gameVersion])}`,
  );
  return list.sort((a, b) => b.date_published.localeCompare(a.date_published));
}

export async function searchMods(query: string, gameVersion: string, limit = 5): Promise<{ project_id: string; slug: string; title: string; author: string }[]> {
  const facets = [["project_type:mod"], ["categories:fabric"], [`versions:${gameVersion}`]];
  const res = await getJson<any>(`${MODRINTH_API}/search?query=${encodeURIComponent(query)}&limit=${limit}&facets=${q(facets)}`);
  return res.hits;
}

const RANK = { release: 0, beta: 1, alpha: 2 } as const;

/**
 * 가장 알맞은 버전 고르기.
 * - 정식(release) 우선. 정식이 하나도 없을 때만 베타, 그 다음 알파
 * - 지금 쓰는 것보다 불안정한 단계로는 바꾸지 않음 (단, 정식이 없으면 어쩔 수 없음)
 */
export function pickVersion(versions: MrVersion[], allowUnstable = true): MrVersion | null {
  const sorted = [...versions].sort((a, b) => b.date_published.localeCompare(a.date_published));
  for (const type of ["release", "beta", "alpha"] as const) {
    if (!allowUnstable && type !== "release") break;
    const v = sorted.find((x) => x.version_type === type && x.files.length > 0);
    if (v) return v;
  }
  return null;
}

export function stabilityRank(t: MrVersion["version_type"]) {
  return RANK[t];
}

export function primaryFile(v: MrVersion): MrFile {
  return v.files.find((f) => f.primary) ?? v.files[0];
}

export function toPackMod(project: MrProject, v: MrVersion, dependencyOf?: string[]): PackMod {
  const f = primaryFile(v);
  return {
    projectId: project.id,
    slug: project.slug,
    name: project.title,
    versionId: v.id,
    versionNumber: v.version_number,
    versionType: v.version_type,
    gameVersions: v.game_versions,
    fileName: f.filename,
    url: f.url,
    sha1: f.hashes.sha1,
    sha512: f.hashes.sha512,
    size: f.size,
    client: project.client_side,
    server: project.server_side,
    ...(dependencyOf && dependencyOf.length ? { dependencyOf } : {}),
    ...(project.project_type === "resourcepack" ? { kind: "resourcepack" as const } : {}),
  };
}
