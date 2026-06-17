## Objetivo

Módulo solo-admin para llevar el expediente completo de cada vendedora: datos personales, contrato, IMSS/Infonavit, vacaciones, nómina (día/semana/quincena/mensual), préstamos/deudas y archivos (contrato, INE, comprobantes).

Se integra con lo que ya existe (`profiles`, `payroll_payments`, `commissions`) sin romperlo.

## Nueva sección en la app

Ruta `/app/hr` (Recursos Humanos), visible en el menú solo para admin. Mismo estilo Material/mobile-first que Finanzas.

**Pantallas:**

1. **Lista de vendedoras** — cards con foto/inicial, nombre, puesto, antigüedad, estado (activa / baja / vacaciones), saldo de préstamo pendiente. Filtros: activas, bajas, con préstamo, en vacaciones. Buscador por nombre.

2. **Detalle de vendedora** — pestañas:
   - **General**: nombre, teléfono, dirección, fecha de nacimiento, fecha de ingreso, fecha de baja, puesto, NSS, CURP, RFC, contacto de emergencia.
   - **Contratación**: tipo de contrato, fecha inicio/fin, esquema de pago (día / semana / quincena / mensual), monto base, comisión, alta IMSS sí/no, número patronal, Infonavit sí/no, % o monto Infonavit.
   - **Nómina**: historial de pagos (los que ya genera el módulo de nómina existente), botón "Registrar pago" con periodo, bruto, deducciones (IMSS, Infonavit, préstamo), neto. Resumen anual.
   - **Vacaciones**: días que le corresponden por antigüedad (cálculo automático LFT), días tomados, saldo. Botón "Registrar vacaciones" con rango de fechas y notas. Estado visual: disfrutando / próximas / disponibles.
   - **Préstamos y deudas**: lista con monto, fecha, saldo, modo (automático/manual). Al crear se elige: descuento automático (monto fijo cada nómina hasta saldar) o manual (admin registra abono). Vista de movimientos del préstamo.
   - **Documentos**: subir/ver contrato PDF, INE, comprobantes IMSS, comprobantes Infonavit, otros. Cada archivo con tipo, fecha y descarga. Storage privado.

3. **Resumen RRHH** (opcional, header del módulo): total vendedoras activas, vacaciones esta semana, préstamos por cobrar, próximos cumpleaños.

## Modelo de datos

Tablas nuevas en `public`, todas admin-only vía `is_admin(auth.uid())`, con GRANT a `authenticated` + `service_role`, RLS habilitado, triggers `updated_at`:

- **`employee_profiles`** (1-a-1 con `profiles.id`): phone, address, birth_date, hire_date, termination_date, position, nss, curp, rfc, emergency_contact_name, emergency_contact_phone, notes.
- **`employment_contracts`**: employee_id, contract_type (indefinido/temporal/honorarios), start_date, end_date, pay_schedule (daily/weekly/biweekly/monthly), base_amount, currency, imss_enrolled, imss_employer_number, infonavit_enrolled, infonavit_type (percent/fixed), infonavit_value, is_active.
- **`vacation_records`**: employee_id, start_date, end_date, days, status (planned/in_progress/taken/cancelled), notes.
- **`employee_loans`**: employee_id, principal, balance, currency, mode (auto/manual), installment_amount (si auto), start_date, status (active/paid/cancelled), notes.
- **`loan_payments`**: loan_id, amount, paid_at, source (payroll/manual), payroll_payment_id (FK opcional), notes.
- **`employee_documents`**: employee_id, doc_type (contract/ine/imss/infonavit/other), file_path, file_name, mime_type, size_bytes, uploaded_at.

**Reutilizamos** `payroll_payments` para el historial de nómina y le agregamos columnas opcionales: `gross_amount`, `imss_deduction`, `infonavit_deduction`, `loan_deduction`, `loan_id` (FK a `employee_loans`).

Cuando se registra un pago de nómina con `loan_deduction > 0`, un trigger inserta una fila en `loan_payments` y reduce `employee_loans.balance` (lo marca `paid` si llega a 0).

Para préstamos en modo `auto`, al abrir el formulario de nómina se precarga `loan_deduction = installment_amount` (mín entre cuota y balance).

## Storage

Bucket privado nuevo `employee-docs`. Policies en `storage.objects`: solo admin (`is_admin(auth.uid())`) puede SELECT/INSERT/UPDATE/DELETE objetos cuyo `bucket_id = 'employee-docs'`. Path por archivo: `{employee_id}/{doc_type}/{uuid}-{filename}`.

## Cálculo de vacaciones (LFT México)

Función SQL `public.vacation_days_by_seniority(hire_date date)` que devuelve los días anuales según la reforma 2023:
año 1 = 12, año 2 = 14, año 3 = 16, año 4 = 18, año 5 = 20, años 6-10 = 22, +2 cada 5 años adicionales. El detalle de vendedora muestra días que le tocan, tomados y saldo.

## Permisos

- Todo el módulo y todas las tablas/storage: solo `is_admin(auth.uid())`.
- No se expone nada a sellers, ni siquiera sus propios datos por ahora (puede agregarse luego).

## Archivos a crear/editar

- `supabase/migrations/<timestamp>_hr_module.sql`: 6 tablas nuevas + columnas en `payroll_payments` + función vacaciones + trigger de loan deduction + policies + bucket vía tool aparte.
- `src/routes/app.hr.tsx`: lista de vendedoras.
- `src/routes/app.hr.$employeeId.tsx`: detalle con tabs.
- `src/components/app-shell.tsx`: agregar item "RRHH" en el menú (solo admin).
- `src/integrations/supabase/types.ts`: se regenera tras la migración.

## Fuera de alcance

- Cálculo automático de IMSS/Infonavit con tablas oficiales (se registran como monto manual).
- Recibos de nómina timbrados / CFDI.
- Auto-pago a banco.
- Vista de vendedora sobre su propio expediente.
