"use strict";
const $ = (id) => document.getElementById(id);
const MAX_LINES = 1500;

const ui = {
  snap: { phase: "stopped", players: [], halted: false },
  settings: null,
  status: null,
  version: "",
  eulaNeeded: false,
  launcherUpdate: null,
  progress: null, // { label, done, total }
  history: [],
  historyPos: -1,
};

let toastTimer;
function toast(msg, ms = 7000) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (el.hidden = true), ms);
}

// ---- 콘솔 ----
const consoleEl = $("console");
function lineClass(line) {
  if (line.startsWith("> ")) return "me";
  if (/\/(ERROR|FATAL)\]|Exception|^\s+at /.test(line)) return "error";
  if (/\/WARN\]/.test(line)) return "warn";
  if (/(\]:|\))\s[A-Za-z0-9_]{1,16} joined the game\s*$/.test(line)) return "join";
  if (/(\]:|\))\s[A-Za-z0-9_]{1,16} left the game\s*$/.test(line)) return "leave";
  return "";
}
function appendLines(lines, cls) {
  const atBottom = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 40;
  const empty = consoleEl.querySelector(".placeholder");
  if (empty) empty.remove();
  const frag = document.createDocumentFragment();
  for (const l of lines) {
    const div = document.createElement("div");
    div.textContent = l;
    const c = cls ?? lineClass(l);
    if (c) div.className = c;
    frag.appendChild(div);
  }
  consoleEl.appendChild(frag);
  while (consoleEl.childElementCount > MAX_LINES) consoleEl.firstElementChild.remove();
  if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
}
function consolePlaceholder() {
  if (consoleEl.childElementCount) return;
  const div = document.createElement("div");
  div.className = "placeholder muted";
  div.textContent = t("console.empty");
  consoleEl.appendChild(div);
}
function showNotice(n) {
  const text = `[MMCraft] ${t(n.key, n.vars || {})}`;
  appendLines([text], `mmc ${n.level}`);
  if (n.level === "error" || n.level === "warn") toast(text.replace(/^\[MMCraft\] /, ""), n.level === "error" ? 0 : 8000);
}

// ---- 상태 ----
const ALIVE = ["starting", "running", "stopping"];
function phaseLabel(s) {
  if (s.phase === "stopped" && s.halted) return t("phase.halted");
  return t(`phase.${s.phase}`);
}
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s % 60)}`;
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(LANG === "en" ? "en-US" : "ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function renderFacts() {
  const s = ui.snap;
  const st = ui.status || {};
  $("fact-state").textContent = phaseLabel(s);
  const dot = $("state-dot");
  dot.className = "dot" + (s.phase === "running" ? " on" : s.phase === "stopped" ? (s.halted ? " bad" : "") : " busy");
  $("fact-mc").textContent = s.minecraft ?? st.installed?.minecraft ?? st.latest?.minecraft ?? "-";
  $("fact-pack").textContent = s.packVersion ?? st.installed?.packVersion ?? st.latest?.packVersion ?? "-";
  $("fact-mods").textContent = st.latest ? t("fact.modCount", { n: st.latest.serverModCount }) : "-";
  $("fact-port").textContent = ui.settings ? String(ui.settings.port) : "-";
}

function renderButtons() {
  const p = ui.snap.phase;
  $("start").disabled = p !== "stopped";
  $("stop").disabled = p === "stopped" || p === "stopping";
  $("restart").disabled = !(p === "running" || p === "starting") || !!ui.snap.updatingTo;
  const alive = ALIVE.includes(p);
  $("cmd").disabled = !alive;
  $("cmd-send").disabled = !alive;
  $("dir-change").disabled = p !== "stopped";
  $("check-now").disabled = (p !== "stopped" && p !== "running") || !!ui.snap.updatingTo;
}

function renderProgress() {
  const s = ui.snap;
  const fill = $("bar-fill");
  fill.classList.toggle("countdown", s.countdown !== undefined);
  if (s.countdown !== undefined) {
    fill.style.width = `${(s.countdown / 30) * 100}%`;
    $("progress-text").textContent = t("update.countdown", { sec: s.countdown });
    return;
  }
  const pr = ui.progress;
  if (pr && pr.total > 0) {
    fill.style.width = `${Math.min(100, (pr.done / pr.total) * 100)}%`;
    $("progress-text").textContent = `${pr.label} ${pr.done}/${pr.total}`;
    return;
  }
  fill.style.width = s.phase === "running" ? "100%" : "0%";
  $("progress-text").textContent =
    s.phase === "running" ? t("progress.running") : s.phase === "stopped" ? t("progress.stopped") : phaseLabel(s);
}

function renderPlayers() {
  const list = $("players");
  const players = ui.snap.players || [];
  $("players-title").textContent = t("players.title", { n: players.length });
  list.innerHTML = "";
  if (players.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = ui.snap.phase === "running" ? t("players.empty") : t("players.off");
    list.appendChild(li);
    return;
  }
  for (const name of players) {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.alt = "";
    img.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/24`;
    img.onerror = () => (img.style.visibility = "hidden");
    const span = document.createElement("span");
    span.textContent = name;
    li.append(img, span);
    list.appendChild(li);
  }
}

