-- Festivos trabajados (pago doble extra por ley) y días dobles en el recibo
ALTER TABLE public.payroll_payments ADD COLUMN IF NOT EXISTS holiday_days INTEGER NOT NULL DEFAULT 0 CHECK (holiday_days >= 0);
ALTER TABLE public.payroll_payments ADD COLUMN IF NOT EXISTS double_days NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (double_days >= 0);
