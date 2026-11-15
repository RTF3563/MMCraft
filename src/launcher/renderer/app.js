"use strict";
const $ = (id) => document.getElementById(id);
const BLOCKS = 32;

const ui = {
  account: null,
  status: null,
  busy: false,
  running: false,
  settings: null,
};

// 진행 막대 블럭
const blocksEl = $("blocks");
for (let i = 0; i < BLOCKS; i++) blocksEl.appendChild(document.createElement("i"));
function setProgress(done, total, label) {
  const n = total > 0 ? Math.round((done / total) * BLOCKS) : 0;
  [...blocksEl.children].forEach((b, i) => b.classList.toggle("on", i < n));
  blocksEl.classList.toggle("busy", total > 0 && done < total);
  if (label !== undefined) $("progress-text").textContent = label;
}

let toastTimer;
function toast(msg, ms = 6000) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (t.hidden = true), ms);
}

const KIND_TEXT = {
  install: { line: "처음 실행이라 게임과 모드를 받는 중입니다.", button: "설치하고 플레이" },
  update: { line: "새 팩 버전을 자동으로 받는 중입니다.", button: "업데이트" },
  "minecraft-upgrade": { line: "마인크래프트 버전이 올라갑니다. 월드는 자동으로 백업한 뒤 업데이트합니다.", button: "업데이트" },
  downgrade: { line: "배포된 팩이 설치된 버전보다 낮아 실행할 수 없습니다. 런처 제작자에게 알려 주세요.", button: "플레이" },
  none: { line: "최신 버전입니다.", button: "플레이" },
  offline: { line: "인터넷에 연결할 수 없어 설치된 버전으로 실행합니다.", button: "플레이" },
};

function renderStatus() {
  const s = ui.status;
  if (!s) return;
  const latest = s.latest;
  const installed = s.installed;
  $("fact-mc").textContent = latest ? latest.minecraft : installed?.minecraft ?? "-";
  $("fact-pack").textContent = latest ? latest.packVersion : installed?.packVersion ?? "-";
  $("fact-mods").textContent = latest ? `${latest.modCount}개` : "-";

  const k = KIND_TEXT[s.updateKind] ?? KIND_TEXT.none;
  let line = k.line;
  if (s.updateKind === "minecraft-upgrade" && installed && latest) {
    line = `마인크래프트 ${installed.minecraft} → ${latest.minecraft}로 올라갑니다. 월드를 먼저 백업한 뒤 자동으로 업데이트합니다.`;
  } else if (s.updateKind === "update" && installed) {
    line = `팩 ${installed.packVersion} → ${latest.packVersion}. 바뀐 모드만 자동으로 받습니다.`;
  } else if (s.updateKind === "offline" && !installed) {
    line = "인터넷에 연결할 수 없습니다. 처음 설치에는 인터넷이 필요합니다.";
  }
  $("state-line").textContent = line;
  $("state-line").classList.toggle("attention", s.updateKind !== "none");

  const um = $("user-mods");
  um.hidden = s.userMods.length === 0;
  um.textContent = `직접 넣은 모드 ${s.userMods.length}개가 함께 실행됩니다 (${s.userMods.slice(0, 3).join(", ")}${s.userMods.length > 3 ? " 등" : ""}). 충돌이 나면 모드 폴더에서 빼 주세요.`;

  const list = $("changelog");
  list.innerHTML = "";
  const lines = latest?.changelog ?? [];
  if (lines.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "아직 기록이 없습니다.";
    list.appendChild(li);
  }
  for (const l of lines) {
    const li = document.createElement("li");
    if (l.startsWith("[")) {
      li.className = "release";
      li.textContent = l.replace(/^\[([^\]]+)\]\s*/, "팩 $1 · ");
    } else {
      li.textContent = l.replace(/^\s*·\s*/, "");
    }
    list.appendChild(li);
  }
  renderPlay();
}

function renderPlay() {
  const btn = $("play");
  const s = ui.status;
  const k = s ? KIND_TEXT[s.updateKind] ?? KIND_TEXT.none : KIND_TEXT.none;
  btn.textContent = ui.running ? "실행 중" : ui.busy ? "준비 중" : k.button;
  const blocked = !s || s.updateKind === "downgrade" || (s.updateKind === "offline" && !s.installed);
  btn.disabled = !ui.account || ui.busy || ui.running || blocked;
}

function renderAccount() {
  const a = ui.account;
  $("who-name").textContent = a ? a.name : "로그인 필요";
  $("logout").hidden = !a;
  const av = $("avatar");
  av.hidden = !a;
  av.onerror = () => (av.hidden = true);
  if (a) av.src = `https://mc-heads.net/avatar/${a.uuid}/40`;
  $("login").hidden = !!a;
  renderPlay();
}

