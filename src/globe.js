// globe.js — Cesium init (Esri keyless basemap), fly-to, camera hash (brief §5.5)
// vite-plugin-cesium externalizes 'cesium' to the global Cesium build and
// auto-injects Widgets/widgets.css + Cesium.js into index.html — do NOT import
// the CSS here (it breaks the dep optimizer).
import {
  Viewer,
  ImageryLayer,
  UrlTemplateImageryProvider,
  Cartesian3,
  Math as CesiumMath,
} from 'cesium';

export function createGlobe(containerId) {
  const esri = new UrlTemplateImageryProvider({
    // Esri World Imagery — keyless (brief §2, §12: attribution rendered on-globe)
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });

  const viewer = new Viewer(containerId, {
    baseLayer: ImageryLayer.fromProviderAsync(Promise.resolve(esri), {}),
    baseLayerPicker: false,
    geocoder: false, // bundled city list instead — no geocoder dependency
    homeButton: true,
    sceneModePicker: false,
    animation: false,
    timeline: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    requestRenderMode: true,
  });

  viewer.scene.globe.enableLighting = false;
  viewer.cesiumWidget.creditContainer.style.opacity = '0.85';

  // Start on a whole-Earth view
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-30, 25, 22000000),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
  });

  return viewer;
}

export function flyToCity(viewer, city, done) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(city.lon, city.lat, city.altitude ?? 9000),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    duration: 2.2,
    complete: done,
  });
}
