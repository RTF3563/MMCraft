import { Argument, ResolvedVersion } from "./minecraft";
import { Layout } from "./paths";
import { Platform, isAllowed } from "./rules";

export interface LaunchAuth {
  name: string;
  uuid: string; // 하이픈 없는 32자리
  accessToken: string;
  xuid?: string;
  userType: "msa" | "legacy";
}

export interface LaunchOptions {
  maxMemoryMb: number;
  minMemoryMb?: number;
  extraJvmArgs?: string[];
  width?: number;
  height?: number;
  launcherVersion?: string;
}

export interface LaunchCommand {
  command: string;
  args: string[];
  cwd: string;
}

/** 메모리 넉넉한 모드팩용 기본 JVM 옵션 (G1GC) */
export const DEFAULT_JVM_FLAGS = [
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=200",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+DisableExplicitGC",
  "-XX:G1NewSizePercent=30",
  "-XX:G1MaxNewSizePercent=40",
  "-XX:G1HeapRegionSize=8M",
  "-XX:G1ReservePercent=20",
  "-XX:InitiatingHeapOccupancyPercent=15",
];

function expandArgs(args: Argument[], platform: Platform, features: Record<string, boolean>): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (typeof a === "string") out.push(a);
    else if (isAllowed(a.rules, platform, features)) out.push(...(Array.isArray(a.value) ? a.value : [a.value]));
  }
  return out;
}

export function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function buildLaunchCommand(
  layout: Layout,
  v: ResolvedVersion,
  javaExe: string,
  auth: LaunchAuth,
  opts: LaunchOptions,
  platform: Platform,
): LaunchCommand {
  const sep = platform.os === "windows" ? ";" : ":";
  const cp: string[] = [];
  for (const lib of v.libraries) if (lib.classpath && lib.download) cp.push(lib.download.dest);
  cp.push(v.clientJar.dest);

  const features: Record<string, boolean> = {
    has_custom_resolution: !!(opts.width && opts.height),
    is_demo_user: false,
  };
  const vars: Record<string, string> = {
    auth_player_name: auth.name,
    version_name: v.id,
    game_directory: layout.game,
    assets_root: layout.assets,
    game_assets: layout.assets,
    assets_index_name: v.assetIndex.id,
    auth_uuid: auth.uuid,
    auth_access_token: auth.accessToken,
    auth_session: auth.accessToken,
    auth_xuid: auth.xuid ?? "0",
    clientid: "",
    user_type: auth.userType,
    user_properties: "{}",
    version_type: "release",
    natives_directory: layout.natives(v.id),
    launcher_name: "MMCraft",
    launcher_version: opts.launcherVersion ?? "1.0.0",
    classpath: cp.join(sep),
    classpath_separator: sep,
    library_directory: layout.libraries,
    resolution_width: String(opts.width ?? 1280),
    resolution_height: String(opts.height ?? 720),
  };

  const jvm: string[] = [
    `-Xmx${opts.maxMemoryMb}M`,
    `-Xms${opts.minMemoryMb ?? Math.min(1024, opts.maxMemoryMb)}M`,
    ...DEFAULT_JVM_FLAGS,
    ...(opts.extraJvmArgs ?? []),
  ];
  if (v.jvmArgs.length > 0) {
    jvm.push(...expandArgs(v.jvmArgs, platform, features).map((a) => substitute(a, vars)));
  } else {
    jvm.push(`-Djava.library.path=${vars.natives_directory}`, "-cp", vars.classpath);
  }
  if (v.logging) jvm.push(substitute(v.logging.argument, { path: v.logging.file.dest }));

  const game = v.legacyGameArgs
    ? v.legacyGameArgs.split(" ").map((a) => substitute(a, vars))
    : expandArgs(v.gameArgs, platform, features).map((a) => substitute(a, vars));

  // Fabric jvm 인자 중 빈칸이 포함된 것 정리 ("-DFabricMcEmu= net.minecraft...")
  const cleanJvm = jvm.map((a) => a.trim()).filter((a) => a.length > 0);

  return {
    command: javaExe,
    args: [...cleanJvm, v.mainClass, ...game.filter((a) => a.length > 0)],
    cwd: layout.game,
  };
}

export function dashedUuid(u: string) {
  const s = u.replace(/-/g, "");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
