/** MMCraft 서버 런처 (Electron 본체) */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { currentPlatform } from "../core/rules";
import { getLang, Lang, setLang, tr } from "../core/i18n";
import { fetchPackIndexCached, loadState, PackIndex, saveState } from "../core/pack";
import { backupFolders } from "../core/backup";
import {
  acceptEula, buildServerCommand, classifyServerUpdate, eulaAccepted, installedServer, prefetchServer, prepareServer,
  serverMods, ServerInstallState, ServerLayout, worldFolders, writeProperties,
} from "../core/server";
import { LaunchSpec, Notice, ServerManager, UpdateCheck } from "./manager";
import { loadSettings, saveSettings, ServerSettings, serverRoot } from "./settings";

// 플레이어 런처와 따로 실행되도록 이름·데이터 폴더를 나눔
app.setName("MMCraft Server");
app.setPath("userData", path.join(app.getPath("appData"), "MMCraft Server"));

/** 새 팩 확인 주기: 플레이어 런처가 새 팩을 받는 것과 거의 같은 때 서버도 맞추도록 짧게 */
const PACK_CHECK_MS = 5 * 60_000;
const LAUNCHER_CHECK_MS = 60 * 60_000;
const CONSOLE_KEEP = 1500;

const root = serverRoot();
let settings: ServerSettings = loadSettings(root);
let layout = new ServerLayout(root, settings.serverDir);
const platform = currentPlatform();
let win: BrowserWindow | null = null;
let allowQuit = false;
let latestIndex: PackIndex | null = null;
let lastCheck: { at: number; online: boolean } | null = null;
/** 이미 백업한 목표 팩 버전 (업데이트 흐름에서 백업했으면 시작할 때 또 하지 않음) */
let backedUpFor: string | null = null;
let launcherUpdate: string | null = null;
const consoleLines: string[] = [];
const launchedAtLogin = process.argv.includes("--autostart");

// ---- 게임 안 글자 · 본체 메시지 (한국어 / English) ----
const T: Record<string, { ko: string; en: string }> = {
  announce: {
    ko: "새 팩 {to} 업데이트가 있어 {sec}초 뒤 서버가 재시작됩니다. 접속이 끊기면 MMCraft를 재실행해 업데이트해 주세요.",
    en: "A new pack ({to}) is out. The server restarts in {sec} seconds. After you're disconnected, restart MMCraft to update.",
  },
  countdown: { ko: "서버 재시작까지 {sec}초", en: "Server restarting in {sec}s" },
  kick: {
    ko: "서버 업데이트가 있습니다. MMCraft를 재실행하여 업데이트를 진행해 주세요.",
    en: "A server update is available. Please restart MMCraft to update.",
  },
  noIndex: { ko: "팩 정보를 받을 수 없고 설치된 서버도 없습니다. 인터넷 연결을 확인하세요.", en: "Couldn't get pack information and no server is installed yet. Check your internet connection." },
  downgrade: {
    ko: "배포된 팩(Minecraft {to})이 설치된 서버({from})보다 낮습니다. 월드 보호를 위해 시작하지 않습니다.",
    en: "The published pack (Minecraft {to}) is older than the installed server ({from}). The server won't start, to protect your world.",
  },
  crashLoopTitle: { ko: "MMCraft 서버가 멈췄습니다", en: "MMCraft server stopped" },
  crashLoopBody: { ko: "짧은 시간에 여러 번 비정상 종료되어 자동 재시작을 멈췄습니다. 콘솔 로그를 확인하세요.", en: "It crashed several times in a short time, so automatic restart was stopped. Check the console log." },
};
const msg = (k: string, vars: Record<string, string | number> = {}) =>
  (T[k]?.[getLang()] ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in vars ? String(vars[x]) : m));

function resolveLang(s: ServerSettings): Lang {
  if (s.language === "ko" || s.language === "en") return s.language;
  return app.getLocale().toLowerCase().startsWith("ko") ? "ko" : "en";
}

