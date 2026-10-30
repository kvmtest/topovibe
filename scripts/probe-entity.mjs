#!/usr/bin/env node
// probe-entity.mjs — inspect full insights entity records: tag URNs attached,
// lat/lon availability, and whether filter.location.query keeps venues in-city.
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
const base = (process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com').replace(/\/$/, '');

const params = new URLSearchParams({
  'filter.type': 'urn:entity:place',
  'filter.location.query': 'Austin',
  'signal.interests.tags': 'urn:tag:genre:place:record_store',
  take: '5',
});
const res = await fetch(`${base}/v2/insights?${params}`, { headers: { 'X-Api-Key': process.env.QLOO_API_KEY } });
const json = await res.json();
const entities = json?.results?.entities ?? [];
console.log(`entities: ${entities.length}`);
for (const e of entities) {
  const tagUrns = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v.startsWith('urn:tag')) tagUrns.add(`${k}→${v}`);
      else walk(v);
    }
  };
  walk(e.properties ?? {});
  console.log(`\n· ${e.name} [${e.entity_id?.slice(0, 8)}…]`);
  console.log(`  city: ${e.properties?.geocode?.city} | lat/lon: ${JSON.stringify(e.location ?? e.geocode?.location ?? null)}`);
  console.log(`  popularity: ${e.popularity} | rating: ${e.properties?.business_rating}`);
  console.log(`  tag URNs in record: ${tagUrns.size}`);
  [...tagUrns].slice(0, 6).forEach((t) => console.log(`    ${t}`));
  console.log(`  keywords: ${(e.properties?.keywords ?? []).slice(0, 5).map((k) => k.name).join(', ')}`);
  console.log(`  top-level keys: ${Object.keys(e).join(', ')}`);
}
