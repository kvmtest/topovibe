// grounding.js — the Grounding Score engine (brief §5.3). The hero metric.
//
//   GS(venue) = 100 × clamp(0.6·A + 0.4·T − 0.3·N)
//
//   A — affinity: rank-normalized position in the /v2/insights result set,
//       blended with the venue's popularity field.
//   T — analog density: |venue tag-URNs ∩ analog lexicon| / lexicon size.
//       Lexicon resolved AT SERVER STARTUP via /v2/tags keyword search.
//   N — viral-noise penalty: /v2/trending does NOT support urn:entity:place
//       (verified live, Phase 1) → kill-switch 2: N = 0 + n.unknown = true.
//
// Honest-data: GS is withheld (gs: null, confidence 'insufficient-data') when
// affinity results are empty or the analog lexicon failed to resolve entirely.
import { qlooWithMeta } from './qloo.js';

// Proof-of-human keywords (brief §5.3) — resolved to real tag URNs at startup
export const ANALOG_KEYWORDS = [
  'vinyl',
  'independent bookshop',
  'ceramics',
  'craft',
  'quiet',
  'heritage',
  'record store',
  'third place',
];

const HITS_PER_KEYWORD = 4; // top-4 candidates per keyword (documented choice)

// Systematic lexicon filter: a resolved tag must be a leaf-ish URN — at least
// 3 segments after "urn:tag:" (e.g. genre:place:record_store). This excludes
// bare parents like urn:tag:genre:place (a real "third place" resolution!)
// that would otherwise intersect with EVERY venue and pollute T.
const MIN_TAG_DEPTH = 3;
const isLeafUrn = (urn) => urn.startsWith('urn:tag:') && urn.slice('urn:tag:'.length).split(':').length >= MIN_TAG_DEPTH;

// Supported /v2/trending filter.types (verified live): actor, artist, brand,
// movie, person, podcast, tv_show — NOT place. Kept for future entity types.
const TRENDING_TYPES = new Set([
  'urn:entity:actor', 'urn:entity:artist', 'urn:entity:brand', 'urn:entity:movie',
  'urn:entity:person', 'urn:entity:podcast', 'urn:entity:tv_show',
]);

const lexicon = {
  urns: new Set(),
  byKeyword: {}, // keyword → [urns resolved]
  resolvedAt: null,
  failed: false,
};

export function getLexicon() {
  return {
    urns: [...lexicon.urns],
    size: lexicon.urns.size,
    byKeyword: lexicon.byKeyword,
    resolvedAt: lexicon.resolvedAt,
    failed: lexicon.failed,
  };
}

/** Resolve the analog lexicon via /v2/tags keyword search. Called once at server startup. */
export async function initGrounding() {
  lexicon.urns.clear();
  lexicon.byKeyword = {};
  for (const kw of ANALOG_KEYWORDS) {
    try {
      const { json } = await qlooWithMeta('/v2/tags', { 'filter.query': kw, take: String(HITS_PER_KEYWORD) });
      const hits = (json?.results?.tags ?? [])
        .map((t) => t.id)
        .filter((u) => u && isLeafUrn(u));
      lexicon.byKeyword[kw] = hits;
      hits.forEach((u) => lexicon.urns.add(u));
    } catch (e) {
      console.error(`[grounding] lexicon keyword "${kw}" failed: ${e.name}: ${e.message}`);
      lexicon.byKeyword[kw] = [];
    }
  }
  lexicon.resolvedAt = Date.now();
  lexicon.failed = lexicon.urns.size === 0;
  console.log(
    `[grounding] analog lexicon: ${lexicon.urns.size} tag URNs across ${ANALOG_KEYWORDS.length} keywords${lexicon.failed ? ' — FAILED, GS will be withheld' : ''}`
  );
  return getLexicon();
}

/** Collect every attached tag URN in a venue's entity record. */
export function venueTagUrns(entity) {
  const urns = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'id' && typeof v === 'string' && v.startsWith('urn:tag')) urns.add(v);
      else walk(v);
    }
  };
  walk(entity?.tags);
  walk(entity?.properties);
  return urns;
}

/** Extract trending noise for supported entity types; places → unknown (kill-switch 2). */
async function trendingNoise(entity) {
  const type = entity?.subtype ?? entity?.type;
  if (!TRENDING_TYPES.has(type)) {
    return { value: 0, unknown: true, reason: 'trending unsupported for urn:entity:place (verified live)' };
  }
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 12 * 7 * 24 * 3600 * 1000); // trailing 12 weeks
    const { json } = await qlooWithMeta('/v2/trending', {
      'filter.type': type,
      'signal.interests.entities': entity.entity_id,
      'filter.start_date': start.toISOString().slice(0, 10),
      'filter.end_date': end.toISOString().slice(0, 10),
      take: '50',
    });
    const points = json?.results?.trending ?? json?.results ?? [];
    const accels = (Array.isArray(points) ? points : [])
      .map((p) => p?.acceleration ?? p?.query?.acceleration)
      .filter((x) => typeof x === 'number');
    if (accels.length === 0) return { value: 0, unknown: true, reason: 'trending empty' };
    return { value: Math.min(Math.max(...accels, 0), 1), unknown: false };
  } catch {
    return { value: 0, unknown: true, reason: 'trending unavailable' };
  }
}

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

/**
 * Score a ranked insights result set.
 * Returns per-venue { gs, components:{a,t,n}, confidence } — gs may be null.
 */
export async function scoreVenues(entities) {
  const n = entities.length;
  const lex = getLexicon();

  if (n === 0 || lex.failed) {
    return entities.map(() => ({
      gs: null,
      components: { a: null, t: null, n: { value: 0, unknown: true } },
      confidence: 'insufficient-data',
    }));
  }

  const confidence = lex.size >= 5 && n >= 3 ? 'high' : 'low';

  const scored = [];
  for (let i = 0; i < n; i++) {
    const e = entities[i];
    // A — affinity: rank-normalized (top ≈ 1.0) blended with popularity
    const rankNorm = n > 1 ? 1 - i / (n - 1) : 1;
    const pop = typeof e.popularity === 'number' ? clamp01(e.popularity) : 0.5;
    const a = 0.7 * rankNorm + 0.3 * pop;

    // T — analog density: tag-URN intersection / lexicon size
    const venueUrns = venueTagUrns(e);
    const intersection = [...venueUrns].filter((u) => lexicon.urns.has(u));
    const t = lex.size > 0 ? intersection.length / lex.size : 0;

    // N — viral noise (places: kill-switch 2)
    const noise = await trendingNoise(e);

    const raw = 0.6 * a + 0.4 * t - 0.3 * noise.value;
    const gs = Math.round(100 * clamp01(raw));

    scored.push({
      gs,
      components: {
        a: Number(a.toFixed(3)),
        t: Number(t.toFixed(3)),
        n: { value: noise.value, unknown: noise.unknown, reason: noise.reason },
        analogMatches: intersection,
      },
      confidence,
    });
  }
  return scored;
}
