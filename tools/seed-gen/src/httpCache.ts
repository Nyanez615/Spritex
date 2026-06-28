import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_ROOT = path.join(HERE, "..", ".cache");
export const OUT_ROOT = path.join(HERE, "..", "out");

export const USER_AGENT = "SpritexSeedGen/0.1 (unofficial fan project; https://github.com/Nyanez615/Spritex)";

/**
 * Confirmed real bug found during the first-50-species audit: the generic
 * fallback below collapses BOTH ♀ (U+2640) and ♂ (U+2642) to the same "_",
 * so "Nidoran♀ (Pokémon)" and "Nidoran♂ (Pokémon)" — the only two species in
 * the dataset whose canonical names differ ONLY by gender symbol — sanitized
 * to the identical cache filename. Nidoran♂'s own page was never actually
 * fetched; every one of its shiny_methods rows was silently a byte-for-byte
 * copy of Nidoran♀'s. Substituting distinct ASCII tokens before the generic
 * fallback runs fixes this pair and any future case with the same shape.
 * Exported so every disk-cache key in this pipeline (not just cachedJson's)
 * gets the same fix — see spriteCrop.ts, which caches by full sprite URL.
 */
export function sanitizeKey(key: string): string {
  return key
    .replace(/♀/g, "-female")
    .replace(/♂/g, "-male")
    .replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function readCache<T>(file: string): Promise<T | undefined> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function writeCache(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), "utf8");
}

/**
 * Fetches JSON with an on-disk cache keyed by `${namespace}/${key}`. A build
 * is idempotent and resumable: re-running the pipeline only re-fetches what
 * isn't already cached. Delete `.cache/` to force a full refresh.
 */
export async function cachedJson<T>(namespace: string, key: string, url: string): Promise<T> {
  const file = path.join(CACHE_ROOT, namespace, `${sanitizeKey(key)}.json`);
  const cached = await readCache<T>(file);
  if (cached !== undefined) return cached;

  const data = await fetchWithRetry<T>(url, (res) => res.json() as Promise<T>, { Accept: "application/json" });
  await writeCache(file, data);
  return data;
}

/**
 * Fetches a URL with retry-with-backoff, handing the raw Response to `parse`
 * once it's known to be `ok` — shared by cachedJson (parses JSON) and
 * spriteCrop.ts's cachedSpriteCrop (parses raw PNG bytes), so the retry
 * policy (4 attempts, 500ms*attempt backoff) and User-Agent live in one
 * place rather than two independently-maintained copies.
 */
export async function fetchWithRetry<T>(
  url: string,
  parse: (res: Response) => Promise<T>,
  extraHeaders?: Record<string, string>,
  attempt = 1,
): Promise<T> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, ...extraHeaders } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return await parse(res);
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(500 * attempt);
    return fetchWithRetry<T>(url, parse, extraHeaders, attempt + 1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bounds concurrent in-flight async calls so we stay polite to upstream APIs. */
export class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export async function ensureOutDir(): Promise<void> {
  await mkdir(OUT_ROOT, { recursive: true });
}

export async function writeOutJson(name: string, data: unknown): Promise<void> {
  await ensureOutDir();
  await writeFile(path.join(OUT_ROOT, name), JSON.stringify(data, null, 2), "utf8");
}

export async function readOutJson<T>(name: string): Promise<T> {
  const raw = await readFile(path.join(OUT_ROOT, name), "utf8");
  return JSON.parse(raw) as T;
}