// ---- 기록 파일 ----
const launcherLog = () => path.join(root, "logs", "server-launcher.log");
function logLine(text: string) {
  try {
    fs.mkdirSync(path.dirname(launcherLog()), { recursive: true });
    fs.appendFileSync(launcherLog(), `[${new Date().toISOString()}] ${text}\n`);
  } catch {}
}
function rotateLog() {
  try {
    const f = launcherLog();
    if (fs.existsSync(f) && fs.statSync(f).size > 2 * 1024 * 1024) fs.renameSync(f, f + ".old");
  } catch {}
}

// ---- 창으로 보내기 ----
const send = (channel: string, data?: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};
let pendingLines: string[] = [];
let lineTimer: NodeJS.Timeout | null = null;
function flushLines() {
  if (lineTimer) clearTimeout(lineTimer);
  lineTimer = null;
  if (pendingLines.length) send("lines", pendingLines);
  pendingLines = [];
}
function pushLine(line: string) {
  consoleLines.push(line);
  if (consoleLines.length > CONSOLE_KEEP) consoleLines.splice(0, consoleLines.length - CONSOLE_KEEP);
  pendingLines.push(line);
  // 줄이 많이 쏟아져도 화면이 버벅이지 않게 묶어서 보냄
  lineTimer ??= setTimeout(flushLines, 80);
}

// ---- 서버 준비 (팩 → 서버 폴더) ----
const progressAdapter = (fn: (label: string, done: number, total: number) => void) =>
  (done: number, total: number, label?: string) => fn(label ?? tr("label.download"), done, total);

async function backupWorld(label: string, target: string): Promise<string | null> {
  const where = await backupFolders(layout, worldFolders(layout.serverDir), label, 5);
  backedUpFor = target;
  return where;
}

async function prepare(progress: (label: string, done: number, total: number) => void): Promise<LaunchSpec> {
  const p = progressAdapter(progress);
  const notices: Notice[] = [];
  const { index, online } = await fetchPackIndexCached(layout);
  let prepared;
  if (index && online) {
    latestIndex = index;
    const state = (await loadState(layout)) as ServerInstallState;
    const kind = classifyServerUpdate(state, index);
    if (kind === "downgrade") throw new Error(msg("downgrade", { to: index.minecraft, from: state.minecraft ?? "?" }));
    // 꺼져 있는 동안 나온 업데이트도 바꾸기 전에 월드 백업
    if ((kind === "restart" || kind === "minecraft-upgrade") && backedUpFor !== index.packVersion) {
      progress(tr("label.backup"), 0, 1);
      const where = await backupWorld(`${state.packVersion}-to-${index.packVersion}`, index.packVersion);
      if (where) notices.push({ level: "info", key: "n.backupDone", vars: { path: where } });
    }
    prepared = await prepareServer(layout, index, platform, p);
    if (prepared.movedMods) notices.push({ level: "warn", key: "n.movedMods", vars: { path: prepared.movedMods } });
  } else {
    prepared = await installedServer(layout, platform);
    if (!prepared) throw new Error(msg("noIndex"));
    notices.push({ level: "warn", key: "n.offline" });
  }
  writeProperties(path.join(layout.serverDir, "server.properties"), { "server-port": String(settings.port) });
  const cmd = buildServerCommand(prepared.javaExe, prepared.jar, layout.serverDir, {
    memoryMb: settings.memoryMb,
    extraJvmArgs: settings.extraJvmArgs.split(/\s+/).filter(Boolean),
  });
  logLine(`start: pack ${prepared.state.packVersion} (Minecraft ${prepared.state.minecraft}), ${cmd.command}`);
  sendStatus();
  return { ...cmd, packVersion: prepared.state.packVersion!, minecraft: prepared.state.minecraft!, notices };
}

async function check(): Promise<UpdateCheck> {
  const { index, online } = await fetchPackIndexCached(layout);
  lastCheck = { at: Date.now(), online };
  if (!index || !online) {
    sendStatus();
    return { kind: "offline" };
  }
  latestIndex = index;
  const state = (await loadState(layout)) as ServerInstallState;
  const kind = classifyServerUpdate(state, index);
  sendStatus();
  return { kind, from: state.packVersion, to: index.packVersion, fromMc: state.minecraft, toMc: index.minecraft };
}

