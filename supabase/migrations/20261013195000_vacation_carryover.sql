-- Días de vacaciones pendientes de años anteriores y nota de seguimiento, por empleada
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS vacation_carryover NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (vacation_carryover >= 0);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS vacation_note TEXT;
