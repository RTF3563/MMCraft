import * as fs from "fs";
import * as path from "path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { Layout } from "../core/paths";
import { Account, ensureFresh, loadAccount, login, saveAccount } from "./auth";
import { getStatus, isRunning, loadSettings, play, prepare, saveSettings, Settings } from "./game";
import { getLang, Lang, setLang, tr } from "../core/i18n";

/** 지금 진행 중인 팩 설치·업데이트 (자동 업데이트와 플레이 버튼이 겹치지 않게) */
let preparing: Promise<void> | null = null;
let launcherUpdatePending = false;
const RECHECK_MS = 30 * 60_000;

const layout = Layout.default();
let win: BrowserWindow | null = null;
let account: Account | null = null;

/** 설정 언어 → 실제 언어 (자동이면 Windows 언어가 한국어일 때만 한국어) */
function resolveLang(s: Settings): Lang {
  if (s.language === "ko" || s.language === "en") return s.language;
  return app.getLocale().toLowerCase().startsWith("ko") ? "ko" : "en";
}

function config(): { azureClientId: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  } catch {
    return { azureClientId: "" };
  }
}

const send = (channel: string, data?: unknown) => win?.webContents.send(channel, data);
const progress = (p: { label: string; done: number; total: number }) => send("progress", p);
const info = (msg: string) => send("info", msg);

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 660,
    minWidth: 900,
    minHeight: 560,
    frame: false,
    backgroundColor: "#0f1115",
    title: "MMCraft",
    icon: path.join(__dirname, "renderer", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
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
  launcherVersion: app.getVersion(),
  account: account ? { name: account.name, uuid: account.uuid } : null,
  loginConfigured: !!config().azureClientId,
  settings: loadSettings(layout),
  lang: getLang(),
  totalMemoryMb: Math.floor(require("os").totalmem() / 1024 / 1024),
  gameDir: layout.game,
})));

ipcMain.handle("status", wrap(() => getStatus(layout)));

ipcMain.handle("login", wrap(async () => {
  const id = config().azureClientId;
  if (!id) throw new Error(tr("err.noClientId"));
  account = await login(id, win ?? undefined);
  saveAccount(layout.account, account);
  return { name: account.name, uuid: account.uuid };
}));

ipcMain.handle("logout", wrap(() => {
  account = null;
  saveAccount(layout.account, null);
}));

ipcMain.handle("settings", wrap((s: Settings) => {
  saveSettings(layout, s);
  setLang(resolveLang(s));
  return { lang: getLang() };
}));

function runPrepare(): Promise<void> {
  if (!preparing) {
    preparing = prepare(layout, progress, info).then(() => undefined).finally(() => { preparing = null; });
  }
  return preparing;
}

/** 팩에 새 버전이 있으면 플레이를 누르지 않아도 미리 받아 둠 */
async function autoUpdatePack() {
  if (isRunning() || preparing) return;
  try {
    const st = await getStatus(layout);
    if (!st.online || !["install", "update", "minecraft-upgrade"].includes(st.updateKind)) return;
    const from = st.installed?.packVersion;
    send("auto-update", { state: "start", kind: st.updateKind, from, to: st.latest?.packVersion });
    await runPrepare();
    send("auto-update", { state: "done", kind: st.updateKind, from, to: st.latest?.packVersion });
  } catch (e: any) {
    send("auto-update", { state: "error", message: e?.message ?? String(e) });
  }
}

/** 런처 자체 업데이트 확인 → 없으면(또는 실패하면) 팩 업데이트 확인 */
function checkEverything() {
  if (!app.isPackaged) return void autoUpdatePack();
  autoUpdater.checkForUpdates().catch(() => autoUpdatePack());
}

function setupLauncherUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => send("launcher-update", { state: "downloading", version: i.version }));
  autoUpdater.on("download-progress", (p) => progress({ label: tr("label.launcherUpdate"), done: Math.round(p.percent), total: 100 }));
  autoUpdater.on("update-not-available", () => autoUpdatePack());
  autoUpdater.on("error", () => autoUpdatePack());
  autoUpdater.on("update-downloaded", (i) => {
    if (isRunning() || preparing) {
      // 게임 중이면 게임을 끈 뒤에 설치
      launcherUpdatePending = true;
      send("launcher-update", { state: "waiting", version: i.version });
      return;
    }
    send("launcher-update", { state: "installing", version: i.version });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 2000);
  });
}

ipcMain.handle("install", wrap(async () => {
  await runPrepare();
  return getStatus(layout);
}));

ipcMain.handle("play", wrap(async () => {
  if (!account) throw new Error(tr("err.loginFirst"));
  if (isRunning()) throw new Error(tr("err.running"));
  if (preparing) await preparing.catch(() => {}); // 자동 업데이트가 끝날 때까지 기다림
  const id = config().azureClientId;
  account = await ensureFresh(id, account);
  saveAccount(layout.account, account);
  const settings = loadSettings(layout);
  await play(layout, account, settings, app.getVersion(), progress, info, (code, crash) => {
    win?.show();
    send("exited", { code, crash });
    if (launcherUpdatePending) {
      send("launcher-update", { state: "installing" });
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 2000);
    }
  });
  send("launched");
  if (settings.hideOnLaunch) setTimeout(() => win?.hide(), 3000);
}));

ipcMain.handle("open", wrap(async (what: "game" | "saves" | "backups" | "logs" | "mods" | "file", file?: string) => {
  const target =
    what === "game" ? layout.game : what === "saves" ? layout.saves : what === "backups" ? layout.backups
      : what === "logs" ? layout.logs : what === "mods" ? layout.mods : file!;
  if (what !== "file") fs.mkdirSync(target, { recursive: true });
  await shell.openPath(target);
}));

ipcMain.handle("restart-update", () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  setLang(resolveLang(loadSettings(layout)));
  account = loadAccount(layout.account);
  createWindow();
  if (app.isPackaged) setupLauncherUpdater();
  // 화면이 뜬 뒤 바로 확인, 켜 둔 동안 30분마다 다시 확인
  win!.webContents.once("did-finish-load", () => checkEverything());
  setInterval(() => { if (!isRunning() && !preparing) checkEverything(); }, RECHECK_MS);
});

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});
if (!app.requestSingleInstanceLock()) app.quit();

app.on("window-all-closed", () => {
  if (!isRunning()) app.quit();
});
