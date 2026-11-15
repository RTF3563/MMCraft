import { PackMod } from "../core/pack";
import { loaderFor, MrProject, MrVersion, stabilityRank, toPackMod } from "../core/modrinth";
import { Held, PackPolicy } from "./source";

/** Modrinth 조회를 바꿔 끼울 수 있게 (테스트에서는 가짜 데이터) */
export interface Provider {
  project(id: string): Promise<MrProject | null>;
  versions(projectId: string, mc: string, loader?: string): Promise<MrVersion[]>;
}

/** 캐시를 붙인 Provider */
export function cached(p: Provider): Provider {
  const pc = new Map<string, Promise<MrProject | null>>();
  const vc = new Map<string, Promise<MrVersion[]>>();
  return {
    project: (id) => {
      if (!pc.has(id)) pc.set(id, p.project(id));
      return pc.get(id)!;
    },
    versions: (id, mc, loader = "fabric") => {
      const k = `${id}@${mc}@${loader}`;
      if (!vc.has(k)) vc.set(k, p.versions(id, mc, loader));
      return vc.get(k)!;
    },
  };
}

export interface Change {
  projectId: string;
  name: string;
  from?: string; // 이전 버전 번호 (없으면 새로 추가)
  to: string;
  mod: PackMod;
  /** 이 변경 때문에 새로 들어오는 의존 모드 */
  deps: PackMod[];
}

export interface Plan {
  minecraft: string;
  ok: boolean;
  mods: PackMod[];
  changes: Change[];
  removed: PackMod[];
  missing: { name: string; reason: string }[];
  conflicts: { a: string; b: string }[];
}

function allowedRank(policy: PackPolicy, current?: PackMod): number {
  const p = stabilityRank(policy.minStability);
  return current ? Math.max(p, stabilityRank(current.versionType)) : p;
}

/** 금지 목록을 빼고, 허용된 안정 단계 안에서 가장 좋은 버전 */
export function chooseVersion(versions: MrVersion[], maxRank: number, held?: Held[string]): MrVersion | null {
  const bad = new Set((held?.badVersions ?? []).map((b) => b.versionId));
  const usable = versions
    .filter((v) => !bad.has(v.id) && v.files.length > 0 && stabilityRank(v.version_type) <= maxRank)
    .sort((a, b) => b.date_published.localeCompare(a.date_published));
  for (let r = 0; r <= maxRank; r++) {
    const v = usable.find((x) => stabilityRank(x.version_type) === r);
    if (v) return v;
  }
  return null;
}

/**
 * 목표 마크 버전(mc)에 맞는 모드 조합 계산.
 * mode = "update": 같은 마크 버전에서 최신화 (새 버전이 없으면 지금 버전 유지)
 * mode = "upgrade": 마크 버전 업 (모든 모드가 목표 버전을 지원해야 ok)
 */
