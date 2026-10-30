// cache.js — in-memory TTL cache + demo pre-cache loader (brief §5.1).
// Qloo permits private caching; cached data is NEVER committed (cache/ is git-ignored).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PRECACHE_FILE = join(__dirname, '..', 'cache', 'precache.json');

export const SIX_HOURS = 6 * 3600 * 1000;

/** Deterministic cache key: path + sorted params. Contains NO secrets. */
export function stableKey(path, params = {}) {
  const qs = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${path}?${qs}`;
}

export class TTLCache {
  constructor(ttlMs = SIX_HOURS) {
    this.ttl = ttlMs;
    this.map = new Map();
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (!e.precache && Date.now() > e.expires) {
      this.map.delete(key);
      return null;
    }
    return e;
  }

  set(key, value, { precache = false, storedAt = Date.now() } = {}) {
    this.map.set(key, { value, precache, storedAt, expires: storedAt + this.ttl });
  }

  has(key) {
    return this.get(key) !== null;
  }

  get size() {
    return this.map.size;
  }

  /**
   * Load demo pre-cache written by scripts/precache.mjs.
   * Pre-cached entries never expire — "demo never hits the network live" (brief §9).
   * Returns number of entries loaded (0 if file absent).
   */
  loadPrecache(file = PRECACHE_FILE) {
    if (!existsSync(file)) return 0;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      const entries = raw.entries ?? {};
      let n = 0;
      for (const [key, value] of Object.entries(entries)) {
        this.set(key, value, { precache: true, storedAt: raw.savedAt ?? Date.now() });
        n++;
      }
      return n;
    } catch (e) {
      console.error(`[cache] failed to load pre-cache ${file}: ${e.message}`);
      return 0;
    }
  }
}
