import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface ServerSettings {
  /** auto = 컴퓨터 언어를 따름 */
  language: "auto" | "ko" | "en";
  memoryMb: number;
  port: number;
  /** 서버 폴더 (월드·mods·config·server.properties) */
  serverDir: string;
  /** Windows 시작 시 런처를 켜고 서버 시작 (기본 꺼짐) */
  autoStart: boolean;
  /** 추가 Java 옵션 */
  extraJvmArgs: string;
  /** 런처 자체 업데이트로 서버를 잠깐 껐음 → 다시 켜지면 서버도 다시 시작 */
  resumeAfterUpdate?: boolean;
}

/** 서버 런처 데이터 폴더 (Windows: %APPDATA%\.mmcraft-server) — 플레이어 런처(.mmcraft)와 따로 */
export function serverRoot(): string {
  if (process.env.MMCRAFT_SERVER_HOME) return process.env.MMCRAFT_SERVER_HOME;
  const base = process.platform === "win32" ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming") : os.homedir();
  return path.join(base, ".mmcraft-server");
}

export function defaultSettings(root: string): ServerSettings {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
  const mem = Math.max(4096, Math.min(8192, Math.floor(totalMb / 2 / 512) * 512));
  return { language: "auto", memoryMb: mem, port: 25565, serverDir: path.join(root, "server"), autoStart: false, extraJvmArgs: "" };
}

const file = (root: string) => path.join(root, "settings.json");

export function loadSettings(root: string): ServerSettings {
  const d = defaultSettings(root);
  try {
    const s = { ...d, ...JSON.parse(fs.readFileSync(file(root), "utf8")) } as ServerSettings;
    if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) s.port = d.port;
    if (!s.serverDir) s.serverDir = d.serverDir;
    return s;
  } catch {
    return d;
  }
}

export function saveSettings(root: string, s: ServerSettings) {
  fs.mkdirSync(root, { recursive: true });
  const tmp = file(root) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file(root));
}
