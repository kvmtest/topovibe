#!/usr/bin/env node
// phase5-check.mjs — Phase 5 acceptance: TopoVibe MCP end-to-end over raw JSON-RPC.
// (MCP inspector = `npx @modelcontextprotocol/inspector` — GUI; this script verifies
// the same protocol surface headlessly: initialize, tools/list, all 5 tools/call.)
const BASE = 'http://localhost:4173';
let idc = 0;
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

async function rpc(method, params = {}) {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++idc, method, params }),
  });
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (ct.includes('text/event-stream')) {
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    return { status: res.status, body: dataLine ? JSON.parse(dataLine.slice(6)) : null };
  }
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const callTool = (name, args) => rpc('tools/call', { name, arguments: args });
const toolJson = (body) => {
  const t = body?.result?.content?.[0]?.text;
  try {
    return { ok: !body?.result?.isError, data: t ? JSON.parse(t) : null, raw: t };
  } catch {
    return { ok: !body?.result?.isError, data: null, raw: t };
  }
};

// --- handshake -------------------------------------------------------------
const init = await rpc('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'phase5-check', version: '0.1.0' },
});
check('initialize handshake', init.body?.result?.serverInfo?.name === 'topovibe-mcp',
  `server=${init.body?.result?.serverInfo?.name} protocol=${init.body?.result?.protocolVersion}`);

// --- tools/list ------------------------------------------------------------
const list = await rpc('tools/list');
const names = (list.body?.result?.tools ?? []).map((t) => t.name).sort();
check('tools/list → 5 tools', JSON.stringify(names) === JSON.stringify([
  'get_grounding_score', 'get_insights', 'get_taste_profile', 'resolve_entities', 'resolve_tags',
]), names.join(', '));

// --- 1 resolve_entities -----------------------------------------------------
const re = toolJson((await callTool('resolve_entities', { query: 'Balthazar', types: 'urn:entity:place' })).body);
check('resolve_entities', re.ok && re.data?.results?.length > 0 && !!re.data?.results?.[0]?.entity_id,
  `${re.data?.results?.length} hits, echo: ${re.data?.queries?.[0]}`);

// --- 2 resolve_tags ----------------------------------------------------------
const rt = toolJson((await callTool('resolve_tags', { keyword: 'vinyl' })).body);
check('resolve_tags', rt.ok && rt.data?.results?.length > 0 && rt.data.results[0].tag_id?.startsWith('urn:tag'),
  `${rt.data?.results?.length} tags, first: ${rt.data?.results?.[0]?.tag_id}`);

// --- 3 get_insights (validity-checked) ---------------------------------------
const gi = toolJson(
  (await callTool('get_insights', { filterType: 'urn:entity:place', signals: { 'location.query': 'Austin' }, take: 2 })).body
);
check('get_insights valid', gi.ok && (gi.data?.results?.entities?.length ?? 0) > 0,
  `${gi.data?.results?.entities?.length} entities`);
const giBad = (await callTool('get_insights', { filterType: 'PLACE', take: 1 })).body;
check('get_insights rejects "PLACE" with actionable error',
  giBad?.result?.isError === true && /unsupported entity type/i.test(giBad?.result?.content?.[0]?.text ?? ''),
  'isError + named error');

// --- 4 get_taste_profile -------------------------------------------------------
const tp = toolJson((await callTool('get_taste_profile', { locationQuery: 'Austin' })).body);
check('get_taste_profile', tp.ok && tp.data?.tags?.length > 0,
  `${tp.data?.tags?.length} tags, demographics: ${tp.data?.demographics ? 'yes' : 'null (honest)'}, coverage=${tp.data?.coverage}`);

// --- 5 get_grounding_score -------------------------------------------------------
const gs = toolJson(
  (await callTool('get_grounding_score', { city: 'Austin', tag: 'urn:tag:genre:place:record_store' })).body
);
check('get_grounding_score', gs.ok && gs.data?.venues?.length >= 5 && gs.data.venues.every((v) => v.gs === null || (v.gs >= 0 && v.gs <= 100)),
  `${gs.data?.venues?.length} venues, GS: ${gs.data?.venues?.slice(0, 5).map((v) => v.gs).join(',')}, echo present: ${(gs.data?.queries?.length ?? 0) > 0}`);

// --- rate limit: 31st call in a minute → 429 -----------------------------------
let got429 = false;
for (let i = 0; i < 31; i++) {
  const r = await rpc('tools/list');
  if (r.status === 429) {
    got429 = true;
    break;
  }
}
check('rate limit 30/min per IP', got429, got429 ? '429 observed' : 'no 429 in 31 calls');

console.log(`\n${fail === 0 ? '✔ PHASE 5 CHECKS PASS' : '✖ FAILURES PRESENT'} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
