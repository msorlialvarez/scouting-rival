// Service Worker de "Scouting Rival" — solo se encarga de que la propia app (el HTML, sus
// iconos y las librerías que carga por CDN) esté disponible sin conexión, por ejemplo para
// poder abrir la PWA y seguir rellenando fichas en un avión. NO cachea datos de Supabase (eso
// lo hace index.html con localStorage, ver OFFLINE_CACHE_KEY) — este archivo solo cachea los
// ARCHIVOS de la propia aplicación.
var CACHE_NAME = 'scouting-rival-shell-v1';

// Todo lo que hace falta para que la app arranque y funcione sin red: el propio HTML, los
// assets de la PWA, y las librerías de CDN que index.html carga con <script src="...">. Las
// URLs de CDN llevan versión fija en la propia URL (p.ej. "@2.5.1"), así que su contenido nunca
// cambia para una misma URL — cachearlas "para siempre" es seguro.
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      // Se añaden uno a uno (no con cache.addAll, que falla entero si UN solo recurso falla,
      // p.ej. un CDN caído justo en ese momento) para que lo que sí se pueda cachear se quede
      // cacheado igualmente.
      return Promise.all(APP_SHELL.map(function(url){
        return cache.add(url).catch(function(err){ console.error('sw: no se pudo cachear', url, err); });
      }));
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return; // las escrituras van directas a Supabase, nunca pasan por aquí

  // El propio index.html: red primero, así el cuerpo técnico ve siempre la última versión en
  // cuanto hay conexión (importante: aquí es donde se van entregando las mejoras de la app) —
  // y la copia en caché sirve de red de seguridad solo cuando no hay red en absoluto.
  var isAppShellPage = req.mode === 'navigate' || req.url.indexOf('index.html') !== -1;
  if(isAppShellPage){
    event.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){ return cached || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Todo lo demás (librerías de CDN con versión fija en la URL, manifest, iconos): caché
  // primero (rápido, y funciona sin red) con refresco en segundo plano por si la copia cacheada
  // ya no existiera en el CDN o hiciera falta guardarla por primera vez.
  event.respondWith(
    caches.match(req).then(function(cached){
      var networkFetch = fetch(req).then(function(res){
        if(res && (res.ok || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || networkFetch;
    })
  );
});
