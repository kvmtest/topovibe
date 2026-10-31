// routes.js — the ONLY REST surface for the client (brief §5.4).
// No new endpoints outside this table:
//   GET /api/health · /api/resolve · /api/dna · /api/heatmap · /api/grounding
// The exported builders (buildDna / buildHeatmap / buildGrounding / resolveEntities)
// are ALSO the TopoVibe MCP tools' implementations — one source of truth (§6).
import { Router } from 'express';
import { qlooWithMeta, cache, QLOO_BASE } from './qloo.js';
import { scoreVenues, getLexicon } from './grounding.js';

export const router = Router();

const bootTime = Date.now();

/** Named Qloo errors → actionable HTTP responses (brief §6 error rule). */
function sendError(res, e) {
  const status = e.status ?? 500;
  res.status(status).json({ error: e.name ?? 'Error', message: e.message });
}

const asyncWrap = (fn) => (req, res) => fn(req, res).catch((e) => sendError(res, e));

const isUnresolvable = (e) => /unable to resolve/i.test(e.message ?? '');

/** Resolve a keyword → real tag URN before signaling (brief rule 5). URNs pass through. */
async function resolveTagUrn(tagIn) {
  if (tagIn.startsWith('urn:')) return { urn: tagIn, name: tagIn, meta: null };
  const resolved = await qlooWithMeta('/v2/tags', { 'filter.query': tagIn, take: '1' });
  const hit = resolved.json?.results?.tags?.[0];
  if (!hit?.id) return { urn: null, name: tagIn, meta: resolved.meta };
  return { urn: hit.id, name: hit.name, meta: resolved.meta };
}

// =====================================================================
// Builders (shared REST + MCP)
// =====================================================================

/** resolve_entities: /search → [{name, entity_id, subtype, popularity}] */
export async function resolveEntities(query, types) {
  const params = { query, take: '10' };
  if (types) params.types = types;
  const { json, meta } = await qlooWithMeta('/search', params);
  const raw = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
  const hits = raw.map((h) => ({
    name: h.name,
    entity_id: h.entity_id,
    subtype: h.subtype ?? h.types?.[0],
    popularity: h.popularity,
  }));
  return { results: hits, coverage: meta.coverage, queries: [meta.query] };
}

/** resolve_tags: /v2/tags keyword → [{tag_id, name, subtype, popularity}] */
export async function resolveTags(keyword) {
  const { json, meta } = await qlooWithMeta('/v2/tags', { 'filter.query': keyword, take: '10' });
  const tags = (json?.results?.tags ?? []).map((t) => ({
    tag_id: t.id,
    name: t.name,
    subtype: t.type,
    popularity: t.popularity,
  }));
  return {
    results: tags,
    coverage: tags.length ? meta.coverage : 'insufficient-data',
    queries: [meta.query],
  };
}

/** get_taste_profile (REST /api/dna): tags + demographics + top places */
export async function buildDna(city) {
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

  // Demographics. Coverage is sparse per-signal (verified in probes): try the
  // city's top tags, then its top place entities, first non-empty wins; else
  // demographics: null → honest insufficient-data UI.
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

  return {
    city,
    tags,
    demographics,
    demographicsOf: demoTag,
    places,
    coverage,
    queries: metas.map((m) => m.query),
  };
}

/** Heatmap: one tag draped over one city. tag may be URN or keyword. */
export async function buildHeatmap(city, tagIn) {
  const { urn: tag, name: tagName, meta: resolveMeta } = await resolveTagUrn(tagIn);
  if (!tag) {
    return {
      city,
      tag: tagIn,
      points: [],
      coverage: 'insufficient-data',
      queries: [resolveMeta.query],
      message: `No Qloo tag found for keyword "${tagIn}".`,
    };
  }

  const { json, meta } = await qlooWithMeta('/v2/insights', {
    'filter.type': 'urn:heatmap',
    'filter.location.query': city,
    'signal.interests.tags': tag,
    'bias.trends': 'medium',
  });

  const cells = json?.results?.heatmap ?? [];
  // Deterministic downsample: sort by geohash, stride to cap payload for the client
  const MAX_POINTS = 1600;
  let points = cells.map((c) => ({
    lat: c.location?.latitude,
    lon: c.location?.longitude,
    geohash: c.location?.geohash,
    affinity: c.query?.affinity,
    affinityRank: c.query?.affinity_rank,
    popularity: c.query?.popularity,
  }));
  points.sort((a, b) => (a.geohash < b.geohash ? -1 : 1));
  if (points.length > MAX_POINTS) {
    const stride = points.length / MAX_POINTS;
    points = points.filter((_, i) => i % Math.ceil(stride) === 0);
  }

  return {
    city,
    tag,
    tagName,
    points,
    totalCells: cells.length,
    coverage: points.length === 0 ? 'insufficient-data' : meta.coverage,
    queries: [resolveMeta?.query, meta.query].filter(Boolean),
  };
}

