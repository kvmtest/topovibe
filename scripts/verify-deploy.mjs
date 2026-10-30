#!/usr/bin/env node
// verify-deploy.mjs — post-deploy acceptance sweep for the hosted TopoVibe.
// Usage: node scripts/verify-deploy.mjs https://xxxx.us-east-1.awsapprunner.com
const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const get = async (p) => {
  const r = await fetch(`${BASE}${p}`);
  return { status: r.status, body: await r.text() };
};

// 1. Static client
{
  const { status, body } = await get('/');
  check('static client serves', status === 200 && body.includes('cesiumContainer'), `HTTP ${status}`);
}
// 2. Cesium assets
{
  const { status } = await get('/cesium/Cesium.js');
  check('cesium bundle serves', status === 200, `HTTP ${status}`);
}
// 3. Health
{
  const { status, body } = await get('/api/health');
  const j = JSON.parse(body);
  check('api health', status === 200 && j.ok && j.keyConfigured, `HTTP ${status} keyConfigured=${j.keyConfigured}`);
}
// 4. DNA live (first call on a fresh deploy burns one Qloo call honestly)
{
  const { status, body } = await get('/api/dna?city=Austin');
  const j = JSON.parse(body);
  check('dna Austin', status === 200 && j.tags?.length > 0 && j.places?.length > 0,
    `coverage=${j.coverage} tags=${j.tags?.length} places=${j.places?.length} demo=${j.demographics ? 'yes' : 'honest-null'}`);
}
// 5. Grounding
{
  const { status, body } = await get('/api/grounding?city=Austin&tag=urn:tag:genre:place:record_store');
  const j = JSON.parse(body);
  check('grounding score', status === 200 && j.venues?.length >= 5 && j.venues.every((v) => v.gs === null || (v.gs >= 0 && v.gs <= 100)),
    `venues=${j.venues?.length} gs=${j.venues?.slice(0, 3).map((v) => v.gs).join(',')} coverage=${j.coverage}`);
}
// 6. MCP tools/list over JSON-RPC
{
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const text = await r.text();
  let names = [];
  let detail = `HTTP ${r.status}`;
  try {
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    const body = line ? JSON.parse(line.slice(6)) : JSON.parse(text);
    names = (body?.result?.tools ?? []).map((t) => t.name).sort();
    if (names.length) detail = names.join(', ');
  } catch {
    detail = `HTTP ${r.status} ${text.slice(0, 120)}`;
  }
  if (r.status === 429) detail = 'rate-limited (30/min — wait a minute and re-run)';
  check('mcp tools/list', names.length === 5, detail);
}
// 7. HTTPS (deploy only)
if (BASE.startsWith('https://')) check('https enabled', true, BASE);

console.log(`\n${fail === 0 ? '✔ DEPLOY VERIFIED' : '✖ FAILURES PRESENT'} @ ${BASE} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
