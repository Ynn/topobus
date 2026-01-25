const CACHE_NAME = 'topobus-static-v0.2.1';
const CORE_ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './topobus-logo.svg',
  './topobus-icon-180.png',
  './topobus-icon-192.png',
  './topobus-icon-512.png',
  './screenshot-wide.png',
  './screenshot-mobile.png',
  './dpt.csv',
  './vendor/jquery.min.js',
  './vendor/lodash.min.js',
  './vendor/backbone-min.js',
  './vendor/joint.min.js',
  './vendor/joint.min.css',
  './vendor/elk.bundled.js',
  './wasm/topobus_wasm.js',
  './wasm/topobus_wasm_bg.wasm',
  './app/index.js',
  './app/controls.js',
  './app/details.js',
  './app/dom.js',
  './app/dpt.js',
  './app/filters.js',
  './app/interactions.js',
  './app/minimap.js',
  './app/parser.js',
  './app/selection.js',
  './app/selection_store.js',
  './app/state.js',
  './app/state_manager.js',
  './app/theme.js',
  './app/upload.js',
  './app/utils.js',
  './app/utils/api_client.js',
  './app/wasm.js',
  './app/cache/graph_cache.js',
  './app/config/elk-algorithms.js',
  './app/config/performance.js',
  './app/entities/normalize.js',
  './app/formatters/device.js',
  './app/ui/details_panel.js',
  './app/ui/icons.js',
  './app/ui/panel_components.js',
  './app/graph/device_graph_builder.js',
  './app/graph/building.js',
  './app/graph/composite.js',
  './app/graph/layout.js',
  './app/graph/render.js',
  './app/graph/shapes.js',
  './app/graph/styles.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request));
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || cache.match('./index.html');
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    eventUpdateCache(request, cache);
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return cached || new Response('Offline', { status: 504, statusText: 'Offline' });
  }
}

function eventUpdateCache(request, cache) {
  fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
    })
    .catch(() => {});
}
