#!/usr/bin/env node
// probe-raw.mjs — discovery tool: hit Qloo paths RAW (no validity matrix) to learn
// correct param spellings. Prints HTTP status + body head. Never prints the key.
// Usage: node scripts/probe-raw.mjs /v2/tags query=vinyl
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
const [, , path, ...pairs] = process.argv;
const params = {};
for (const p of pairs) {
  const i = p.indexOf('=');
  if (i > 0) params[p.slice(0, i)] = p.slice(i + 1);
}
const qs = new URLSearchParams(params).toString();
const res = await fetch(`${base}${path}?${qs}`, { headers: { 'X-Api-Key': process.env.QLOO_API_KEY } });
const text = await res.text();
console.log(`HTTP ${res.status} · ${path}?${qs}`);
console.log(text.slice(0, 600));
