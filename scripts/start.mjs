#!/usr/bin/env node
// start.mjs — resilient production start: build the client first if dist/ is
// missing (hosts that only run `npm install && npm start`, e.g. Elastic
// Beanstalk / a bare EC2 user-data), then boot the Express server.
// When dist/ exists (normal case), this adds zero overhead and spawns nothing.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present (same lightweight parser as dev-server.mjs)
import { readFileSync } from 'node:fs';
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.log('[topovibe] dist/ missing — running production build once (npm run build)…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('[topovibe] build failed — cannot serve the client. Fix the build and retry.');
    process.exit(r.status ?? 1);
  }
}

await import('../server/index.js');
