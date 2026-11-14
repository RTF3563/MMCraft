import * as fs from "fs";
import * as path from "path";
import { Layout } from "./paths";

/** 월드(saves) 폴더 통째로 백업. 마크 버전이 오르기 전에 반드시 실행 */
export async function backupSaves(layout: Layout, label: string, keep = 5): Promise<string | null> {
  if (!fs.existsSync(layout.saves)) return null;
  const entries = await fs.promises.readdir(layout.saves);
  if (entries.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dest = path.join(layout.backups, `${stamp}_${label.replace(/[^\w.\-]/g, "_")}`, "saves");
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.cp(layout.saves, dest, { recursive: true, errorOnExist: false, force: true });
  await pruneBackups(layout, keep);
  return path.dirname(dest);
}

export async function listBackups(layout: Layout): Promise<string[]> {
  try {
    return (await fs.promises.readdir(layout.backups)).sort();
  } catch {
    return [];
  }
}

async function pruneBackups(layout: Layout, keep: number) {
  const all = await listBackups(layout);
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    await fs.promises.rm(path.join(layout.backups, old), { recursive: true, force: true });
  }
}
