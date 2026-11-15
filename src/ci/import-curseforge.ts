/**
 * CurseForge에서 내보낸 모드 목록(pack/import/curseforge-modlist.json)을
 * Modrinth 모드로 찾아 pack/mods.json을 만든다. 결과는 pack/import/import-report.md
 */
import * as fs from "fs";
import * as path from "path";
import { getProject, getVersions, loaderFor, searchMods, MrProject } from "../core/modrinth";
import { PackMod } from "../core/pack";
import { cached, plan, Provider } from "./resolve";
import { PACK_DIR, readHeld, readPack, writeMods } from "./source";

interface CfEntry {
  name: string;
  author: string;
  curseforgeSlug: string;
}

/** CurseForge 주소 이름과 Modrinth 주소 이름이 다른 모드 (알려진 것) */
const KNOWN: Record<string, string[]> = {
  irisshaders: ["iris"],
  "ferritecore-fabric": ["ferrite-core"],
  "lootr-fabric": ["lootr"],
  "entity-texture-features-fabric": ["entitytexturefeatures"],
  "entity-model-features": ["entity-model-features"],
  "free-cam": ["freecam"],
  "terrablender-fabric": ["terrablender"],
  "falling-leaves-fabric": ["fallingleaves"],
  "prism-fabric": ["prism-lib"],
  "iceberg-fabric": ["iceberg"],
  "item-borders-fabric": ["item-borders"],
  "advancement-plaques-fabric": ["advancement-plaques"],
  "item-highlighter-fabric": ["item-highlighter"],
  "skin-layers-3d": ["3dskinlayers"],
  "structure-essentials-forge-fabric": ["structure-essentials"],
  "text-placeholder-api": ["placeholder-api"],
  morechathistory: ["morechathistory", "more-chat-history"],
  betterdays: ["better-days", "betterdays"],
  configmanager: ["configmanager"],
  "sodium-shadowy-path-blocks": ["sodium-shadowy-path-blocks", "sspb"],
  "particular-reforged": ["particular-reforged", "particular"],
  "almanac-lib": ["almanac", "almanac-lib"],
  "smooth-chunk-save": ["smooth-chunk-save", "smoothchunk"],
};

const MAPPING_FILE = path.join(PACK_DIR, "import", "mapping.json"); // 사람이 직접 고칠 수 있는 매핑
/** 정식·베타가 없을 때 알파 버전도 허용할 모드 (CurseForge 주소 이름) */
const ALLOW_ALPHA_FILE = path.join(PACK_DIR, "import", "allow-alpha.json");

const isUsable = (p: MrProject) =>
  (p.project_type === "mod" && p.loaders.includes("fabric")) || p.project_type === "resourcepack";
const kindOf = (p: MrProject) => (p.project_type === "resourcepack" ? "resourcepack" : "mod");

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function candidates(e: CfEntry, manual: Record<string, string | null>): string[] {
  const s = e.curseforgeSlug;
  const out = [...(manual[s] ? [manual[s]!] : []), ...(KNOWN[s] ?? []), s];
  for (const suf of ["-forge-fabric", "-fabric-forge", "-fabric", "-forge"]) if (s.endsWith(suf)) out.push(s.slice(0, -suf.length));
  return [...new Set(out)];
}

