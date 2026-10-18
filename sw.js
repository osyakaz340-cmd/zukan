// ===================================================================
//  サービスワーカー（オフラインで動かすための仕組み）
//  ネット上に置いた図鑑アプリを、1回開いたあとは電波がなくても開けるようにする。
//  ※ PCで zukan.html を直接開くときは使われません（ネット上に置いたときだけ動く）
// ===================================================================

const CACHE = 'zukan-cache-v1';      // 保存場所の名前。中身の作りを大きく変えたら v2, v3… と変える
const FILES = [                      // 端末に保存しておくファイルの一覧
  './',
  './zukan.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

// 初めて読み込まれたとき：ファイルを端末に保存する
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();                // 新しい版をすぐ使えるようにする
});

// 新しい版になったとき：古い保存場所を片付ける
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// ファイルを読み込むたび：保存してあるものをすぐ返し、ネットにつながっていれば裏で最新版に更新する
// （アプリを更新してアップロードし直すと、次の次に開いたときから新しい版になる）
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(event.request, { ignoreSearch: true });  // 端末に保存してあるもの
    const fresh = fetch(event.request)                                       // ネットから取りに行く
      .then(res => { if (res.ok) cache.put(event.request, res.clone()); return res; })
      .catch(() => saved);                                                   // 電波がなければ保存分
    if (saved) { event.waitUntil(fresh); return saved; }
    return fresh;
  }));
});
