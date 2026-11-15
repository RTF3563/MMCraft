/**
 * 모드 추가/삭제 (GitHub Actions "모드 추가·삭제" 버튼에서 실행)
 * ADD_MODS="sodium-extra, https://modrinth.com/mod/xaeros-minimap"  REMOVE_MODS="freecam"
 */
import * as fs from "fs";
import { getProject, getVersions, loaderFor } from "../core/modrinth";
import { PackMod } from "../core/pack";
import { cached, plan, withCompat } from "./resolve";
import { testPack } from "./tester";
import { addChangelog, bumpVersion, readCompat, readHeld, readMods, readPack, writeMods, writePack } from "./source";

function parseList(s: string | undefined): string[] {
  return (s ?? "")
    .split(/[,\s]+/)
    .map((x) => x.trim().replace(/^https?:\/\/modrinth\.com\/(mod|plugin|datapack|resourcepack)\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

function out(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function say(lines: string[]) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

async function main() {
  const pack = readPack();
  let mods = readMods();
  const lines: string[] = [];
  const errors: string[] = [];
  const provider = withCompat(cached({ project: getProject, versions: getVersions }), readCompat());

  for (const slug of parseList(process.env.REMOVE_MODS)) {
    const m = mods.find((x) => x.slug === slug || x.projectId === slug || x.name.toLowerCase() === slug.toLowerCase());
    if (!m) { errors.push(`삭제할 모드 '${slug}'가 팩에 없음`); continue; }
    mods = mods.filter((x) => x !== m);
    lines.push(`제거: ${m.name}`);
  }
  for (const slug of parseList(process.env.ADD_MODS)) {
    const p = await getProject(slug);
    if (!p) { errors.push(`Modrinth에 '${slug}' 모드가 없음`); continue; }
    if (mods.some((m) => m.projectId === p.id)) { errors.push(`${p.title}는 이미 팩에 있음`); continue; }
    const kind = p.project_type === "resourcepack" ? "resourcepack" : "mod";
    if ((await provider.versions(p.id, pack.minecraft, loaderFor(kind))).length === 0) { errors.push(`${p.title}: ${pack.minecraft}용 버전 없음`); continue; }
    mods.push({
      projectId: p.id, slug: p.slug, name: p.title, versionId: "", versionNumber: "", versionType: "release",
      gameVersions: [], fileName: "", url: "", sha1: "", sha512: "", size: 0, client: p.client_side, server: p.server_side,
      ...(kind === "resourcepack" ? { kind } : {}),
    } as PackMod);
    lines.push(`새 모드: ${p.title}`);
  }
  if (errors.length) say(["## ⚠ 확인 필요", ...errors.map((e) => `- ${e}`)]);
  if (lines.length === 0) { out("changed", "false"); return; }

  // 새로 넣은 모드의 버전 고르기 + 필요 라이브러리 정리 (기존 모드 버전은 그대로)
  const p = await plan(pack.minecraft, mods, provider, pack.policy, readHeld(), "update");
  const keep = new Map(mods.filter((m) => m.versionId).map((m) => [m.projectId, m]));
  const finalMods = p.mods.map((m) => {
    const old = keep.get(m.projectId);
    return old && !old.dependencyOf ? old : m;
  });
  if (!p.ok) {
    say(["## ❌ 추가 불가", ...p.missing.map((m) => `- ${m.name}: ${m.reason}`), ...p.conflicts.map((c) => `- 충돌: ${c.a} ↔ ${c.b}`)]);
    out("changed", "false");
    process.exit(1);
  }
  const r = await testPack({ minecraft: pack.minecraft, fabricLoader: pack.fabricLoader, mods: finalMods, label: "manage" });
  if (!r.ok) {
    say([`## ❌ 실행 테스트 실패 → 반영 안 함`, `- ${r.stage}: ${r.reason}`]);
    out("changed", "false");
    process.exit(1);
  }
  for (const m of finalMods) if (m.dependencyOf?.length && !mods.some((x) => x.projectId === m.projectId)) lines.push(`새 라이브러리: ${m.name}`);
  pack.version = bumpVersion(pack.version, "patch");
  writePack(pack);
  writeMods(finalMods);
  addChangelog({ version: pack.version, minecraft: pack.minecraft, date: new Date().toISOString().slice(0, 10), lines });
  say([`## ✅ 팩 ${pack.version}`, ...lines.map((l) => `- ${l}`)]);
  out("changed", "true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
