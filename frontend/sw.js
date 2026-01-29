// Cache busting for GitHub Pages / static hosting.
// The WASM crate build script generates `./sw.generated.js` which defines:
//   self.__TOPOBUS_BUILD_ID__ = '<git sha>'
// This file changes whenever a new commit is deployed, which forces SW updates
// even if Cargo versions were not bumped.
try {
  importScripts('./sw.generated.js');
} catch (_) {
  // If the generated file is missing (e.g. running without building), fall back.
  self.__TOPOBUS_BUILD_ID__ = self.__TOPOBUS_BUILD_ID__ || 'dev';
}

const BUILD_ID = self.__TOPOBUS_BUILD_ID__ || 'dev';
const DEV_MODE = BUILD_ID === 'dev' ||
  (self.location && /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname || ''));
const CACHE_NAME = DEV_MODE ? 'topobus-static-dev' : `topobus-static-${BUILD_ID}`;
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

const CORE_URLS = CORE_ASSETS.map((asset) => new URL(asset, self.registration.scope).toString());
const CORE_URL_SET = new Set(CORE_URLS);

function isCoreAssetRequest(request) {
  return CORE_URL_SET.has(request.url);
}

function isVersionSensitiveRequest(request) {
  // For JS/CSS/WASM we prefer consistency over SWR to avoid mixed-version runtimes.
  // These resources are expected to update via a new CACHE_NAME on deploy.
  const url = new URL(request.url);
  const path = url.pathname;
  const dest = request.destination;

  if (dest === 'script' || dest === 'style' || dest === 'worker' || dest === 'sharedworker') return true;
  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.wasm') || path.endsWith('.mjs')) return true;
  return false;
}

self.addEventListener('message', (event) => {
  const data = event && event.data ? event.data : null;
  if (!data) return;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      // Do not activate immediately on updates: we want a user-driven reload to
      // avoid mixed-version runtimes. The page can send SKIP_WAITING when the
      // user clicks "Reload".
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

  // Never cache the build id marker: the page polls it to detect new deployments.
  // Serving it cache-first can cause persistent "update available" loops.
  if (url.pathname.endsWith('/build-id.txt')) {
    event.respondWith(handleBuildId(request));
    return;
  }

  event.respondWith(handleAsset(request));
});

async function handleBuildId(request) {
  try {
    // Force a network roundtrip when possible.
    const noStore = new Request(request.url, {
      method: 'GET',
      headers: request.headers,
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow'
    });
    return await fetch(noStore);
  } catch (error) {
    // Best-effort offline fallback.
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 504, statusText: 'Offline' });
  }
}

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
  if (DEV_MODE) {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      return cached || new Response('Offline', { status: 504, statusText: 'Offline' });
    }
  }

  const cached = await cache.match(request);
  if (cached) {
    // Avoid mixing versions: core assets are only updated on SW upgrade (new CACHE_NAME).
    if (!isCoreAssetRequest(request) && !isVersionSensitiveRequest(request)) {
      eventUpdateCache(request, cache);
    }
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
