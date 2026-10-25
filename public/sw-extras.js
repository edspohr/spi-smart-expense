/* Imported by the Workbox service worker (vite.config.js → workbox.importScripts).
 * 1. Web Share Target: the OS share sheet POSTs a photo to /share-target; we
 *    stash it in Cache Storage and open the expense form, which picks it up.
 * 2. Push: FCM data messages ({ title, body, link }) shown as notifications,
 *    without loading the Firebase SDK in the worker.
 */

const SHARE_CACHE = 'shared-files';
const SHARED_KEY = '/shared/receipt';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form.getAll('receipt').find((f) => f && typeof f === 'object' && 'type' in f);
        if (file) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARED_KEY,
            new Response(file, {
              headers: {
                'content-type': file.type || 'application/octet-stream',
                'x-filename': encodeURIComponent(file.name || 'compartido.jpg'),
              },
            }),
          );
        }
      } catch (err) {
        console.warn('[share-target] could not read shared file', err);
      }
      return Response.redirect('/dashboard/new-expense?shared=1', 303);
    })(),
  );
});

function payloadOf(event) {
  try {
    const json = event.data ? event.data.json() : {};
    const data = json.data || {};
    const notification = json.notification || {};
    return {
      title: data.title || notification.title || 'Nueva notificación',
      body: data.body || notification.body || '',
      link: data.link || (json.fcmOptions && json.fcmOptions.link) || '/',
      tag: data.tag || undefined,
    };
  } catch {
    return { title: 'Nueva notificación', body: event.data ? event.data.text() : '', link: '/' };
  }
}

self.addEventListener('push', (event) => {
  const p = payloadOf(event);
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: '/icons/' + (self.__TENANT_ID__ || 'spi') + '/icon-192.png',
      badge: '/icons/' + (self.__TENANT_ID__ || 'spi') + '/icon-192.png',
      data: { link: p.link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(link);
          return;
        }
      }
      await self.clients.openWindow(link);
    })(),
  );
});
