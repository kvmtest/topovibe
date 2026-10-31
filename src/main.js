// TopoVibe client boot — viewer, basemap, wire modules (brief §4)
import { createGlobe, flyToCity } from './globe.js';
import { CITIES } from './cities.js';
import { showDna } from './panels/dna.js';
import { initHeatmap } from './layers/heatmap.js';
import { initInsights } from './layers/insights.js';
import { initShare } from './share.js';

const viewer = createGlobe('cesiumContainer');
initHeatmap(viewer);
initInsights(viewer);

// --- Unified city selection (buttons, search, share-link restore) -----------
const citybar = document.getElementById('citybar');
let activeBtn = null;

function selectCity(city) {
  if (activeBtn) activeBtn.classList.remove('active');
  activeBtn = [...citybar.children].find((b) => b.dataset.city === city.name) ?? null;
  if (activeBtn) activeBtn.classList.add('active');
  flyToCity(viewer, city);
  showDna(city);
  window.dispatchEvent(new CustomEvent('topovibe:city', { detail: city }));
}
window.__topovibeSelectCity = selectCity; // used by share.js restore

function addCityButton(city, isCustom = false) {
  const btn = document.createElement('button');
  btn.textContent = isCustom ? `· ${city.name}` : city.name;
  btn.dataset.city = city.name;
  if (isCustom) btn.title = 'searched city';
  btn.addEventListener('click', () => selectCity(city));
  citybar.appendChild(btn);
  return btn;
}

// Demo-city buttons (keyless "search": bundled coords, no geocoder dependency)
for (const city of CITIES) addCityButton(city);

// --- City search: Qloo resolves the locality itself — no geocoder -----------
// /api/dna?city=X returns places with lat/lon; we fly to the first one.
const searchInput = document.createElement('input');
searchInput.id = 'city-search';
searchInput.placeholder = 'any city…';
searchInput.setAttribute('aria-label', 'Search any city');
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchCity();
});
citybar.appendChild(searchInput);

async function searchCity() {
  const name = searchInput.value.trim();
  if (!name) return;
  window.topovibeToast?.(`Resolving "${name}" via Qloo…`);
  let d;
  try {
    const r = await fetch(`/api/dna?city=${encodeURIComponent(name)}`);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message ?? `HTTP ${r.status}`);
    }
    d = await r.json();
  } catch (e) {
    window.topovibeToast?.(`"${name}" failed: ${e.message}`, 4000);
    return;
  }
  const loc = d.places?.find((p) => typeof p.location?.lat === 'number')?.location;
  if (!loc) {
    window.topovibeToast?.(`No Qloo taste map for "${name}" (insufficient data)`, 4000);
    return;
  }
  const city = { name: d.city ?? name, lat: loc.lat, lon: loc.lon, altitude: 13000 };
  if (![...citybar.children].some((b) => b.dataset.city === city.name)) addCityButton(city, true);
  selectCity(city);
  searchInput.value = '';
}

// --- Zoom controls (Cesium defaults to scroll/right-drag only) --------------
const zoombar = document.createElement('div');
zoombar.id = 'zoombar';
for (const [label, title, factor] of [
  ['+', 'Zoom in', 0.5],
  ['−', 'Zoom out', -1],
]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', () => {
    const h = viewer.camera.positionCartographic.height;
    if (factor > 0) viewer.camera.zoomIn(h * factor);
    else viewer.camera.zoomOut(h * -factor);
  });
  zoombar.appendChild(b);
}
document.body.appendChild(zoombar);

// Global toast helper for all modules
window.topovibeToast = (msg, ms = 2600) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
};

// Share links LAST: restore() selects cities + fires layer events, so the
// citybar, selectCity and toast helper must exist first.
initShare(viewer);

// Deep-link boot: ?city=Austin selects a demo city on load (screenshot-friendly)
const wanted = new URLSearchParams(location.search).get('city');
if (wanted) {
  const btn = [...citybar.children].find((b) => b.dataset.city.toLowerCase() === wanted.toLowerCase());
  if (btn) setTimeout(() => btn.click(), 600);
}

window.__viewer = viewer; // handy for debugging / share module
console.log('[topovibe] boot ok');
