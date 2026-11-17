/**
 * CurseForge에서 내보낸 모드 목록(pack/import/curseforge-modlist.json)을
 * Modrinth 모드로 찾아 pack/mods.json을 만든다. 결과는 pack/import/import-report.md
 */
import * as fs from "fs";
import * as path from "path";
import { getProject, getVersions, loaderFor, searchMods, MrProject } from "../core/modrinth";
import { PackMod } from "../core/pack";
import { cached, plan, Provider, withCompat } from "./resolve";
import { cfFilesFor, cfProblems, cfProjectId, CfMod, getCfMod, hasCfKey, readCurseForge, withCurseForge, writeCurseForge } from "./curseforge";
import { addChangelog, nextPackVersion, PACK_DIR, readCompat, readHeld, readMods, readPack, writeMods, writePack } from "./source";

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

  const cfg = readCurseForge();
  const cfNotes = new Set<string>();
  const provider: Provider = cached(withCurseForge(withCompat(cached({ project: getProject, versions: getVersions }), readCompat()), cfg, (n) => cfNotes.add(n)));
  const found: { e: CfEntry; p: MrProject; how: string }[] = [];
  const cfOnly: { e: CfEntry; mod: CfMod }[] = [];
  const failed: { e: CfEntry; reason: string }[] = [];
  const skipped: CfEntry[] = [];

  /** Modrinth에 없을 때 CurseForge 전용으로 넣을 수 있는지 */
  async function tryCurseForge(e: CfEntry, why: string) {
    const mod = await getCfMod(e.curseforgeSlug);
    if (mod && cfFilesFor(mod, mc).length > 0) {
      cfOnly.push({ e, mod });
      cfg.only.push(e.curseforgeSlug);
      console.log(`✓ ${e.name} → CurseForge 전용 (${why})`);
    } else {
      failed.push({ e, reason: mod ? `${why}, CurseForge에 ${mc} Fabric 파일 없음 (받은 파일 ${mod.files.length}개)` : `${why}, CurseForge 조회 실패` });
    }
  }

  for (const e of list) {
    if (manual[e.curseforgeSlug] === null) {
      skipped.push(e);
      continue;
    }
    if (manual[e.curseforgeSlug] === "curseforge") {
      await tryCurseForge(e, "CurseForge 전용으로 지정");
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
      await tryCurseForge(e, "Modrinth에 없음");
      continue;
    }
    if (found.some((f) => f.p.id === project!.id)) continue;
    if (kindOf(project) === "mod") cfg.map[project.slug] = e.curseforgeSlug; // CurseForge 지원 버전 정보도 함께 확인
    const versions = await provider.versions(project.id, mc, loaderFor(kindOf(project)));
    if (versions.length === 0) {
      delete cfg.map[project.slug];
      await tryCurseForge(e, `Modrinth(${project.slug})에 ${mc}${kindOf(project) === "mod" ? " Fabric" : ""} 버전 없음`);
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
  for (const { e, mod } of cfOnly) {
    seeds.push({
      projectId: cfProjectId(mod.id), slug: `cf-${mod.slug}`, name: mod.name, versionId: "", versionNumber: "",
      versionType: allowAlpha.includes(e.curseforgeSlug) ? "alpha" : "release",
      gameVersions: [], fileName: "", url: "", sha1: "", sha512: "", size: 0, client: "optional", server: "optional",
    });
  }
  writeCurseForge(cfg);
  const result = await plan(mc, seeds, provider, pack.policy, readHeld(), "upgrade");
  // 이미 배포된 목록과 다르면 팩 버전을 올려서 플레이어 런처가 업데이트하게 함
  const before = readMods();
  const key = (ms: PackMod[]) => ms.map((m) => m.versionId).sort().join(",");
  if (before.length > 0 && key(before) !== key(result.mods)) {
    pack.version = nextPackVersion(pack.version, mc, before, result.mods);
    writePack(pack);
    const added = result.mods.filter((m) => !before.some((b) => b.projectId === m.projectId)).map((m) => `새 모드: ${m.name}`);
    const removed = before.filter((b) => !result.mods.some((m) => m.projectId === b.projectId)).map((m) => `제거: ${m.name}`);
    addChangelog({ version: pack.version, minecraft: mc, date: new Date().toISOString().slice(0, 10), lines: [...added, ...removed, "모드 목록 다시 가져오기"] });
  }
  writeMods(result.mods);

  const r: string[] = [];
  r.push(`# CurseForge → Modrinth 가져오기 결과`, ``, `- Minecraft ${mc} / Fabric · CurseForge 확인: ${hasCfKey() ? "공식 API" : "CFWidget (API 키 없음)"}`, `- CurseForge 모드 ${list.length}개 → Modrinth로 찾음 **${found.length}개**, CurseForge 전용 **${cfOnly.length}개**, 못 찾음 **${failed.length}개**, 제외 ${skipped.length}개`);
  const added = result.mods.filter((m) => m.dependencyOf?.length);
  r.push(`- 필요해서 자동 추가된 라이브러리 ${added.length}개`, `- 최종 모드 수 **${result.mods.length}개**`, ``);
  if (failed.length) {
    r.push(`## ❗ 확인 필요 (못 찾은 모드)`, ``, `| CurseForge 모드 | 이유 |`, `|---|---|`);
    for (const f of failed) r.push(`| ${f.e.name} (${f.e.curseforgeSlug}) | ${f.reason} |`);
    r.push(``, `> \`pack/import/mapping.json\`에 \`"CurseForge주소": "Modrinth주소"\`를 적거나, 빼려면 \`null\`을 적고 다시 실행`, ``);
  }
  if (cfOnly.length) {
    r.push(`## CurseForge 전용 모드`, ``);
    for (const { mod } of cfOnly) {
      const inPack = result.mods.some((m) => m.projectId === cfProjectId(mod.id));
      const why = inPack ? "✅ 설치 (CurseForge에서 받음)"
        : !hasCfKey() ? "⏳ CurseForge API 키(CF_API_KEY)를 등록하면 설치됨"
        : mod.allowDistribution === false ? "❌ 제작자가 외부 배포를 막음 (CurseForge 앱에서만 받을 수 있음)"
        : mod.allowDistribution === null ? "⚠ API 키가 작동하지 않아 확인 못 함 (아래 'CurseForge 조회 문제')"
        : "❌ 26.3 Fabric 파일을 받을 수 없음";
      r.push(`- ${mod.name}: ${why}`);
    }
    r.push(``);
  }
  if (cfProblems.length) {
    const keyBad = cfProblems.filter((p) => /403|API Key missing or invalid/i.test(p)).length;
    const others = cfProblems.filter((p) => !/403|API Key missing or invalid/i.test(p));
    r.push(`## ⚠ CurseForge 조회 문제`, ``);
    if (keyBad) r.push(`- **CurseForge가 API 키를 거부함** (403 "API Key missing or invalid", ${keyBad}건) → GitHub Secrets의 CF_API_KEY 값을 확인하세요. 그동안은 CFWidget으로 정보만 확인`);
    r.push(...others.map((n) => `- ${n}`), ``);
  }
  if (cfNotes.size) {
    r.push(`## CurseForge 정보로 보완`, ``, ...[...cfNotes].map((n) => `- ${n}`), ``);
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