/** get_grounding_score: insights + GS engine → [{entity, gs, components, confidence}] */
export async function buildGrounding(city, tagIn) {
  // tag may be a keyword — resolve to a real URN first (brief rule 5)
  const { urn: tag, name: tagName, meta: resolveMeta } = await resolveTagUrn(tagIn);
  if (!tag) {
    return {
      city, tag: tagIn, venues: [], lexicon: { size: 0, byKeyword: {}, failed: true },
      formula: 'GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N)',
      coverage: 'insufficient-data', queries: [resolveMeta.query],
      message: `No Qloo tag found for keyword "${tagIn}".`,
    };
  }
  // Venues matching the tag, hard-filtered to the city (signal-only drifts
  // out-of-town — verified in probes: Austin query leaked San Antonio venues)
  let json, meta;
  try {
    ({ json, meta } = await qlooWithMeta('/v2/insights', {
      'filter.type': 'urn:entity:place',
      'filter.location.query': city,
      'signal.interests.tags': tag,
      'feature.explainability': 'true',
      take: '10',
    }));
  } catch (e) {
    if (isUnresolvable(e)) {
      return {
        city, tag, venues: [], lexicon: { size: 0, byKeyword: {}, failed: true },
        formula: 'GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N)',
        coverage: 'insufficient-data', queries: [],
        message: `Qloo cannot resolve "${city}" to a locality.`,
      };
    }
    throw e;
  }
  const entities = json?.results?.entities ?? [];
  const scores = await scoreVenues(entities);

  const venues = entities.map((e, i) => ({
    entity: {
      entity_id: e.entity_id,
      name: e.name,
      subtype: e.subtype,
      popularity: e.popularity,
      location: e.location ?? null,
      address: e.properties?.address ?? null,
      rating: e.properties?.business_rating ?? null,
      keywords: (e.properties?.keywords ?? []).slice(0, 6).map((k) => k.name),
      image: e.properties?.images?.[0]?.url ?? null,
      website: e.properties?.website ?? null,
      phone: e.properties?.phone ?? null,
      description: e.properties?.description ?? null,
    },
    gs: scores[i].gs,
    components: scores[i].components,
    confidence: scores[i].confidence,
    explainability: e.explainability ?? e.query?.explainability ?? null,
  }));

  const lex = getLexicon();
  return {
    city,
    tag,
    tagName,
    venues,
    lexicon: { size: lex.size, byKeyword: lex.byKeyword, failed: lex.failed },
    formula: 'GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N)',
    coverage: venues.length === 0 ? 'insufficient-data' : meta.coverage,
    queries: [resolveMeta?.query, meta.query].filter(Boolean),
  };
}

// =====================================================================
// REST endpoints
// =====================================================================

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
    const out = await resolveEntities(q, req.query.types ? String(req.query.types) : undefined);
    res.json({ ...out, query: out.queries[0] });
  })
);

// --- GET /api/dna?city= ---------------------------------------------------
router.get(
  '/dna',
  asyncWrap(async (req, res) => {
    const city = String(req.query.city ?? '').trim();
    if (!city) return res.status(400).json({ error: 'BadRequest', message: 'city is required' });
    res.json(await buildDna(city));
  })
);

// --- GET /api/heatmap?city=&tag= ------------------------------------------
router.get(
  '/heatmap',
  asyncWrap(async (req, res) => {
    const city = String(req.query.city ?? '').trim();
    const tag = String(req.query.tag ?? '').trim();
    if (!city || !tag) {
      return res.status(400).json({ error: 'BadRequest', message: 'city and tag are required' });
    }
    res.json(await buildHeatmap(city, tag));
  })
);

// --- GET /api/grounding?city=&tag= -----------------------------------------
router.get(
  '/grounding',
  asyncWrap(async (req, res) => {
    const city = String(req.query.city ?? '').trim();
    const tag = String(req.query.tag ?? '').trim();
    if (!city || !tag) {
      return res.status(400).json({ error: 'BadRequest', message: 'city and tag are required' });
    }
    res.json(await buildGrounding(city, tag));
  })
);
