-- Aportaciones patronales mensuales (SIPARE): IMSS e Infonavit que paga el negocio
CREATE TABLE IF NOT EXISTS public.employer_contributions (
  month DATE PRIMARY KEY CHECK (month = date_trunc('month', month)::date),
  imss_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (imss_total >= 0),
  infonavit_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (infonavit_total >= 0),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_contributions TO authenticated;
GRANT ALL ON public.employer_contributions TO service_role;
ALTER TABLE public.employer_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage employer contributions" ON public.employer_contributions;
CREATE POLICY "Admins manage employer contributions" ON public.employer_contributions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
