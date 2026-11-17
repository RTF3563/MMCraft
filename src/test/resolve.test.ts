import { test } from "node:test";
import assert from "node:assert/strict";
import { MrProject, MrVersion } from "../core/modrinth";
import { PackMod } from "../core/pack";
import { applyChanges, chooseVersion, findCulprits, plan, Provider, withCompat } from "../ci/resolve";
import { nextPackVersion, PackPolicy } from "../ci/source";
import { CfMod, withCurseForge } from "../ci/curseforge";

const policy: PackPolicy = { minStability: "beta", autoUpgradeMinecraft: true, maxBisectTests: 8 };

let day = 0;
function ver(project: string, num: string, games: string[], type: MrVersion["version_type"] = "release", deps: MrVersion["dependencies"] = []): MrVersion {
  day++;
  return {
    id: `${project}-${num}`, project_id: project, name: num, version_number: num, version_type: type, game_versions: games, loaders: ["fabric"],
    files: [{ hashes: { sha1: `${project}${num}`, sha512: "" }, url: `https://cdn/${project}-${num}.jar`, filename: `${project}-${num}.jar`, primary: true, size: 1 }],
    dependencies: deps, date_published: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
  };
}
const req = (id: string) => ({ project_id: id, version_id: null, file_name: null, dependency_type: "required" as const });
const inc = (id: string) => ({ project_id: id, version_id: null, file_name: null, dependency_type: "incompatible" as const });

function provider(all: MrVersion[]): Provider {
  return {
    project: async (id) => ({ id, slug: id, title: id.toUpperCase(), project_type: "mod", client_side: "required", server_side: "optional", loaders: id.startsWith("forge") ? ["neoforge"] : ["fabric"], game_versions: [] } as MrProject),
    versions: async (id, mc) => all.filter((v) => v.project_id === id && v.game_versions.includes(mc)).sort((a, b) => b.date_published.localeCompare(a.date_published)),
  };
}
function packMod(v: MrVersion, dependencyOf?: string[]): PackMod {
  return {
    projectId: v.project_id, slug: v.project_id, name: v.project_id.toUpperCase(), versionId: v.id, versionNumber: v.version_number,
    versionType: v.version_type, gameVersions: v.game_versions, fileName: v.files[0].filename, url: v.files[0].url, sha1: v.files[0].hashes.sha1,
    sha512: "", size: 1, client: "required", server: "optional", ...(dependencyOf ? { dependencyOf } : {}),
  };
}

test("버전 고르기: 정식 우선, 베타 허용, 알파 제외, 보류 제외", () => {
  const vs = [ver("x", "2.0-alpha", ["26.3"], "alpha"), ver("x", "1.9-beta", ["26.3"], "beta"), ver("x", "1.8", ["26.3"])];
  assert.equal(chooseVersion(vs, 1)!.version_number, "1.8", "정식이 있으면 정식");
  assert.equal(chooseVersion(vs.slice(0, 2), 1)!.version_number, "1.9-beta", "정식이 없으면 베타");
  assert.equal(chooseVersion(vs.slice(0, 1), 1), null, "알파는 안 씀");
  assert.equal(chooseVersion(vs, 1, { name: "x", badVersions: [{ versionId: "x-1.8", versionNumber: "1.8", minecraft: "26.3", reason: "", date: "" }] })!.version_number, "1.9-beta");
});

test("같은 버전 업데이트 + 새 라이브러리 자동 추가 + 안 쓰는 라이브러리 제거", async () => {
  const a1 = ver("a", "1.0", ["26.3"], "release", [req("oldlib")]);
  const old = ver("oldlib", "1.0", ["26.3"]);
  const b1 = ver("b", "1.0", ["26.3"]);
  const a2 = ver("a", "1.1", ["26.3"], "release", [req("newlib")]);
  const lib = ver("newlib", "3.0", ["26.3"]);
  const current = [packMod(a1), packMod(old, ["A"]), packMod(b1)];
  const p = await plan("26.3", current, provider([a1, old, b1, a2, lib]), policy, {}, "update");
  assert.equal(p.ok, true);
  assert.deepEqual(p.mods.map((m) => m.versionId).sort(), ["a-1.1", "b-1.0", "newlib-3.0"]);
  assert.equal(p.changes.length, 1);
  assert.equal(p.changes[0].from, "1.0");
  assert.equal(p.changes[0].deps[0].projectId, "newlib");
  assert.deepEqual(p.removed.map((m) => m.projectId), ["oldlib"]);
  assert.deepEqual(p.mods.find((m) => m.projectId === "newlib")!.dependencyOf, ["A"]);
});

