
ALTER TABLE public.payroll_payments
  ADD COLUMN IF NOT EXISTS days_worked numeric(8,2),
  ADD COLUMN IF NOT EXISTS daily_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS bonus_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS severance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_number text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id_file_path text,
  ADD COLUMN IF NOT EXISTS customer_id_file_name text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS voucher_file_path text,
  ADD COLUMN IF NOT EXISTS voucher_file_name text;
