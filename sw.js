
const CACHE_NAME = 'vocalflow-v5-ios-fix';

// 核心資源：必須確保 index.html 和根路徑都被快取
const CORE_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'metadata.json',
  'https://cdn-icons-png.flaticon.com/512/5988/5988544.png'
];

// 安裝：立即快取核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching core assets');
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活：清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  return self.clients.claim();
});

// 攔截：核心邏輯
self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = new URL(request.url);

  // 1. 針對導航請求 (開啟 App) 的特殊處理：永遠優先嘗試快取 index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        // 如果有網路，更新快取並回傳
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => {
        // 如果沒網路 (飛航模式)，直接回傳 index.html 快取
        return caches.match('index.html') || caches.match('./');
      })
    );
    return;
  }

  // 2. 針對其餘資源 (JS, CSS, Images, CDN)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // 有快取就直接給 (Stale-While-Revalidate 模式：給快取的同時背景更新)
        fetch(request).then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // 沒快取就去網路上抓
      return fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try {
              cache.put(request, responseToCache);
            } catch (e) {}
          });
        }
        return networkResponse;
      }).catch(() => {
        // 最終防線：連網失敗且沒快取，回傳一個空的回應而不是讓它報錯
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
