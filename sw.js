// ===================================================================
//  サービスワーカー（オフラインで動かすための仕組み）
//  ネット上に置いた図鑑アプリを、1回開いたあとは電波がなくても開けるようにする。
//  ※ PCで zukan.html を直接開くときは使われません（ネット上に置いたときだけ動く）
// ===================================================================

const CACHE = 'zukan-cache-v2';      // 保存場所の名前。この仕組み（sw.js）の作りを変えたら v3, v4… と変える
const FILES = [                      // 端末に保存しておくファイルの一覧
  './',
  './zukan.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];
const WAIT_MS = 4000;                // ページを取りに行くのを待つ最大時間（ミリ秒）。電波が弱いときはこれを過ぎたら保存分を使う

// 初めて読み込まれたとき：ファイルを端末に保存する
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));  // ブラウザの一時保存を使わず、必ず最新を取る
  self.skipWaiting();                // 新しい版をすぐ使えるようにする
});

// 新しい版になったとき：古い保存場所を片付ける
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// ネットから最新版を取り、取れたら端末にも保存する
// cache: 'no-cache' ＝ ブラウザの一時保存（GitHubは最大10分ほど古いものを返すことがある）に頼らず、サーバーに確認する
async function fetchAndSave(request) {
  const res = await fetch(request, { cache: 'no-cache' });
  if (res.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const isPage = req.mode === 'navigate' || req.url.endsWith('.html');  // 図鑑のページ本体か

  if (isPage) {
    // ページ本体：まずネットの最新版を取りに行く（アップロードし直した版がすぐ反映される）
    // 電波がない・遅いとき（WAIT_MS 以上かかる）は、端末に保存してある版を使う
    const fresh = fetchAndSave(req);
    event.waitUntil(fresh.catch(() => {}));            // 時間切れになっても、裏で最新版の保存は続ける
    event.respondWith((async () => {
      const timeout = new Promise(resolve => setTimeout(resolve, WAIT_MS, null));
      const res = await Promise.race([fresh.catch(() => null), timeout]);
      if (res && res.ok) return res;
      const saved = await caches.match(req, { ignoreSearch: true }) || await caches.match('./zukan.html');
      return saved || fresh;                           // 保存分もなければ、ネットの結果を待つ
    })());
    return;
  }

  // アイコンなどその他のファイル：保存分をすぐ返し、裏で最新版に更新する
  event.respondWith((async () => {
    const saved = await caches.match(req, { ignoreSearch: true });
    const fresh = fetchAndSave(req).catch(() => saved);
    if (saved) { event.waitUntil(fresh); return saved; }
    return fresh;
  })());
});
