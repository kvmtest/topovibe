// qloo.js — the Qloo broker (brief §5.1). Everything depends on it.
// Rules baked in (brief "Non-negotiable Qloo rules"):
//   1. Base URL = QLOO_BASE_URL (default https://hackathon.api.qloo.com)
//   2. Auth = header X-Api-Key — never Bearer, never query param
//   3. GET with query-string params only — no POST, no JSON body
//   8. Legacy /recs and /recommendations are forbidden
//   9. The key is read from the environment and NEVER logged or echoed.
import { TTLCache, stableKey } from './cache.js';
import { validateForPath, QlooUnsupportedError } from './validity.js';

export const QLOO_BASE = (process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com').replace(/\/$/, '');
const KEY = process.env.QLOO_API_KEY;

export class QlooError extends Error {
  constructor(name, message, status = 500) {
    super(message);
    this.name = name;
    this.status = status;
  }
}

export const cache = new TTLCache();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FORBIDDEN = ['/recs', '/recommendations'];

/**
 * Contract: qlooWithMeta(path, params) → { json, meta }
 *   meta = { coverage: 'live'|'cached', cache: 'miss'|'ttl'|'precache', fetchedAt, query }
 * meta.query is the auditable Qloo query echo (path + sorted params, NO key).
 */
export async function qlooWithMeta(path, params = {}) {
  if (!path.startsWith('/')) path = `/${path}`;
  if (FORBIDDEN.some((f) => path.startsWith(f))) {
    throw new QlooError('QlooForbiddenEndpoint', `${path} is a forbidden legacy endpoint (brief rule 8)`, 400);
  }
  if (!KEY) {
    throw new QlooError('QlooConfigError', 'QLOO_API_KEY missing from environment — create .env from .env.example', 500);
  }

  const { clean } = validateForPath(path, params); // invalid keys stripped + logged inside
  const key = stableKey(path, clean);

  const hit = cache.get(key);
  if (hit) {
    return {
      json: hit.value,
      meta: {
        coverage: 'cached',
        cache: hit.precache ? 'precache' : 'ttl',
        fetchedAt: hit.storedAt,
        query: key,
      },
    };
  }

  const qs = new URLSearchParams(clean).toString();
  const url = `${QLOO_BASE}${path}${qs ? `?${qs}` : ''}`;

  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { headers: { 'X-Api-Key': KEY } });
    } catch (e) {
      if (attempt < 1) {
        await sleep(1000);
        continue;
      }
      throw new QlooError('QlooNetworkError', `network error on ${path}: ${e.message}`, 502);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      console.warn(`[qloo] HTTP ${res.status} on ${path} — retrying once after 1s`);
      await sleep(1000);
      continue;
    }
    break;
  }

  if (res.status === 401 || res.status === 403) {
    throw new QlooError(
      'QlooAuthError',
      `HTTP ${res.status} — wrong environment or invalid key. Hackathon keys work ONLY on https://hackathon.api.qloo.com`,
      res.status
    );
  }
  if (res.status === 404) throw new QlooError('QlooNotFound', `HTTP 404 on ${path}`, 404);
  if (!res.ok) throw new QlooError('QlooHttpError', `HTTP ${res.status} on ${path}`, res.status);

  const json = await res.json();
  cache.set(key, json);
  return {
    json,
    meta: { coverage: 'live', cache: 'miss', fetchedAt: Date.now(), query: key },
  };
}

/** Brief contract: qloo(path, params) → Promise<json> (GET only; params → query string). */
export async function qloo(path, params = {}) {
  return (await qlooWithMeta(path, params)).json;
}

export { QlooUnsupportedError };
