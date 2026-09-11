ALTER TABLE public.payroll_payments
  ADD COLUMN IF NOT EXISTS vacation_days numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_premium numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS christmas_bonus numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions_note text,
  ADD COLUMN IF NOT EXISTS worked_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_settlement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS termination_reason text,
  ADD COLUMN IF NOT EXISTS period_days integer NOT NULL DEFAULT 0;

-- Vendedora: solo ve los recibos que generó hoy
DROP POLICY IF EXISTS "seller read own payroll" ON public.payroll_payments;
CREATE POLICY "seller read own payroll today" ON public.payroll_payments
  FOR SELECT TO authenticated
  USING (
    created_at::date = CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_payments.employee_id AND e.profile_id = auth.uid()
    )
  );

-- Vendedora: puede corregir el recibo que generó hoy
DROP POLICY IF EXISTS "seller update own payroll today" ON public.payroll_payments;
CREATE POLICY "seller update own payroll today" ON public.payroll_payments
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at::date = CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_payments.employee_id AND e.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_payments.employee_id AND e.profile_id = auth.uid()
    )
  );

-- Vendedora: ve el saldo de sus préstamos y puede registrar uno propio
DROP POLICY IF EXISTS "seller read own loans" ON public.employee_loans;
CREATE POLICY "seller read own loans" ON public.employee_loans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_loans.employee_id AND e.profile_id = auth.uid()
  ));

DROP POLICY IF EXISTS "seller create own loan" ON public.employee_loans;
CREATE POLICY "seller create own loan" ON public.employee_loans
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_loans.employee_id AND e.profile_id = auth.uid() AND e.is_active = true
  ));

-- Vendedora: puede actualizar sus datos personales, no los económicos
CREATE OR REPLACE FUNCTION public.protect_employee_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.profile_id := OLD.profile_id;
  NEW.salary := OLD.salary;
  NEW.frequency := OLD.frequency;
  NEW.is_active := OLD.is_active;
  NEW.position := OLD.position;
  NEW.hire_date := OLD.hire_date;
  NEW.termination_date := OLD.termination_date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_protect_sensitive ON public.employees;
CREATE TRIGGER employees_protect_sensitive
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.protect_employee_sensitive_fields();

DROP POLICY IF EXISTS "seller update own employee data" ON public.employees;
CREATE POLICY "seller update own employee data" ON public.employees
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.protect_employee_sensitive_fields() FROM anon;