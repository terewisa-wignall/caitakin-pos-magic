## Módulo "Finanzas" (solo admin)

Nueva sección que vive en paralelo a Caja. Caja sigue siendo el operativo del día. Finanzas es la vista del negocio: consolida automáticamente las ventas y movimientos de caja, y suma los registros nuevos (gastos fijos, variables, imprevistos, nómina, comisiones pagadas).

### Navegación
Nuevo ítem "Finanzas" en el menú lateral (solo visible para admin), con sub-secciones internas por tabs:
- Resumen · Ingresos · Gastos · Nómina · Comisiones · Cierres

Mismo lenguaje visual actual (cards, íconos lucide, paleta intacta, mobile-first).

---

### 1. Resumen (pantalla principal)
Cards arriba con filtro de mes (selector simple "Junio 2026 ▾"):
- Ingresos del mes (ventas + ingresos de caja)
- Gastos del mes (fijos + variables + imprevistos)
- Nómina pagada
- Comisiones pagadas
- **Utilidad del mes** (ingresos − gastos − nómina − comisiones), verde/rojo
- Mini gráfica de barras: utilidad mes a mes del año en curso

### 2. Ingresos
Lista consolidada (solo lectura, viene de ventas y de `cash_movements` tipo income). Filtros: mes, origen (venta / caja / otro). Permite registrar "Otro ingreso" manual (renta cobrada, devolución de proveedor, etc.).

### 3. Gastos
Una sola pantalla con chips para filtrar por tipo: **Fijo · Variable · Imprevisto**. Botón "+ Nuevo gasto" abre formulario corto:
- Concepto, monto, moneda, tipo (fijo/variable/imprevisto), categoría libre (renta, luz, papelería…), fecha, método de pago, nota, comprobante (foto opcional al bucket existente).
- Los fijos tienen toggle "Recurrente mensual" → se sugieren automáticamente cada mes en el resumen ("Pendiente: Renta $X").

### 4. Nómina
Dos partes:
- **Empleados**: alta sencilla (nombre, puesto, sueldo, periodicidad: semanal o mensual, activo). Independiente de los usuarios del sistema (no todos los empleados usan la app).
- **Pagos de nómina**: botón "Registrar pago" → elige empleado, periodo (semana del…/mes de…), monto (pre-llenado con su sueldo, editable), fecha de pago, nota. Queda como gasto en el mes correspondiente.

### 5. Comisiones pagadas
Lista las comisiones existentes (tabla `commissions`) con estado pendiente/pagada. Botón "Marcar como pagada" en lote para el corte del **5** y **20** de cada mes (selector rápido "Corte 5 jun" / "Corte 20 jun" que filtra las pendientes hasta esa fecha). Al pagar se guarda fecha y método.

### 6. Cierres mensuales y vista anual
- Botón "Cerrar mes" genera snapshot del mes (totales por categoría + utilidad). No bloquea edición, no traspasa saldo: cada mes queda independiente.
- Pantalla "Año 2026" con tabla de 12 meses + gráfica: ingresos, gastos, utilidad y un total anual al pie.
- Cada mes cerrado se puede exportar/imprimir como reporte simple.

---

### Cambios técnicos (resumen)

**Base de datos (nuevas tablas, todas RLS solo admin lee/escribe, vendedores no ven nada):**
- `expenses` (concepto, monto, moneda, tipo enum fijo/variable/imprevisto, categoría, fecha, método, nota, comprobante_url, recurrente, created_by)
- `employees` (nombre, puesto, sueldo, periodicidad enum weekly/monthly, activo)
- `payroll_payments` (empleado_id, periodo_inicio, periodo_fin, monto, fecha_pago, nota)
- `other_incomes` (concepto, monto, moneda, fecha, nota) — ingresos manuales no-venta
- `commission_payments` (commission_ids[], monto_total, fecha, método, corte_label) + columna `paid_at` en `commissions`
- `monthly_closings` (año, mes, snapshot jsonb, closed_at, closed_by)

**Rutas nuevas:**
- `src/routes/app.finance.tsx` (layout con tabs)
- `app.finance.index.tsx` (Resumen), `app.finance.income.tsx`, `app.finance.expenses.tsx`, `app.finance.payroll.tsx`, `app.finance.commissions.tsx`, `app.finance.closings.tsx`

**Componentes:**
- `month-picker.tsx`, `expense-form.tsx`, `employee-form.tsx`, `payroll-form.tsx`, `finance-summary-cards.tsx`

**Editado:** `app-shell.tsx` (ítem de menú admin), `app.commissions.tsx` (link a Finanzas).

Sin cambios a Caja, Inventario ni Ventas. Paleta y logo intactos.

¿Apruebas para empezar por la migración de base de datos?
