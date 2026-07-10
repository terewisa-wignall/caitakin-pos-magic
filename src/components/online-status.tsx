import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { listPendingOrders } from "@/lib/offline-db";

export function OnlineStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const refresh = () => {
      void listPendingOrders().then((p) => setPending(p.length));
    };
    refresh();
    const iv = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(iv);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-background/95 px-3 py-1 text-xs font-medium shadow-md ring-1 ring-border backdrop-blur">
      {online ? (
        <span className="flex items-center gap-1.5 text-primary">
          <Wifi className="h-3 w-3" /> {pending} venta(s) por sincronizar
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-destructive">
          <WifiOff className="h-3 w-3" /> Sin conexión — trabajando offline
        </span>
      )}
    </div>
  );
}
