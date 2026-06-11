# Plan — CAsitakin Dashboard / POS

Construyo el MVP completo en una sola entrega: frontend visual + Lovable Cloud (auth, base de datos, storage, RLS) + lógica de negocio (descuento de inventario, comisiones, tickets con QR público, envío WhatsApp/email).

## Stack y enfoque

- React 19 + TypeScript + Vite + TanStack Start v1 (ya configurado).
- Tailwind v4 + ShadCN UI, paleta artesanal definida como tokens en `src/styles.css`.
- Lovable Cloud (Supabase) para auth, Postgres, Storage y server functions.
- Mobile-first: bottom-nav en celular, sidebar lateral en desktop.
- Material Design como inspiración: cards redondeadas, sombras suaves, íconos Lucide, tipografía Inter/Roboto.

## Identidad visual

- **Logo**: genero PNG transparente — casita minimalista con detalle geométrico textil mexicano, en terracota + dorado + verde suave sobre fondo blanco.
- **Paleta de tokens** (oklch en `src/styles.css`):
  - background: blanco cálido `oklch(0.99 0.005 80)`
  - foreground: gris oscuro `oklch(0.25 0.01 250)`
  - primary: terracota `oklch(0.62 0.13 40)`
  - secondary: verde suave `oklch(0.72 0.08 145)`
  - accent: dorado artesanal `oklch(0.78 0.11 80)`
  - destructive, muted, border, ring estándar Material-style
- Tipografía: Inter (UI) + IBM Plex Sans (números/caja) cargadas vía `<link>` en `__root.tsx`.

## Esquema de base de datos (migraciones)

Tablas con RLS activo, GRANTs explícitos, FKs y triggers:

1. `profiles` (id=auth.users.id, name, email, commission_rate, is_active, created_at) + trigger `handle_new_user`.
2. `app_role` enum (`admin`, `seller`) + tabla `user_roles` + función `has_role(_user_id, _role)` SECURITY DEFINER.
3. `categories`.
4. `products` (name, description, category_id, photo_url, base_price_mxn/usd/eur, sku, is_active).
5. `product_variants` (product_id, variant_name, size, color, stock, price_override_*, sku, is_active). Stock por variante.
6. `customers` (opcional en venta).
7. `orders` (seller_id, customer_id, subtotal, discount, total, currency, exchange_rate_used, payment_status).
8. `order_items` (snapshots de nombre, variante y precio).
9. `payments` (method, currency, amount, exchange_rate_used). Soporta pago mixto = múltiples filas por orden.
10. `exchange_rates` (base, target, rate, created_by, is_active).
11. `cash_sessions` (opening/closing por moneda, status, opened/closed_by).
12. `cash_movements` (cash_session_id, type income|expense, concept, amount, currency, payment_method).
13. `commissions` (seller_id, order_id, rate, amount, currency) — populadas por trigger al insertar `orders`.
14. `tickets` (order_id, public_token UUID, qr_code_url, sent_by_email, sent_by_whatsapp).

**Políticas RLS clave:**
- Admin (`has_role(uid, 'admin')`): full CRUD en todo.
- Seller: SELECT productos/variantes activos; INSERT orders/order_items/payments/tickets propios; SELECT propios; SELECT sus comisiones.
- `tickets`: SELECT público por `public_token` para ruta `/t/$token`.

**Storage bucket** `product-photos` (público para lectura, escritura solo admin).

## Server functions y rutas

En `src/lib/`:
- `products.functions.ts` — CRUD productos y variantes (admin), listar activos (seller).
- `sales.functions.ts` — `createOrder`: valida stock, crea order + items + payments, descuenta variantes, inserta comisión, genera ticket con token y QR. Transaccional via RPC SQL.
- `cash.functions.ts` — abrir/cerrar caja, registrar movimientos, calcular esperado vs real.
- `reports.functions.ts` — agregaciones por fecha/vendedor/moneda.
- `exchange.functions.ts` — leer/actualizar tipo de cambio.

Rutas:
- `src/routes/auth.tsx` — login (email/password + Google).
- `src/routes/_authenticated/` — gate gestionado por la integración Lovable Cloud.
  - `index.tsx` → redirige según rol.
  - `dashboard.tsx`, `sell.tsx`, `inventory.tsx`, `inventory.$productId.tsx`, `cash.tsx`, `reports.tsx`, `commissions.tsx`, `settings.tsx`, `users.tsx`.
