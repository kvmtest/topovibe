// index.js — Express boot, static serving, startup self-check (brief §4).
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { router } from './routes.js';
import { cache, qlooWithMeta, QLOO_BASE } from './qloo.js';
import { initGrounding } from './grounding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = Number(process.env.PORT ?? 4173);

const app = express();
app.use(express.json());

// REST surface (the only one — brief §5.4)
app.use('/api', router);

// MCP endpoint mounts here in Phase 5 (server/mcp.js)
async function mountMcp() {
  try {
    const { mountMcp: mount } = await import('./mcp.js');
    mount(app);
  } catch {
    /* mcp.js lands in Phase 5 */
  }
}
await mountMcp();

// Production: serve the Vite build. Dev: Vite dev server owns :4173 (see vite.config.js).
const dist = join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(join(dist, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res
      .status(200)
      .send('TopoVibe API up. Client: run `npm run dev` (Vite on :4173) or `npm run build` first.')
  );
}

app.listen(PORT, () => {
  console.log(`[topovibe] server listening on http://localhost:${PORT}`);
});

// --- Startup self-check (brief §8): one /v2/insights ping, loud on failure ---
try {
  const { meta } = await qlooWithMeta('/v2/insights', {
    'filter.type': 'urn:entity:place',
    'signal.location.query': 'Austin',
    take: '1',
  });
  console.log(`[topovibe] ✔ startup self-check PASS against ${QLOO_BASE} (${meta.coverage})`);
} catch (e) {
  console.error(`[topovibe] ✖ STARTUP SELF-CHECK FAIL: ${e.name}: ${e.message}`);
  console.error('[topovibe]   → server keeps running, but Qloo-backed endpoints will fail until fixed.');
}

// --- Grounding Score: resolve the analog tag lexicon (brief §5.3) ----------
try {
  await initGrounding();
} catch (e) {
  console.error(`[topovibe] grounding lexicon init failed: ${e.message} — GS will be withheld honestly`);
}
