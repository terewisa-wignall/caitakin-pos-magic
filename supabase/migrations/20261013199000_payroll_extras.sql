-- Extras (suman) y descuentos (restan) libres en el recibo: [{type:'in'|'out', concept, amount, loan?}]
ALTER TABLE public.payroll_payments ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '[]'::jsonb;
