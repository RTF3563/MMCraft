import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { tr } from "./i18n";

export const USER_AGENT = "RTF3563/MMCraft-Launcher (github.com/RTF3563/MMCraft)";

export class HttpError extends Error {
  constructor(public status: number, public url: string, public body: string) {
    super(`HTTP ${status} ${url}${body ? ": " + body.slice(0, 300) : ""}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** fetch + 재시도 (네트워크 오류, 429, 5xx) */
export async function request(url: string, init: RequestInit = {}, retries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = new Headers(init.headers);
      if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        lastErr = new HttpError(res.status, url, await res.text().catch(() => ""));
        await sleep(Math.max(retryAfter * 1000, 1000 * 2 ** attempt));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function getJson<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await request(url, init);
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

export async function postJson<T = any>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

export type HashAlgo = "sha1" | "sha512";

export async function hashFile(file: string, algo: HashAlgo = "sha1"): Promise<string> {
  const h = crypto.createHash(algo);
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex");
}

export interface DownloadItem {
  url: string;
  dest: string;
  sha1?: string;
  sha512?: string;
  size?: number;
}

/** 이미 같은 파일이 있으면 true (해시가 없으면 크기만 비교, 둘 다 없으면 존재 여부) */
export async function isValid(item: DownloadItem): Promise<boolean> {
  try {
    const st = await fs.promises.stat(item.dest);
    if (!st.isFile()) return false;
    if (item.size !== undefined && st.size !== item.size) return false;
    if (item.sha1) return (await hashFile(item.dest, "sha1")) === item.sha1.toLowerCase();
    if (item.sha512) return (await hashFile(item.dest, "sha512")) === item.sha512.toLowerCase();
    return true;
  } catch {
    return false;
  }
}

export async function downloadFile(item: DownloadItem, retries = 3): Promise<void> {
  if (await isValid(item)) return;
  await fs.promises.mkdir(path.dirname(item.dest), { recursive: true });
  const tmp = item.dest + ".part";
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await request(item.url);
      if (!res.ok || !res.body) throw new HttpError(res.status, item.url, "");
      await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp));
      const check = { ...item, dest: tmp };
      if (!(await isValid(check))) throw new Error(tr("err.verify", { url: item.url }));
      await fs.promises.rename(tmp, item.dest);
      return;
    } catch (e) {
      lastErr = e;
      await fs.promises.rm(tmp, { force: true });
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

export type Progress = (done: number, total: number, label?: string) => void;

/** 동시 다운로드 (기본 16개씩) */
export async function downloadAll(items: DownloadItem[], onProgress?: Progress, concurrency = 16, label?: string) {
  let done = 0;
  let index = 0;
  const total = items.length;
  onProgress?.(0, total, label);
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await downloadFile(item);
      done++;
      onProgress?.(done, total, label);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
