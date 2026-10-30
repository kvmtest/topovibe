#!/usr/bin/env node
// TopoVibe startup self-check (brief §8): ONE GET /v2/insights ping against
// QLOO_BASE_URL with header X-Api-Key. Green banner or loud failure — before
// any dev work continues. Dependency-free (Node >=20 global fetch).
// NOTE: never prints the API key.
const base = (process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com').replace(/\/$/, '');
const key = process.env.QLOO_API_KEY;

function fail(msg, hint) {
  console.error(`✖ SELFCHECK FAIL: ${msg}`);
  if (hint) console.error(`  → ${hint}`);
  process.exit(1);
}

if (!key) {
  fail(
    'QLOO_API_KEY is missing from the environment.',
    'Create .env from .env.example and paste the provisioned hackathon key. Never invent one.'
  );
}
if (!base.includes('hackathon.api.qloo.com')) {
  console.warn(`⚠ QLOO_BASE_URL=${base} — hackathon keys 401 anywhere except https://hackathon.api.qloo.com`);
}

const params = new URLSearchParams({
  'filter.type': 'urn:entity:place',
  'signal.location.query': 'Austin',
  take: '1',
});
const url = `${base}/v2/insights?${params}`;

const t0 = Date.now();
let res;
try {
  res = await fetch(url, { headers: { 'X-Api-Key': key } });
} catch (e) {
  fail(`network error reaching ${base}: ${e.message}`);
}
const ms = Date.now() - t0;

if (res.status === 401 || res.status === 403) {
  fail(
    `HTTP ${res.status} from ${base} (${ms}ms).`,
    'Wrong environment or invalid key — hackathon keys are valid ONLY on https://hackathon.api.qloo.com'
  );
}
if (!res.ok) fail(`HTTP ${res.status} from ${base} (${ms}ms).`);

let json;
try {
  json = await res.json();
} catch {
  fail(`response was not JSON (${ms}ms).`);
}

const entities = json?.results?.entities ?? json?.results ?? [];
const n = Array.isArray(entities) ? entities.length : 0;
console.log(
  `✔ SELFCHECK PASS: ${base} reachable · /v2/insights OK · ${ms}ms · ${n} sample ${n === 1 ? 'entity' : 'entities'} returned`
);
if (n > 0) {
  const first = entities[0];
  console.log(`  sample: ${first?.name ?? '(unnamed)'} · id ${first?.entity_id ?? '?'}`);
}
