# Auditoría general de CAsitakin POS

## Hallazgos principales

### 1. Errores de compilación TypeScript (bloquean build)

**`src/routes/app.suppliers.tsx`** — usa tablas que **no existen** en la base de datos: `suppliers`, `supplier_products`, `supplier_lists`. Toda la página está rota (12+ errores TS). Además el menú lateral la muestra a admins.

**`src/routes/app.sell.tsx`** (2 errores)
- Línea 361: pasa `Product | null` donde se espera `Product` — falta guard.
- Línea 366: `variantPickerFor` posiblemente `null`.

**`src/routes/app.payroll.tsx`** (2 errores)
- Línea 48: `string | undefined` pasado como `string` (probable `profile?.id` sin guard).
- Línea 63: `employee.data` posiblemente `null/undefined`.

**`src/routes/app.finance.tsx`** (1 error)
- Línea 519: acceso a `.amount` sobre `{}` (tipo inferido vacío en un reduce/map).

### 2. Base de datos / Seguridad

- 9 warnings del linter de Supabase (0029): funciones `SECURITY DEFINER` ejecutables por usuarios autenticados. Son en su mayoría **falsos positivos necesarios** (`has_role`, `is_admin`, `decrement_variant_stock`, `create_commission_for_order`, triggers). Documentar y silenciar las que sí lo son, revocar EXECUTE en las que no se llaman desde el cliente.
- Módulo Proveedores: decidir si **crear las tablas** (`suppliers`, `supplier_products`, `supplier_lists` + storage + RLS) o **eliminar la página** del menú y del árbol de rutas.

### 3. Estado del resto de la app

- Auth, inventario, ventas (fuera de los 2 bugs), caja, comisiones, dashboard, usuarios, settings: compilaron OK en la última pasada. No hay errores de runtime reportados en consola.

---

## Plan de reparación

### Paso 1 — Fix de TypeScript en rutas activas
- `app.sell.tsx`: añadir guards para `Product | null` y `variantPickerFor` antes de usarlos en el render del picker.
- `app.payroll.tsx`: guardar `if (!profile?.id) return null` antes del query; manejar `employee.data` con optional chaining + fallback.
- `app.finance.tsx`: tipar el acumulador del reduce (`{ amount: number }`) o extraer un tipo explícito.

### Paso 2 — Módulo Proveedores (necesito tu decisión, ver preguntas abajo)
Opción A: crear migración con las 3 tablas + bucket + RLS + GRANTs, y dejar la página funcional.
Opción B: quitar `app.suppliers.tsx` y el item "Proveedores" de `app-shell.tsx`.

### Paso 3 — Warnings de Supabase
- Revisar cada función `SECURITY DEFINER`:
  - Triggers (`handle_new_user`, `decrement_variant_stock`, `create_commission_for_order`, `prevent_profile_privilege_escalation`, `apply_payroll_loan_deduction`, `update_updated_at_column`): revocar EXECUTE a `authenticated`/`anon` (los triggers no necesitan permiso de llamada).
  - Helpers usados en RLS (`has_role`, `is_admin`, `is_active_seller_or_admin`, `cash_session_belongs_to_user`, `vacation_days_by_seniority`): mantener EXECUTE a `authenticated` y documentar en `@security-memory` que son intencionales.

### Paso 4 — Verificación
- `tsgo --noEmit` limpio (0 errores).
- `supabase--linter` con solo warnings documentados.
- Smoke test manual en preview: login, inventario, venta, caja, comisiones.

## Lo que NO voy a tocar
- Diseño visual, enum de roles, HR/Finanzas/Reportes más allá de los fixes TS listados, archivos autogenerados.

---

## Preguntas antes de implementar

1. **¿Qué hago con Proveedores?** Crear las tablas para que funcione, o eliminar el módulo del menú y del código.
2. **¿Reporto y arreglo, o solo reporto?** Puedo dejar solo el reporte para que decidas, o aplicar los fixes de Pasos 1, 3 (y 2 según tu respuesta) en una sola pasada.
