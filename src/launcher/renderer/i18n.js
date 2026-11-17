"use strict";
/** 화면 글자 한국어 / English */
const STRINGS = {
  ko: {
    "win.min": "최소화", "win.max": "최대화", "win.close": "닫기",
    "fact.mc": "마인크래프트", "fact.pack": "팩 버전", "fact.mods": "모드", "fact.modCount": "{n}개",
    "state.checking": "팩 정보를 확인하고 있습니다",
    "state.fetchFail": "팩 정보를 확인하지 못했습니다: {msg}",
    "ledger.title": "업데이트 기록", "ledger.loading": "불러오는 중", "ledger.empty": "아직 기록이 없습니다.",
    "who.needLogin": "로그인 필요", "who.logout": "로그아웃",
    "progress.ready": "준비됨", "progress.preparing": "준비 중", "progress.running": "게임 실행 중",
    "progress.checked": "파일 검사 완료",
    "settings.open": "설정", "settings.close": "설정 닫기", "settings.title": "설정",
    "settings.language": "언어", "settings.lang.auto": "자동", "settings.lang.ko": "한국어", "settings.lang.en": "English",
    "settings.memory": "게임 메모리", "settings.memoryHint": "모드가 많아서 6~8GB를 권장합니다. 컴퓨터 메모리의 절반을 넘기지 마세요.",
    "settings.hide": "게임을 켜면 런처 숨기기",
    "settings.jvm": "추가 Java 옵션", "settings.jvmPlaceholder": "필요할 때만 입력",
    "settings.folders": "폴더 열기", "folder.saves": "월드", "folder.backups": "월드 백업", "folder.mods": "모드", "folder.game": "게임 폴더", "folder.logs": "로그",
    "settings.reinstall": "파일 검사 후 다시 받기", "settings.version": "런처 {v}",
    "login.title": "Microsoft 계정으로 로그인",
    "login.body": "마인크래프트 자바 에디션을 구매한 계정이 필요합니다. 로그인 정보는 이 컴퓨터에만 암호화해 저장합니다.",
    "login.button": "로그인",
    "login.notConfigured": "이 런처에는 아직 로그인 설정이 들어가지 않았습니다 (Azure 앱 승인 대기 중).",
    "kind.install.line": "처음 실행이라 게임과 모드를 받는 중입니다.", "kind.install.button": "설치하고 플레이",
    "kind.update.line": "새 팩 버전을 자동으로 받는 중입니다.", "kind.update.button": "업데이트",
    "kind.upgrade.line": "마인크래프트 버전이 올라갑니다. 월드를 먼저 백업한 뒤 자동으로 업데이트합니다.", "kind.upgrade.button": "업데이트",
    "kind.downgrade.line": "배포된 팩이 설치된 버전보다 낮아 실행할 수 없습니다. 런처 제작자에게 알려 주세요.",
    "kind.none.line": "최신 버전입니다.", "kind.play": "플레이",
    "kind.offline.line": "인터넷에 연결할 수 없어 설치된 버전으로 실행합니다.",
    "kind.offlineNew.line": "인터넷에 연결할 수 없습니다. 처음 설치에는 인터넷이 필요합니다.",
    "kind.upgradeDetail": "마인크래프트 {from} → {to}로 올라갑니다. 월드를 먼저 백업한 뒤 자동으로 업데이트합니다.",
    "kind.updateDetail": "팩 {from} → {to}. 바뀐 모드만 자동으로 받습니다.",
    "play.running": "실행 중", "play.preparing": "준비 중",
    "userMods": "직접 넣은 모드 {n}개가 함께 실행됩니다 ({list}{more}). 충돌이 나면 모드 폴더에서 빼 주세요.", "userMods.more": " 등",
    "crash.report": "게임이 비정상 종료되었습니다. 크래시 보고서: {path}",
    "crash.code": "게임이 비정상 종료되었습니다 (코드 {code}). 설정 → 로그 폴더를 확인하세요.",
    "launcher.downloading": "새 런처 {v}을 받고 있습니다.",
    "launcher.installing": "런처를 {v}로 업데이트하고 다시 시작합니다.",
    "launcher.waiting": "런처 {v}을 받았습니다. 게임을 끄면 자동으로 업데이트됩니다.",
    "launcher.newVersion": "새 버전", "launcher.restart": "지금 다시 시작해서 적용",
    "auto.install": "게임과 모드를 처음 받는 중", "auto.upgrade": "마인크래프트 버전 업데이트 중", "auto.update": "팩 {to}로 업데이트 중",
    "auto.installDone": "설치 완료", "auto.updateDone": "팩 {to} 업데이트 완료",
    "auto.installToast": "설치를 마쳤습니다. 바로 플레이할 수 있습니다.",
    "auto.updateToast": "팩을 {from} → {to}로 자동 업데이트했습니다.",
    "auto.error": "자동 업데이트 실패: {msg} (플레이를 누르면 다시 시도합니다)",
    "reinstall.done": "모든 파일을 확인했습니다.",
    "changelog.release": "팩 {v} · ",
    "splash": "조금 더!", "settings.done": "완료", "on": "켜짐", "off": "꺼짐",
    "settings.langBtn": "언어: {v}", "settings.hideBtn": "게임 중 런처 숨기기: {v}",
    "settings.sizeBtn": "창 크기: {v}", "settings.fullscreen": "전체 화면",
  },
  en: {
    "win.min": "Minimize", "win.max": "Maximize", "win.close": "Close",
    "fact.mc": "Minecraft", "fact.pack": "Pack version", "fact.mods": "Mods", "fact.modCount": "{n}",
    "state.checking": "Checking for pack updates",
    "state.fetchFail": "Couldn't check the pack: {msg}",
    "ledger.title": "Update history", "ledger.loading": "Loading", "ledger.empty": "No updates yet.",
    "who.needLogin": "Not signed in", "who.logout": "Sign out",
    "progress.ready": "Ready", "progress.preparing": "Preparing", "progress.running": "Game is running",
    "progress.checked": "File check complete",
    "settings.open": "Settings", "settings.close": "Close settings", "settings.title": "Settings",
    "settings.language": "Language", "settings.lang.auto": "Auto", "settings.lang.ko": "한국어", "settings.lang.en": "English",
    "settings.memory": "Game memory", "settings.memoryHint": "With this many mods, 6–8 GB is recommended. Don't use more than half of your computer's memory.",
    "settings.hide": "Hide the launcher while playing",
    "settings.jvm": "Extra Java options", "settings.jvmPlaceholder": "Only if you need them",
    "settings.folders": "Open folder", "folder.saves": "Worlds", "folder.backups": "World backups", "folder.mods": "Mods", "folder.game": "Game folder", "folder.logs": "Logs",
    "settings.reinstall": "Check files and re-download", "settings.version": "Launcher {v}",
    "login.title": "Sign in with Microsoft",
    "login.body": "You need an account that owns Minecraft: Java Edition. Your sign-in is stored encrypted on this computer only.",
    "login.button": "Sign in",
    "login.notConfigured": "Sign-in isn't set up in this launcher yet (waiting for Azure app approval).",
    "kind.install.line": "First launch: downloading the game and mods.", "kind.install.button": "Install and play",
    "kind.update.line": "Downloading the new pack version automatically.", "kind.update.button": "Update",
    "kind.upgrade.line": "Minecraft is being updated. Your worlds are backed up first, then the update installs automatically.", "kind.upgrade.button": "Update",
    "kind.downgrade.line": "The published pack is older than the installed one, so the game can't start. Please tell the launcher author.",
    "kind.none.line": "You're up to date.", "kind.play": "Play",
    "kind.offline.line": "No internet connection. Starting the installed version.",
    "kind.offlineNew.line": "No internet connection. The first install needs the internet.",
    "kind.upgradeDetail": "Minecraft {from} → {to}. Your worlds are backed up first, then the update installs automatically.",
    "kind.updateDetail": "Pack {from} → {to}. Only changed mods are downloaded.",
    "play.running": "Running", "play.preparing": "Preparing",
    "userMods": "{n} mods you added yourself will also load ({list}{more}). If something breaks, remove them from the mods folder.", "userMods.more": ", …",
    "crash.report": "The game closed unexpectedly. Crash report: {path}",
    "crash.code": "The game closed unexpectedly (code {code}). Check Settings → Logs.",
    "launcher.downloading": "Downloading launcher {v}.",
    "launcher.installing": "Updating the launcher to {v} and restarting.",
    "launcher.waiting": "Launcher {v} is ready. It will update when you close the game.",
    "launcher.newVersion": "a new version", "launcher.restart": "Restart now to update",
    "auto.install": "Downloading the game and mods", "auto.upgrade": "Updating Minecraft", "auto.update": "Updating pack to {to}",
    "auto.installDone": "Install complete", "auto.updateDone": "Pack {to} installed",
    "auto.installToast": "Install complete. You can play now.",
    "auto.updateToast": "The pack was updated automatically: {from} → {to}.",
    "auto.error": "Automatic update failed: {msg} (it will try again when you press Play)",
    "reinstall.done": "All files checked.",
    "changelog.release": "Pack {v} · ",
    "splash": "A little more!", "settings.done": "Done", "on": "ON", "off": "OFF",
    "settings.langBtn": "Language: {v}", "settings.hideBtn": "Hide launcher while playing: {v}",
    "settings.sizeBtn": "Window size: {v}", "settings.fullscreen": "Fullscreen",
  },
};

