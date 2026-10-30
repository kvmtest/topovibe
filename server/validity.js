// validity.js — param ↔ filter.type validity matrix, from Qloo docs (brief §5.2).
// The Qloo API SILENTLY IGNORES invalid params — we refuse to: strip + log client-side.

export const MATRIX = {
  'urn:entity:place': [
    'filter.type', 'signal.interests.entities', 'signal.interests.tags',
    'signal.location', 'signal.location.query', 'filter.location', 'filter.location.query',
    'filter.location.radius', 'filter.tags', 'filter.exclude.tags', 'filter.address',
    'filter.external.exists', 'bias.quality', 'bias.trends', 'diversify.by', 'diversify.take',
    'feature.explainability', 'take', 'page',
  ],
  'urn:entity:artist': [
    'filter.type', 'signal.interests.entities', 'signal.interests.tags',
    'signal.location.query', 'filter.tags', 'bias.trends', 'feature.explainability', 'take', 'page',
  ],
  'urn:heatmap': [
    'filter.type', 'filter.location', 'filter.location.query',
    'filter.location.radius', 'signal.interests.entities', 'signal.interests.tags',
    'signal.demographics.age', 'signal.demographics.gender', 'signal.demographics.audiences',
    'filter.dimensions.price_level', 'bias.trends', 'output.heatmap.boundary',
  ],
  'urn:demographics': [
    'filter.type', 'signal.interests.entities', 'signal.interests.tags',
  ],
  'urn:tag': [
    'filter.type', 'signal.interests.entities', 'signal.interests.tags',
    'signal.location', 'signal.location.query', 'filter.tag.types', 'filter.parents.types',
  ],
  'urn:entity:locality': [
    // compare/insights subset
    'filter.type', 'signal.interests.entities', 'signal.interests.tags',
    'signal.location.query', 'take', 'page',
  ],
};

// /v2/trending (brief §5.2): GS noise penalty only
export const TRENDING_PARAMS = [
  'filter.type', 'filter.start_date', 'filter.end_date', 'signal.interests.entities', 'take',
];

// /search — entity-ID resolution (always before signaling)
export const SEARCH_PARAMS = ['query', 'types', 'take', 'page'];

// /v2/tags — tag-URN resolution (conservative allowlist; docs guarantee `query`)
export const TAGS_PARAMS = ['query', 'take', 'page'];

export class QlooUnsupportedError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'QlooUnsupportedError';
    this.status = 400;
  }
}

function applyAllowlist(allowlist, params, context) {
  const clean = {};
  const stripped = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (allowlist.includes(k)) clean[k] = String(v);
    else stripped.push(k);
  }
  if (stripped.length) {
    // The API would silently ignore these — we log instead (brief §5.1).
    console.warn(`[validity] stripped ${stripped.length} invalid param(s) for ${context}: ${stripped.join(', ')}`);
  }
  return { clean, stripped };
}

/**
 * Validate params for a Qloo path. Returns { clean, stripped }.
 * Throws QlooUnsupportedError for unknown/missing filter.type on /v2/insights.
 */
export function validateForPath(path, params = {}) {
  if (path === '/v2/insights') {
    const filterType = params['filter.type'];
    if (!filterType) {
      throw new QlooUnsupportedError('/v2/insights requires filter.type (full URN, e.g. urn:entity:place)');
    }
    const allowlist = MATRIX[filterType];
    if (!allowlist) {
      throw new QlooUnsupportedError(
        `unsupported entity type "${filterType}" — valid: ${Object.keys(MATRIX).join(', ')}`
      );
    }
    return applyAllowlist(allowlist, params, `insights ${filterType}`);
  }
  if (path === '/v2/trending') return applyAllowlist(TRENDING_PARAMS, params, 'trending');
  if (path === '/search') return applyAllowlist(SEARCH_PARAMS, params, 'search');
  if (path === '/v2/tags') return applyAllowlist(TAGS_PARAMS, params, 'tags');
  // Unknown paths: pass through untouched but say so (should not happen — see routes.js table)
  console.warn(`[validity] no allowlist for path ${path} — passing params through`);
  return { clean: { ...params }, stripped: [] };
}
