/**
 * Microsoft 계정 → Xbox Live → Minecraft 로그인
 * (Azure 앱 등록 + Minecraft API 사용 승인 필요: docs/로그인-승인-신청.md)
 */
import * as crypto from "crypto";
import * as fs from "fs";
import { BrowserWindow, safeStorage, session } from "electron";
import { request } from "../core/http";

export const REDIRECT_URI = "https://login.microsoftonline.com/common/oauth2/nativeclient";
const AUTHORIZE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE = "XboxLive.signin offline_access";

export interface Account {
  name: string;
  uuid: string;
  mcToken: string;
  mcExpiresAt: number;
  msRefreshToken: string;
  xuid?: string;
}

export class AuthError extends Error {}

async function post(url: string, body: unknown, form = false) {
  const res = await request(url, {
    method: "POST",
    headers: form
      ? { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
      : { "Content-Type": "application/json", Accept: "application/json" },
    body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  return { status: res.status, json, text };
}

const XERR: Record<string, string> = {
  "2148916233": "이 Microsoft 계정에는 Xbox 프로필이 없습니다. minecraft.net에서 한 번 로그인해 프로필을 만든 뒤 다시 시도하세요.",
  "2148916235": "Xbox Live를 쓸 수 없는 국가의 계정입니다.",
  "2148916236": "성인 인증이 필요한 계정입니다 (Xbox 사이트에서 인증).",
  "2148916237": "성인 인증이 필요한 계정입니다 (Xbox 사이트에서 인증).",
  "2148916238": "만 18세 미만 계정입니다. 보호자가 Microsoft 가족 그룹에 추가해야 로그인할 수 있습니다.",
};

/** 로그인 창을 띄워 인증 코드 받기 (PKCE) */
export function interactiveLogin(clientId: string, parent?: BrowserWindow): Promise<{ code: string; verifier: string }> {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  const url =
    `${AUTHORIZE}?client_id=${encodeURIComponent(clientId)}&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&prompt=select_account`;

  return new Promise((resolve, reject) => {
    const ses = session.fromPartition(`mmcraft-login-${Date.now()}`); // 매번 새 세션 (다른 계정 선택 가능)
    const win = new BrowserWindow({
      width: 520, height: 680, parent, modal: !!parent, title: "Microsoft 로그인", autoHideMenuBar: true,
      webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true },
    });
    let settled = false;
    const finish = (err: Error | null, code?: string) => {
      if (settled) return;
      settled = true;
      if (!win.isDestroyed()) win.close();
      err ? reject(err) : resolve({ code: code!, verifier });
    };
    ses.webRequest.onBeforeRequest({ urls: [REDIRECT_URI + "*"] }, (details, cb) => {
      const u = new URL(details.url);
      cb({ cancel: true });
      if (u.searchParams.get("state") !== state) return finish(new AuthError("로그인 확인값이 맞지 않습니다. 다시 시도하세요."));
      const code = u.searchParams.get("code");
      if (code) finish(null, code);
      else finish(new AuthError(u.searchParams.get("error_description") || "로그인이 취소되었습니다."));
    });
    win.on("closed", () => finish(new AuthError("로그인 창을 닫았습니다.")));
    win.loadURL(url);
  });
}

async function msToken(clientId: string, params: Record<string, string>) {
  const r = await post(TOKEN, { client_id: clientId, scope: SCOPE, ...params }, true);
  if (r.status !== 200) throw new AuthError(`Microsoft 로그인 실패: ${r.json.error_description || r.text.slice(0, 200)}`);
  return r.json as { access_token: string; refresh_token: string };
}

async function minecraftFromMs(msAccess: string, msRefresh: string): Promise<Account> {
  const xbl = await post("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msAccess}` },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
  });
  if (xbl.status !== 200) throw new AuthError("Xbox Live 로그인 실패");

  const xsts = await post("https://xsts.auth.xboxlive.com/xsts/authorize", {
    Properties: { SandboxId: "RETAIL", UserTokens: [xbl.json.Token] },
    RelyingParty: "rp://api.minecraftservices.com/",
    TokenType: "JWT",
  });
  if (xsts.status === 401) throw new AuthError(XERR[String(xsts.json.XErr)] ?? `Xbox 인증 실패 (${xsts.json.XErr})`);
  if (xsts.status !== 200) throw new AuthError("Xbox 인증 실패");
  const uhs = xsts.json.DisplayClaims.xui[0].uhs;

  const mc = await post("https://api.minecraftservices.com/authentication/login_with_xbox", {
    identityToken: `XBL3.0 x=${uhs};${xsts.json.Token}`,
  });
  if (mc.status === 403 || /Invalid app registration/i.test(mc.text)) {
    throw new AuthError("이 런처는 아직 Mojang의 Minecraft 로그인 승인을 받지 못했습니다. (런처 제작자: Azure 앱 권한 신청 필요)");
  }
  if (mc.status !== 200) throw new AuthError(`Minecraft 로그인 실패 (${mc.status})`);

  const prof = await request("https://api.minecraftservices.com/minecraft/profile", {
    headers: { Authorization: `Bearer ${mc.json.access_token}` },
  });
  if (prof.status === 404) throw new AuthError("이 계정은 Minecraft: Java Edition을 갖고 있지 않습니다.");
  if (!prof.ok) throw new AuthError(`프로필을 불러오지 못했습니다 (${prof.status})`);
  const p = (await prof.json()) as { id: string; name: string };

  return {
    name: p.name,
    uuid: p.id,
    mcToken: mc.json.access_token,
    mcExpiresAt: Date.now() + (mc.json.expires_in ?? 86400) * 1000,
    msRefreshToken: msRefresh,
  };
}

export async function login(clientId: string, parent?: BrowserWindow): Promise<Account> {
  const { code, verifier } = await interactiveLogin(clientId, parent);
  const t = await msToken(clientId, { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
  return minecraftFromMs(t.access_token, t.refresh_token);
}

/** 저장된 계정의 토큰이 곧 만료되면 새로 받기 */
export async function ensureFresh(clientId: string, acc: Account): Promise<Account> {
  if (acc.mcExpiresAt - Date.now() > 10 * 60_000) return acc;
  const t = await msToken(clientId, { grant_type: "refresh_token", refresh_token: acc.msRefreshToken });
  return minecraftFromMs(t.access_token, t.refresh_token ?? acc.msRefreshToken);
}

export function saveAccount(file: string, acc: Account | null) {
  if (!acc) return fs.rmSync(file, { force: true });
  const data = JSON.stringify(acc);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(data) : Buffer.from(data, "utf8");
  fs.writeFileSync(file, buf);
}

export function loadAccount(file: string): Account | null {
  try {
    const buf = fs.readFileSync(file);
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}
