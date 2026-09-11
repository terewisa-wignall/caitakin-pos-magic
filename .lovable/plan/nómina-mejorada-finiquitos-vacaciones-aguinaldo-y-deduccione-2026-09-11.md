# Nómina mejorada: finiquitos, vacaciones, aguinaldo y deducciones

Objetivo: que cada vendedora pueda generar su propia nómina o finiquito con cualquier periodo (7, 10, 15, 30 días o días sueltos), que el sistema haga todas las cuentas y muestre el total a pagar, y que ella **no vea historial** — solo el recibo del día y el saldo de su préstamo. El administrador sí ve y edita el historial completo de todas.

## 1. Calculadora de nómina (nuevo asistente)

Un solo formulario guiado, mismo para vendedora y administrador:

**Datos del periodo**
- Fecha inicio y fecha fin libres (el sistema cuenta los días naturales del rango).
- Botones rápidos opcionales: 7 / 10 / 15 / 30 días, que solo llenan la fecha fin.
- **Días trabajados**: ella marca los días que trabajó dentro del rango (útil para cubre-turnos que va 2 días por semana o cubre enfermedades). El total de días marcados es lo que se paga.
- Pago por día: se precarga del salario del empleado y es editable.

**Percepciones calculadas automáticamente (todas editables antes de guardar)**
- Sueldo = pago por día × días trabajados.
- Vacaciones: días según antigüedad (12, 14, 16, 18, 20, 22...) conforme a la reforma 2023, proporcionales si el periodo es parcial.
- Prima vacacional = 25% del importe de vacaciones.
- Aguinaldo = 15 días al año, proporcional a los días trabajados en el año.
- Bono / otras percepciones (manual).
- Indemnización / finiquito extra (manual).

**Deducciones**
- IMSS (monto o porcentaje).
- Infonavit: se toma del contrato del empleado (monto fijo o porcentaje) y se puede ajustar.
- Préstamo: muestra el saldo actual y propone el abono; se puede cambiar y nunca excede el saldo.
- Otras deducciones (manual, con concepto).

**Resultado**
- Resumen en vivo: total percepciones − total deducciones = **Total a pagar**.
- Al guardar: recibo imprimible con nombre completo, NSS, CURP, RFC, puesto, fecha de ingreso, periodo, desglose completo y total.

## 2. Modo finiquito

Un interruptor "Es finiquito / baja" dentro del mismo asistente:
- Pide fecha de baja y motivo.
- Calcula automáticamente: días pendientes del periodo, vacaciones no gozadas, prima vacacional, aguinaldo proporcional, y descuenta el saldo del préstamo completo.
- Marca al empleado como inactivo y cierra el préstamo al guardar (solo si el administrador lo confirma).

## 3. Datos del empleado para finiquito

En el perfil del empleado, un bloque "Datos para nómina y finiquito" con: nombre completo, NSS, CURP, RFC, fecha de ingreso, puesto, salario diario, tipo de contrato y esquema de Infonavit. La vendedora puede completar y corregir sus propios datos; los ve solo de ella misma.

## 4. Permisos (importante)

Administrador — acceso total, sin restricción de fecha:
- Ve el historial completo de nóminas, finiquitos, préstamos, pagos de préstamo, vacaciones y deducciones de **todas** las empleadas, de cualquier fecha.
- Puede crear, editar, corregir y borrar cualquier recibo, incluidos los que generó una vendedora.
- Ve totales por empleada, por periodo y por año, y reimprime cualquier recibo histórico.

Vendedora — solo lo suyo y solo del día:
- Entra cuando quiera a generar nómina, finiquito, préstamos y deducciones de ella misma.
- Ve el recibo que acaba de generar en el día en curso, más el saldo pendiente de su préstamo.
- **No** ve recibos de días anteriores, ni pagos pasados del préstamo, ni nada de otras compañeras.

## 5. Detalles técnicos

- Migración: nuevas columnas en `payroll_payments` — `vacation_days`, `vacation_amount`, `vacation_premium`, `christmas_bonus` (aguinaldo), `other_deductions`, `other_deductions_note`, `worked_dates jsonb`, `is_settlement bool`, `termination_reason`, `period_days`. Trigger existente de préstamo se conserva.
- RLS `payroll_payments`: política de lectura para vendedora limitada a `employee_id` propio **y** `created_at::date = current_date`; política separada de admin (`is_admin(auth.uid())`) con SELECT/INSERT/UPDATE/DELETE sin filtro de fecha. Misma división en `employee_loans`, `loan_payments` y `vacation_records`.
- Nueva función de cálculo en `src/lib/payroll-calc.ts` (pura, testeable): vacaciones por antigüedad proporcional, prima 25%, aguinaldo 15 días proporcional, totales y redondeos a 2 decimales.
- Refactor de `src/routes/app.payroll.tsx`: el diálogo actual se reemplaza por el asistente en pasos, reutilizado por la vista admin y la vista vendedora; la vista admin conserva el historial por empleada con filtros de año/mes; recibo imprimible ampliado con datos fiscales.
- Lectura del saldo de préstamo vía `employee_loans` con política que permita a la vendedora ver solo su saldo (no `loan_payments`).
- Mobile-first: pasos apilados, teclado numérico en importes, resumen fijo abajo con el total a pagar.
