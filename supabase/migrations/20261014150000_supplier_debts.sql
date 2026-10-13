-- Deudas con proveedores y sus abonos (como los préstamos a empleados).
-- Saldo = monto de la deuda − suma de abonos. Solo administradores.
-- Idempotente: se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.supplier_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Fecha en que hay que pagarla (opcional).
ALTER TABLE public.supplier_debts ADD COLUMN IF NOT EXISTS due_on DATE;
CREATE INDEX IF NOT EXISTS supplier_debts_supplier_idx ON public.supplier_debts(supplier_id, incurred_on);

CREATE TABLE IF NOT EXISTS public.supplier_debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES public.supplier_debts(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_debt_payments_debt_idx ON public.supplier_debt_payments(debt_id, paid_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_debts, public.supplier_debt_payments TO authenticated;
GRANT ALL ON public.supplier_debts, public.supplier_debt_payments TO service_role;
ALTER TABLE public.supplier_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_debt_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manages supplier_debts" ON public.supplier_debts;
CREATE POLICY "admin manages supplier_debts" ON public.supplier_debts
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manages supplier_debt_payments" ON public.supplier_debt_payments;
CREATE POLICY "admin manages supplier_debt_payments" ON public.supplier_debt_payments
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Un abono no puede dejar el saldo en negativo.
CREATE OR REPLACE FUNCTION public.check_supplier_debt_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC;
  v_paid NUMERIC;
BEGIN
  SELECT amount INTO v_amount FROM public.supplier_debts WHERE id = NEW.debt_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.supplier_debt_payments
  WHERE debt_id = NEW.debt_id AND id IS DISTINCT FROM NEW.id;
  IF v_paid + NEW.amount > v_amount + 0.005 THEN
    RAISE EXCEPTION 'El abono excede el saldo pendiente (%).', v_amount - v_paid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_debt_payment_check ON public.supplier_debt_payments;
CREATE TRIGGER supplier_debt_payment_check
  BEFORE INSERT OR UPDATE ON public.supplier_debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.check_supplier_debt_payment();
