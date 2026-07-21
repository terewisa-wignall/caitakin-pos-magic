## Objetivo
La administradora no tiene nómina ni comisiones propias: esas dos secciones son donde revisa y gestiona los pagos del equipo. Hoy `/app/payroll` sólo muestra "Mi nómina" (y para admin dice "no vinculada"), y `/app/commissions` ya lista todas las filas para admin pero no le permite marcar pagos ni agrupar por vendedora.

## Cambios

### 1. `/app/payroll` — vista dual por rol
- **Vendedora**: vista actual sin cambios (su recibo, generar el suyo).
- **Admin**: nueva `AdminPayrollView` con:
  - Lista de empleadas activas (`employees`) con total pagado del mes y del año.
  - Al seleccionar una empleada, historial completo de `payroll_payments` con badge de quién lo generó.
  - Botón **Generar recibo** por empleada, reutilizando la lógica actual de `PayrollDialog` de `app.finance.tsx` extraída a un componente compartido `src/components/payroll-form-dialog.tsx` (sin cambiar el comportamiento en Finanzas).
  - **Editar** y **Borrar** en cada recibo (admin puede modificar los generados por vendedoras). Editar abre el diálogo precargado; borrar pide confirmación.
  - Filtros por mes y por estado (`pendiente` vs pagado).
- Cambiar la etiqueta del menú lateral de "Mi nómina" a **"Nómina"**.

### 2. `/app/commissions` — capacidades de admin
- Encabezado adaptativo ("Comisiones de todas las vendedoras" para admin).
- Nueva sub-pestaña **Por vendedora** (solo admin): agrupa el corte actual y los pendientes por vendedora, con total y:
  - **Marcar corte como pagado**: pone `paid_at = now()` y `payment_method` en todas sus comisiones pendientes del corte e inserta un registro en `commission_payments` (tabla ya existente) con el total y periodo.
  - **Generar recibo** por vendedora (usa el `printableReceipt` actual con el nombre correcto).
- Ocultar el botón "Generar recibo" propio cuando es admin.

### 3. Esquema y permisos
Sin migraciones nuevas de tablas. Antes de implementar se verifica que las políticas RLS de `payroll_payments` permitan a admin `UPDATE`/`DELETE` de recibos ajenos; si no, se agrega una migración mínima con dos políticas usando `public.is_admin(auth.uid())`. Idem para `commissions.paid_at` (admin ya debería poder actualizar).

## Archivos
- `src/routes/app.payroll.tsx` — rama admin.
- `src/components/payroll-form-dialog.tsx` — nuevo, compartido.
- `src/routes/app.finance.tsx` — reemplazar `PayrollDialog` local por el compartido.
- `src/routes/app.commissions.tsx` — sub-pestaña "Por vendedora" con acciones.
- `src/components/app-shell.tsx` — renombrar a "Nómina".
- Migración condicional sólo si RLS actual no cubre a admin.
