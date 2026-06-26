CREATE TABLE IF NOT EXISTS public.expense_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept TEXT NOT NULL,
  default_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_variable BOOLEAN NOT NULL DEFAULT false,
  currency TEXT NOT NULL DEFAULT 'MXN',
  type TEXT NOT NULL DEFAULT 'fixed',
  category TEXT,
  payment_method TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  due_day INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_templates_frequency_check CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly')),
  CONSTRAINT expense_templates_due_day_check CHECK (due_day BETWEEN 1 AND 31),
  CONSTRAINT expense_templates_type_check CHECK (type IN ('fixed', 'variable', 'unexpected'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_templates TO authenticated;
GRANT ALL ON public.expense_templates TO service_role;
ALTER TABLE public.expense_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage expense templates" ON public.expense_templates;
CREATE POLICY "Admins manage expense templates" ON public.expense_templates
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS expense_templates_updated_at ON public.expense_templates;
CREATE TRIGGER expense_templates_updated_at BEFORE UPDATE ON public.expense_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_expense_templates_active ON public.expense_templates(is_active, frequency);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES public.expense_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_template_date ON public.expenses(recurring_template_id, expense_date);
