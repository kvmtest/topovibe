// mcp.js — TopoVibe MCP server (streamable HTTP, @modelcontextprotocol/sdk).
// The agentic surface: 5 tools grounded in Qloo's taste graph (brief §6).
// Every tool embeds the raw Qloo query echo(s) for auditability; errors map to
// named, actionable strings. Stateless per-request server (no sessions).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { resolveEntities, resolveTags, buildDna, buildGrounding } from './routes.js';
import { qlooWithMeta } from './qloo.js';
import { MATRIX } from './validity.js';

const PKG = { name: 'topovibe-mcp', version: '0.1.0' };

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const asError = (e) => ({
  isError: true,
  content: [
    {
      type: 'text',
      text: `${e.name ?? 'Error'}: ${e.message ?? String(e)}\nHint: hackathon keys work only on https://hackathon.api.qloo.com with X-Api-Key; filter.type must be a full URN.`,
    },
  ],
});

function buildServer() {
  const server = new McpServer(PKG);

  // 1 — resolve_entities: name → entity IDs (always resolve before signaling)
  server.registerTool(
    'resolve_entities',
    {
      title: 'Resolve Entities',
      description:
        'Resolve a free-text name to Qloo entities (entity_id, subtype, popularity). ALWAYS resolve entity IDs before using them as signal.interests.entities.',
      inputSchema: {
        query: z.string().describe('Free-text entity name, e.g. "Balthazar"'),
        types: z.string().optional().describe('Comma-separated full URNs, e.g. "urn:entity:place"'),
      },
    },
    async ({ query, types }) => {
      try {
        return asText(await resolveEntities(query, types));
      } catch (e) {
        return asError(e);
      }
    }
  );

  // 2 — resolve_tags: keyword → tag URNs (never invent urn:qloo:* tags)
  server.registerTool(
    'resolve_tags',
    {
      title: 'Resolve Tags',
      description:
        'Resolve a keyword to real Qloo tag URNs via /v2/tags. Use these URNs in signal.interests.tags — never invent tag URNs.',
      inputSchema: { keyword: z.string().describe('Tag keyword, e.g. "vinyl" or "record store"') },
    },
    async ({ keyword }) => {
      try {
        return asText(await resolveTags(keyword));
      } catch (e) {
        return asError(e);
      }
    }
  );

  // 3 — get_insights: ranked entities, validity-checked (matrix from Qloo docs)
  server.registerTool(
    'get_insights',
    {
      title: 'Get Insights',
      description:
        'Ranked Qloo insights. filterType must be a full URN (urn:entity:place, urn:entity:artist, urn:heatmap, urn:demographics, urn:tag, urn:entity:locality). ' +
        'signals map to signal.* params (e.g. {"location.query":"Austin","interests.tags":"urn:tag:..."}); filters map to filter.* params. ' +
        `Valid params per filterType: ${Object.entries(MATRIX).map(([k, v]) => `${k} → ${v.join(', ')}`).join(' | ')}`,
      inputSchema: {
        filterType: z.string().describe('Full URN filter.type'),
        signals: z.record(z.string(), z.string()).optional().describe('signal.* params without the prefix'),
        filters: z.record(z.string(), z.string()).optional().describe('filter.* params without the prefix'),
        take: z.number().optional().describe('Result count (1..50)'),
        page: z.number().optional(),
      },
    },
    async ({ filterType, signals = {}, filters = {}, take, page }) => {
      try {
        const params = { 'filter.type': filterType };
        for (const [k, v] of Object.entries(signals)) params[`signal.${k}`] = v;
        for (const [k, v] of Object.entries(filters)) params[`filter.${k}`] = v;
        if (take) params.take = String(take);
        if (page) params.page = String(page);
        const { json, meta } = await qlooWithMeta('/v2/insights', params); // validity matrix strips+logs
        return asText({ results: json?.results ?? json, coverage: meta.coverage, queries: [meta.query] });
      } catch (e) {
        return asError(e);
      }
    }
  );

  // 4 — get_taste_profile: signature tags + demographics of a place
  server.registerTool(
    'get_taste_profile',
    {
      title: 'Get Taste Profile',
      description:
        'Cultural DNA of a place: signature tags, demographics (when Qloo coverage allows — may be null honestly), top places. Every claim carries its Qloo query echo.',
      inputSchema: { locationQuery: z.string().describe('Natural-language place, e.g. "Austin" or "Tokyo"') },
    },
    async ({ locationQuery }) => {
      try {
        return asText(await buildDna(locationQuery));
      } catch (e) {
        return asError(e);
      }
    }
  );

  // 5 — get_grounding_score: the hero metric for agents
  server.registerTool(
    'get_grounding_score',
    {
      title: 'Get Grounding Score',
      description:
        'Grounding Score (0-100 proof-of-human authenticity) per venue: GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N). ' +
        'A = insights rank affinity, T = analog tag-URN density, N = viral noise (n.unknown=true when trending is unsupported — never faked). ' +
        'Provide city + tag (cohort mode) or entityIds[] (venues similar to the given entities). GS is withheld (null) on insufficient data.',
      inputSchema: {
        city: z.string().describe('Natural-language city, e.g. "Austin"'),
        tag: z.string().optional().describe('Tag URN (cohort mode) — resolve via resolve_tags first'),
        entityIds: z.array(z.string()).optional().describe('Qloo entity IDs (similar-venue mode)'),
      },
    },
    async ({ city, tag, entityIds }) => {
      try {
        if (tag) return asText(await buildGrounding(city, tag));
        if (entityIds?.length) {
          // Similar-venue mode: affinity-ranked cohort of the given entities
          const { json, meta } = await qlooWithMeta('/v2/insights', {
            'filter.type': 'urn:entity:place',
            'filter.location.query': city,
            'signal.interests.entities': entityIds.join(','),
            'feature.explainability': 'true',
            take: '10',
          });
          const { scoreVenues } = await import('./grounding.js');
          const entities = json?.results?.entities ?? [];
          const scores = await scoreVenues(entities);
          return asText({
            city,
            mode: 'similar-venues',
            signalEntities: entityIds,
            venues: entities.map((e, i) => ({
              entity: { entity_id: e.entity_id, name: e.name, popularity: e.popularity, location: e.location ?? null },
              gs: scores[i].gs,
              components: scores[i].components,
              confidence: scores[i].confidence,
            })),
            formula: 'GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N)',
            coverage: entities.length === 0 ? 'insufficient-data' : meta.coverage,
            queries: [meta.query],
          });
        }
        return asError({ name: 'BadRequest', message: 'provide tag (cohort mode) or entityIds[] (similar-venue mode)' });
      } catch (e) {
        return asError(e);
      }
    }
  );

  return server;
}

// --- Per-IP rate limit: 30 req/min on the MCP route (brief §6) -------------
const hits = new Map(); // ip → [timestamps]
function rateLimit(req, res, next) {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const now = Date.now();
  const window = 60_000;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < window);
  if (list.length >= 30) {
    return res.status(429).json({ error: 'RateLimited', message: 'TopoVibe MCP: 30 requests/min per IP' });
  }
  list.push(now);
  hits.set(ip, list);
  next();
}

/** Mount the stateless streamable-HTTP MCP endpoint at /mcp. */
export function mountMcp(app) {
  app.post('/mcp', rateLimit, async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error(`[mcp] request failed: ${e.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'McpError', message: e.message });
      }
    }
  });
  app.get('/mcp', (req, res) =>
    res.status(405).json({ error: 'MethodNotAllowed', message: 'TopoVibe MCP is stateless: POST JSON-RPC to /mcp' })
  );
  app.delete('/mcp', (req, res) => res.status(405).json({ error: 'MethodNotAllowed' }));
  console.log('[topovibe] MCP endpoint mounted at /mcp (5 tools)');
}
