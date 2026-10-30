#!/usr/bin/env node
// probe.mjs — dev tool: fire one brokered Qloo call and inspect the response shape.
// Usage: node scripts/probe.mjs /v2/insights filter.type=urn:tag signal.location.query=Austin take=5
// Prints the auditable query echo (no key), coverage, and a truncated payload.
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

const [, , path, ...pairs] = process.argv;
if (!path) {
  console.error('usage: node scripts/probe.mjs <path> [k=v ...]');
  process.exit(2);
}
const params = {};
for (const p of pairs) {
  const i = p.indexOf('=');
  if (i > 0) params[p.slice(0, i)] = p.slice(i + 1);
}

const { qlooWithMeta } = await import('../server/qloo.js');
const t0 = Date.now();
try {
  const { json, meta } = await qlooWithMeta(path, params);
  const ms = Date.now() - t0;
  console.log(`coverage=${meta.coverage} cache=${meta.cache} ${ms}ms`);
  console.log(`query=${meta.query}`);
  console.log(`top-level keys: ${Object.keys(json ?? {}).join(', ')}`);
  const s = JSON.stringify(json, null, 1);
  console.log(s.length > 4000 ? `${s.slice(0, 4000)}\n… [truncated, ${s.length} chars total]` : s);
} catch (e) {
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
}