- `src/routes/t.$token.tsx` — **pública**, renderiza ticket leído por server fn pública con `supabaseAdmin` filtrando por token.

## Pantallas

- **Login**: email/password, botón Google, link "olvidé contraseña" (+ `/reset-password`).
- **Dashboard**: cards de ventas del día / mes, ingresos vs egresos, top vendedores, top productos, alertas de poco stock, comisiones generadas. Gráficas con Recharts.
- **Vender (POS)**: buscador, grid de productos con foto, modal de variantes, carrito lateral (drawer en mobile), descuento, selector de divisa, selector de método (con tabs para mixto), botón cobrar, modal de éxito con QR + botones "WhatsApp" y "Email".
- **Inventario**: lista con filtros por categoría + alerta poco stock; detalle de producto con foto, datos y tabla de variantes editables inline.
- **Caja**: estado actual, abrir/cerrar caja con montos por moneda, formulario rápido para ingreso/egreso, historial.
- **Reportes**: tabs (ventas, inventario, dinero, comisiones), filtros de fecha/vendedor/moneda, export CSV.
- **Comisiones**: vista admin (por vendedor) y vista vendedor (solo suyas).
- **Configuración**: tipos de cambio (form rápido), categorías CRUD, comisión por vendedor, datos del negocio.
- **Usuarios** (admin): listar, invitar, asignar rol, editar comisión.

## Layout y navegación

- `_authenticated/route.tsx` (gestionado por la integración) envuelve con `AppShell`.
- Desktop: sidebar fijo con logo + ítems. Mobile: bottom-nav 5 ítems (Inicio, Vender, Inventario, Caja, Perfil) + drawer para los demás.
- Header con: nombre del negocio, indicador de caja abierta, selector rápido de divisa para POS, avatar/menú.

## Ticket con QR

- Al cobrar, `createOrder` devuelve `{ orderId, ticketToken }`.
- QR generado client-side con `qrcode` apuntando a `https://<dominio>/t/<token>`.
- Botón WhatsApp: `https://wa.me/?text=...` con resumen + link.
- Botón Email: `mailto:` con cuerpo prellenado (envío real por proveedor queda para fase futura).
- Ruta `/t/$token` muestra ticket completo, imprimible.

## Reglas de negocio implementadas

- Trigger `before insert on order_items`: verifica stock suficiente, falla si no.
- Trigger `after insert on order_items`: descuenta `product_variants.stock`.
- Trigger `after insert on orders`: inserta fila en `commissions` usando `profiles.commission_rate` del seller.
- Productos con `is_active=false` no aparecen en POS.
- Tipo de cambio se snapshotea en `orders.exchange_rate_used` y en cada `payments.exchange_rate_used`.

## Orden de implementación

1. Activar Lovable Cloud.
2. Tokens de diseño + tipografía + logo generado.
3. Migración SQL completa (tablas, RLS, GRANTs, triggers, función has_role, bucket storage).
4. Layout `_authenticated` + sidebar/bottom-nav + página login.
5. Productos + inventario (CRUD admin, listado seller).
6. POS + flujo de venta + tickets con QR + ruta pública `/t/$token`.
7. Caja (apertura/cierre/movimientos).
8. Dashboard + reportes + comisiones.
9. Configuración (tipos de cambio, categorías, usuarios, comisiones).
10. Pase final de QA en preview mobile y desktop.

## Detalles técnicos relevantes

- Auth: email/password + Google vía broker `lovable.auth.signInWithOAuth("google", ...)`.
- Roles en tabla `user_roles` separada (nunca en `profiles`) con función `has_role` SECURITY DEFINER.
- Todas las server fns con datos sensibles usan `requireSupabaseAuth`; `createOrder` valida que `seller_id = context.userId` o que el caller sea admin.
- Ruta pública `/t/$token` usa server fn pública sin auth con `supabaseAdmin` (import dinámico dentro del handler), filtra por token y proyecta sólo columnas seguras del ticket.
- Validación con Zod en cada `.inputValidator()`.
- Imágenes de producto: subida a bucket `product-photos`, una sola por producto.

## Fuera del MVP (confirmado)

Terminal bancaria, facturación fiscal (CFDI), reconocimiento por foto, app nativa, multi-sucursal, contabilidad, marketplace, lealtad avanzada, envío real de email/SMS (los botones generan link `wa.me` y `mailto:` por ahora).

Cuando confirmes, paso a build mode y arranco por la activación de Lovable Cloud + tokens de diseño + logo.
