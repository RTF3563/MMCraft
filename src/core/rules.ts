/** Mojang 버전 JSON의 rules 판정 */

export type OsName = "windows" | "osx" | "linux";

export interface Platform {
  os: OsName;
  arch: "x64" | "arm64" | "x86";
}

export interface Rule {
  action: "allow" | "disallow";
  os?: { name?: string; arch?: string; version?: string };
  features?: Record<string, boolean>;
}

export function currentPlatform(): Platform {
  const os: OsName = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "osx" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "x86" : "x64";
  return { os, arch };
}

export function ruleMatches(rule: Rule, platform: Platform, features: Record<string, boolean> = {}): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== platform.os) return false;
    if (rule.os.arch && rule.os.arch !== platform.arch) return false;
  }
  if (rule.features) {
    for (const [k, v] of Object.entries(rule.features)) {
      if ((features[k] ?? false) !== v) return false;
    }
  }
  return true;
}

export function isAllowed(rules: Rule[] | undefined, platform: Platform, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule, platform, features)) allowed = rule.action === "allow";
  }
  return allowed;
}

/** natives-windows / natives-windows-arm64 / natives-linux 같은 분류자를 현재 플랫폼에 맞는지 판정 */
export function nativeClassifierMatches(classifier: string, platform: Platform): boolean {
  const osKey = platform.os === "osx" ? "macos" : platform.os;
  if (!classifier.startsWith("natives-")) return true;
  const rest = classifier.slice("natives-".length); // windows, windows-arm64, macos-patch ...
  const [os, ...suffix] = rest.split("-");
  if (os !== osKey && !(osKey === "macos" && os === "osx")) return false;
  const tail = suffix.join("-");
  if (tail === "") return platform.arch === "x64";
  if (tail === "arm64" || tail === "aarch_64") return platform.arch === "arm64";
  if (tail === "x86") return platform.arch === "x86";
  if (tail === "arm32") return false;
  return true; // 기타(patch 등)
}
