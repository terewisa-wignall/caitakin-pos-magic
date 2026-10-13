-- Recordatorios que se repiten (nómina semanal, quincenal, renta mensual…)
-- y nuevo tipo "nomina". Al marcar uno repetido como hecho, la app crea el siguiente.
-- Idempotente: se puede correr más de una vez.

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS repeat TEXT;

ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_repeat_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_repeat_check CHECK (repeat IS NULL OR repeat IN ('weekly', 'semimonthly', 'monthly'));

ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_kind_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_kind_check CHECK (kind IN ('pago', 'permiso', 'documento', 'nomina'));
