/**
 * 매일 실행되는 자동 업데이트.
 * 1) 새 마크 버전이 있고 모든 모드가 지원하면 → 실행 테스트 → 버전 업
 * 2) 아니면 같은 마크 버전에서 모드 최신화 → 실행 테스트 → 문제 모드는 보류하고 나머지만 반영
 */
import * as fs from "fs";
import { getProject, getProjects, getVersions, MrProject } from "../core/modrinth";
import { compareMcVersions, fabricSupportsGame, getVersionManifest, latestFabricLoader, releaseVersions } from "../core/minecraft";
import { PackMod } from "../core/pack";
import { applyChanges, cached, Change, findCulprits, plan, Provider, withCompat } from "./resolve";
import { testPack, TestResult } from "./tester";
import { cfProblems, hasCfKey, readCurseForge, withCurseForge } from "./curseforge";
import {
  addChangelog, nextPackVersion, Held, readCompat, readHeld, readMods, readPack, UpgradeStatus,
  writeHeld, writeMods, writePack, writeUpgradeStatus,
} from "./source";

const today = () => new Date().toISOString().slice(0, 10);

function output(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function summary(lines: string[]) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

const cfNotes = new Set<string>();

async function makeProvider(mods: PackMod[]): Promise<Provider> {
  const known = new Map<string, MrProject>();
  for (const p of await getProjects(mods.map((m) => m.projectId).filter((id) => !id.startsWith("cf:")))) known.set(p.id, p);
  const base = withCompat(cached({
    project: async (id) => known.get(id) ?? getProject(id),
    versions: getVersions,
  }), readCompat());
  return cached(withCurseForge(base, readCurseForge(), (n) => cfNotes.add(n)));
}

function changeLines(changes: Change[], removed: PackMod[]): string[] {
  const lines: string[] = [];
  for (const c of changes) {
    const so = c.mod.serverOnly ? " (서버 전용)" : "";
    lines.push(c.from ? `${c.name} ${c.from} → ${c.to}${so}` : `새 모드: ${c.name} ${c.to}${so}`);
    for (const d of c.deps) lines.push(`새 라이브러리: ${d.name} ${d.versionNumber} (${c.name}에 필요)`);
  }
  for (const r of removed) lines.push(`제거: ${r.name} (더 이상 필요 없는 라이브러리)`);
  return lines;
}

function holdVersions(held: Held, culprits: Change[], mc: string, result: TestResult) {
  for (const c of culprits) {
    for (const m of [c.mod, ...c.deps]) {
      const entry = (held[m.projectId] ??= { name: m.name, badVersions: [] });
      if (!entry.badVersions.some((b) => b.versionId === m.versionId)) {
        entry.badVersions.push({
          versionId: m.versionId, versionNumber: m.versionNumber, minecraft: mc,
          reason: `${result.stage === "server" ? "서버" : "클라이언트"} 실행 실패: ${result.reason}`.slice(0, 300),
          date: today(),
        });
      }
    }
  }
}

async function tryUpgrade(): Promise<boolean> {
  const pack = readPack();
  const mods = readMods();
  const held = readHeld();
  const manifest = await getVersionManifest();
  const newer = releaseVersions(manifest)
    .map((v) => v.id)
    .filter((id) => compareMcVersions(id, pack.minecraft) > 0)
    .reverse(); // 최신부터
  const status: UpgradeStatus = { checkedAt: new Date().toISOString(), current: pack.minecraft, ready: false, waitingFor: [] };
  if (newer.length === 0) {
    status.note = "새 마인크래프트 버전 없음";
    writeUpgradeStatus(status);
    return false;
  }
  if (!pack.policy.autoUpgradeMinecraft) {
    status.target = newer[0];
    status.note = "자동 버전 업이 꺼져 있음 (pack.json policy.autoUpgradeMinecraft)";
    writeUpgradeStatus(status);
    return false;
  }
  const provider = await makeProvider(mods);
  for (const target of newer) {
    const s: UpgradeStatus = { ...status, target, waitingFor: [] };
    if (!(await fabricSupportsGame(target))) {
      s.waitingFor.push({ name: "Fabric Loader", reason: `${target} 미지원` });
      if (target === newer[0]) Object.assign(status, s);
      continue;
    }
    const p = await plan(target, mods, provider, pack.policy, held, "upgrade");
    if (!p.ok) {
      s.waitingFor.push(...p.missing);
      for (const c of p.conflicts) s.waitingFor.push({ name: `${c.a} ↔ ${c.b}`, reason: "서로 충돌" });
      if (target === newer[0]) Object.assign(status, s);
      summary([`## ${target} 버전 업 대기`, `지원 안 하는 모드 ${s.waitingFor.length}개:`, ...s.waitingFor.map((w) => `- ${w.name}: ${w.reason}`)]);
      continue;
    }
    const loader = (await latestFabricLoader(target))!;
    summary([`## ${target}: 모든 모드 지원 확인 → 실행 테스트`]);
    const result = await testPack({ minecraft: target, fabricLoader: loader, mods: p.mods, label: `upgrade-${target}` });
    if (!result.ok) {
      s.waitingFor.push({ name: "실행 테스트", reason: `${result.stage}: ${result.reason}` });
      if (target === newer[0]) Object.assign(status, s);
      summary([`❌ ${target} 실행 테스트 실패: ${result.reason} (다음 실행 때 다시 시도)`]);
      continue;
    }
    const from = pack.minecraft;
    pack.minecraft = target;
    pack.fabricLoader = loader;
    pack.version = nextPackVersion(pack.version, target, [], []);
    writePack(pack);
    writeMods(p.mods);
    const lines = [`Minecraft ${from} → ${target}`, `Fabric Loader → ${loader}`, ...changeLines(p.changes, p.removed)];
    addChangelog({ version: pack.version, minecraft: target, date: today(), lines });
    writeUpgradeStatus({ checkedAt: status.checkedAt, current: target, ready: true, waitingFor: [], note: `${from} → ${target} 버전 업 완료` });
    summary([`## ✅ ${from} → ${target} 버전 업 (팩 ${pack.version})`, ...lines.map((l) => `- ${l}`)]);
    return true;
  }
  writeUpgradeStatus(status);
  return false;
}

async function updateMods(): Promise<boolean> {
  const pack = readPack();
  const mods = readMods();
  const held = readHeld();
  const mc = pack.minecraft;
  const provider = await makeProvider(mods);
  const p = await plan(mc, mods, provider, pack.policy, held, "update");

  // 충돌이 생기는 업데이트는 이번엔 빼기
  const conflictNames = new Set(p.conflicts.flatMap((c) => [c.a, c.b]));
  let changes = p.changes.filter((c) => !conflictNames.has(c.name));
  if (p.conflicts.length) summary(["충돌로 제외: " + p.conflicts.map((c) => `${c.a} ↔ ${c.b}`).join(", ")]);
  const removed = p.removed;

  const newestLoader = (await latestFabricLoader(mc)) ?? pack.fabricLoader;
  let loader = newestLoader;
  const loaderChanged = newestLoader !== pack.fabricLoader;

  if (changes.length === 0 && removed.length === 0 && !loaderChanged) {
    summary([`## 변경 없음 (Minecraft ${mc}, 모드 ${mods.length}개 모두 최신)`]);
    return false;
  }
  summary([`## 업데이트 후보 ${changes.length}개${loaderChanged ? ` + Fabric Loader ${newestLoader}` : ""}`, ...changeLines(changes, removed).map((l) => `- ${l}`)]);

  const budget = { left: pack.policy.maxBisectTests };
  const run = (ms: PackMod[], l: string, label: string) => testPack({ minecraft: mc, fabricLoader: l, mods: ms, label });

  let full = await run(applyChanges(mods, changes, removed), loader, "all");
  let culprits: Change[] = [];
  if (!full.ok) {
    summary([`❌ 전체 테스트 실패 (${full.stage}: ${full.reason}) → 원인 찾는 중`]);
    if (loaderChanged) {
      budget.left--;
      const r = await run(applyChanges(mods, changes, removed), pack.fabricLoader, "old-loader");
      if (r.ok) {
        loader = pack.fabricLoader;
        full = r;
        summary([`Fabric Loader ${newestLoader}이(가) 원인 → 기존 ${pack.fabricLoader} 유지`]);
      } else {
        loader = pack.fabricLoader;
      }
    }
    if (!full.ok) {
      const found = await findCulprits(mods, changes, async (ms) => (await run(ms, loader, "bisect")).ok, budget);
      if (found === null) {
        summary([`⚠ 테스트 횟수(${pack.policy.maxBisectTests}회) 안에 원인을 못 찾음 → 이번엔 업데이트 안 함`]);
        return false;
      }
      culprits = found;
      holdVersions(held, culprits, mc, full);
      changes = changes.filter((c) => !culprits.includes(c));
      summary([`원인 모드 보류: ${culprits.map((c) => `${c.name} ${c.to}`).join(", ") || "없음"}`]);
      if (changes.length === 0 && removed.length === 0 && loader === pack.fabricLoader) {
        writeHeld(held);
        return false;
      }
      const final = await run(applyChanges(mods, changes, removed), loader, "final");
      if (!final.ok) {
        writeHeld(held);
        summary([`⚠ 남은 업데이트로도 실패 (${final.reason}) → 이번엔 업데이트 안 함`]);
        return false;
      }
    }
  }

  const finalMods = applyChanges(mods, changes, removed);
  const lines = changeLines(changes, removed);
  if (loader !== pack.fabricLoader) lines.unshift(`Fabric Loader ${pack.fabricLoader} → ${loader}`);
  if (lines.length === 0) {
    writeHeld(held);
    return false;
  }
  pack.fabricLoader = loader;
  pack.version = nextPackVersion(pack.version, mc, mods, finalMods);
  writePack(pack);
  writeMods(finalMods);
  writeHeld(held);
  for (const c of culprits) lines.push(`보류(문제 발견): ${c.name} ${c.to}`);
  addChangelog({ version: pack.version, minecraft: mc, date: today(), lines });
  summary([`## ✅ 팩 ${pack.version} 배포 준비`, ...lines.map((l) => `- ${l}`)]);
  return true;
}

async function main() {
  const upgraded = await tryUpgrade();
  const updated = upgraded ? false : await updateMods();
  summary([`## CurseForge 확인 (${hasCfKey() ? "공식 API" : "CFWidget, API 키 없음"})`, ...(cfNotes.size ? [...cfNotes].map((n) => `- ${n}`) : ["- 특이사항 없음"]), ...cfProblems.map((p) => `- ⚠ ${p}`)]);
  output("changed", String(upgraded || updated));
  output("version", readPack().version);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
