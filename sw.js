// 香月農園 勤怠打刻 — 最小サービスワーカー
// 目的：PWAとしてインストール可能にする＋ガワ(シェル)を軽くキャッシュ。
// ※GASアプリ本体(iframeの中身)は別オリジンのためキャッシュしません（常に最新を読みます）。

const CACHE = 'kintai-shell-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){}));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if (k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  // 自分のシェルだけ「ネット優先・失敗時キャッシュ」。それ以外(GAS/Google)は素通し。
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); }).catch(function(){});
        return res;
      }).catch(function(){ return caches.match(e.request); })
    );
  }
});