const manager = new ServerManager({
  prepare,
  check,
  prefetch: async (progress) => {
    if (!latestIndex) return;
    await prefetchServer(layout, latestIndex, platform, progressAdapter(progress));
  },
  recordPackOnly: async () => {
    if (!latestIndex) return;
    const state = (await loadState(layout)) as ServerInstallState;
    await saveState(layout, { ...state, packVersion: latestIndex.packVersion });
    sendStatus();
  },
  backup: (label) => backupWorld(label, latestIndex?.packVersion ?? label),
  text: (key, vars) => msg(key, vars),
});

manager.on("line", pushLine);
manager.on("phase", (s) => {
  send("phase", s);
  if (!manager.busy) tryLauncherUpdate();
});
manager.on("players", (p) => {
  send("players", p);
  if (p.length === 0) tryLauncherUpdate();
});
manager.on("progress", (p) => send("progress", p));
manager.on("notice", (n) => {
  logLine(`${n.level} ${n.key} ${JSON.stringify(n.vars ?? {})}`);
  flushLines(); // 콘솔 줄과 알림 순서가 뒤바뀌지 않게
  send("notice", n);
  if (n.key === "n.crashLoop") {
    win?.flashFrame(true);
    if (Notification.isSupported()) new Notification({ title: msg("crashLoopTitle"), body: msg("crashLoopBody") }).show();
  }
});

async function statusData() {
  const state = (await loadState(layout)) as ServerInstallState;
  return {
    installed: state.packVersion ? { packVersion: state.packVersion, minecraft: state.minecraft } : null,
    latest: latestIndex
      ? { packVersion: latestIndex.packVersion, minecraft: latestIndex.minecraft, serverModCount: serverMods(latestIndex).length, changelog: latestIndex.changelog }
      : null,
    lastCheck,
  };
}
function sendStatus() {
  statusData().then((d) => send("status", d)).catch(() => {});
}

// ---- 런처 자체 업데이트 (접속자가 없을 때만 적용, 서버는 다시 켬) ----
let applyingLauncherUpdate = false;
async function tryLauncherUpdate() {
  if (!launcherUpdate || applyingLauncherUpdate || manager.busy) return;
  const snap = manager.snapshot();
  if (snap.phase === "running" && snap.players.length > 0) return; // 누가 접속해 있으면 기다림
  if (snap.phase !== "running" && snap.phase !== "stopped") return;
  applyingLauncherUpdate = true;
  send("launcher-update", { state: "installing", version: launcherUpdate });
  logLine(`launcher update ${launcherUpdate}: install (server was ${snap.phase})`);
  if (snap.phase === "running") {
    settings = { ...settings, resumeAfterUpdate: true };
    saveSettings(root, settings);
    await manager.shutdown();
  }
  allowQuit = true;
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
}

function setupLauncherUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => send("launcher-update", { state: "downloading", version: i.version }));
  autoUpdater.on("update-downloaded", (i) => {
    launcherUpdate = i.version;
    send("launcher-update", { state: "waiting", version: i.version });
    tryLauncherUpdate();
  });
  autoUpdater.on("error", (e) => logLine(`launcher update error: ${e?.message ?? e}`));
  const checkLauncher = () => autoUpdater.checkForUpdates().catch(() => {});
  checkLauncher();
  setInterval(checkLauncher, LAUNCHER_CHECK_MS);
}

// ---- 창 ----
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: "#0f1115",
    title: "MMCraft Server",
    icon: path.join(__dirname, "renderer", "icon.png"),
    show: !launchedAtLogin,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  if (launchedAtLogin) win.once("ready-to-show", () => win?.showInactive());
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (allowQuit || (!manager.isRunning && !manager.busy)) return;
    e.preventDefault();
    send("confirm-close");
  });
  // Windows 종료·로그오프: 월드가 저장되도록 정지 명령부터
  win.on("session-end", () => {
    allowQuit = true;
    manager.shutdown();
  });
  win.on("focus", () => win?.flashFrame(false));
}

function wrap<T>(fn: (...a: any[]) => Promise<T> | T) {
  return async (_e: unknown, ...args: any[]) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  };
}

ipcMain.handle("window", (_e, action: "min" | "max" | "close") => {
  if (!win) return;
  if (action === "min") win.minimize();
  else if (action === "max") win.isMaximized() ? win.unmaximize() : win.maximize();
  else win.close();
});

