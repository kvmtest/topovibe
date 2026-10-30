// layers/heatmap.js — urn:heatmap grid → affinity-colored PointPrimitives (brief §5.5)
// color = lerp(blue→red, affinity_rank); pixelSize = 4 + 10·popularity. Toggleable.
import { PointPrimitiveCollection, Color, Cartesian3 } from 'cesium';
import { setCoverage } from '../panels/dna.js';

// The 3 presets (mirrored by scripts/precache.mjs — keep in sync).
// URNs resolved via /v2/tags and density-verified live in Austin (Phase 3):
// the indie-music KEYWORD tag yields no place heat grid, and specialty_coffee
// only 22 cells — so music→live-music-venue and coffee→coffee-shop genre URNs.
export const HEAT_PRESETS = [
  { label: '🍝 Italian', tag: 'urn:tag:genre:place:restaurant:italian', name: 'Italian dining' },
  { label: '🎸 Live Music', tag: 'urn:tag:genre:place:live_music_venue', name: 'Live music venues' },
  { label: '☕ Coffee', tag: 'urn:tag:genre:place:restaurant:coffee_shop', name: 'Coffee shops' },
];

let viewer = null;
let collection = null;
let activeTag = null; // { tag, name }
let currentCity = null;
let enabled = true;

function affinityColor(rank) {
  // rank 0..1 → hue blue (0.66) → red (0.0)
  const hue = 0.66 * (1 - Math.min(Math.max(rank ?? 0.5, 0), 1));
  return Color.fromHsl(hue, 1.0, 0.52, 0.85);
}

export function initHeatmap(v) {
  viewer = v;
  collection = viewer.scene.primitives.add(new PointPrimitiveCollection());

  window.addEventListener('topovibe:city', (e) => {
    currentCity = e.detail;
    if (activeTag) loadHeatmap(currentCity, activeTag); // re-drape same tag over new city
  });
  window.addEventListener('topovibe:tag', (e) => {
    loadHeatmap(e.detail.city ?? currentCity, { tag: e.detail.tag, name: e.detail.tagName });
  });

  buildHeatbar();
}

export async function loadHeatmap(city, tagRef) {
  if (!city || !tagRef) return;
  activeTag = tagRef;
  window.topovibeToast?.(`Loading ${tagRef.name} heatmap for ${city.name}…`);
  let d;
  try {
    const r = await fetch(`/api/heatmap?city=${encodeURIComponent(city.name)}&tag=${encodeURIComponent(tagRef.tag)}`);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message ?? `HTTP ${r.status}`);
    }
    d = await r.json();
  } catch (e) {
    window.topovibeToast?.(`Heatmap failed: ${e.message}`);
    return;
  }

  setCoverage(d.coverage);
  collection.removeAll();
  for (const p of d.points) {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
    collection.add({
      position: Cartesian3.fromDegrees(p.lon, p.lat),
      color: affinityColor(p.affinityRank),
      pixelSize: 4 + 10 * (p.popularity ?? 0.5),
    });
  }
  collection.show = enabled;
  syncHeatbar();

  if (d.points.length === 0) {
    window.topovibeToast?.(`No heatmap grid for ${d.tagName ?? tagRef.name} in ${city.name} (insufficient data)`);
  } else {
    window.topovibeToast?.(`${d.tagName ?? tagRef.name}: ${d.points.length} heat cells (${d.totalCells} raw) · ${d.coverage}`);
  }
}

export function clearHeatmap() {
  collection?.removeAll();
  activeTag = null;
  syncHeatbar();
}

export function toggleHeatmap() {
  enabled = !enabled;
  if (collection) collection.show = enabled;
  syncHeatbar();
  return enabled;
}

// --- preset picker bar (3 presets + on/off toggle) -------------------------
let barEl = null;
function buildHeatbar() {
  barEl = document.createElement('div');
  barEl.id = 'heatbar';
  for (const p of HEAT_PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.dataset.tag = p.tag;
    b.title = `${p.name} heatmap`;
    // Dispatch, don't call directly: heatmap + GS markers both listen for this event
    b.addEventListener('click', () => {
      const city = currentCity ?? { name: 'Austin', lat: 30.2672, lon: -97.7431 };
      window.dispatchEvent(new CustomEvent('topovibe:tag', { detail: { tag: p.tag, tagName: p.name, city } }));
    });
    barEl.appendChild(b);
  }
  const t = document.createElement('button');
  t.id = 'heat-toggle';
  t.textContent = '⏻ heat';
  t.title = 'Toggle heatmap layer';
  t.addEventListener('click', toggleHeatmap);
  barEl.appendChild(t);
  document.body.appendChild(barEl);
  syncHeatbar();
}

function syncHeatbar() {
  if (!barEl) return;
  barEl.querySelectorAll('button[data-tag]').forEach((b) => {
    b.classList.toggle('active', activeTag?.tag === b.dataset.tag);
  });
  const t = barEl.querySelector('#heat-toggle');
  t.classList.toggle('active', enabled);
  t.textContent = enabled ? '⏻ heat on' : '⏻ heat off';
}
