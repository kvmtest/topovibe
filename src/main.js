// TopoVibe client boot — viewer, basemap, wire modules (brief §4)
import { createGlobe, flyToCity } from './globe.js';
import { CITIES } from './cities.js';
import { showDna } from './panels/dna.js';

const viewer = createGlobe('cesiumContainer');

// --- Demo-city buttons (keyless "search": bundled coords, no geocoder dependency) ---
const citybar = document.getElementById('citybar');
let activeBtn = null;
for (const city of CITIES) {
  const btn = document.createElement('button');
  btn.textContent = city.name;
  btn.dataset.city = city.name;
  btn.addEventListener('click', () => {
    if (activeBtn) activeBtn.classList.remove('active');
    activeBtn = btn;
    btn.classList.add('active');
    flyToCity(viewer, city);
    showDna(city);
    window.dispatchEvent(new CustomEvent('topovibe:city', { detail: city }));
  });
  citybar.appendChild(btn);
}

// Global toast helper for all modules
window.topovibeToast = (msg, ms = 2600) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
};

// Deep-link boot: ?city=Austin selects a demo city on load (screenshot-friendly;
// the full camera hash serializer lands with share.js in Phase 6).
const wanted = new URLSearchParams(location.search).get('city');
if (wanted) {
  const btn = [...citybar.children].find((b) => b.dataset.city.toLowerCase() === wanted.toLowerCase());
  if (btn) setTimeout(() => btn.click(), 600);
}

window.__viewer = viewer; // handy for debugging / share module
console.log('[topovibe] boot ok');
