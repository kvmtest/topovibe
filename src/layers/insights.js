// layers/insights.js — venue markers colored by Grounding Score (brief §5.5):
// gs ≥ 70 → hot red #ff3b30 · 40–69 → amber · < 40 → cold blue #0a84ff · null → grey.
// Click a marker → panels/grounding.js breakdown.
import { Cartesian3, Color, ScreenSpaceEventType, defined } from 'cesium';
import { showGrounding } from '../panels/grounding.js';

const GS_COLORS = {
  hot: Color.fromCssColorString('#ff3b30'),
  warm: Color.fromCssColorString('#ff9f0a'),
  cold: Color.fromCssColorString('#0a84ff'),
  grey: Color.fromCssColorString('#6b7684'),
};

export function gsColor(gs) {
  if (gs === null || gs === undefined) return GS_COLORS.grey;
  if (gs >= 70) return GS_COLORS.hot;
  if (gs >= 40) return GS_COLORS.warm;
  return GS_COLORS.cold;
}

let viewer = null;
let currentCity = null;
let activeTag = null;
const markerIds = new Set();

function clearMarkers() {
  for (const id of markerIds) viewer.entities.removeById(id);
  markerIds.clear();
  viewer.scene.requestRender();
}

export function initInsights(v) {
  viewer = v;

  window.addEventListener('topovibe:city', (e) => {
    currentCity = e.detail;
    if (activeTag) loadGrounding(currentCity, activeTag);
  });
  window.addEventListener('topovibe:tag', (e) => {
    activeTag = { tag: e.detail.tag, name: e.detail.tagName };
    loadGrounding(e.detail.city ?? currentCity, activeTag);
  });

  // Unified picking: venue marker → GS breakdown; heat cell → affinity readout
  viewer.screenSpaceEventHandler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (!defined(picked)) return;
    if (picked.id?.venue) {
      showGrounding(picked.id.venue, picked.id.gsMeta);
    } else if (picked.primitive?.heatData) {
      const h = picked.primitive.heatData;
      window.topovibeToast?.(
        `${h.tagName} cell (${h.geohash}) · affinity ${Math.round((h.affinityRank ?? 0) * 100)}% · popularity ${Math.round((h.popularity ?? 0) * 100)}%`,
        3500
      );
    }
  }, ScreenSpaceEventType.LEFT_CLICK);
}

export async function loadGrounding(city, tagRef) {
  if (!city || !tagRef) return;
  clearMarkers();
  let d;
  try {
    const r = await fetch(
      `/api/grounding?city=${encodeURIComponent(city.name)}&tag=${encodeURIComponent(tagRef.tag)}`
    );
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message ?? `HTTP ${r.status}`);
    }
    d = await r.json();
  } catch (e) {
    window.topovibeToast?.(`Grounding Score failed: ${e.message}`);
    return;
  }

  let placed = 0;
  for (const v of d.venues) {
    const loc = v.entity.location;
    if (typeof loc?.lat !== 'number' || typeof loc?.lon !== 'number') continue;
    const id = `gs-${v.entity.entity_id}`;
    const gsMeta = {
      gs: v.gs,
      components: v.components,
      confidence: v.confidence,
      formula: d.formula,
      coverage: d.coverage,
      tag: d.tag,
      explainability: v.explainability,
    };
    viewer.entities.add({
      id,
      position: Cartesian3.fromDegrees(loc.lon, loc.lat),
      venue: v.entity,
      gsMeta,
      point: {
        pixelSize: 10 + 12 * (v.entity.popularity ?? 0.5),
        color: gsColor(v.gs),
        outlineColor: Color.WHITE.withAlpha(0.85),
        outlineWidth: 1.5,
      },
      label: {
        text: `${v.gs ?? '?'} · ${v.entity.name}`,
        font: '11px Segoe UI, sans-serif',
        fillColor: Color.WHITE,
        style: 2, // FILL_AND_OUTLINE
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        pixelOffset: { x: 0, y: -18 },
        verticalOrigin: 0,
      },
    });
    markerIds.add(id);
    placed++;
  }
  viewer.scene.requestRender();
  window.topovibeToast?.(
    placed
      ? `Grounding Score: ${placed} ${tagRef.name} venues in ${city.name} (${d.coverage})`
      : `No scored venues for ${tagRef.name} in ${city.name} (insufficient data)`
  );
}
