/** 런처 메시지 한국어 / English (자동 테스트·CI는 한국어 그대로) */
export type Lang = "ko" | "en";

let current: Lang = "ko";
export const setLang = (l: Lang) => { current = l; };
export const getLang = () => current;

const M: Record<string, { ko: string; en: string }> = {
  // 다운로드 단계 이름
  "label.libraries": { ko: "라이브러리", en: "Libraries" },
  "label.assets": { ko: "게임 리소스", en: "Game assets" },
  "label.java": { ko: "Java", en: "Java" },
  "label.mods": { ko: "모드", en: "Mods" },
  "label.configs": { ko: "설정 파일", en: "Config files" },
  "label.download": { ko: "다운로드", en: "Downloading" },
  "label.checkGame": { ko: "게임 정보 확인", en: "Checking game files" },
  "label.backup": { ko: "월드 백업", en: "Backing up worlds" },
  "label.launcherUpdate": { ko: "런처 업데이트", en: "Launcher update" },

  // 오류·안내
  "err.verify": { ko: "파일 검증 실패: {url}", en: "File verification failed: {url}" },
  "err.noJava": { ko: "이 컴퓨터용 Java({component})를 찾을 수 없습니다", en: "No Java ({component}) is available for this computer" },
  "err.noVersion": { ko: "Minecraft {mc} 버전을 찾을 수 없습니다", en: "Minecraft {mc} was not found" },
  "err.oldLauncher": { ko: "런처가 오래되어 새 팩 형식을 읽을 수 없습니다. 런처를 업데이트해 주세요.", en: "This launcher is too old to read the new pack format. Please update the launcher." },
  "err.badPath": { ko: "잘못된 경로: {path}", en: "Invalid path: {path}" },
  "err.noIndex": { ko: "팩 정보를 받을 수 없습니다. 인터넷 연결을 확인하세요.", en: "Couldn't get pack information. Check your internet connection." },
  "err.downgrade": { ko: "배포된 팩({to})이 설치된 버전({from})보다 낮습니다. 월드 보호를 위해 실행하지 않습니다.", en: "The published pack ({to}) is older than the installed one ({from}). The game won't start, to protect your worlds." },
  "err.running": { ko: "이미 게임이 실행 중입니다.", en: "The game is already running." },
  "err.loginFirst": { ko: "먼저 로그인하세요.", en: "Please sign in first." },
  "err.noClientId": { ko: "런처에 로그인 설정(Azure Client ID)이 아직 없습니다.", en: "Sign-in isn't set up in this launcher yet (missing Azure Client ID)." },
  "err.launch": { ko: "실행 실패: {msg}", en: "Couldn't start the game: {msg}" },
  "info.upgradeBackup": { ko: "Minecraft {from} → {to} 버전 업: 월드를 먼저 백업합니다", en: "Updating Minecraft {from} → {to}: backing up your worlds first" },
  "info.backupDone": { ko: "월드 백업 완료: {path}", en: "Worlds backed up to: {path}" },

  // 로그인
  "auth.window": { ko: "Microsoft 로그인", en: "Microsoft sign-in" },
  "auth.state": { ko: "로그인 확인값이 맞지 않습니다. 다시 시도하세요.", en: "Sign-in check failed. Please try again." },
  "auth.cancelled": { ko: "로그인이 취소되었습니다.", en: "Sign-in was cancelled." },
  "auth.closed": { ko: "로그인 창을 닫았습니다.", en: "The sign-in window was closed." },
  "auth.msFail": { ko: "Microsoft 로그인 실패: {msg}", en: "Microsoft sign-in failed: {msg}" },
  "auth.xblFail": { ko: "Xbox Live 로그인 실패", en: "Xbox Live sign-in failed" },
  "auth.xstsFail": { ko: "Xbox 인증 실패 ({code})", en: "Xbox authentication failed ({code})" },
  "auth.notApproved": { ko: "이 런처는 아직 Mojang의 Minecraft 로그인 승인을 받지 못했습니다. (런처 제작자: Azure 앱 권한 신청 필요)", en: "This launcher hasn't been approved for Minecraft sign-in by Mojang yet. (Launcher author: Azure app permission is pending.)" },
  "auth.mcFail": { ko: "Minecraft 로그인 실패 ({code})", en: "Minecraft sign-in failed ({code})" },
  "auth.noGame": { ko: "이 계정은 Minecraft: Java Edition을 갖고 있지 않습니다.", en: "This account doesn't own Minecraft: Java Edition." },
  "auth.profileFail": { ko: "프로필을 불러오지 못했습니다 ({code})", en: "Couldn't load the profile ({code})" },
  "xerr.2148916233": { ko: "이 Microsoft 계정에는 Xbox 프로필이 없습니다. minecraft.net에서 한 번 로그인해 프로필을 만든 뒤 다시 시도하세요.", en: "This Microsoft account has no Xbox profile. Sign in once at minecraft.net to create one, then try again." },
  "xerr.2148916235": { ko: "Xbox Live를 쓸 수 없는 국가의 계정입니다.", en: "Xbox Live isn't available in this account's country." },
  "xerr.2148916236": { ko: "성인 인증이 필요한 계정입니다 (Xbox 사이트에서 인증).", en: "This account needs adult verification (verify on the Xbox website)." },
  "xerr.2148916237": { ko: "성인 인증이 필요한 계정입니다 (Xbox 사이트에서 인증).", en: "This account needs adult verification (verify on the Xbox website)." },
  "xerr.2148916238": { ko: "만 18세 미만 계정입니다. 보호자가 Microsoft 가족 그룹에 추가해야 로그인할 수 있습니다.", en: "This account belongs to someone under 18. An adult must add it to a Microsoft family group before it can sign in." },
};

export function tr(key: string, vars: Record<string, string | number> = {}): string {
  const entry = M[key];
  const text = entry ? entry[current] : key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function hasMessage(key: string) {
  return key in M;
}
