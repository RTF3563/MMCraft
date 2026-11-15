import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mmc", {
  init: () => ipcRenderer.invoke("init"),
  status: () => ipcRenderer.invoke("status"),
  login: () => ipcRenderer.invoke("login"),
  logout: () => ipcRenderer.invoke("logout"),
  install: () => ipcRenderer.invoke("install"),
  play: () => ipcRenderer.invoke("play"),
  saveSettings: (s: unknown) => ipcRenderer.invoke("settings", s),
  open: (what: string, file?: string) => ipcRenderer.invoke("open", what, file),
  window: (action: string) => ipcRenderer.invoke("window", action),
  restartUpdate: () => ipcRenderer.invoke("restart-update"),
  on: (channel: string, fn: (data: unknown) => void) => {
    const allowed = ["progress", "info", "exited", "launched", "launcher-update", "auto-update"];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, d) => fn(d));
  },
});
