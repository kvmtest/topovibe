// routes.js — the ONLY REST surface for the client (brief §5.4).
// No new endpoints outside this table:
//   GET /api/health · /api/resolve · /api/dna · /api/heatmap · /api/grounding
import { Router } from 'express';
import { qlooWithMeta, cache, QLOO_BASE } from './qloo.js';

export const router = Router();

const bootTime = Date.now();

/** Named Qloo errors → actionable HTTP responses (brief §6 error rule). */
function sendError(res, e) {
  const status = e.status ?? 500;
  res.status(status).json({ error: e.name ?? 'Error', message: e.message });
}

const asyncWrap = (fn) => (req, res) => fn(req, res).catch((e) => sendError(res, e));

const notYet = (phase) => (req, res) =>
  res.status(501).json({
    error: 'NotImplementedYet',
    message: `This endpoint lands in ${phase} of the 7-hour plan (brief §9).`,
  });

// --- GET /api/health — boot banner self-check ---------------------------
router.get(
  '/health',
  asyncWrap(async (req, res) => {
    res.json({
      ok: true,
      service: 'topovibe',
      qlooBase: QLOO_BASE,
      keyConfigured: !!process.env.QLOO_API_KEY,
      cacheEntries: cache.size,
      uptimeSec: Math.round((Date.now() - bootTime) / 1000),
    });
  })
);

// --- GET /api/resolve?q=&types= — wraps /search (entity-ID resolution) --
router.get(
  '/resolve',
  asyncWrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.status(400).json({ error: 'BadRequest', message: 'q is required' });
    const params = { query: q, take: String(req.query.take ?? '10') };
    if (req.query.types) params.types = String(req.query.types);
    const { json, meta } = await qlooWithMeta('/search', params);
    const raw = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
    const hits = raw.map((h) => ({
      name: h.name,
      entity_id: h.entity_id,
      subtype: h.subtype ?? h.types?.[0],
      popularity: h.popularity,
    }));
    res.json({ results: hits, coverage: meta.coverage, query: meta.query });
  })
);

// --- GET /api/dna?city= — Cultural DNA: signature tags + demographics + ----
// --- top places (3 Qloo calls, cached; brief §5.4) -------------------------
router.get(
  '/dna',
  asyncWrap(async (req, res) => {
    const city = String(req.query.city ?? '').trim();
    if (!city) return res.status(400).json({ error: 'BadRequest', message: 'city is required' });

    // Calls 1+3 in parallel: signature tags · top places (brief §7: diversify + explainability)
    const [tagsCall, placesCall] = await Promise.all([
      qlooWithMeta('/v2/insights', {
        'filter.type': 'urn:tag',
        'signal.location.query': city,
      }),
      qlooWithMeta('/v2/insights', {
        'filter.type': 'urn:entity:place',
        'signal.location.query': city,
        'diversify.by': 'properties.geocode.city',
        'diversify.take': '5',
        'feature.explainability': 'true',
        take: '10',
      }),
    ]);
    const rawTags = tagsCall.json?.results?.tags ?? [];
    const tags = rawTags.slice(0, 12).map((t) => ({
      tag_id: t.tag_id,
      name: t.name,
      subtype: t.subtype,
      popularity: t.popularity,
      affinity: t.query?.affinity,
    }));
    const rawPlaces = placesCall.json?.results?.entities ?? [];
    const places = rawPlaces.slice(0, 10).map((e) => ({
      entity_id: e.entity_id,
      name: e.name,
      subtype: e.subtype,
      popularity: e.popularity,
      geocode: e.properties?.geocode ?? null,
      address: e.properties?.address ?? null,
      description: e.properties?.description ?? null,
      location: e.location ?? e.properties?.geocode?.location ?? null,
    }));

    // Call 2: demographics. Coverage is sparse per-signal (verified in probes):
    // try the city's top tags, then its top place entities, take the first
    // non-empty result; else demographics: null → honest insufficient-data UI.
    let demographics = null;
    let demoTag = null;
    let demoMeta = null;
    const tryDemo = async (params, label) => {
      const call = await qlooWithMeta('/v2/insights', { 'filter.type': 'urn:demographics', ...params });
      const d = call.json?.results?.demographics?.[0];
      if (d?.query) {
        demographics = d.query;
        demoTag = label;
        demoMeta = call.meta;
        return true;
      }
      return false;
    };
    for (const t of tags.slice(0, 4)) {
      if (demographics) break;
      await tryDemo({ 'signal.interests.tags': t.tag_id }, { kind: 'tag', tag_id: t.tag_id, name: t.name });
    }
    for (const p of places.slice(0, 3)) {
      if (demographics) break;
      await tryDemo(
        { 'signal.interests.entities': p.entity_id },
        { kind: 'entity', entity_id: p.entity_id, name: p.name }
      );
    }

    const metas = [tagsCall.meta, demoMeta, placesCall.meta].filter(Boolean);
    const coverage =
      tags.length === 0 && places.length === 0
        ? 'insufficient-data'
        : metas.every((m) => m.coverage === 'cached')
          ? 'cached'
          : 'live';

    res.json({
      city,
      tags,
      demographics,
      demographicsOf: demoTag,
      places,
      coverage,
      queries: metas.map((m) => m.query),
    });
  })
);

// --- GET /api/heatmap?city=&tag= (Phase 3) --------------------------------
router.get('/heatmap', notYet('Phase 3 (heatmap)'));

// --- GET /api/grounding?city=&tag= (Phase 4) ------------------------------
router.get('/grounding', notYet('Phase 4 (Grounding Score)'));
