import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mms", {
  init: () => ipcRenderer.invoke("init"),
  start: () => ipcRenderer.invoke("start"),
  stop: () => ipcRenderer.invoke("stop"),
  restart: () => ipcRenderer.invoke("restart"),
  command: (text: string) => ipcRenderer.invoke("command", text),
  acceptEula: () => ipcRenderer.invoke("accept-eula"),
  checkNow: () => ipcRenderer.invoke("check-now"),
  saveSettings: (s: unknown) => ipcRenderer.invoke("settings", s),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  open: (what: string, url?: string) => ipcRenderer.invoke("open", what, url),
  window: (action: string) => ipcRenderer.invoke("window", action),
  quit: () => ipcRenderer.invoke("quit"),
  restartUpdate: () => ipcRenderer.invoke("restart-update"),
  on: (channel: string, fn: (data: unknown) => void) => {
    const allowed = ["phase", "lines", "players", "notice", "progress", "status", "launcher-update", "confirm-close"];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, d) => fn(d));
  },
});
