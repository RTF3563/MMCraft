import * as fs from "fs";
import * as path from "path";
import { PackMod } from "../core/pack";

/** 저장소의 pack/ 폴더 (팩 원본) */
export const PACK_DIR = path.resolve(process.env.MMCRAFT_PACK_DIR ?? path.join(__dirname, "..", "..", "pack"));

export interface PackPolicy {
  /** 정식 버전이 없을 때 허용할 가장 불안정한 단계 */
  minStability: "release" | "beta" | "alpha";
  /** 모든 모드가 새 마크 버전을 지원하면 자동으로 버전 업 */
  autoUpgradeMinecraft: boolean;
  /** 문제 모드 찾기에 쓸 최대 테스트 횟수 (1회 약 5~8분) */
  maxBisectTests: number;
}

export interface PackSource {
  name: string;
  version: string;
  minecraft: string;
  fabricLoader: string;
  policy: PackPolicy;
  /** 게임 실행 때 꼭 넣을 Java 옵션 (예: Essential 재실행 끄기) */
  jvmArgs?: string[];
}

export interface HeldEntry {
  name: string;
  /** 테스트에서 문제가 난 버전 (이 버전들은 건너뜀) */
  badVersions: { versionId: string; versionNumber: string; minecraft: string; reason: string; date: string }[];
}

export type Held = Record<string, HeldEntry>; // projectId → 정보

export interface UpgradeStatus {
  checkedAt: string;
  current: string;
  target?: string;
  ready: boolean;
  waitingFor: { name: string; reason: string }[];
  note?: string;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export const files = {
  pack: () => path.join(PACK_DIR, "pack.json"),
  mods: () => path.join(PACK_DIR, "mods.json"),
  held: () => path.join(PACK_DIR, "held.json"),
  changelog: () => path.join(PACK_DIR, "changelog.json"),
  upgrade: () => path.join(PACK_DIR, "upgrade-status.json"),
  overrides: () => path.join(PACK_DIR, "overrides"),
  installNames: () => path.join(PACK_DIR, "install-names.json"),
  compat: () => path.join(PACK_DIR, "compat.json"),
  curseforge: () => path.join(PACK_DIR, "curseforge.json"),
};

/** pack/compat.json (설명용 "_설명" 키는 무시) */
export function readCompat(): Record<string, Record<string, string[]>> {
  const raw = readJson<Record<string, any>>(files.compat(), {});
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_")));
}

/** 설치 파일 이름 고정 (예: 기본 설정이 "file/Chat Reporting Helper.zip"을 켜도록 되어 있을 때) */
export function applyInstallNames(mods: PackMod[]): PackMod[] {
  const names = readJson<Record<string, string>>(files.installNames(), {});
  return mods.map((m) => (names[m.slug] ? { ...m, fileName: names[m.slug] } : m));
}

export const readPack = () => readJson<PackSource>(files.pack(), null as any);
export const writePack = (p: PackSource) => writeJson(files.pack(), p);
export const readMods = () => readJson<PackMod[]>(files.mods(), []);
export const writeMods = (m: PackMod[]) =>
  writeJson(files.mods(), [...m].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })));
export const readHeld = () => readJson<Held>(files.held(), {});
export const writeHeld = (h: Held) => writeJson(files.held(), h);
export const writeUpgradeStatus = (s: UpgradeStatus) => writeJson(files.upgrade(), s);

export interface ChangelogEntry {
  version: string;
  minecraft: string;
  date: string;
  lines: string[];
}
export const readChangelog = () => readJson<ChangelogEntry[]>(files.changelog(), []);
export function addChangelog(e: ChangelogEntry) {
  const all = readChangelog();
  all.unshift(e);
  writeJson(files.changelog(), all.slice(0, 50));
}

/** 0.1.3 → 0.1.4 (patch) / 0.2.0 (minor) */
export function bumpVersion(v: string, kind: "patch" | "minor"): string {
  const [a, b, c] = v.split(".").map((x) => parseInt(x, 10) || 0);
  return kind === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}
