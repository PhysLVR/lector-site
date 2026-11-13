/*
 * Service Worker — پوستهٔ آفلاین و کشِ دارایی‌ها.
 *
 * راهبردها:
 *  - ناوبری (HTML):      network-first با مهلت زمانی؛ اگر آفلاین بود، نسخهٔ کش‌شدهٔ index.html.
 *  - دارایی‌های ایستا:  stale-while-revalidate (CSS/JS/فونت/تصویر/JSON) — سریع + به‌روز در پس‌زمینه.
 *  - بقیه:              مستقیم به شبکه (بدون مداخله).
 *
 * نگهداری کش:
 *  - فقط پاسخ‌های 200 از همان origin ذخیره می‌شوند.
 *  - کش runtime به سقف MAX_RUNTIME_ENTRIES محدود است (قدیمی‌ترین اول حذف می‌شود).
 *  - هر نسخهٔ SW کش‌های قدیمی با پیشوند خودش را در activate پاک می‌کند.
 *
 * پیام‌ها (از صفحه):
 *  - SKIP_WAITING         : فعال‌سازی نسخهٔ جدید همین حالا
 *  - GET_VERSION          : پاسخ با { version, build, schema, caches } از طریق MessageChannel
 *  - CLEAR_RUNTIME_CACHE  : پاک‌کردن کش runtime
 */

const CACHE_PREFIX = "lector-";
const APP_VERSION = "1.0.1"; // نسخهٔ معنایی برنامه (از package.json)
const BUILD = "22d822d"; // شناسهٔ هر دیپلوی: SW و کش‌های تازه برای هر دیپلوی
// ساختار کش: فقط وقتی بالا می‌رود که قالب ذخیرهٔ کش عوض شود.
// کش‌های هر ساختار قدیمی‌تر در activate پاک می‌شوند.
const CACHE_SCHEMA = 2;
const SCHEMA_PREFIX = CACHE_PREFIX + "s" + CACHE_SCHEMA + "-";
const STATIC_CACHE = SCHEMA_PREFIX + "static-" + BUILD;
const RUNTIME_CACHE = SCHEMA_PREFIX + "runtime-" + BUILD;
const SHELL_URLS = ["./", "./index.html", "./manifest.json", "./public/favicon.svg", "./public/apple-touch-icon.png"];
// هر build حدود ۲۵۰ دارایی دارد (JS، CSS، فونت، JSON پک‌ها). سقف باید از این بیشتر باشد
// وگرنه قدیمی‌ترین فایل‌ها (هستهٔ موتور و اسکریپت‌های پک) حذف و آفلاین شکسته می‌شوند.
const MAX_RUNTIME_ENTRIES = 600;
const NAV_TIMEOUT_MS = 4000;
const STATIC_RE = /\.(?:css|js|woff2?|ttf|otf|svg|png|jpe?g|webp|gif|json)$/i;

const OFFLINE_HTML =
  '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>آفلاین</title>' +
  '<body style="font-family:Tahoma,sans-serif;background:#070b16;color:#e5e9f5;display:grid;place-items:center;height:100vh;margin:0">' +
  '<div style="text-align:center;padding:24px"><h1 style="font-size:20px">آفلاین هستی</h1>' +
  '<p style="opacity:.75;font-size:14px">اتصال برقرار نیست و نسخهٔ کش‌شدهٔ برنامه هنوز در دسترس نیست.</p></div></body></html>';

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && !keep.has(k))
          .map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {}
      }
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "SW_ACTIVATED", build: BUILD }));
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  // manifest انتشار همیشه از شبکه: وگرنه نسخهٔ جدید دیده نمی‌شود
  if (url.pathname.endsWith("/release.json")) {
    event.respondWith(releaseNetworkFirst(req));
    return;
  }
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function handleNavigation(event) {
  const req = event.request;
  try {
    const preload = await event.preloadResponse;
    if (preload) {
      cacheIfOk(STATIC_CACHE, "./index.html", preload.clone());
      return preload;
    }
  } catch (_) {}

  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    if (res && res.ok) cacheIfOk(STATIC_CACHE, "./index.html", res.clone());
    return res;
  } catch (_) {
    const cached =
      (await caches.match("./index.html")) || (await caches.match("./"));
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

// release.json همیشه از شبکه؛ اگر آفلاین بود، آخرین نسخهٔ کش‌شده یا یک پاسخ خطای معتبر (هرگز undefined)
async function releaseNetworkFirst(req) {
  try {
    return await fetch(req, { cache: "no-store" });
  } catch (_) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        cache.put(req, res.clone()).then(() => trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES));
      }
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  const fresh = await network;
  return fresh || new Response("", { status: 504, statusText: "Offline" });
}

function cacheIfOk(name, url, res) {
  if (!res || res.status !== 200) return;
  caches.open(name).then((c) => c.put(url, res)).catch(() => {});
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const extra = keys.length - max;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const reply = (payload) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
    else if (event.source) event.source.postMessage(payload);
  };

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "GET_VERSION") {
    caches.keys().then((keys) =>
      reply({
        type: "VERSION",
        version: APP_VERSION,
        build: BUILD,
        schema: CACHE_SCHEMA,
        caches: keys.filter((k) => k.startsWith(CACHE_PREFIX)),
      }),
    );
    return;
  }
  if (data.type === "CLEAR_RUNTIME_CACHE") {
    caches.delete(RUNTIME_CACHE).then((ok) => reply({ type: "CLEARED", ok }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => "focus" in c);
      if (client) return client.focus();
      return self.clients.openWindow("./");
    }),
  );
});
