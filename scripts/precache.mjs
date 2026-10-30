#!/usr/bin/env node
// precache.mjs — warm the demo cache ONCE with the hackathon key (brief §9):
//   /api/dna, /api/heatmap, /api/grounding for the 3 demo cities × 3 preset tags.
// Burns quota once, demos from cache forever. Output: cache/precache.json
// (GIT-IGNORED — Qloo responses are cached privately per Qloo terms, §12).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
if (!process.env.QLOO_API_KEY) {
  console.error('✖ QLOO_API_KEY missing — precache needs the hackathon key in .env');
  process.exit(1);
}

const { cache } = await import('../server/qloo.js');
const { buildDna, buildHeatmap, buildGrounding } = await import('../server/routes.js');
const { initGrounding } = await import('../server/grounding.js');

// Keep in sync with src/layers/heatmap.js HEAT_PRESETS
const PRESETS = [
  'urn:tag:genre:place:restaurant:italian',
  'urn:tag:genre:place:live_music_venue',
  'urn:tag:genre:place:restaurant:coffee_shop',
];
const CITIES = (process.env.DEMO_CITIES || 'Austin,New York City,Tokyo').split(',').map((s) => s.trim());

const t0 = Date.now();
let calls = 0;
const failures = [];

console.log(`[precache] cities: ${CITIES.join(' · ')}`);
console.log(`[precache] presets: ${PRESETS.length} tags`);

// Grounding lexicon first (its /v2/tags calls get cached too)
await initGrounding();

for (const city of CITIES) {
  try {
    const dna = await buildDna(city);
    calls += dna.queries.length;
    console.log(`[precache] ${city}: DNA ✔ (${dna.tags.length} tags, ${dna.places.length} places, demographics ${dna.demographics ? '✔' : 'null'}, ${dna.coverage})`);
  } catch (e) {
    failures.push(`${city} dna: ${e.message}`);
    console.error(`[precache] ${city}: DNA ✖ ${e.message}`);
  }
  for (const tag of PRESETS) {
    try {
      const hm = await buildHeatmap(city, tag);
      calls += hm.queries.length;
      console.log(`[precache] ${city} heat ${tag.split(':').pop()}: ${hm.points.length} pts (${hm.coverage})`);
    } catch (e) {
      failures.push(`${city} heatmap ${tag}: ${e.message}`);
      console.error(`[precache] ${city} heatmap ✖ ${e.message}`);
    }
    try {
      const gs = await buildGrounding(city, tag);
      calls += gs.queries.length;
      console.log(`[precache] ${city} gs ${tag.split(':').pop()}: ${gs.venues.length} venues (${gs.coverage})`);
    } catch (e) {
      failures.push(`${city} grounding ${tag}: ${e.message}`);
      console.error(`[precache] ${city} grounding ✖ ${e.message}`);
    }
  }
}

// Dump the shared TTL cache to disk
mkdirSync(join(root, 'cache'), { recursive: true });
const entries = {};
for (const [key, entry] of cache.map.entries()) entries[key] = entry.value;
const out = { savedAt: Date.now(), cities: CITIES, presets: PRESETS, entries };
const file = join(root, 'cache', 'precache.json');
writeFileSync(file, JSON.stringify(out));

const kb = Math.round(JSON.stringify(out).length / 1024);
console.log(
  `\n[precache] done in ${Math.round((Date.now() - t0) / 1000)}s · ${calls} Qloo calls · ${Object.keys(entries).length} cache entries · ${kb} KB → cache/precache.json`
);
if (failures.length) {
  console.error(`[precache] ${failures.length} failures:`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('[precache] ✔ demo flows now serve from cache — demo never hits the network live');
