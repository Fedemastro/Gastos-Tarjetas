const CACHE = 'controlate-v1775318884';
const ASSETS = [
  '/Controlate/',
  '/Controlate/index.html',
  '/Controlate/app.js',
  '/Controlate/supabase.js',
  'https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
];

// Instalación: cachear assets estáticos
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS).catch(function(err) {
        console.warn('SW: some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network first para Supabase, cache first para assets estáticos
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Supabase y Cloudflare Worker: siempre red (datos en tiempo real)
  if (url.includes('supabase.co') || url.includes('workers.dev') || url.includes('anthropic')) {
    return; // dejar pasar sin interceptar
  }

  // Assets estáticos: cache first, fallback a red
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cachear respuestas exitosas de assets propios
        if (response.ok && (url.includes('/Controlate/') || url.includes('googleapis') || url.includes('cdnjs'))) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        // Offline fallback: devolver index.html para navegación
        if (e.request.mode === 'navigate') {
          return caches.match('/Controlate/index.html');
        }
      });
    })
  );
});
