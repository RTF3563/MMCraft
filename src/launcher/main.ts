import * as fs from "fs";
import * as path from "path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { Layout } from "../core/paths";
import { Account, ensureFresh, loadAccount, login, saveAccount } from "./auth";
import { getStatus, isRunning, loadSettings, play, prepare, saveSettings, Settings } from "./game";

const layout = Layout.default();
let win: BrowserWindow | null = null;
let account: Account | null = null;

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
  totalMemoryMb: Math.floor(require("os").totalmem() / 1024 / 1024),
  gameDir: layout.game,
})));

ipcMain.handle("status", wrap(() => getStatus(layout)));

ipcMain.handle("login", wrap(async () => {
  const id = config().azureClientId;
  if (!id) throw new Error("런처에 로그인 설정(Azure Client ID)이 아직 없습니다.");
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
  return s;
}));

ipcMain.handle("install", wrap(async () => {
  await prepare(layout, progress, info);
  return getStatus(layout);
}));

ipcMain.handle("play", wrap(async () => {
  if (!account) throw new Error("먼저 로그인하세요.");
  if (isRunning()) throw new Error("이미 게임이 실행 중입니다.");
  const id = config().azureClientId;
  account = await ensureFresh(id, account);
  saveAccount(layout.account, account);
  const settings = loadSettings(layout);
  await play(layout, account, settings, app.getVersion(), progress, info, (code, crash) => {
    win?.show();
    send("exited", { code, crash });
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
  account = loadAccount(layout.account);
  createWindow();
  if (app.isPackaged) {
    autoUpdater.on("update-downloaded", (i) => send("launcher-update", i.version));
    autoUpdater.checkForUpdates().catch(() => {});
  }
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