async function refreshStatus() {
  const r = await window.mmc.status();
  if (r.ok) {
    ui.status = r.data;
    renderStatus();
  } else {
    $("state-line").textContent = `팩 정보를 확인하지 못했습니다: ${r.error}`;
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

// 플레이
$("play").addEventListener("click", async () => {
  ui.busy = true;
  renderPlay();
  setProgress(0, 1, "준비 중");
  const r = await window.mmc.play();
  ui.busy = false;
  if (!r.ok) {
    setProgress(0, 0, "준비됨");
    toast(r.error, 0);
  }
  renderPlay();
  refreshStatus();
});

window.mmc.on("progress", (p) => setProgress(p.done, p.total, `${p.label} ${p.done}/${p.total}`));
window.mmc.on("info", (m) => toast(m));
window.mmc.on("launched", () => {
  ui.running = true;
  setProgress(1, 1, "게임 실행 중");
  renderPlay();
});
window.mmc.on("exited", (e) => {
  ui.running = false;
  setProgress(0, 0, "준비됨");
  renderPlay();
  if (e.code !== 0 && e.code !== null) {
    toast(e.crash ? `게임이 비정상 종료되었습니다. 크래시 보고서: ${e.crash}` : `게임이 비정상 종료되었습니다 (코드 ${e.code}). 설정 → 로그 폴더를 확인하세요.`, 0);
  }
});
window.mmc.on("launcher-update", (u) => {
  const v = u.version ? `v${u.version}` : "새 버전";
  const text = {
    downloading: `새 런처 ${v}을 받고 있습니다.`,
    installing: `런처를 ${v}로 업데이트하고 다시 시작합니다.`,
    waiting: `런처 ${v}을 받았습니다. 게임을 끄면 자동으로 업데이트됩니다.`,
  }[u.state];
  if (!text) return;
  $("update-text").textContent = text;
  $("update-restart").hidden = u.state !== "waiting";
  $("update-banner").hidden = false;
});
window.mmc.on("auto-update", (a) => {
  if (a.state === "start") {
    ui.busy = true;
    renderPlay();
    const what = a.kind === "install" ? "게임과 모드를 처음 받는 중" : a.kind === "minecraft-upgrade" ? "마인크래프트 버전 업데이트 중" : `팩 ${a.to}로 업데이트 중`;
    setProgress(0, 1, what);
  } else if (a.state === "done") {
    ui.busy = false;
    setProgress(1, 1, a.kind === "install" ? "설치 완료" : `팩 ${a.to} 업데이트 완료`);
    toast(a.kind === "install" ? "설치를 마쳤습니다. 바로 플레이할 수 있습니다." : `팩을 ${a.from ?? ""} → ${a.to}로 자동 업데이트했습니다.`);
    renderPlay();
    refreshStatus();
  } else if (a.state === "error") {
    ui.busy = false;
    setProgress(0, 0, "준비됨");
    toast(`자동 업데이트 실패: ${a.message} (플레이를 누르면 다시 시도합니다)`, 0);
    renderPlay();
  }
});
$("update-restart").addEventListener("click", () => window.mmc.restartUpdate());

// 설정
function fmtMem(mb) {
  return `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)}GB`;
}
$("settings-open").addEventListener("click", () => ($("settings").hidden = false));
$("settings-close").addEventListener("click", () => ($("settings").hidden = true));
async function persist() {
  ui.settings = {
    ...ui.settings,
    memoryMb: Number($("mem").value),
    hideOnLaunch: $("hide").checked,
    extraJvmArgs: $("jvm").value.trim(),
  };
  await window.mmc.saveSettings(ui.settings);
}
$("mem").addEventListener("input", () => ($("mem-out").textContent = fmtMem(Number($("mem").value))));
$("mem").addEventListener("change", persist);
$("hide").addEventListener("change", persist);
$("jvm").addEventListener("change", persist);
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => window.mmc.open(b.dataset.open)));
$("reinstall").addEventListener("click", async () => {
  $("settings").hidden = true;
  ui.busy = true;
  renderPlay();
  const r = await window.mmc.install();
  ui.busy = false;
  setProgress(0, 0, r.ok ? "파일 검사 완료" : "준비됨");
  if (!r.ok) toast(r.error, 0);
  else toast("모든 파일을 확인했습니다.");
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
  ui.account = d.account;
  ui.settings = d.settings;
  $("launcher-version").textContent = `런처 ${d.launcherVersion}`;
  const mem = $("mem");
  mem.max = String(Math.max(4096, Math.floor((d.totalMemoryMb * 0.75) / 512) * 512));
  mem.value = String(d.settings.memoryMb);
  $("mem-out").textContent = fmtMem(d.settings.memoryMb);
  $("hide").checked = d.settings.hideOnLaunch;
  $("jvm").value = d.settings.extraJvmArgs;
  if (!d.loginConfigured) {
    $("login-error").textContent = "이 런처에는 아직 로그인 설정이 들어가지 않았습니다 (Azure 앱 승인 대기 중).";
    $("login-error").hidden = false;
    $("login-btn").disabled = true;
  }
  renderAccount();
  setProgress(0, 0, "준비됨");
  refreshStatus();
})();
