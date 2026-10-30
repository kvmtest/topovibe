// TopoVibe client boot — viewer, basemap, wire modules (brief §4)
import { createGlobe, flyToCity } from './globe.js';
import { CITIES } from './cities.js';

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

window.__viewer = viewer; // handy for debugging / share module
console.log('[topovibe] boot ok');
