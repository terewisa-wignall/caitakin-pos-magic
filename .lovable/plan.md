# Nómina más simple, recibo como imagen y carta de renuncia firmada

## 1. Sacar la nómina en 2 toques

El asistente actual pide demasiado. Cambia a esto:

- Al abrir, la app propone sola el **siguiente periodo consecutivo**: toma el último recibo de esa persona y empieza al día siguiente de donde terminó. Si el último fue del 5 al 10, el nuevo arranca el 11.
- La duración se toma de cómo se le paga (semanal = 7 días, quincenal = 15, mensual = mes, diario = 1). Botones de 7 / 10 / 15 / 30 quedan solo como ajuste.
- Encabezado grande: "Semana del 11 al 17 de septiembre", con flechas para ir al periodo anterior o al siguiente. Nunca se traslapa con un periodo ya pagado: si eliges fechas que se cruzan con otro recibo, avisa antes de guardar.
- Los días del periodo aparecen **ya marcados como trabajados**; solo se destildan los que no vino.
- El resto (vacaciones, aguinaldo, IMSS, Infonavit, préstamo, otras) se pliega en una sección "Ajustes (opcional)" cerrada por defecto. Abajo siempre el total a pagar y un solo botón "Guardar y descargar".

## 2. Recibo como imagen para WhatsApp

- Se quita el flujo de imprimir/PDF.
- El recibo se dibuja en pantalla en formato vertical de celular y se descarga como **imagen PNG** con el nombre de la persona y el periodo.
- Botón **Compartir por WhatsApp**: en celular abre WhatsApp con la imagen adjunta; si el teléfono no lo permite, guarda la imagen y abre el chat con el resumen escrito (nombre, periodo, días y total) para adjuntarla.
- El recibo lleva logo, nombre completo, puesto, seguro social, CURP, RFC, periodo, días trabajados, percepciones, deducciones y total.

## 3. Se quita el finiquito y la baja

- Desaparece el interruptor de finiquito y el motivo de baja del asistente. Los recibos ya guardados como finiquito se siguen viendo, pero ya no se crean nuevos.

## 4. Carta de renuncia firmada

Nueva sección dentro de Nómina:

- Se genera **una carta por persona cada fin de mes**. Si a la persona se le paga por semana, la carta corresponde a la **última semana del mes**.
- La empleada abre su nómina, ve la carta pendiente del mes y **firma con el dedo** en un cuadro de firma; se guarda con la fecha y la hora.
- La carta ya firmada se descarga como imagen y se puede compartir por WhatsApp igual que el recibo.
- La administradora ve la lista de cartas por mes: quién ya firmó y quién no, y puede descargar cualquiera.
- La empleada solo ve su carta del mes en curso; el historial completo lo ves tú.

## Detalles técnicos

- Nueva tabla `resignation_letters` (employee_id, period_year, period_month, period_start, period_end, body_snapshot, signature_data_url, signed_at, created_at) con GRANTs y RLS: la empleada solo lee/firma la suya del mes actual, admin lee/escribe todo. La firma se guarda como imagen PNG en base64.
- `payroll_payments`: se conserva el esquema; `is_settlement`/`termination_reason` quedan como histórico sin escribirse.
- Exportación de imagen con `html-to-image` (ya instalado, se usa en Horarios) → `toPng` sobre un nodo oculto de ancho fijo 720px; descarga vía enlace temporal.
- Compartir con `navigator.share({ files: [File] })` cuando existe, con respaldo a `https://wa.me/?text=` más descarga automática.
- El cálculo del siguiente periodo consecutivo vive en `src/lib/payroll-calc.ts` (`nextPeriod(lastEnd, frequency)`) y la detección de traslapes consulta los recibos previos de la empleada.
- Cambios en `src/components/payroll-wizard.tsx`, `src/routes/app.payroll.tsx`, más un nuevo `src/components/resignation-letter.tsx` y `src/lib/receipt-image.ts`.
