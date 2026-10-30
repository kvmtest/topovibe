#!/usr/bin/env node
// phase1-check.mjs — Phase 1 acceptance: cache TTL hit, /v2/tags via broker,
// forbidden-endpoint guard. (Insights/search/demographics/heatmap evidence: docs/phase1-probes*.txt)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { qlooWithMeta } = await import('../server/qloo.js');
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

// 1. /v2/tags through the broker (validity-fixed): keyword → real tag URNs
try {
  const { json, meta } = await qlooWithMeta('/v2/tags', { 'filter.query': 'record store' });
  const tags = json?.results?.tags ?? [];
  check('/v2/tags brokered', tags.length > 0, `${tags.length} tags, first: ${tags[0]?.id}`);
  check('tags coverage live', meta.coverage === 'live');
} catch (e) {
  check('/v2/tags brokered', false, `${e.name}: ${e.message}`);
}

// 2. TTL cache: same call twice in-process → second is a cache hit, no network
try {
  const p = { 'filter.query': 'ceramics' };
  const a = await qlooWithMeta('/v2/tags', p);
  const t0 = Date.now();
  const b = await qlooWithMeta('/v2/tags', p);
  const ms = Date.now() - t0;
  check(
    'TTL cache hit on 2nd call',
    a.meta.coverage === 'live' && b.meta.coverage === 'cached' && b.meta.cache === 'ttl' && ms < 50,
    `2nd call ${ms}ms, cache=${b.meta.cache}`
  );
} catch (e) {
  check('TTL cache hit on 2nd call', false, `${e.name}: ${e.message}`);
}

// 3. Forbidden legacy endpoints throw a named error WITHOUT a network call
for (const path of ['/recs', '/recommendations']) {
  try {
    await qlooWithMeta(path, { foo: 'bar' });
    check(`forbidden ${path}`, false, 'no error thrown');
  } catch (e) {
    check(`forbidden ${path}`, e.name === 'QlooForbiddenEndpoint', e.name);
  }
}

// 4. Unknown filter.type → named QlooUnsupportedError before any network call
try {
  await qlooWithMeta('/v2/insights', { 'filter.type': 'PLACE' });
  check('invalid filter.type rejected', false, 'no error thrown');
} catch (e) {
  check('invalid filter.type rejected', e.name === 'QlooUnsupportedError', e.message.slice(0, 60));
}

// 5. Pre-cache loader round-trip (demo pre-cache overrides TTL)
try {
  const { TTLCache } = await import('../server/cache.js');
  const { writeFileSync, rmSync } = await import('node:fs');
  const tmp = join(root, 'cache', '.test-precache.json');
  writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), entries: { '/x?a=1': { hello: 'world' } } }));
  const c = new TTLCache(1); // 1ms TTL — precache must still win
  const n = c.loadPrecache(tmp);
  await new Promise((r) => setTimeout(r, 5));
  const e = c.get('/x?a=1');
  check('precache overrides TTL', n === 1 && e?.precache === true && e.value.hello === 'world');
  rmSync(tmp);
} catch (e) {
  check('precache overrides TTL', false, e.message);
}

console.log(`\n${fail === 0 ? '✔ PHASE 1 CHECKS PASS' : '✖ FAILURES PRESENT'} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
