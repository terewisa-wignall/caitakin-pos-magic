# Auditoría y estabilización de CAsitakin POS

## Modelo confirmado
- **2 roles**: `admin` y `seller`. "Encargada", "vendedora" y "cubre turnos" son etiquetas internas pero todas operan como `seller`. No se cambia el enum.
- **Comisiones de seller**: ve **sus propias comisiones** + **total de ventas de la tienda** (sin desglose por persona).
- **Alcance**: auditoría + fixes críticos + mejoras mobile + refactors.

---

## 1. Auditoría (lectura, sin tocar código)

Recorro cada módulo verificando contra tus checklist:

- **Inventario** (`app.inventory.tsx`, `app.inventory.$productId.tsx`): creación simple / por tallas, edición y borrado de producto y variantes, orden de tallas (`getSizeSortValue` ya existe), foto cámara + galería, upload a `product-photos`.
- **Ventas** (`app.sell.tsx`): carrito, descuento de stock vía trigger `decrement_variant_stock`, generación de pagos, tickets.
- **Caja** (`app.cash.tsx`): apertura / cierre, movimientos, handoffs.
- **Usuarios** (`app.users.tsx`): crear, desactivar, cambiar rol — solo admin.
- **Auth** (`auth.tsx`, `use-auth.ts`): login usuario/clave (sin email), bloqueo de inactivos.
- **Configuración** (`app.settings.tsx`): CRUD de categorías por admin.
- **HR / Finanzas / Reportes**: revisión de errores TS y rutas, no se rediseñan.

Entrego un reporte corto con los hallazgos antes de aplicar cambios grandes (en chat, no en archivo).

---

## 2. Fixes técnicos (orden de ataque)

### 2.1 Base de datos / RLS
- Auditar políticas en `products`, `product_variants`, `categories`, `orders`, `order_items`, `payments`, `tickets`, `cash_sessions`, `cash_movements`, `shift_handoffs`, `commissions`. Confirmar que **todo seller activo** puede:
  - INSERT/UPDATE/DELETE en `products`, `product_variants`, `categories` (lo pediste explícitamente para inventario).
  - SELECT global de productos / variantes / categorías.
  - SELECT total de ventas del día (vista o policy específica para sellers).
  - SELECT solo de **sus** comisiones (`seller_id = auth.uid()`).
- Confirmar policies de storage `product-photos` (INSERT/SELECT para `authenticated`) y `employee-docs` (solo admin).
- Bloquear escritura de no-admin en `user_roles`, `profiles.is_active`, `profiles.commission_rate` (el trigger `prevent_profile_privilege_escalation` ya existe — verificar que cubre todos los campos).
- Si una policy depende de la sesión de caja abierta, dejarla.
- Migración única consolidando los GRANT/policy ajustes necesarios.

### 2.2 Errores de tipos / build
- Pasada de `tsc` (lo dispara el harness) y arreglo de cualquier residuo de los cambios recientes (HR, cash, sell).
- Eliminar `as any` y casts innecesarios donde rompan inferencia.
- Confirmar que `routeTree.gen.ts` no tiene desfases con archivos.

### 2.3 Bugs funcionales
- **Inventario**:
  - Confirmar que `getSizeSortValue` ordena correctamente sets mixtos (numérico, texto CH/M/G, rangos `0-3m`).
  - Editar variante: validar que `price_override_mxn` se guarda/limpia.
  - Borrar producto: cascada de variantes y foto en storage.
  - Subida de foto: aceptar HEIC del iPhone (validar mime, mostrar error claro si falla).
- **Ventas**:
  - Validar descuento de stock en variantes y rollback si falla el pago.
  - Mostrar mensaje claro cuando la caja está cerrada (no debería poder vender).
- **Caja**: cierre con totales correctos por método de pago y moneda.
- **Usuarios**: que la lista no muestre el email interno `@casitakin.local` — mostrar solo username derivado.
- **Comisiones (seller)**: vista que muestra `mis comisiones` + `ventas totales tienda hoy/mes`.

### 2.4 Mobile / responsive
- `app-shell` y nav: que el menú sea usable en 360-414px de ancho.
- Diálogos largos (Nuevo producto, Editar variante, Cobrar): `max-h-[90vh] overflow-y-auto` + botones sticky abajo donde aplique.
- Tablas largas (inventario, ventas, comisiones, HR): wrap a tarjetas en `< sm`.
- Inputs numéricos con `inputMode="decimal"`.
- Botones con texto largo: truncar o iconizar en mobile.

### 2.5 Refactors (puntuales, sin romper)
- Extraer helpers compartidos:
  - `lib/permissions.ts`: `canManageInventory`, `canManageUsers`, `canSeeAllCommissions`.
  - `lib/sizes.ts`: mover `QUICK_SIZE_SETS`, `getSizeSortValue`, `sortSizes` (hoy duplicados).
  - `lib/storage.ts`: helper `uploadProductPhoto(file)` y `uploadEmployeeDoc(file)`.
- Centralizar queries Supabase reusadas (productos, categorías, sesión de caja) en hooks `useProducts`, `useCategories`, `useOpenCashSession`.
- Quitar imports muertos y `console.log` residuales.

---

## 3. Entregables

- 1 migración SQL consolidada (policies + GRANTs faltantes).
- Cambios de código por módulo, manteniendo el diseño actual.
- Reporte corto en chat con: lo que estaba bien, lo arreglado, lo que sugiero para una segunda iteración (ej. tests, separar manager/cubre-turnos si en el futuro cambia de opinión).

## 4. Lo que NO voy a hacer
- No cambio el enum de roles (te quedas con admin/seller).
- No reescribo HR, Finanzas ni Reportes; solo arreglo errores y mobile.
- No toco `src/integrations/supabase/*` autogenerado.
- No agrego features nuevas; solo estabilizo lo existente.

## 5. Riesgos
- Cambios de RLS pueden ocultar/mostrar datos diferente; reviso después con queries de prueba.
- Refactors de helpers pueden tocar muchos archivos a la vez; los hago en commits lógicos pequeños.

¿Apruebas para implementar?