export async function plan(
  mc: string,
  current: PackMod[],
  provider: Provider,
  policy: PackPolicy,
  held: Held,
  mode: "update" | "upgrade",
): Promise<Plan> {
  const result: Plan = { minecraft: mc, ok: true, mods: [], changes: [], removed: [], missing: [], conflicts: [] };
  const byId = new Map(current.map((m) => [m.projectId, m]));
  const topLevel = current.filter((m) => !m.dependencyOf || m.dependencyOf.length === 0);
  const chosen = new Map<string, { mod: PackMod; version?: MrVersion; changed: boolean }>();

  const projectOf = async (m: PackMod): Promise<MrProject> =>
    (await provider.project(m.projectId)) ?? {
      id: m.projectId, slug: m.slug, title: m.name, project_type: "mod",
      client_side: m.client, server_side: m.server, loaders: ["fabric"], game_versions: m.gameVersions,
    };

  // 1) 직접 넣은 모드
  for (const m of topLevel) {
    const versions = await provider.versions(m.projectId, mc, loaderFor(m.kind));
    const v = chooseVersion(versions, allowedRank(policy, m), held[m.projectId]);
    if (!v) {
      if (mode === "update" && m.gameVersions.includes(mc)) {
        chosen.set(m.projectId, { mod: m, changed: false });
      } else {
        result.missing.push({ name: m.name, reason: `${mc}용 Fabric 버전 없음` });
      }
      continue;
    }
    const project = await projectOf(m);
    const mod = toPackMod(project, v);
    chosen.set(m.projectId, { mod, version: v, changed: v.id !== m.versionId });
  }

  // 2) 필요한 의존 모드 채우기 (누가 필요로 하는지 기록)
  const requiredBy = new Map<string, Set<string>>();
  const depOwner = new Map<string, string>(); // 새 의존 모드 → 처음 요구한 모드
  const queue = [...chosen.keys()];
  const incompatible: [string, string][] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const entry = chosen.get(id)!;
    const deps = entry.version?.dependencies ?? [];
    for (const d of deps) {
      if (!d.project_id) continue;
      if (d.dependency_type === "incompatible") {
        incompatible.push([id, d.project_id]);
        continue;
      }
      if (d.dependency_type !== "required") continue;
      // 여러 로더용 파일에 붙은 NeoForge/Forge 전용 의존성은 무시 (예: KotlinLangForge)
      const depProject = await provider.project(d.project_id);
      const depKind = depProject?.project_type === "resourcepack" ? "resourcepack" : "mod";
      if (depProject && depKind === "mod" && !depProject.loaders.includes("fabric") && !depProject.loaders.includes("quilt")) continue;
      if (!requiredBy.has(d.project_id)) requiredBy.set(d.project_id, new Set());
      requiredBy.get(d.project_id)!.add(entry.mod.name);
      if (chosen.has(d.project_id)) continue;
      const existing = byId.get(d.project_id);
      const versions = await provider.versions(d.project_id, mc, loaderFor(depKind));
      const v = chooseVersion(versions, allowedRank(policy, existing), held[d.project_id]);
      const project = depProject;
      if (!v || !project) {
        if (mode === "update" && existing && existing.gameVersions.includes(mc)) {
          chosen.set(d.project_id, { mod: existing, changed: false });
        } else {
          result.missing.push({ name: project?.title ?? d.project_id, reason: `${entry.mod.name}에 필요한 모드인데 ${mc}용이 없음` });
        }
        continue;
      }
      const mod = toPackMod(project, v);
      chosen.set(d.project_id, { mod, version: v, changed: !existing || existing.versionId !== v.id });
      if (!existing) depOwner.set(d.project_id, id);
      queue.push(d.project_id);
    }
  }

  // 3) 충돌 (서로 같이 쓰면 안 된다고 표시된 모드)
  for (const [a, b] of incompatible) {
    if (chosen.has(b)) result.conflicts.push({ a: chosen.get(a)!.mod.name, b: chosen.get(b)!.mod.name });
  }

  // 4) 더 이상 아무도 필요로 하지 않는 자동 의존 모드는 제거
  for (const m of current) {
    if (m.dependencyOf && m.dependencyOf.length > 0 && !requiredBy.has(m.projectId) && !topLevel.some((t) => t.projectId === m.projectId)) {
      chosen.delete(m.projectId);
      result.removed.push(m);
    }
  }

  // 5) 결과 정리
  for (const [id, c] of chosen) {
    const isTop = topLevel.some((t) => t.projectId === id);
    const mod = { ...c.mod };
    if (!isTop) mod.dependencyOf = [...(requiredBy.get(id) ?? [])].sort();
    else delete mod.dependencyOf;
    result.mods.push(mod);
  }
  for (const [id, c] of chosen) {
    if (!c.changed || depOwner.has(id)) continue;
    const before = byId.get(id);
    const deps = [...depOwner.entries()].filter(([, owner]) => owner === id).map(([depId]) => result.mods.find((m) => m.projectId === depId)!);
    result.changes.push({ projectId: id, name: c.mod.name, from: before?.versionNumber, to: c.mod.versionNumber, mod: result.mods.find((m) => m.projectId === id)!, deps });
  }
  // 주인 없이 들어온 의존 모드 (주인이 바뀌지 않았는데 새로 필요해진 경우)
  for (const [depId, owner] of depOwner) {
    if (result.changes.some((c) => c.projectId === owner)) continue;
    const mod = result.mods.find((m) => m.projectId === depId)!;
    result.changes.push({ projectId: depId, name: mod.name, to: mod.versionNumber, mod, deps: [] });
  }

  result.ok = result.missing.length === 0 && result.conflicts.length === 0;
  return result;
}

/** 기존 조합에 일부 변경만 적용한 조합 (원인 모드 찾기용) */
export function applyChanges(base: PackMod[], changes: Change[], removed: PackMod[] = []): PackMod[] {
  const map = new Map(base.map((m) => [m.projectId, m]));
  for (const c of changes) {
    map.set(c.projectId, c.mod);
    for (const d of c.deps) map.set(d.projectId, d);
  }
  for (const r of removed) map.delete(r.projectId);
  return [...map.values()];
}

/**
 * 문제를 일으키는 변경 찾기 (반씩 나눠서 시험).
 * test(mods) → true면 통과. 시험 횟수가 budget을 넘으면 null.
 */
export async function findCulprits(
  base: PackMod[],
  changes: Change[],
  test: (mods: PackMod[]) => Promise<boolean>,
  budget: { left: number },
): Promise<Change[] | null> {
  async function search(items: Change[], accepted: Change[], knownFail: boolean): Promise<Change[] | null> {
    if (items.length === 0) return [];
    if (!knownFail) {
      if (budget.left <= 0) return null;
      budget.left--;
      if (await test(applyChanges(base, [...accepted, ...items]))) return [];
    }
    if (items.length === 1) return items;
    const mid = Math.ceil(items.length / 2);
    const a = items.slice(0, mid);
    const b = items.slice(mid);
    const badA = await search(a, accepted, false);
    if (badA === null) return null;
    const goodA = a.filter((x) => !badA.includes(x));
    // A가 전부 통과했다면 실패 원인은 B에 있음
    const badB = await search(b, [...accepted, ...goodA], badA.length === 0);
    if (badB === null) return null;
    return [...badA, ...badB];
  }
  return search(changes, [], true);
}