function renderUpdate() {
  const st = ui.status || {};
  const s = ui.snap;
  const el = $("update-state");
  let text;
  let attention = false;
  if (s.updatingTo) {
    text = t("update.pendingRunning", { to: s.updatingTo });
    attention = true;
  } else if (st.lastCheck && !st.lastCheck.online) {
    text = t("update.offline");
    attention = true;
  } else if (!st.installed && st.latest) {
    text = t("update.notInstalled", { to: st.latest.packVersion });
    attention = true;
  } else if (st.installed && st.latest && st.installed.packVersion !== st.latest.packVersion) {
    text = t(s.phase === "stopped" ? "update.pending" : "update.pendingRunning", { to: st.latest.packVersion });
    attention = true;
  } else if (st.installed) {
    text = t("update.latest", { v: st.installed.packVersion });
  } else {
    text = t("update.never");
  }
  el.textContent = text;
  el.classList.toggle("attention", attention);
  $("update-checked").textContent = st.lastCheck ? t("update.checked", { t: fmtTime(st.lastCheck.at) }) : "";
  $("update-auto").textContent = t("update.auto");
}

function renderUptime() {
  const s = ui.snap;
  $("uptime").textContent = s.phase === "running" && s.startedAt ? t("uptime", { t: fmtDuration(Date.now() - s.startedAt) }) : "";
}

function renderSettings() {
  const s = ui.settings;
  if (!s) return;
  const langName = { auto: t("settings.lang.auto"), ko: "한국어", en: "English" }[s.language ?? "auto"];
  $("lang-btn").textContent = t("settings.langBtn", { v: langName });
  $("autostart-btn").textContent = t("settings.autostartBtn", { v: s.autoStart ? t("on") : t("off") });
  $("server-dir").textContent = s.serverDir;
  $("server-dir").title = s.serverDir;
  if (document.activeElement !== $("port")) $("port").value = String(s.port);
  updateMem();
}

function updateMem() {
  const m = $("mem");
  $("mem-out").textContent = `${(Number(m.value) / 1024).toFixed(Number(m.value) % 1024 ? 1 : 0)}GB`;
  const pos = (Number(m.value) - Number(m.min)) / (Number(m.max) - Number(m.min) || 1);
  m.parentElement.style.setProperty("--pos", String(pos));
}

function renderLauncherUpdate(u) {
  if (!u) return;
  const key = { downloading: "launcher.downloading", waiting: "launcher.waiting", installing: "launcher.installing" }[u.state];
  if (!key) return;
  $("update-text").textContent = t(key, { v: u.version ? `v${u.version}` : "" });
  $("update-restart").hidden = u.state !== "waiting";
  $("update-banner").hidden = false;
}

function renderAll() {
  applyStatic();
  $("launcher-version").textContent = t("settings.version", { v: ui.version });
  renderFacts();
  renderButtons();
  renderProgress();
  renderPlayers();
  renderUpdate();
  renderUptime();
  renderSettings();
  renderLauncherUpdate(ui.launcherUpdate);
  const ph = consoleEl.querySelector(".placeholder");
  if (ph) ph.textContent = t("console.empty");
}

async function saveSettings(patch) {
  const r = await window.mms.saveSettings(patch);
  if (!r.ok) {
    toast(r.error === "running" ? t("err.running") : r.error);
    return false;
  }
  ui.settings = r.data.settings;
  ui.eulaNeeded = r.data.eulaNeeded;
  setUiLang(r.data.lang);
  renderAll();
  return true;
}

// ---- 동작 ----
document.querySelectorAll("[data-win]").forEach((b) => b.addEventListener("click", () => window.mms.window(b.dataset.win)));

let eulaThenStart = false;
function askEula(thenStart) {
  eulaThenStart = thenStart;
  $("eula-accept").textContent = t(thenStart ? "eula.accept" : "eula.agree");
  $("eula").hidden = false;
}
async function doStart() {
  if (ui.eulaNeeded) return askEula(true);
  const r = await window.mms.start();
  if (!r.ok) {
    if (r.error === "EULA") {
      ui.eulaNeeded = true;
      askEula(true);
    } else toast(r.error, 0);
  }
}
$("start").addEventListener("click", doStart);
$("stop").addEventListener("click", () => window.mms.stop());
$("restart").addEventListener("click", () => window.mms.restart());
$("check-now").addEventListener("click", async () => {
  $("check-now").disabled = true;
  await window.mms.checkNow();
  renderButtons();
});

