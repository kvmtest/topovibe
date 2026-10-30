#!/usr/bin/env node
// dev-server.mjs — dev-mode API boot. Loads .env itself (no deps), then starts
// the Express server on the internal dev port 4180; Vite owns :4173 and proxies
// /api + /mcp here (see vite.config.js). Self-loading .env keeps the npm script
// free of cross-platform env-var gymnastics.
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

process.env.PORT = process.env.DEV_API_PORT || '4180';
await import('../server/index.js');