let LANG = "ko";
function setUiLang(l) {
  LANG = l === "en" ? "en" : "ko";
  document.documentElement.lang = LANG;
}
function t(key, vars = {}) {
  const s = (STRINGS[LANG] && STRINGS[LANG][key]) ?? STRINGS.ko[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
/** data-i18n 속성이 붙은 글자 바꾸기 */
function applyStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder)));
}

/** 자동 업데이트가 만든 한국어 기록을 영어로 (영어 화면일 때) */
const CHANGELOG_EN = [
  [/^새 모드: (.+)$/, "New mod: $1"],
  [/^새 라이브러리: (.+?) \((.+)에 필요\)$/, "New library: $1 (needed by $2)"],
  [/^새 라이브러리: (.+)$/, "New library: $1"],
  [/^제거: (.+?) \(더 이상 필요 없는 라이브러리\)$/, "Removed: $1 (library no longer needed)"],
  [/^제거: (.+)$/, "Removed: $1"],
  [/^보류\(문제 발견\): (.+)$/, "On hold (problem found): $1"],
  [/^모드 목록 다시 가져오기$/, "Mod list re-imported"],
  [/^Minecraft (.+) → (.+)$/, "Minecraft $1 → $2"],
  [/^팩 버전 표기 변경: (.+?) → (.+?) \(.*\)$/, "Pack version format changed: $1 → $2 (Minecraft.additions/removals.updates)"],
  [/^첫 실행 시 Fabulously Optimized 환영 화면 표시 안 함$/, "Fabulously Optimized welcome screen no longer shows on first launch"],
];
function translateChangelog(line) {
  if (LANG !== "en") return line;
  for (const [re, rep] of CHANGELOG_EN) if (re.test(line)) { line = line.replace(re, rep); break; }
  // 영어 화면에서는 한국어 설명(괄호)을 뺌
  return line.replace(/\s*\([^)]*[\uAC00-\uD7A3][^)]*\)/g, "");
}
