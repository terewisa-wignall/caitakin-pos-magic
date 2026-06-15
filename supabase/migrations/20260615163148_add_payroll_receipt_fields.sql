ALTER TABLE public.payroll_payments
  ADD COLUMN IF NOT EXISTS days_worked numeric(6,2),
  ADD COLUMN IF NOT EXISTS daily_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS bonus_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS severance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_number text;
