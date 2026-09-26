self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const url = new URL(data.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.focused && client.url === url)) return;
      await self.registration.showNotification(data.title || "Matchium", {
        body: data.body,
        tag: data.tag,
        icon: "/icon.svg",
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url === url) ?? windows[0];
      if (open) {
        await open.focus();
        if (open.url !== url) await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
