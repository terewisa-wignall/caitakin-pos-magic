## Cambios solicitados

### 1) Finiquito y bono en "Mi nómina"
En `src/routes/app.payroll.tsx` (diálogo `PayrollSelfDialog`) hoy sólo se capturan días trabajados y una nota. Agrego:
- Campo **Bono** (opcional).
- Campo **Finiquito** (opcional).
- Total: `neto = sueldoBase + bono + finiquito`, guardando `bonus_amount` y `severance_amount` en `payroll_payments` (columnas ya existen y el recibo ya las imprime).

### 2) Admin ve y edita todas las nóminas
Hoy `app.payroll.tsx` es "mi nómina" (una vendedora ve sólo la suya) y `app.finance.tsx` tiene la vista admin pero sin edición de recibos ya creados.

- **RLS**: revisar policies actuales de `payroll_payments` y asegurar que admin tenga `SELECT` y `UPDATE` sobre **todos** los recibos; la vendedora sólo sobre los propios (creados por ella o vinculados a su `employee_id`). Migración sólo si faltan.
- En `app.finance.tsx` (sección Nómina), la lista de recibos actual gana un botón **Editar** visible sólo para admin, que abre un diálogo con los mismos campos (días, sueldo/día, bono, finiquito, deducciones, nota, fecha de pago, método) y guarda con `update` a `payroll_payments`.
- En `app.payroll.tsx`, el admin (cuando entra a esta vista) verá también un botón **Editar** en cada recibo listado; la vendedora sigue viendo sólo botón "PDF".

### 3) Cobro más rápido en Venta
En `src/routes/app.sell.tsx`, cuando el pago **no** es mixto:
- **Tarjeta débito / crédito / transferencia** → forzar moneda **MXN**, ocultar selector de divisa y **no pedir monto** (se asume el total del carrito).
- **Efectivo** → conservar selector de divisa (MXN/USD/EUR) y autollenar el monto con el total convertido, editable para el caso de "pagó de más y hay cambio".
- Modo **mixto** queda igual (cada método captura su monto).
- Comprobante y banco de tarjeta se conservan como están.

### 4) Móvil: legibilidad y velocidad
En pantallas de uso diario (venta, inventario, caja, mi nómina) sin rediseñar:
- Botones principales `h-12`, inputs numéricos con `inputMode="decimal"` y `text-lg`.
- Cabeceras con el patrón responsive de grid + `min-w-0` + `truncate` para no cortar títulos.
- Tarjetas de producto en Venta más grandes con thumbnail (`photo_thumb_url` ya disponible) y precio prominente.
- Carga optimista desde IndexedDB en la primera pintura del buscador de venta para que aparezca instantáneo aunque la red esté lenta.
- Verificar `loading="lazy"` + `decoding="async"` + `width/height` en la grilla de venta (ya se hizo en inventario).

### Archivos que cambian
- `src/routes/app.payroll.tsx` — inputs de bono/finiquito, y modo edición para admin.
- `src/routes/app.finance.tsx` — botón/diálogo de edición de recibos para admin.
- `src/routes/app.sell.tsx` — flujo simplificado de método único, autollenado del monto, ocultar divisa cuando no aplica, tarjetas más grandes, precarga desde IDB.
- Ajustes menores en `src/components/app-shell.tsx` si el header pisa contenido en móvil.
- Migración RLS de `payroll_payments` **sólo si** la revisión muestra que admin no puede editar todos los recibos (se plantea como migración aparte con aprobación).

### Fuera de alcance
- No cambio otras tablas ni módulos (Finanzas, RRHH, Reportes intactos salvo el bloque de nómina).
- No toco paleta ni logo.

### Preguntas
1. Para **efectivo en USD/EUR**, ¿autollenar el monto convertido al total o dejarlo vacío como hoy?
2. En **tarjeta**, ¿el comprobante (foto del voucher) sigue obligatorio o lo hago opcional para acelerar el cobro?
