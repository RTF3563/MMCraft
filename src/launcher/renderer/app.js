"use strict";
const $ = (id) => document.getElementById(id);

const ui = {
  account: null,
  status: null,
  busy: false,
  running: false,
  settings: null,
  launcherVersion: "",
  progress: { done: 0, total: 0, key: "progress.ready", vars: {}, raw: null },
};
let loginNotConfigured = false;

/** key: 번역 키 / raw: 이미 번역된 글자 (본체에서 온 진행 상황) */
function setProgress(done, total, key, vars = {}, raw = null) {
  ui.progress = { done, total, key, vars, raw };
  $("bar-fill").style.width = total > 0 ? `${Math.min(100, (done / total) * 100)}%` : "0%";
  $("progress-text").textContent = raw ?? t(key, vars);
}

let toastTimer;
function toast(msg, ms = 6000) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (el.hidden = true), ms);
}

const KIND = {
  install: { line: "kind.install.line", button: "kind.install.button" },
  update: { line: "kind.update.line", button: "kind.update.button" },
  "minecraft-upgrade": { line: "kind.upgrade.line", button: "kind.upgrade.button" },
  downgrade: { line: "kind.downgrade.line", button: "kind.play" },
  none: { line: "kind.none.line", button: "kind.play" },
  offline: { line: "kind.offline.line", button: "kind.play" },
};

function renderStatus() {
  const s = ui.status;
  if (!s) return;
  const latest = s.latest;
  const installed = s.installed;
  $("fact-mc").textContent = latest ? latest.minecraft : installed?.minecraft ?? "-";
  $("fact-pack").textContent = latest ? latest.packVersion : installed?.packVersion ?? "-";
  $("fact-mods").textContent = latest ? t("fact.modCount", { n: latest.modCount }) : "-";

  const k = KIND[s.updateKind] ?? KIND.none;
  let line = t(k.line);
  if (s.updateKind === "minecraft-upgrade" && installed && latest) {
    line = t("kind.upgradeDetail", { from: installed.minecraft, to: latest.minecraft });
  } else if (s.updateKind === "update" && installed && latest) {
    line = t("kind.updateDetail", { from: installed.packVersion, to: latest.packVersion });
  } else if (s.updateKind === "offline" && !installed) {
    line = t("kind.offlineNew.line");
  }
  $("state-line").textContent = line;
  $("state-line").classList.toggle("attention", s.updateKind !== "none");

  const um = $("user-mods");
  um.hidden = s.userMods.length === 0;
  um.textContent = t("userMods", {
    n: s.userMods.length,
    list: s.userMods.slice(0, 3).join(", "),
    more: s.userMods.length > 3 ? t("userMods.more") : "",
  });

  const list = $("changelog");
  list.innerHTML = "";
  const lines = latest?.changelog ?? [];
  if (lines.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = t("ledger.empty");
    list.appendChild(li);
  }
  for (const l of lines) {
    const li = document.createElement("li");
    if (l.startsWith("[")) {
      li.className = "release";
      li.textContent = l.replace(/^\[([^\]]+)\]\s*/, (_m, v) => t("changelog.release", { v }));
    } else {
      li.textContent = translateChangelog(l.replace(/^\s*·\s*/, ""));
    }
    list.appendChild(li);
  }
  renderPlay();
}

function renderPlay() {
  const btn = $("play");
  const s = ui.status;
  const k = s ? KIND[s.updateKind] ?? KIND.none : KIND.none;
  btn.textContent = ui.running ? t("play.running") : ui.busy ? t("play.preparing") : t(k.button);
  const blocked = !s || s.updateKind === "downgrade" || (s.updateKind === "offline" && !s.installed);
  btn.disabled = !ui.account || ui.busy || ui.running || blocked;
}

function renderAccount() {
  const a = ui.account;
  $("who-name").textContent = a ? a.name : t("who.needLogin");
  $("logout").hidden = !a;
  const av = $("avatar");
  av.hidden = !a;
  av.onerror = () => (av.hidden = true);
  if (a) av.src = `https://mc-heads.net/avatar/${a.uuid}/40`;
  $("login").hidden = !!a;
  renderPlay();
}

