// Service worker registration with strict guards.
// Only registers in production and outside Lovable preview.

function isBlockedHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith("/sw.js");
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* noop */
  }
}

export function registerAppSw() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (window.self !== window.top) return;
  if (isBlockedHost(window.location.hostname)) {
    void unregisterAppSw();
    return;
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") {
    void unregisterAppSw();
    return;
  }
  // Load workbox-window lazily so it never runs in preview.
  import("workbox-window")
    .then(({ Workbox }) => {
      const wb = new Workbox("/sw.js");
      wb.addEventListener("waiting", () => {
        // Auto-activate new version.
        void wb.messageSW({ type: "SKIP_WAITING" });
      });
      void wb.register();
    })
    .catch(() => {
      /* noop */
    });
}
