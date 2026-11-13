/* Offline shell cache: bump when the published source changes. */
const CACHE_VERSION='lut-deluxe-ultimate-2.0.0';
const ASSETS=['./','./index.html','./ultimate-app.js?v=2.0.0','./ultimate-engine.js',
'./ultimate.css?v=2.0.0','./voice-processor.js','./bank.js','./engine.js',
'./classic.html','./styles.css?v=1.3.0','./app.js?v=1.3.0',
'./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE_VERSION).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
  return response;
 }).catch(()=>caches.match(event.request).then(result=>result||caches.match('./index.html'))));
});