function fmtMem(mb) {
  return `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)}GB`;
}

/** 언어가 바뀌면 화면 전체를 다시 그림 */
function renderAll() {
  applyStatic();
  $("launcher-version").textContent = t("settings.version", { v: ui.launcherVersion });
  updateMem();
  renderToggles();
  const p = ui.progress;
  setProgress(p.done, p.total, p.key, p.vars, p.raw);
  if (loginNotConfigured) $("login-error").textContent = t("login.notConfigured");
  renderAccount();
  renderStatus();
}

function updateMem() {
  const m = $("mem");
  $("mem-out").textContent = fmtMem(Number(m.value));
  const pos = (Number(m.value) - Number(m.min)) / (Number(m.max) - Number(m.min) || 1);
  m.parentElement.style.setProperty("--pos", String(pos));
}

/** 게임 옵션처럼 누를 때마다 값이 바뀌는 버튼 */
function renderToggles() {
  const langName = { auto: t("settings.lang.auto"), ko: "한국어", en: "English" }[ui.settings?.language ?? "auto"];
  $("lang-btn").textContent = t("settings.langBtn", { v: langName });
  $("hide-btn").textContent = t("settings.hideBtn", { v: ui.settings?.hideOnLaunch ? t("on") : t("off") });
  const s = ui.settings;
  $("size-btn").textContent = t("settings.sizeBtn", { v: !s ? "" : s.fullscreen ? t("settings.fullscreen") : `${s.width}×${s.height}` });
}

async function changeLanguage(value) {
  ui.settings = { ...ui.settings, language: value };
  const r = await window.mmc.saveSettings(ui.settings);
  if (r.ok) setUiLang(r.data.lang);
  renderAll();
}

async function refreshStatus() {
  const r = await window.mmc.status();
  if (r.ok) {
    ui.status = r.data;
    renderStatus();
  } else {
    $("state-line").textContent = t("state.fetchFail", { msg: r.error });
  }
}

// 창 버튼
document.querySelectorAll("[data-win]").forEach((b) => b.addEventListener("click", () => window.mmc.window(b.dataset.win)));

// 로그인
$("login-btn").addEventListener("click", async () => {
  $("login-btn").disabled = true;
  $("login-error").hidden = true;
  const r = await window.mmc.login();
  $("login-btn").disabled = false;
  if (r.ok) {
    ui.account = r.data;
    renderAccount();
  } else {
    $("login-error").textContent = r.error;
    $("login-error").hidden = false;
  }
});
$("logout").addEventListener("click", async () => {
  await window.mmc.logout();
  ui.account = null;
  renderAccount();
});
document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => changeLanguage(b.dataset.lang)));

// 플레이
$("play").addEventListener("click", async () => {
  ui.busy = true;
  renderPlay();
  setProgress(0, 1, "progress.preparing");
  const r = await window.mmc.play();
  ui.busy = false;
  if (!r.ok) {
    setProgress(0, 0, "progress.ready");
    toast(r.error, 0);
  }
  renderPlay();
  refreshStatus();
});