test("마크 버전 업: 하나라도 미지원이면 대기", async () => {
  const a = ver("a", "1.0", ["26.3"]);
  const b = ver("b", "1.0", ["26.3"]);
  const a4 = ver("a", "2.0", ["26.4"]);
  const current = [packMod(a), packMod(b)];
  let p = await plan("26.4", current, provider([a, b, a4]), policy, {}, "upgrade");
  assert.equal(p.ok, false);
  assert.deepEqual(p.missing.map((m) => m.name), ["B"]);

  const b4 = ver("b", "2.0-beta", ["26.4"], "beta");
  p = await plan("26.4", current, provider([a, b, a4, b4]), policy, {}, "upgrade");
  assert.equal(p.ok, true, "모두 지원하면 진행");
  assert.deepEqual(p.mods.map((m) => m.versionNumber).sort(), ["2.0", "2.0-beta"]);
});

test("같은 버전 업데이트에서는 새 버전이 없어도 기존 유지", async () => {
  const a = ver("a", "1.0", ["26.3"]);
  const p = await plan("26.3", [packMod(a)], provider([]), policy, {}, "update");
  assert.equal(p.ok, true);
  assert.equal(p.mods[0].versionId, "a-1.0");
  assert.equal(p.changes.length, 0);
});

test("서로 충돌 표시된 모드 감지", async () => {
  const a = ver("a", "1.0", ["26.3"], "release", [inc("b")]);
  const b = ver("b", "1.0", ["26.3"]);
  const p = await plan("26.3", [packMod(a), packMod(b)], provider([a, b]), policy, {}, "update");
  assert.equal(p.ok, false);
  assert.deepEqual(p.conflicts, [{ a: "A", b: "B" }]);
});

test("원인 모드 찾기 (반씩 나눠 시험)", async () => {
  const base = ["a", "b", "c", "d", "e", "f"].map((x) => packMod(ver(x, "1.0", ["26.3"])));
  const changes = ["a", "b", "c", "d", "e", "f"].map((x) => {
    const m = packMod(ver(x, "2.0", ["26.3"]));
    return { projectId: x, name: x, from: "1.0", to: "2.0", mod: m, deps: [] };
  });
  const bad = new Set(["c", "f"]);
  let tests = 0;
  const testFn = async (mods: PackMod[]) => {
    tests++;
    return !mods.some((m) => bad.has(m.projectId) && m.versionNumber === "2.0");
  };
  const found = await findCulprits(base, changes, testFn, { left: 20 });
  assert.deepEqual(found!.map((c) => c.projectId).sort(), ["c", "f"]);
  assert.ok(tests <= 10, `시험 ${tests}회`);
  const good = changes.filter((c) => !found!.includes(c));
  assert.ok(await testFn(applyChanges(base, good)), "나머지만 적용하면 통과");

  const none = await findCulprits(base, changes, testFn, { left: 1 });
  assert.equal(none, null, "시험 횟수 부족하면 포기");
});

test("NeoForge 전용 의존성은 무시", async () => {
  const z = ver("zoom", "1.0", ["26.3"], "release", [req("forgekotlin")]);
  const p = await plan("26.3", [packMod(z)], provider([z]), policy, {}, "update");
  assert.equal(p.ok, true);
  assert.deepEqual(p.missing, []);
});

test("호환 예외: 26.1용 파일을 26.3에서 사용 (26.4는 예외 없음)", async () => {
  const m = ver("mixintrace", "1.0", ["26.1", "26.1.1", "26.1.2"]);
  const prov = withCompat(provider([m]), { mixintrace: { "26.3": ["26.1", "26.1.1", "26.1.2"] } });
  const p = await plan("26.3", [packMod(m)], prov, policy, {}, "upgrade");
  assert.equal(p.ok, true);
  assert.equal(p.mods[0].versionId, "mixintrace-1.0");
  const p4 = await plan("26.4", [packMod(m)], prov, policy, {}, "upgrade");
  assert.equal(p4.ok, false, "26.4는 따로 확인해야 함");
});

