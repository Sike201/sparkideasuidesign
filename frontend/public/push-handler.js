/**
 * Web Push event handlers, loaded into the workbox-generated service
 * worker via `importScripts`. Lives in /public so it's served verbatim
 * (not bundled) and the same file shape survives every rebuild — which
 * matters because installed PWAs cache the SW aggressively and a changed
 * filename means every user has to re-subscribe.
 *
 * Payload contract (JSON, set by the server in the encrypted body):
 *   {
 *     title: string,   // notification title, ≤ 50 chars
 *     body: string,    // body text, ≤ 200 chars recommended
 *     url: string,     // path to open on click, e.g. "/mini-app/trade/<pda>"
 *     tag?: string,    // optional grouping tag — messages with the same
 *                      // tag collapse on Android (only latest shown)
 *   }
 *
 * If the payload is missing / unparseable we still fire a notification
 * with a generic title — some browsers (Chrome on Windows) will auto-
 * generate a "This site has been updated in the background" notification
 * if we DON'T show one, which is worse UX than a bland fallback.
 */

self.addEventListener("push", (event) => {
  /** @type {{title?: string, body?: string, url?: string, tag?: string}} */
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    // Fall back to text() if JSON parsing fails — the admin broadcast
    // builder always sends JSON, but a stray sender might not.
    try {
      payload = { body: event.data.text() };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || "Spark-it";
  const options = {
    body: payload.body || "",
    // `icon` = the LARGE coloured icon rendered inside the notification
    // body. 192×192 PNG, full colour. This is what the user actually
    // looks at when the notif is expanded.
    icon: "/icon-192x192.png",
    // `badge` = the SMALL icon that lives in the Android status bar at
    // the top of the screen. CRITICAL: Android only renders the ALPHA
    // CHANNEL of this image as a white silhouette — colour is dropped.
    // So the file MUST be a white-on-transparent monochrome PNG, ~72×72,
    // with the logo nicely padded. A coloured icon here renders as an
    // empty circle (the bug we just fixed).
    badge: "/badge-72x72.png",
    tag: payload.tag || undefined,
    data: {
      // Persist the absolute URL — when the PWA is closed, openWindow()
      // is more reliable with an absolute https URL than a relative path
      // (some Android push services strip the origin context).
      url: payload.url || "/mini-app",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Resolve to an ABSOLUTE URL inside the PWA scope. openWindow() is far
  // more reliable about routing into the installed PWA (vs a browser tab)
  // when given an absolute URL whose path matches the manifest scope —
  // browsers use the scope match + manifest `handle_links: preferred`
  // to decide whether to launch the standalone window.
  const rawUrl = (event.notification.data && event.notification.data.url) || "/mini-app";
  const absoluteUrl = new URL(rawUrl, self.location.origin).href;
  // The mini-app's manifest scope. Used to filter existing clients —
  // we only want to focus a window that's ALREADY inside /mini-app/, not
  // a random browser tab the user has open elsewhere on justspark.fun.
  const scopePrefix = new URL("/mini-app/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 1. Prefer a client whose URL is already inside the /mini-app/ scope.
      //    On a Brave/Chrome install where the user has both a tab AND
      //    the standalone PWA open, this list will contain both — but
      //    the standalone window is also `/mini-app/...` so either is
      //    fine to focus + navigate.
      const inScope = allClients.filter((c) => {
        try {
          return c.url.startsWith(scopePrefix) || c.url === scopePrefix.slice(0, -1);
        } catch {
          return false;
        }
      });

      for (const client of inScope) {
        try {
          if ("navigate" in client) {
            await client.navigate(absoluteUrl);
          }
          if ("focus" in client) {
            await client.focus();
          }
          return;
        } catch {
          // Fall through to the next candidate / openWindow.
        }
      }

      // 2. No /mini-app/ client open → cold-launch the PWA. We deliberately
      //    do NOT focus a random non-scope tab here — focusing
      //    e.g. a `justspark.fun/back-office` tab and navigating it to
      //    /mini-app would replace the user's other work AND keep them
      //    inside the browser instead of the installed PWA.
      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteUrl);
      }
    })(),
  );
});
