// Local cache for offline product browsing + pending sales queue.
// Uses IndexedDB via `idb`. Safe to import on the client only.

import { openDB, type IDBPDatabase } from "idb";

export type CachedProduct = {
  id: string;
  name: string;
  photo_url: string | null;
  photo_thumb_url: string | null;
  base_price_mxn: number;
  category_id: string | null;
  categories: { name: string } | null;
  variants: Array<{
    id: string;
    variant_name: string | null;
    size: string | null;
    color: string | null;
    stock: number;
    price_override_mxn: number | null;
  }>;
  cached_at: number;
};

export type PendingOrder = {
  local_id: string;
  payload: unknown; // shape defined by sell page
  status: "pending" | "syncing" | "error";
  error?: string | null;
  created_at: number;
};

const DB_NAME = "casitakin-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("products")) {
          db.createObjectStore("products", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pending_orders")) {
          db.createObjectStore("pending_orders", { keyPath: "local_id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("products", "readwrite");
    await tx.store.clear();
    await Promise.all(products.map((p) => tx.store.put({ ...p, cached_at: Date.now() })));
    await tx.done;
  } catch (e) {
    console.warn("[offline] cacheProducts failed", e);
  }
}

export async function loadCachedProducts(): Promise<CachedProduct[]> {
  try {
    const db = await getDb();
    return await db.getAll("products");
  } catch {
    return [];
  }
}

export async function addPendingOrder(payload: unknown): Promise<string> {
  const db = await getDb();
  const local_id = crypto.randomUUID();
  const record: PendingOrder = {
    local_id,
    payload,
    status: "pending",
    created_at: Date.now(),
  };
  await db.put("pending_orders", record);
  return local_id;
}

export async function listPendingOrders(): Promise<PendingOrder[]> {
  try {
    const db = await getDb();
    return await db.getAll("pending_orders");
  } catch {
    return [];
  }
}

export async function removePendingOrder(local_id: string): Promise<void> {
  const db = await getDb();
  await db.delete("pending_orders", local_id);
}

export async function markPendingOrderError(local_id: string, error: string): Promise<void> {
  const db = await getDb();
  const existing = (await db.get("pending_orders", local_id)) as PendingOrder | undefined;
  if (!existing) return;
  await db.put("pending_orders", { ...existing, status: "error", error });
}
