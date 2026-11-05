/**
 * sw.js
 * Service Worker para soporte Offline-First en brigadas de campo y visitas domiciliarias.
 * MÁXIME Salud Digital - Puesta en Marcha de Hospitales (v20: acceso con usuario y clave, T-03b)
 */

const CACHE_NAME = 'maxime-cronicos-huarmey-v20261105-f4c';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/images/logo_maxime.png',
  './assets/images/favicon.png',
  './assets/images/icono-192.png',
  './assets/images/icono-512.png',
  './css/georis-theme.css?v=20261026_premium',
  './css/layout.css?v=20261105_f4',
  './css/components.css?v=20261105_f4c',
  './css/padron-grid.css?v=20261027_v4',
  './css/registro-clinico.css?v=20261027_v4',
  './libs/leaflet.js',
  './libs/leaflet.css',
  './libs/xlsx.full.min.js',
  './data/georis/georisDataBundle.js?v=20261021_v18',
  './data/georis/huarmeyCadastreBundle.js?v=20261021_v18',
  './js/config.js?v=20261105_f4c',
  './js/utils/fechaLima.js?v=20261029_a8f',
  './js/auth/session.js?v=20261105_f4c',
  './js/auth/authUi.js?v=20261105_f4c',
  './js/main.js?v=20261029_a8f',
  './js/map/mapManager.js?v=20261021_v18',
  './js/map/establecimientos.js?v=20261026_v21',
  './js/map/georisAncashLayers.js?v=20261026_v21',
  './js/map/ancashGeocoder.js?v=20261026_v21',
  './js/clinical/semaforo.js?v=20261021_v18',
  './js/clinical/heartsEngine.js?v=20261021_v18',
  './js/clinical/alertsManager.js?v=20261021_v18',
  './js/clinical/whatsappNotifier.js?v=20261029_a8f',
  './js/clinical/indicadoresConvenio.js?v=20261029_a8f',
  './js/data/hosixParser.js?v=20261021_v18',
  './js/data/padronSchema.js?v=20261029_a8f',
  './js/data/padronExcelParser.js?v=20261029_a8f',
  './js/data/padronPlantillaV4.js?v=20261029_a8f',
  './js/data/padronExportV4.js?v=20261029_a8f',
  './js/clinical/padronCalculadora.js?v=20261027_v4',
  './js/ui/icons.js?v=20261027_v6',
  './js/ui/padronGridModal.js?v=20261029_a8f',
  './js/ui/registroClinicoModal.js?v=20261029_a8f',
  './js/ui/acciones.js?v=20261105_f4'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Ignorar métodos no GET
  if (e.request.method !== 'GET') return;

  // Ignorar peticiones a servidores externos de mapas (Tiles de Esri, Google, CartoDB, OSM)
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Consultas de API / FHIR siempre directas a la red
  if (e.request.url.includes('/api/') || e.request.url.includes('/fhir/')) {
    return;
  }

  // Estrategia Network-First con respaldo seguro en caché (evita ERR_FAILED si retorna undefined)
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(e.request, { ignoreSearch: true });
        if (cached) return cached;
        if (e.request.mode === 'navigate') {
          const fallbackIndex = await caches.match('./index.html', { ignoreSearch: true });
          if (fallbackIndex) return fallbackIndex;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