ipcMain.handle("init", wrap(async () => ({
  version: app.getVersion(),
  settings,
  lang: getLang(),
  totalMemoryMb: Math.floor(os.totalmem() / 1024 / 1024),
  snapshot: manager.snapshot(),
  lines: consoleLines.slice(-CONSOLE_KEEP),
  eulaNeeded: !eulaAccepted(layout.serverDir),
  status: await statusData(),
  launcherUpdate,
})));

ipcMain.handle("start", wrap(async () => {
  if (!eulaAccepted(layout.serverDir)) throw new Error("EULA");
  manager.start();
}));
ipcMain.handle("stop", wrap(() => manager.stop()));
ipcMain.handle("restart", wrap(() => manager.restart()));
ipcMain.handle("command", wrap((text: string) => {
  if (manager.command(text)) pushLine(`> ${text.trim()}`);
}));
ipcMain.handle("accept-eula", wrap(() => acceptEula(layout.serverDir)));
ipcMain.handle("check-now", wrap(async () => {
  const c = await manager.checkForUpdate();
  if (!c) sendStatus();
  return c;
}));

ipcMain.handle("settings", wrap((s: Partial<ServerSettings>) => {
  const next = { ...settings, ...s };
  if (next.serverDir !== settings.serverDir && (manager.isRunning || manager.busy)) throw new Error("running");
  if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) next.port = settings.port;
  if (next.autoStart !== settings.autoStart && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: next.autoStart, args: ["--autostart"] });
  }
  settings = next;
  saveSettings(root, settings);
  layout = new ServerLayout(root, settings.serverDir);
  setLang(resolveLang(settings));
  sendStatus();
  return { settings, lang: getLang(), eulaNeeded: !eulaAccepted(layout.serverDir) };
}));

ipcMain.handle("choose-folder", wrap(async () => {
  if (manager.isRunning || manager.busy) throw new Error("running");
  const r = await dialog.showOpenDialog(win!, { defaultPath: settings.serverDir, properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
}));

ipcMain.handle("open", wrap(async (what: "server" | "backups" | "mods" | "config" | "logs" | "launcherLogs" | "url", url?: string) => {
  if (what === "url") {
    if (url?.startsWith("https://")) await shell.openExternal(url);
    return;
  }
  const target = {
    server: layout.serverDir,
    backups: layout.backups,
    mods: layout.mods,
    config: path.join(layout.serverDir, "config"),
    logs: path.join(layout.serverDir, "logs"),
    launcherLogs: path.join(root, "logs"),
  }[what];
  fs.mkdirSync(target, { recursive: true });
  await shell.openPath(target);
}));

ipcMain.handle("quit", wrap(async () => {
  await manager.shutdown();
  allowQuit = true;
  app.quit();
}));
ipcMain.handle("restart-update", wrap(async () => {
  if (!launcherUpdate) return;
  await manager.shutdown();
  allowQuit = true;
  autoUpdater.quitAndInstall(true, true);
}));

// ---- 시작 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    rotateLog();
    setLang(resolveLang(settings));
    logLine(`server launcher ${app.getVersion()} started${launchedAtLogin ? " (Windows startup)" : ""}`);
    createWindow();
    if (app.isPackaged) {
      setupLauncherUpdater();
      // 설정과 실제 Windows 시작 프로그램 등록을 맞춤
      app.setLoginItemSettings({ openAtLogin: settings.autoStart, args: ["--autostart"] });
    }
    win!.webContents.once("did-finish-load", () => {
      // 런처 업데이트로 잠깐 껐거나, Windows 시작 시 자동 실행이면 서버 시작
      const resume = settings.resumeAfterUpdate || (launchedAtLogin && settings.autoStart);
      if (settings.resumeAfterUpdate) {
        settings = { ...settings, resumeAfterUpdate: false };
        saveSettings(root, settings);
      }
      if (resume && eulaAccepted(layout.serverDir)) manager.start();
      else manager.checkForUpdate().catch(() => {});
    });
    setInterval(() => manager.checkForUpdate().catch(() => {}), PACK_CHECK_MS);
  });

  app.on("before-quit", (e) => {
    if (allowQuit || (!manager.isRunning && !manager.busy)) return;
    e.preventDefault();
    send("confirm-close");
    win?.show();
  });
  app.on("window-all-closed", () => app.quit());
}
