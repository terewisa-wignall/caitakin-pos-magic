# Nómina más simple y recibo como imagen para WhatsApp

## 1. Sacar la nómina en 2 toques

El asistente actual pide demasiado. Cambia a esto:

- Al abrir, la app propone sola el **siguiente periodo consecutivo**: toma el último recibo de esa persona y empieza al día siguiente de donde terminó. Si el último fue del 5 al 10, el nuevo arranca el 11.
- La duración se toma de cómo se le paga (semanal = 7 días, quincenal = 15, mensual = mes, diario = 1). Los botones de 7 / 10 / 15 / 30 quedan solo como ajuste.
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
- La carta de renuncia queda fuera por ahora, como lo pediste.

## Detalles técnicos

- Sin cambios de base de datos. `payroll_payments` conserva su esquema; `is_settlement`/`termination_reason` quedan como histórico sin escribirse.
- Exportación de imagen con `html-to-image` (ya instalado, se usa en Horarios) → `toPng` sobre un nodo de ancho fijo 720px; descarga vía enlace temporal.
- Compartir con `navigator.share({ files: [File] })` cuando existe, con respaldo a `https://wa.me/?text=` más descarga automática.
- El cálculo del siguiente periodo consecutivo vive en `src/lib/payroll-calc.ts` (`nextPeriod(lastEnd, frequency)`) y la detección de traslapes consulta los recibos previos de la empleada.
- Cambios en `src/components/payroll-wizard.tsx`, `src/routes/app.payroll.tsx` y un nuevo `src/lib/receipt-image.ts`.
