import * as fs from "fs";
import * as path from "path";
import { Layout } from "./paths";

/** 월드(saves) 폴더 통째로 백업. 마크 버전이 오르기 전에 반드시 실행 */
export async function backupSaves(layout: Layout, label: string, keep = 5): Promise<string | null> {
  return backupFolders(layout, [layout.saves], label, keep);
}

/**
 * 폴더들을 backups/<시각>_<이름>/ 아래로 복사 (서버는 월드 폴더들). 비어 있으면 null.
 * 최근 keep개만 남김
 */
export async function backupFolders(layout: Layout, folders: string[], label: string, keep = 5): Promise<string | null> {
  const existing: string[] = [];
  for (const f of folders) {
    if (fs.existsSync(f) && (await fs.promises.readdir(f)).length > 0) existing.push(f);
  }
  if (existing.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dir = path.join(layout.backups, `${stamp}_${label.replace(/[^\w.\-]/g, "_")}`);
  for (const f of existing) {
    const dest = path.join(dir, path.basename(f));
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.cp(f, dest, { recursive: true, errorOnExist: false, force: true });
  }
  await pruneBackups(layout, keep);
  return dir;
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
