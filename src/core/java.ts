import * as fs from "fs";
import * as path from "path";
import { DownloadItem, downloadAll, getJson, Progress } from "./http";
import { Layout } from "./paths";
import { Platform } from "./rules";
import { tr } from "./i18n";

/** Mojang이 공식 런처용으로 제공하는 Java 런타임 목록 */
export const JAVA_RUNTIME_INDEX =
  "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

export function runtimePlatformKey(p: Platform): string {
  if (p.os === "windows") return p.arch === "arm64" ? "windows-arm64" : p.arch === "x86" ? "windows-x86" : "windows-x64";
  if (p.os === "osx") return p.arch === "arm64" ? "mac-os-arm64" : "mac-os";
  return p.arch === "x86" ? "linux-i386" : "linux";
}

export function javaExecutable(root: string, p: Platform, windowless = true): string {
  if (p.os === "windows") return path.join(root, "bin", windowless ? "javaw.exe" : "java.exe");
  if (p.os === "osx") return path.join(root, "jre.bundle", "Contents", "Home", "bin", "java");
  return path.join(root, "bin", "java");
}

/** 게임 버전이 요구하는 Java를 받아서 실행 파일 경로를 돌려줌 */
export async function ensureJava(layout: Layout, component: string, p: Platform, onProgress?: Progress): Promise<string> {
  const root = path.join(layout.runtimes, component);
  const marker = path.join(root, ".mmcraft-complete");
  const exe = javaExecutable(root, p);
  if (fs.existsSync(marker) && fs.existsSync(exe)) return exe;

  const all = await getJson<any>(JAVA_RUNTIME_INDEX);
  const entries = all[runtimePlatformKey(p)]?.[component];
  if (!entries || entries.length === 0) throw new Error(tr("err.noJava", { component }));
  const manifest = await getJson<any>(entries[0].manifest.url);

  const items: DownloadItem[] = [];
  const executables: string[] = [];
  const links: [string, string][] = [];
  for (const [rel, info] of Object.entries<any>(manifest.files)) {
    const dest = path.join(root, rel);
    if (info.type === "directory") {
      await fs.promises.mkdir(dest, { recursive: true });
    } else if (info.type === "file") {
      const raw = info.downloads.raw;
      items.push({ url: raw.url, dest, sha1: raw.sha1, size: raw.size });
      if (info.executable) executables.push(dest);
    } else if (info.type === "link") {
      links.push([dest, info.target]);
    }
  }
  await downloadAll(items, onProgress, 16, tr("label.java"));
  if (p.os !== "windows") {
    for (const f of executables) await fs.promises.chmod(f, 0o755);
    for (const [dest, target] of links) {
      await fs.promises.rm(dest, { force: true });
      await fs.promises.symlink(target, dest).catch(() => {});
    }
  }
  await fs.promises.writeFile(marker, new Date().toISOString());
  return exe;
}
