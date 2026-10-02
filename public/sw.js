/* HealthOS service worker: shows reminders and opens the app on tap. No caching — the app loads as before. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: "HealthOS", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "HealthOS", {
    body: m.body || "",
    tag: m.tag || "healthos",
    renotify: true,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: m.url || "/#today" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/#today", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); if ("navigate" in w) await w.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
