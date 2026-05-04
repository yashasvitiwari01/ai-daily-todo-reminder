/* global self, clients */

self.addEventListener('push', (event) => {
  let data = { title: 'Daily Tasks', body: '' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (_) {
    const text = event.data?.text?.();
    if (text) data = { title: 'Daily Tasks', body: text };
  }
  const title = data.title || 'Daily Tasks';
  const body = data.body || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: new URL('vite.svg', self.registration.scope).href,
      tag: data.tag || 'tasks-reminder',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(self.registration.scope);
      }
    }),
  );
});