window.mmc.on("progress", (p) => setProgress(p.done, p.total, null, {}, `${p.label} ${p.done}/${p.total}`));
window.mmc.on("info", (m) => toast(m));
window.mmc.on("launched", () => {
  ui.running = true;
  setProgress(1, 1, "progress.running");
  renderPlay();
});
window.mmc.on("exited", (e) => {
  ui.running = false;
  setProgress(0, 0, "progress.ready");
  renderPlay();
  if (e.code !== 0 && e.code !== null) {
    toast(e.crash ? t("crash.report", { path: e.crash }) : t("crash.code", { code: e.code }), 0);
  }
});
window.mmc.on("launcher-update", (u) => {
  const v = u.version ? `v${u.version}` : t("launcher.newVersion");
  const key = { downloading: "launcher.downloading", installing: "launcher.installing", waiting: "launcher.waiting" }[u.state];
  if (!key) return;
  $("update-text").textContent = t(key, { v });
  $("update-restart").hidden = u.state !== "waiting";
  $("update-banner").hidden = false;
});
window.mmc.on("auto-update", (a) => {
  if (a.state === "start") {
    ui.busy = true;
    renderPlay();
    const key = a.kind === "install" ? "auto.install" : a.kind === "minecraft-upgrade" ? "auto.upgrade" : "auto.update";
    setProgress(0, 1, key, { to: a.to });
  } else if (a.state === "done") {
    ui.busy = false;
    setProgress(1, 1, a.kind === "install" ? "auto.installDone" : "auto.updateDone", { to: a.to });
    toast(a.kind === "install" ? t("auto.installToast") : t("auto.updateToast", { from: a.from ?? "", to: a.to }));
    renderPlay();
    refreshStatus();
  } else if (a.state === "error") {
    ui.busy = false;
    setProgress(0, 0, "progress.ready");
    toast(t("auto.error", { msg: a.message }), 0);
    renderPlay();
  }
});
$("update-restart").addEventListener("click", () => window.mmc.restartUpdate());

// 설정
$("settings-open").addEventListener("click", () => ($("settings").hidden = false));
$("settings-close").addEventListener("click", () => ($("settings").hidden = true));
async function persist() {
  ui.settings = {
    ...ui.settings,
    memoryMb: Number($("mem").value),
    extraJvmArgs: $("jvm").value.trim(),
  };
  await window.mmc.saveSettings(ui.settings);
}
$("mem").addEventListener("input", updateMem);
$("mem").addEventListener("change", persist);
$("jvm").addEventListener("change", persist);
$("hide-btn").addEventListener("click", async () => {
  ui.settings = { ...ui.settings, hideOnLaunch: !ui.settings.hideOnLaunch };
  renderToggles();
  await window.mmc.saveSettings(ui.settings);
});
// 창 크기: 화면에 맞는 16:9 크기들 → 전체 화면 → 처음으로
$("size-btn").addEventListener("click", async () => {
  const s = ui.settings;
  const opts = [...ui.windowSizes.map(([w, h]) => ({ w, h, fs: false })), { w: s.width, h: s.height, fs: true }];
  let cur = s.fullscreen ? opts.length - 1 : opts.findIndex((o) => !o.fs && o.w === s.width && o.h === s.height);
  const next = opts[(cur + 1) % opts.length];
  ui.settings = { ...s, width: next.w, height: next.h, fullscreen: next.fs };
  renderToggles();
  await window.mmc.saveSettings(ui.settings);
});
$("lang-btn").addEventListener("click", () => {
  const order = ["auto", "ko", "en"];
  const cur = order.indexOf(ui.settings?.language ?? "auto");
  changeLanguage(order[(cur + 1) % order.length]);
});
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => window.mmc.open(b.dataset.open)));
$("reinstall").addEventListener("click", async () => {
  $("settings").hidden = true;
  ui.busy = true;
  renderPlay();
  const r = await window.mmc.install();
  ui.busy = false;
  setProgress(0, 0, r.ok ? "progress.checked" : "progress.ready");
  if (!r.ok) toast(r.error, 0);
  else toast(t("reinstall.done"));
  refreshStatus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("settings").hidden = true;
});

// 시작
(async () => {
  const r = await window.mmc.init();
  if (!r.ok) return toast(r.error, 0);
  const d = r.data;
  setUiLang(d.lang);
  ui.account = d.account;
  ui.settings = d.settings;
  ui.launcherVersion = d.launcherVersion;
  ui.windowSizes = d.windowSizes?.length ? d.windowSizes : [[1280, 720]];
  const mem = $("mem");
  mem.max = String(Math.max(4096, Math.floor((d.totalMemoryMb * 0.75) / 512) * 512));
  mem.value = String(d.settings.memoryMb);
  $("jvm").value = d.settings.extraJvmArgs;
  if (!d.loginConfigured) {
    loginNotConfigured = true;
    $("login-error").hidden = false;
    $("login-btn").disabled = true;
  }
  setProgress(0, 0, "progress.ready");
  renderAll();
  refreshStatus();
})();
