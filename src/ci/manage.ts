/**
 * 모드 추가/삭제 (GitHub Actions "모드 추가·삭제" 버튼에서 실행)
 * ADD_MODS="sodium-extra, https://modrinth.com/mod/xaeros-minimap"  REMOVE_MODS="freecam"
 */
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import { downloadFile } from "../core/http";
import { getProject, getVersions, loaderFor, toPackMod } from "../core/modrinth";
import { PackMod } from "../core/pack";
import { cached, plan, withCompat } from "./resolve";
import { testPack } from "./tester";
import { cfProjectId, getCfMod, hasCfKey, readCurseForge, withCurseForge, writeCurseForge } from "./curseforge";

const norm = (x: string) => x.toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
import { addChangelog, nextPackVersion, PACK_DIR, readCompat, readHeld, readMods, readPack, writeHeld, writeMods, writePack } from "./source";

function parseList(s: string | undefined): string[] {
  return (s ?? "")
    .split(/[,\s]+/)
    .map((x) => x.trim().replace(/^https?:\/\/modrinth\.com\/(mod|plugin|datapack|resourcepack)\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

/**
 * pack/requests.json 으로도 요청 가능 (push하면 자동 처리 후 비워짐)
 * { "add": ["sodium-extra", { "modrinth": "essential", "curseforge": "essential-mod" }], "remove": ["freecam"] }
 */
type AddItem = string | { modrinth?: string; curseforge?: string };
/** inspect: 모드 파일 안의 fabric.mod.json(필요·충돌 정보)을 결과 파일에 적음 (원인 분석용) */
const REQUESTS = path.join(PACK_DIR, "requests.json");
/** upgrade: 베타까지 허용해서 가장 새 버전으로 (다른 모드가 새 버전을 요구할 때) */
/** use: {"모드주소": "previous" 또는 "버전 번호"} → 그 버전으로 바꾸고, 지금 버전은 보류 목록에 (자동 업데이트가 다시 올리지 않게) */
function readRequests(): { add: AddItem[]; remove: string[]; inspect: string[]; test: boolean; upgrade: string[]; use: Record<string, string>; reason: string } {
  try {
    const r = JSON.parse(fs.readFileSync(REQUESTS, "utf8"));
    return { add: r.add ?? [], remove: r.remove ?? [], inspect: r.inspect ?? [], test: !!r.test, upgrade: r.upgrade ?? [], use: r.use ?? {}, reason: r.reason ?? "" };
  } catch {
    return { add: [], remove: [], inspect: [], test: false, upgrade: [], use: {}, reason: "" };
  }
}

async function inspectMod(slug: string, mc: string): Promise<string[]> {
  if (slug.startsWith("pack:")) {
    // 지금 팩에 들어 있는 파일 그대로 확인
    const m = readMods().find((x) => x.slug === slug.slice(5));
    if (!m) return [`- ${slug}: 팩에 없음`];
    const dest = path.join(process.env.MMCRAFT_CI_HOME ?? ".ci-cache", "inspect", m.fileName);
    await downloadFile({ url: m.url, dest, sha1: m.sha1 });
    return describeJar(`${m.name} ${m.versionNumber} (팩에 들어 있는 파일)`, dest);
  }
  const p = await getProject(slug);
  if (!p) return [`- ${slug}: Modrinth에 없음`];
  const v = (await getVersions(p.id, mc))[0];
  if (!v) return [`- ${p.title}: ${mc} Fabric 버전 없음`];
  const f = v.files.find((x) => x.primary) ?? v.files[0];
  const dest = path.join(process.env.MMCRAFT_CI_HOME ?? ".ci-cache", "inspect", f.filename);
  await downloadFile({ url: f.url, dest, sha1: f.hashes.sha1 });
  return describeJar(`${p.title} ${v.version_number} (${f.filename})`, dest);
}

function describeJar(title: string, dest: string): string[] {
  const out: string[] = [`### ${title}`, "```"];
  const walk = (zip: AdmZip, depth: number) => {
    const meta = zip.getEntry("fabric.mod.json");
    if (meta) {
      try {
        const j = JSON.parse(meta.getData().toString("utf8"));
        out.push(`${"  ".repeat(depth)}${j.id} ${j.version}` +
          (j.depends ? ` depends=${JSON.stringify(j.depends)}` : "") +
          (j.breaks ? ` breaks=${JSON.stringify(j.breaks)}` : "") +
          (j.conflicts ? ` conflicts=${JSON.stringify(j.conflicts)}` : "") +
          (j.provides ? ` provides=${JSON.stringify(j.provides)}` : ""));
      } catch { out.push(`${"  ".repeat(depth)}(fabric.mod.json 읽기 실패)`); }
    }
    for (const e of zip.getEntries()) {
      if (depth < 2 && e.entryName.endsWith(".jar")) walk(new AdmZip(e.getData()), depth + 1);
    }
  };
  walk(new AdmZip(dest), 0);
  out.push("```");
  return out;
}

/** 실패 원인이 적힌 로그 부분 (Fabric 의존성 오류 목록 등) */
function logExcerpt(file?: string): string[] {
  if (!file || !fs.existsSync(file)) return ["(로그 없음)"];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.replace(/<\/?log4j:[^>]*>|<!\[CDATA\[|\]\]>/g, "").trimEnd()).filter((l) => l.trim());
  const i = lines.findIndex((l) => /resolution failed|Incompatible mod|Crash Report|Exception/i.test(l));
  return (i >= 0 ? lines.slice(i, i + 80) : lines.slice(-80)).filter((l) => !/SemVer is recommended/.test(l)).map((l) => l.slice(0, 300));
}

function out(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
const RESULT = path.join(PACK_DIR, "requests-result.md");
function say(lines: string[]) {
  console.log(lines.join("\n"));
  fs.appendFileSync(RESULT, lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

async function main() {
  const pack = readPack();
  let mods = readMods();
  const lines: string[] = [];
  const errors: string[] = [];
  const cfg = readCurseForge();
  const notes = new Set<string>();
  const provider = cached(withCurseForge(withCompat(cached({ project: getProject, versions: getVersions }), readCompat()), cfg, (n) => notes.add(n)));

  fs.writeFileSync(RESULT, `# 모드 추가·삭제 결과 (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)\n\n`);
  const req = readRequests();
  for (const slug of req.inspect) say(await inspectMod(slug, pack.minecraft));
  if (req.test) {
    // 지금 팩 그대로 실행해 보고 로그 앞부분을 기록
    const r = await testPack({ minecraft: pack.minecraft, fabricLoader: pack.fabricLoader, mods: readMods(), label: "check" });
    const log = r.logFile && fs.existsSync(r.logFile) ? r.logFile : path.join(process.env.MMCRAFT_CI_HOME ?? ".ci-cache", "last-client.log");
    const lines = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).map((l) => l.replace(/<\/?log4j:[^>]*>|<!\[CDATA\[|\]\]>/g, "").trimEnd()).filter((l) => /Loading \d+ mods|resolution|Reason|Backend library|OpenGL|GL_RENDERER|Renderer|Created: .*atlas|Sound engine|FATAL|Crash|Stopping/i.test(l)).slice(0, 40) : ["(로그 없음)"];
    say([`### 현재 팩 테스트: ${r.ok ? "통과" : "실패"} (${r.stage}: ${r.reason})`, "```", ...lines.map((l) => l.slice(0, 300)), "```"]);
  }
  const fromFile = req.add.length + req.remove.length + req.upgrade.length + Object.keys(req.use).length > 0;
  const held = readHeld();
  for (const [slug, want] of Object.entries(req.use)) {
    const i = mods.findIndex((m) => m.slug === slug);
    if (i < 0) { errors.push(`'${slug}'가 팩에 없음`); continue; }
    const m = mods[i];
    const vs = (await provider.versions(m.projectId, pack.minecraft, loaderFor(m.kind))).filter((v) => v.files.length > 0);
    const cur = vs.findIndex((v) => v.id === m.versionId);
    const pick = want === "previous" ? vs.slice(cur + 1).find((v) => v.version_type !== "alpha") : vs.find((v) => v.version_number === want);
    const proj = await provider.project(m.projectId);
    if (!pick || !proj) { errors.push(`${m.name}: '${want}' 버전을 찾지 못함`); continue; }
    const entry = (held[m.projectId] ??= { name: m.name, badVersions: [] });
    if (!entry.badVersions.some((b) => b.versionId === m.versionId)) {
      entry.badVersions.push({ versionId: m.versionId, versionNumber: m.versionNumber, minecraft: pack.minecraft, reason: req.reason || "직접 보류", date: new Date().toISOString().slice(0, 10) });
    }
    mods[i] = toPackMod(proj, pick, m.dependencyOf);
    lines.push(`${m.name} ${m.versionNumber} → ${pick.version_number} (${req.reason || "직접 지정"})`);
  }
  for (const slug of req.upgrade) {
    const i = mods.findIndex((m) => m.slug === slug);
    if (i < 0) { errors.push(`업그레이드할 '${slug}'가 팩에 없음`); continue; }
    const m = mods[i];
    const vs = (await provider.versions(m.projectId, pack.minecraft, loaderFor(m.kind)))
      .filter((v) => v.version_type !== "alpha" && v.files.length > 0);
    const best = vs[0];
    const proj = await provider.project(m.projectId);
    if (!best || !proj) { errors.push(`${m.name}: 받을 수 있는 새 버전 없음`); continue; }
    if (best.id === m.versionId) { errors.push(`${m.name}: 이미 가장 새 버전`); continue; }
    mods[i] = toPackMod(proj, best, m.dependencyOf);
    lines.push(`${m.name} ${m.versionNumber} → ${best.version_number}`);
  }
  const removeList = [...parseList(process.env.REMOVE_MODS), ...req.remove];
  const addList: { mr: string; cf?: string }[] = [
    ...parseList(process.env.ADD_MODS).map((x) => ({ mr: x })),
    ...req.add.map((a) => (typeof a === "string" ? { mr: a } : { mr: a.modrinth ?? a.curseforge ?? "", cf: a.curseforge })),
  ].filter((a) => a.mr);

  for (const slug of removeList) {
    const m = mods.find((x) => x.slug === slug || x.projectId === slug || x.name.toLowerCase() === slug.toLowerCase());
    if (!m) { errors.push(`삭제할 모드 '${slug}'가 팩에 없음`); continue; }
    mods = mods.filter((x) => x !== m);
    if (m.slug.startsWith("cf-")) cfg.only = cfg.only.filter((x) => x !== m.slug.slice(3));
    lines.push(`제거: ${m.name}`);
  }
  for (const { mr: slug, cf: cfSlug } of addList) {
    const p = await getProject(slug);
    if (!p) {
      // Modrinth에 없으면 CurseForge 전용으로
      const cf = await getCfMod(cfSlug ?? slug);
      if (!cf) { errors.push(`'${slug}' 모드를 Modrinth와 CurseForge 모두에서 찾지 못함`); continue; }
      if (!hasCfKey()) { errors.push(`${cf.name}: CurseForge 전용 모드라 CurseForge API 키(CF_API_KEY) 등록 후 추가 가능`); continue; }
      if (mods.some((m) => m.projectId === cfProjectId(cf.id))) { errors.push(`${cf.name}는 이미 팩에 있음`); continue; }
      cfg.only.push(cfSlug ?? slug);
      mods.push({
        projectId: cfProjectId(cf.id), slug: `cf-${cf.slug}`, name: cf.name, versionId: "", versionNumber: "", versionType: "release",
        gameVersions: [], fileName: "", url: "", sha1: "", sha512: "", size: 0, client: "optional", server: "optional",
      } as PackMod);
      lines.push(`새 모드: ${cf.name} (CurseForge)`);
      continue;
    }
    // CurseForge에도 같은 모드가 있으면 지원 버전 정보를 함께 확인
    const cfSame = await getCfMod(cfSlug ?? slug);
    if (cfSame && (cfSlug || norm(cfSame.name) === norm(p.title))) cfg.map[p.slug] = cfSlug ?? slug;
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
  writeCurseForge(cfg);
  if (lines.length === 0) { out("changed", "false"); return; }

  // 새로 넣은 모드의 버전 고르기 + 필요 라이브러리 정리 (기존 모드 버전은 그대로)
  const p = await plan(pack.minecraft, mods, provider, pack.policy, held, "update");
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
  const before = new Map(readMods().map((m) => [m.projectId, m.versionNumber]));
  const diff = finalMods.filter((m) => before.get(m.projectId) !== m.versionNumber).map((m) => `- ${m.name}: ${before.get(m.projectId) ?? "(새로)"} → ${m.versionNumber}`);
  say(["### 테스트할 변경", ...diff]);
  const r = await testPack({ minecraft: pack.minecraft, fabricLoader: pack.fabricLoader, mods: finalMods, label: "manage" });
  if (!r.ok) {
    say([`## ❌ 실행 테스트 실패 → 반영 안 함`, `- ${r.stage}: ${r.reason}`, "", "```", ...logExcerpt(r.logFile), "```"]);
    out("changed", "false");
    process.exit(1);
  }
  for (const m of finalMods) if (m.dependencyOf?.length && !mods.some((x) => x.projectId === m.projectId)) lines.push(`새 라이브러리: ${m.name}`);
  pack.version = nextPackVersion(pack.version, pack.minecraft, readMods(), finalMods);
  writePack(pack);
  writeMods(finalMods);
  writeHeld(held);
  addChangelog({ version: pack.version, minecraft: pack.minecraft, date: new Date().toISOString().slice(0, 10), lines });
  if (fromFile) fs.writeFileSync(REQUESTS, JSON.stringify({ add: [], remove: [] }, null, 2) + "\n");
  say([`## ✅ 팩 ${pack.version}`, ...lines.map((l) => `- ${l}`), ...[...notes].map((n) => `- (CurseForge) ${n}`)]);
  out("changed", "true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
