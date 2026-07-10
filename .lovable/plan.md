## Objetivo
1) Fotos más rápidas en inventario y venta.
2) App instalable en el celular que funcione **sin internet** y se **sincronice** al reconectar.

---

## Parte 1 — Fotos rápidas

**Diagnóstico**
Hoy cada foto se sube al bucket `product-photos` con `remove-bg` y se guarda como PNG a resolución completa; luego se lee con `createSignedUrl` a 5 años. Eso da PNGs de 1–3 MB cargándose de golpe en grillas de 10–30 productos.

**Cambios**
- **Comprimir antes de subir**: pasar la imagen final (ya sin fondo) por un resize a máx. 800px del lado mayor y exportar como **WebP calidad 82** (fallback JPG). Baja el peso de ~1.5 MB → ~40–80 KB.
- **Generar thumbnail 200px** aparte y guardar ambas rutas en el producto (`photo_url` + `photo_thumb_url`). Lista de inventario y buscador de venta usan el thumb; el detalle usa la grande.
- **Migración**: agregar columna `photo_thumb_url text` a `products` y `product_variants` (nullable, sin backfill obligatorio).
- **Lazy + tamaño fijo**: las `<img>` ya usan `loading="lazy"`, agregar `decoding="async"` y `width/height` para evitar reflow.
- **Cache del navegador**: el signed URL de 5 años ya se cachea; asegurarnos de reutilizar el mismo URL (no re-firmar en cada render).
- **Placeholder**: usar `background-color` del tono terracota mientras carga (evita el "flash" gris).

*No* se agrega un CDN externo ni transformador server-side — todo se resuelve en el cliente antes de subir, para no tocar el runtime del Worker.

---

## Parte 2 — App instalable + offline

**Alcance (para acordar)**
- **Instalable** en celular (Android/iOS Add to Home Screen) con ícono y splash de CAsitakin.
- **Consulta offline**: ver inventario, precios y datos del último sync.
- **Venta offline** (cola): registrar ventas sin internet y sincronizar al reconectar.
- **Módulos admin (Finanzas, RRHH, Reportes, Usuarios, Comisiones)**: **solo online**. Son sensibles y usan queries pesadas; no vale la pena replicarlas.

**Arquitectura**
Sigo la skill oficial de PWA de Lovable:

1. **Manifest + íconos** (`public/manifest.webmanifest`, `theme-color`, `apple-touch-icon` con el logo bordado).
2. **Service worker generado con `vite-plugin-pwa`** (`registerType: autoUpdate`, `injectRegister: null`).
   - `NetworkFirst` para HTML.
   - `CacheFirst` para JS/CSS hasheados y para las URLs firmadas de `product-photos` (con expiración 30 días).
3. **Registrar el SW sólo en producción**, nunca en el preview de Lovable (guardas de hostname `id-preview--`, `preview--`, `lovableproject.com`, `?sw=off`).
4. **Datos offline con IndexedDB** (`idb` package):
   - Tabla `products_cache` + `variants_cache` refrescada al abrir la app cuando hay red.
   - Tabla `pending_orders` para ventas creadas sin red.
5. **Cola de sincronización**:
   - Al confirmar una venta sin red, se guarda en `pending_orders` con un `local_id` (uuid) y estado `pending`.
   - Al recuperar conexión (`window.online` + intento periódico), un worker en el cliente envía las ventas una por una vía server function `syncOfflineOrder` (protegida con `requireSupabaseAuth`), que hace la inserción normal y devuelve el `order_id` real.
   - Manejo de conflictos: si la variante ya no tiene stock, la venta queda marcada `conflict` y aparece en un banner "Ventas por revisar" para que admin decida.
6. **Indicador visual**: chip en la topbar que muestra "En línea / Sin conexión / Sincronizando (N)".

**Ticket con QR offline**: el QR se genera localmente; el link público sólo abrirá cuando haya red, pero el ticket impreso/compartido en el momento ya lleva los datos.

---

## Detalles técnicos (para el equipo)

**Archivos nuevos**
- `src/lib/image-compress.ts` — resize a WebP 800px + thumb 200px con `canvas`.
- `src/lib/offline-db.ts` — wrapper de IndexedDB con `idb`.
- `src/lib/offline-sync.ts` — cola de ventas + listener `online`.
- `src/components/online-status.tsx` — chip de estado.
- `src/pwa/register-sw.ts` — registro guardado.
- `src/lib/orders.functions.ts` → agregar `syncOfflineOrder` con validación Zod.
- `public/manifest.webmanifest` + íconos 192/512/maskable.

**Archivos modificados**
- `src/lib/remove-bg.ts` — encadenar compresión al terminar.
- `src/routes/app.inventory.tsx` y `app.inventory.$productId.tsx` — usar `photo_thumb_url` en lista, subir ambos tamaños.
- `src/routes/app.sell.tsx` — leer productos desde IndexedDB si offline; escribir a cola si offline.
- `src/routes/__root.tsx` — link al manifest, meta theme-color, chip de estado.
- `vite.config.ts` — plugin PWA con las opciones anteriores.
- Migración: `alter table products add column photo_thumb_url text; alter table product_variants add column photo_thumb_url text;`

**Fuera de alcance ahora (para no bloquear)**
- Reprocesar fotos históricas (se pueden regenerar bajo demanda al abrir el producto).
- Offline para módulos administrativos.
- iOS push notifications.

---

## Preguntas de confirmación
1. ¿Confirmas que **venta offline** entra en el alcance (con posible revisión de conflictos), o prefieres que offline sea **sólo consulta** por ahora?
2. ¿Quieres que las fotos ya subidas se **regeneren automáticamente** la primera vez que se abran (más lento la primera vez, más ligero después), o dejamos las antiguas como están?