$("cmd-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("cmd");
  const text = input.value.trim();
  if (!text) return;
  ui.history.push(text);
  if (ui.history.length > 50) ui.history.shift();
  ui.historyPos = -1;
  input.value = "";
  await window.mms.command(text);
});
$("cmd").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  const h = ui.history;
  if (!h.length) return;
  e.preventDefault();
  if (ui.historyPos === -1) ui.historyPos = h.length;
  ui.historyPos = Math.max(0, Math.min(h.length, ui.historyPos + (e.key === "ArrowUp" ? -1 : 1)));
  $("cmd").value = h[ui.historyPos] ?? "";
});

// EULA
$("eula-read").addEventListener("click", () => window.mms.open("url", "https://aka.ms/MinecraftEULA"));
$("eula-cancel").addEventListener("click", () => ($("eula").hidden = true));
$("eula-accept").addEventListener("click", async () => {
  const r = await window.mms.acceptEula();
  if (!r.ok) return toast(r.error, 0);
  ui.eulaNeeded = false;
  $("eula").hidden = true;
  if (eulaThenStart) doStart();
});

// 닫기 확인
$("close-cancel").addEventListener("click", () => ($("confirm-close").hidden = true));
$("close-ok").addEventListener("click", () => {
  $("close-ok").disabled = true;
  window.mms.quit();
});

// 설정
$("settings-open").addEventListener("click", () => ($("settings").hidden = false));
$("settings-close").addEventListener("click", () => ($("settings").hidden = true));
$("lang-btn").addEventListener("click", () => {
  const order = ["auto", "ko", "en"];
  const cur = order.indexOf(ui.settings?.language ?? "auto");
  saveSettings({ language: order[(cur + 1) % order.length] });
});
$("autostart-btn").addEventListener("click", () => saveSettings({ autoStart: !ui.settings.autoStart }));
$("mem").addEventListener("input", updateMem);
$("mem").addEventListener("change", () => saveSettings({ memoryMb: Number($("mem").value) }));
$("port").addEventListener("change", () => {
  const v = Number($("port").value);
  if (!Number.isInteger(v) || v < 1 || v > 65535) {
    $("port").value = String(ui.settings.port);
    return;
  }
  saveSettings({ port: v });
});
$("jvm").addEventListener("change", () => saveSettings({ extraJvmArgs: $("jvm").value.trim() }));
$("dir-change").addEventListener("click", async () => {
  const r = await window.mms.chooseFolder();
  if (!r.ok) return toast(r.error === "running" ? t("err.running") : r.error);
  if (r.data) await saveSettings({ serverDir: r.data });
});
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => window.mms.open(b.dataset.open)));
$("update-restart").addEventListener("click", () => window.mms.restartUpdate());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("settings").hidden = true;
    $("eula").hidden = true;
    $("confirm-close").hidden = true;
  }
});

// ---- 본체에서 오는 소식 ----
window.mms.on("phase", (s) => {
  ui.snap = s;
  renderFacts();
  renderButtons();
  renderProgress();
  renderPlayers();
  renderUpdate();
  renderUptime();
});
window.mms.on("lines", (lines) => appendLines(lines));
window.mms.on("players", (p) => {
  ui.snap = { ...ui.snap, players: p };
  renderPlayers();
});
window.mms.on("notice", showNotice);
window.mms.on("progress", (p) => {
  ui.progress = p.total > 0 ? p : null;
  renderProgress();
});
window.mms.on("status", (st) => {
  ui.status = st;
  renderFacts();
  renderUpdate();
});
window.mms.on("launcher-update", (u) => {
  ui.launcherUpdate = u;
  renderLauncherUpdate(u);
});
window.mms.on("confirm-close", () => {
  $("close-ok").disabled = false;
  $("confirm-close").hidden = false;
});

setInterval(renderUptime, 1000);

// ---- 시작 ----
(async () => {
  const r = await window.mms.init();
  if (!r.ok) return toast(r.error, 0);
  const d = r.data;
  setUiLang(d.lang);
  ui.version = d.version;
  ui.settings = d.settings;
  ui.snap = d.snapshot;
  ui.status = d.status;
  ui.eulaNeeded = d.eulaNeeded;
  if (d.launcherUpdate) ui.launcherUpdate = { state: "waiting", version: d.launcherUpdate };
  const mem = $("mem");
  mem.max = String(Math.max(4096, Math.floor((d.totalMemoryMb * 0.75) / 512) * 512));
  mem.value = String(d.settings.memoryMb);
  $("jvm").value = d.settings.extraJvmArgs;
  if (d.lines.length) appendLines(d.lines);
  else consolePlaceholder();
  renderAll();
  if (ui.eulaNeeded) askEula(false); // 처음 실행: EULA 동의부터 (설정을 먼저 바꿀 수 있게 바로 시작하지는 않음)
})();
