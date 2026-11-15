/** pack/ → 런처가 읽는 index.json 만들기 (out/pack-dist/) */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { hashFile } from "../core/http";
import { PackIndex, PackOverride } from "../core/pack";
import { applyInstallNames, files, readChangelog, readMods, readPack } from "./source";

const REPO = process.env.GITHUB_REPOSITORY ?? "RTF3563/MMCraft";

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

async function main() {
  const sha = process.env.PACK_COMMIT ?? execSync("git rev-parse HEAD").toString().trim();
  const pack = readPack();
  const mods = applyInstallNames(readMods());
  const overrides: PackOverride[] = [];
  const root = files.overrides();
  for (const rel of await walk(root)) {
    const full = path.join(root, rel);
    overrides.push({
      path: rel,
      sha1: await hashFile(full, "sha1"),
      size: (await fs.promises.stat(full)).size,
      url: `https://raw.githubusercontent.com/${REPO}/${sha}/pack/overrides/${rel.split("/").map(encodeURIComponent).join("/")}`,
    });
  }
  const changelog = readChangelog();
  const index: PackIndex = {
    formatVersion: 1,
    name: pack.name,
    packVersion: pack.version,
    minecraft: pack.minecraft,
    fabricLoader: pack.fabricLoader,
    publishedAt: new Date().toISOString(),
    changelog: changelog.slice(0, 10).flatMap((c) => [`[${c.version}] ${c.date} · Minecraft ${c.minecraft}`, ...c.lines.map((l) => `  · ${l}`)]),
    mods,
    overrides,
  };
  const outDir = path.resolve("out", "pack-dist");
  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`index.json: 팩 ${pack.version}, Minecraft ${pack.minecraft}, 모드 ${mods.length}개, 설정 파일 ${overrides.length}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
