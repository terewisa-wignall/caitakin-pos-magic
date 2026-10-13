-- Pagos patronales (SIPARE IMSS/Infonavit y 4% impuesto sobre nómina) con PDF de la contadora y comprobante
CREATE TABLE IF NOT EXISTS public.employer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('imss','nomina_4pct')),
  period DATE NOT NULL CHECK (period = date_trunc('month', period)::date),
  bimester TEXT,
  due_date DATE,
  patronal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (patronal >= 0),
  obrera NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (obrera >= 0),
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  reference TEXT,
  doc_path TEXT,
  paid_at DATE,
  receipt_path TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_payments TO authenticated;
GRANT ALL ON public.employer_payments TO service_role;
ALTER TABLE public.employer_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage employer payments" ON public.employer_payments;
CREATE POLICY "Admins manage employer payments" ON public.employer_payments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_employer_payments_period ON public.employer_payments (period);
