# Horarios semanales (nueva sección)

Nueva ruta `/app/schedule` visible para admin y vendedoras desde la navegación.

## Vista principal
- Calendario semanal tipo Google Calendar: 7 columnas (Lun-Dom) con fecha del día arriba.
- Bloques de color por turno: **Mañana** (verde suave), **Tarde** (terracota), **Descanso** (gris/dorado) — paleta actual.
- Cada bloque muestra el nombre de la empleada y hora (ej. "Mirna · 9AM-2PM"). Se pueden apilar varias empleadas en el mismo turno/día.
- Header con: semana actual (rango de fechas), flechas ← →, botón "Hoy", selector de semana, botón "Descargar imagen" y botón "Copiar semana".

## Turnos fijos (editables en Configuración)
Tres turnos base guardados en tabla `schedule_shifts`:
- Mañana · 09:00-15:45
- Tarde · 15:45-22:30
- Descanso · (sin hora)

Admin puede renombrarlos y cambiar horas desde `/app/settings` (sección nueva "Turnos"). Vendedoras los usan como están.

## Editar (todas las profiles)
- Click en una celda vacía → mini popover: elegir empleada + turno + hora opcional (para variantes tipo "9AM-2PM"). Guardar.
- Click en un bloque existente → editar hora / cambiar empleada / cambiar turno / eliminar.
- Long-press o botón "×" para borrar rápido.
- Selección múltiple: shift-click para borrar varios a la vez, con botón "Borrar seleccionados".
- Todo con guardado optimista (aparece al instante, se sincroniza en segundo plano).

## Copiar / pegar / limpiar
Menú "Copiar semana":
- **Copiar de** → elegir semana origen (semana anterior por defecto).
- **Pegar en** → semana actual u otra que elijas.
- Opción: reemplazar todo o sólo agregar donde esté vacío.
- Botón **Limpiar semana** con confirmación.

## Descargar como imagen (para WhatsApp)
Botón "Descargar imagen":
- Renderiza la semana visible a PNG usando `html-to-image` (ligero, funciona en móvil).
- Formato vertical apto WhatsApp, con logo CAsitakin arriba y rango de fechas.
- Se descarga como `horario-2026-07-13.png`; en móvil abre el share sheet nativo si está disponible.

## Datos (Lovable Cloud)

Migración nueva:

```text
schedule_shifts
  code (text, unique)  -- 'morning' | 'afternoon' | 'off'
  label (text)         -- 'Mañana', 'Tarde', 'Descanso'
  start_time, end_time (time, nullable)
  color (text)         -- token de color
  sort_order (int)

schedule_entries
  work_date (date)
  shift_id (fk schedule_shifts)
  employee_id (fk employees)  -- puede ser null si es texto libre
  label_override (text, nullable)  -- ej. '9AM-2PM' cuando cambia la hora
  note (text, nullable)
  created_by (fk profiles)
  unique(work_date, shift_id, employee_id)
```

RLS: SELECT/INSERT/UPDATE/DELETE para cualquier usuario activo (admin o vendedora activa) usando `is_active_seller_or_admin(auth.uid())`. Grants a `authenticated` y `service_role`.

Seed inicial de los 3 turnos con horarios de la foto.

## Archivos que se crean o cambian
- Migración con las dos tablas + seed de turnos + RLS/grants.
- `src/routes/app.schedule.tsx` — vista calendario, edición, copia, descarga PNG.
- `src/components/schedule-cell.tsx` — celda editable con popover.
- `src/components/app-shell.tsx` — nuevo ítem "Horarios" en nav (bottom mobile + sidebar desktop).
- `src/routes/app.settings.tsx` — bloque para editar los 3 turnos (solo admin).
- `bun add html-to-image` para exportar PNG.

## Fuera de alcance
- No se toca nómina ni asistencias reales (los horarios son sólo planeación visual).
- No hay notificaciones ni recordatorios automáticos por ahora.
- No hay vista mensual, sólo semanal (con navegación entre semanas).
