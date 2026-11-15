/** 런처: 팩 확인 → (월드 백업) → 설치/업데이트 → 실행 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import { Layout } from "../core/paths";
import { currentPlatform } from "../core/rules";
import { installVersion, resolveVersion } from "../core/minecraft";
import { ensureJava } from "../core/java";
import { buildLaunchCommand } from "../core/launch";
import {
  classifyUpdate, fetchPackIndex, loadState, PackIndex, saveState, syncPack, UpdateKind, unmanagedMods,
} from "../core/pack";
import { backupSaves } from "../core/backup";
import { Account } from "./auth";
import { tr } from "../core/i18n";

export interface Settings {
  /** auto = 컴퓨터 언어를 따름 */
  language: "auto" | "ko" | "en";
  memoryMb: number;
  hideOnLaunch: boolean;
  extraJvmArgs: string;
  width: number;
  height: number;
}

export function defaultSettings(): Settings {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
  const mem = Math.max(4096, Math.min(8192, Math.floor(totalMb / 2 / 512) * 512));
  return { language: "auto", memoryMb: mem, hideOnLaunch: true, extraJvmArgs: "", width: 1280, height: 720 };
}

export function loadSettings(layout: Layout): Settings {
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(layout.settings, "utf8")) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(layout: Layout, s: Settings) {
  fs.mkdirSync(layout.root, { recursive: true });
  fs.writeFileSync(layout.settings, JSON.stringify(s, null, 2));
}

export interface Status {
  online: boolean;
  installed?: { packVersion?: string; minecraft?: string };
  latest?: { packVersion: string; minecraft: string; changelog: string[]; modCount: number };
  updateKind: UpdateKind | "offline";
  userMods: string[];
}

export type ProgressFn = (p: { label: string; done: number; total: number }) => void;

const indexCache = (layout: Layout) => path.join(layout.cache, "index.json");

async function getIndex(layout: Layout): Promise<{ index: PackIndex | null; online: boolean }> {
  try {
    const index = await fetchPackIndex();
    fs.mkdirSync(layout.cache, { recursive: true });
    fs.writeFileSync(indexCache(layout), JSON.stringify(index));
    return { index, online: true };
  } catch {
    try {
      return { index: JSON.parse(fs.readFileSync(indexCache(layout), "utf8")), online: false };
    } catch {
      return { index: null, online: false };
    }
  }
}

export async function getStatus(layout: Layout): Promise<Status> {
  const state = await loadState(layout);
  const { index, online } = await getIndex(layout);
  return {
    online,
    installed: state.packVersion ? { packVersion: state.packVersion, minecraft: state.minecraft } : undefined,
    latest: index
      ? { packVersion: index.packVersion, minecraft: index.minecraft, changelog: index.changelog, modCount: index.mods.length }
      : undefined,
    updateKind: index ? (online ? classifyUpdate(state, index) : "offline") : "offline",
    userMods: await unmanagedMods(layout, state),
  };
}

let running: ChildProcess | null = null;
export const isRunning = () => running !== null;

/** 설치·업데이트까지만 */
export async function prepare(layout: Layout, onProgress: ProgressFn, onInfo: (msg: string) => void) {
  const platform = currentPlatform();
  const { index, online } = await getIndex(layout);
  if (!index) throw new Error(tr("err.noIndex"));
  let state = await loadState(layout);
  const kind = online ? classifyUpdate(state, index) : "none";

  if (kind === "downgrade") {
    throw new Error(tr("err.downgrade", { to: index.minecraft, from: state.minecraft ?? "?" }));
  }
  if (kind === "minecraft-upgrade") {
    onInfo(tr("info.upgradeBackup", { from: state.minecraft ?? "?", to: index.minecraft }));
    onProgress({ label: tr("label.backup"), done: 0, total: 1 });
    const where = await backupSaves(layout, `${state.minecraft}-before-${index.minecraft}`);
    if (where) onInfo(tr("info.backupDone", { path: where }));
    onProgress({ label: tr("label.backup"), done: 1, total: 1 });
  }

  const p = (done: number, total: number, label?: string) => onProgress({ label: label ?? tr("label.download"), done, total });
  onProgress({ label: tr("label.checkGame"), done: 0, total: 1 });
  const resolved = await resolveVersion(layout, index.minecraft, index.fabricLoader, platform);
  const javaExe = await ensureJava(layout, resolved.javaComponent, platform, p);
  await installVersion(layout, resolved, p);
  state = await syncPack(layout, index, state, p);
  await saveState(layout, state);
  return { resolved, javaExe, platform, index };
}

export async function play(
  layout: Layout,
  account: Account,
  settings: Settings,
  launcherVersion: string,
  onProgress: ProgressFn,
  onInfo: (msg: string) => void,
  onExit: (code: number | null, crashReport: string | null) => void,
) {
  if (running) throw new Error(tr("err.running"));
  const { resolved, javaExe, platform } = await prepare(layout, onProgress, onInfo);
  const cmd = buildLaunchCommand(
    layout,
    resolved,
    javaExe,
    { name: account.name, uuid: account.uuid, accessToken: account.mcToken, xuid: account.xuid, userType: "msa" },
    {
      maxMemoryMb: settings.memoryMb,
      extraJvmArgs: settings.extraJvmArgs.split(/\s+/).filter(Boolean),
      width: settings.width,
      height: settings.height,
      launcherVersion,
    },
    platform,
  );
  fs.mkdirSync(layout.logs, { recursive: true });
  const logFile = path.join(layout.logs, "launcher-game.log");
  const out = fs.openSync(logFile, "w");
  const started = Date.now();
  running = spawn(cmd.command, cmd.args, { cwd: cmd.cwd, stdio: ["ignore", out, out], windowsHide: false });
  running.on("exit", (code) => {
    running = null;
    fs.closeSync(out);
    onExit(code, code !== 0 ? newestCrashReport(layout, started) : null);
  });
  running.on("error", (e) => {
    running = null;
    onInfo(tr("err.launch", { msg: e.message }));
    onExit(-1, null);
  });
}

function newestCrashReport(layout: Layout, since: number): string | null {
  const dir = path.join(layout.game, "crash-reports");
  try {
    const f = fs.readdirSync(dir)
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .filter((x) => x.t >= since)
      .sort((a, b) => b.t - a.t)[0];
    return f ? path.join(dir, f.n) : null;
  } catch {
    return null;
  }
}

export function killGame() {
  running?.kill();
}