test("CurseForge: 26.3 지원 표시된 같은 파일을 Modrinth에서 사용 + CurseForge 전용 모드", async () => {
  const mr = ver("mixin", "1.0", ["26.1.2"]); // Modrinth엔 26.1.2만
  const cfMods: Record<string, CfMod> = {
    "mixin-cf": { id: 1, slug: "mixin-cf", name: "Mixin", allowDistribution: true, files: [
      { fileId: 10, fileName: mr.files[0].filename, display: "x", gameVersions: ["Fabric", "26.3"], releaseType: "release", date: "2026-01-01" }] },
    "biome-music": { id: 840873, slug: "biome-music", name: "Biome Music", allowDistribution: true, files: [
      { fileId: 8906107, fileName: "biomemusic-fabric-26.3-4.3.jar", display: "biomemusic-fabric-26.3-4.3.jar", gameVersions: ["Client", "Fabric", "26.3"], releaseType: "release", date: "2026-02-01", sha1: "abc", size: 5, downloadUrl: "https://edge.forgecdn.net/files/8906/107/biomemusic-fabric-26.3-4.3.jar" },
      { fileId: 8906023, fileName: "biomemusic-26.3-4.3.jar", display: "neo", gameVersions: ["Client", "NeoForge", "26.3"], releaseType: "release", date: "2026-02-01", sha1: "def", size: 5, downloadUrl: "https://x" }] },
  };
  const notes: string[] = [];
  const make = (key: boolean) => withCurseForge(provider([mr]), { map: { mixin: "mixin-cf" }, only: ["biome-music"] }, (n) => notes.push(n), {
    getCf: async (s) => cfMods[s] ?? null,
    mrAllVersions: async (id) => (id === "mixin" ? [mr] : []),
    hasKey: () => key,
  });
  const seed = { ...packMod(mr), versionId: "" };
  const cfSeed = { ...packMod(ver("x", "0", [])), projectId: "cf:840873", slug: "cf-biome-music", name: "Biome Music", versionId: "" };

  const withKey = await plan("26.3", [seed, cfSeed], make(true), policy, {}, "upgrade");
  assert.equal(withKey.ok, true);
  assert.equal(withKey.mods.find((m) => m.projectId === "mixin")!.versionId, "mixin-1.0", "CurseForge 확인으로 Modrinth 파일 사용");
  const bm = withKey.mods.find((m) => m.projectId === "cf:840873")!;
  assert.equal(bm.fileName, "biomemusic-fabric-26.3-4.3.jar", "Fabric 파일만");
  assert.ok(bm.url.startsWith("https://edge.forgecdn.net/"));

  const noKey = await plan("26.3", [seed, cfSeed], make(false), policy, {}, "upgrade");
  assert.deepEqual(noKey.missing.map((m) => m.name), ["Biome Music"], "키 없으면 CurseForge 전용은 대기");
  assert.ok(notes.some((n) => n.includes("API 키")));
});

test("팩 버전 올리기", () => {
  const A = { projectId: "a" }, B = { projectId: "b" };
  assert.equal(nextPackVersion("0.1.6", "26.3", [A], [A]), "26.3.0.0"); // 예전 형식 → 새 형식
  assert.equal(nextPackVersion("26.3.0.0", "26.3", [A], [A]), "26.3.0.1"); // 업데이트만
  assert.equal(nextPackVersion("26.3.2.5", "26.3", [A], [A, B]), "26.3.3.0"); // 추가
  assert.equal(nextPackVersion("26.3.2.5", "26.3", [A, B], [A]), "26.3.3.0"); // 삭제
  assert.equal(nextPackVersion("26.3.2.5", "26.4", [A], [A]), "26.4.0.0"); // 마크 버전 업
  assert.equal(nextPackVersion("26.4.0.0", "26.4.1", [A], [A]), "26.4.1.0.0");
});
