-- Recordatorios: permisos, documentos y pagos importantes con fecha límite
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'pago' CHECK (kind IN ('pago','permiso','documento')),
  due_date DATE NOT NULL,
  amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'MXN',
  note TEXT,
  done_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage reminders" ON public.reminders;
CREATE POLICY "Admins manage reminders" ON public.reminders FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_reminders_due ON public.reminders (due_date) WHERE done_at IS NULL;