async function main() {
  const pack = readPack();
  const mc = pack.minecraft;
  const list: CfEntry[] = JSON.parse(fs.readFileSync(path.join(PACK_DIR, "import", "curseforge-modlist.json"), "utf8"));
  const manual: Record<string, string | null> = fs.existsSync(MAPPING_FILE) ? JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8")) : {};
  const allowAlpha: string[] = fs.existsSync(ALLOW_ALPHA_FILE) ? JSON.parse(fs.readFileSync(ALLOW_ALPHA_FILE, "utf8")) : [];

  const found: { e: CfEntry; p: MrProject; how: string }[] = [];
  const failed: { e: CfEntry; reason: string }[] = [];
  const skipped: CfEntry[] = [];

  for (const e of list) {
    if (manual[e.curseforgeSlug] === null) {
      skipped.push(e);
      continue;
    }
    let project: MrProject | null = null;
    let how = "";
    for (const c of candidates(e, manual)) {
      const p = await getProject(c);
      if (p && isUsable(p)) {
        project = p;
        how = c === e.curseforgeSlug ? "같은 주소" : `주소 '${c}'`;
        break;
      }
    }
    if (!project) {
      const hits = await searchMods(e.name.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim(), mc);
      const hit = hits.find((h) => normalize(h.title) === normalize(e.name));
      if (hit) {
        project = await getProject(hit.project_id);
        how = "이름 검색";
      }
    }
    if (!project) {
      failed.push({ e, reason: "Modrinth에서 찾지 못함" });
      continue;
    }
    if (found.some((f) => f.p.id === project!.id)) continue;
    const versions = await getVersions(project.id, mc, loaderFor(kindOf(project)));
    if (versions.length === 0) {
      failed.push({ e, reason: `Modrinth에는 있지만 ${mc}${kindOf(project) === "mod" ? " Fabric" : ""} 버전이 없음 (${project.slug})` });
      continue;
    }
    found.push({ e, p: project, how });
    console.log(`✓ ${e.name} → ${project.title} (${project.slug}, ${how})`);
  }

  // 각 모드의 최신 버전 + 필요한 라이브러리 자동 추가
  const seeds: PackMod[] = found.map(({ e, p }) => ({
    projectId: p.id, slug: p.slug, name: p.title, versionId: "", versionNumber: "",
    versionType: allowAlpha.includes(e.curseforgeSlug) || allowAlpha.includes(p.slug) ? "alpha" : "release",
    gameVersions: [], fileName: "", url: "", sha1: "", sha512: "", size: 0, client: p.client_side, server: p.server_side,
    ...(kindOf(p) === "resourcepack" ? { kind: "resourcepack" as const } : {}),
  }));
  const provider: Provider = cached({ project: getProject, versions: getVersions });
  const result = await plan(mc, seeds, provider, pack.policy, readHeld(), "upgrade");
  writeMods(result.mods);

  const r: string[] = [];
  r.push(`# CurseForge → Modrinth 가져오기 결과`, ``, `- Minecraft ${mc} / Fabric`, `- CurseForge 모드 ${list.length}개 → Modrinth로 찾음 **${found.length}개**, 못 찾음 **${failed.length}개**, 제외 ${skipped.length}개`);
  const added = result.mods.filter((m) => m.dependencyOf?.length);
  r.push(`- 필요해서 자동 추가된 라이브러리 ${added.length}개`, `- 최종 모드 수 **${result.mods.length}개**`, ``);
  if (failed.length) {
    r.push(`## ❗ 확인 필요 (못 찾은 모드)`, ``, `| CurseForge 모드 | 이유 |`, `|---|---|`);
    for (const f of failed) r.push(`| ${f.e.name} (${f.e.curseforgeSlug}) | ${f.reason} |`);
    r.push(``, `> \`pack/import/mapping.json\`에 \`"CurseForge주소": "Modrinth주소"\`를 적거나, 빼려면 \`null\`을 적고 다시 실행`, ``);
  }
  if (result.missing.length || result.conflicts.length) {
    r.push(`## ❗ 의존성 문제`, ``);
    for (const m of result.missing) r.push(`- ${m.name}: ${m.reason}`);
    for (const c of result.conflicts) r.push(`- 충돌: ${c.a} ↔ ${c.b}`);
    r.push(``);
  }
  if (skipped.length) {
    r.push(`## 제외한 모드 (mapping.json에서 null)`, ``);
    for (const e of skipped) r.push(`- ${e.name}`);
    r.push(``);
  }
  r.push(`## 연결된 모드`, ``, `| CurseForge | Modrinth | 종류 | 찾은 방법 | 버전 |`, `|---|---|---|---|---|`);
  for (const f of found) {
    const m = result.mods.find((x) => x.projectId === f.p.id);
    const k = kindOf(f.p);
    r.push(`| ${f.e.name} | [${f.p.title}](https://modrinth.com/${k}/${f.p.slug}) | ${k === "mod" ? "모드" : "리소스팩"} | ${f.how} | ${m ? `${m.versionNumber} (${m.versionType})` : "❌ 빠짐"} |`);
  }
  if (added.length) {
    r.push(``, `## 자동 추가된 라이브러리`, ``);
    for (const m of added) r.push(`- ${m.name} (${m.versionNumber}) ← ${m.dependencyOf!.join(", ")}`);
  }
  fs.writeFileSync(path.join(PACK_DIR, "import", "import-report.md"), r.join("\n") + "\n");
  console.log(`\n찾음 ${found.length} / 못 찾음 ${failed.length} / 최종 ${result.mods.length}개`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, r.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
