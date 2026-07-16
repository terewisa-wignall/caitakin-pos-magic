# Limpiar ventas de prueba y habilitar edición de ventas

## 1. Reset de datos de prueba
Borrar todo lo generado por las pruebas y devolver el stock:
- Regresar stock: por cada `order_items.variant_id`, sumar la `quantity` a `product_variants.stock`.
- Borrar `payments`, `commissions`, `tickets`, `order_items`, `shift_handoffs` (referencias a órdenes), y finalmente `orders`.
- Dejar intactos: productos, variantes (con stock restaurado), categorías, empleados, nómina, gastos, horarios, usuarias, cajas cerradas (se pueden dejar o limpiar — pregunto abajo).

## 2. Migración: fecha real de venta + auditoría + restauración de stock
- `orders`: nueva columna `sold_at timestamptz NOT NULL DEFAULT now()`. Todas las consultas y reportes actuales que agrupan por `created_at` pasan a usar `sold_at` (el `created_at` queda como marca de captura).
- Trigger `restore_variant_stock_on_delete`: al borrar un `order_items` con `variant_id`, sumar `quantity` de vuelta a la variante.
- Trigger `adjust_variant_stock_on_update`: si cambia `quantity` o `variant_id` de un `order_items`, ajustar stock (devolver el anterior, descontar el nuevo, validar suficiencia).
- Trigger `sync_commission_on_order_update`: si cambia `orders.total`, recalcular `commissions.commission_amount` (rate × total).
- Nueva tabla `order_audit_log` (id, order_id, action `create|update|delete`, changed_by, changed_at, diff jsonb, note text). RLS: INSERT permitido a la usuaria activa; SELECT sólo admin. GRANTs correctos.
- Triggers `AFTER INSERT/UPDATE/DELETE` en `orders` que escriben en `order_audit_log` con el diff y `auth.uid()`.
- Políticas RLS ampliadas: vendedora activa puede `UPDATE`/`DELETE` sus propias órdenes (`seller_id = auth.uid()`), admin cualquier orden. Igual para `order_items` y `payments` de esas órdenes.

## 3. UI — Registrar ventas de otros días
En `src/routes/app.sell.tsx`, agregar antes de cobrar un campo opcional **Fecha de la venta** (date + hora, default = ahora). Se envía a `orders.sold_at`. Si es distinto a hoy, mostrar aviso "Registrando venta atrasada del X".

## 4. UI — Editar/borrar ventas
Nueva ruta `src/routes/app.sales.tsx` (menú "Ventas") con:
- Lista de últimas 60 días de órdenes propias (vendedora) o de todas (admin), con filtros por fecha/vendedora.
- Cada renglón: fecha, vendedora, total, método(s), botones **Editar** y **Borrar**.
- **Editar**: diálogo para cambiar `sold_at`, cantidad de cada item, agregar/quitar items, cambiar método de pago; recalcula subtotal/total; pide **nota obligatoria** ("¿por qué se edita?") que se guarda en el audit log.
- **Borrar**: confirma, pide nota, borra la orden (los triggers restauran stock y borran comisiones/pagos en cascada), queda registro en audit log.
- Sub-tab **Historial de cambios** (admin) que lee `order_audit_log`.
- Enlace en bottom-nav móvil y sidebar.

## 5. Ticket público
No cambia; `t/$token` sigue funcionando. Si se borra la orden, el ticket devuelve "Venta cancelada".

## Archivos
- Migración nueva (schema + triggers + RLS + tabla audit).
- Insert masivo para reset (con restauración de stock previa).
- `src/routes/app.sell.tsx` (campo fecha).
- `src/routes/app.sales.tsx` (nuevo — lista/editar/borrar/historial).
- `src/routes/app.reports.tsx` y `src/routes/app.dashboard.tsx` (usar `sold_at`).
- `src/components/app-shell.tsx` (nuevo ítem "Ventas").
- `src/lib/tickets.functions.ts` (mensaje si la orden ya no existe).

## Pregunta rápida
1. Además de las ventas, ¿borro también las **cajas** (sesiones y movimientos) y los **cierres de turno** de prueba, o los dejo?
2. ¿Las vendedoras pueden editar/borrar ventas de **cualquier fecha** o sólo de los **últimos 7 días** (admin sin límite)?
