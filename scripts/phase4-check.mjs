#!/usr/bin/env node
// phase4-check.mjs — Phase 4 acceptance: GS engine on ≥5 venues (2nd call cached),
// honest insufficient-data withholding. Requires the dev stack (http://localhost:4173).
const BASE = 'http://localhost:4173';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const get = async (url) => {
  const r = await fetch(`${BASE}${url}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
};

try {
  // 1st call — live or cached depending on what ran before
  const a = await get('/api/grounding?city=Austin&tag=urn:tag:genre:place:record_store');
  // 2nd call — MUST be a cache hit (the insights call is identical)
  const b = await get('/api/grounding?city=Austin&tag=urn:tag:genre:place:record_store');

  check('venues scored ≥ 5', a.venues.length >= 5, `${a.venues.length} venues`);
  check('2nd call cached', b.coverage === 'cached', `coverage=${b.coverage}`);
  check(
    'all GS in 0..100',
    a.venues.every((v) => v.gs === null || (v.gs >= 0 && v.gs <= 100)),
    a.venues.map((v) => v.gs).join(',')
  );
  check(
    'components present (a/t/n)',
    a.venues.every((v) => typeof v.components?.a === 'number' && typeof v.components?.t === 'number' && v.components?.n),
    ''
  );
  check(
    'kill-switch 2: n.unknown everywhere (places unsupported by /v2/trending)',
    a.venues.every((v) => v.components?.n?.unknown === true),
    ''
  );
  check('confidence reported', a.venues.every((v) => ['high', 'low', 'insufficient-data'].includes(v.confidence)), a.venues[0]?.confidence);
  check('lexicon resolved', a.lexicon.size >= 8, `${a.lexicon.size} URNs`);
  check('formula documented', a.formula?.includes('0.6'), a.formula);

  // GS withheld on empty results — a query with no venues
  const empty = await get('/api/grounding?city=Nowheresville&tag=urn:tag:genre:place:record_store');
  check(
    'insufficient-data when empty (GS never faked)',
    empty.coverage === 'insufficient-data' && empty.venues.length === 0,
    `coverage=${empty.coverage}`
  );
} catch (e) {
  check('endpoint reachable', false, e.message);
}

console.log(`\n${fail === 0 ? '✔ PHASE 4 CHECKS PASS' : '✖ FAILURES PRESENT'} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
