-- Una empleada solo puede generar su recibo del periodo en curso:
-- el periodo debe haber empezado ya (no futuro) y no haber terminado hace más de 3 días.
-- La administradora puede generar recibos de cualquier periodo.
CREATE OR REPLACE FUNCTION public.payroll_period_is_current(_start date, _end date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT _start <= _end
    AND _start <= (now() AT TIME ZONE 'America/Mexico_City')::date
    AND _end >= (now() AT TIME ZONE 'America/Mexico_City')::date - 3
$$;

GRANT EXECUTE ON FUNCTION public.payroll_period_is_current(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_period_is_current(date, date) FROM anon, public;

DROP POLICY IF EXISTS "seller creates own payroll receipt" ON public.payroll_payments;
CREATE POLICY "seller creates own payroll receipt"
  ON public.payroll_payments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.payroll_period_is_current(period_start, period_end)
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = payroll_payments.employee_id
        AND e.profile_id = auth.uid()
        AND e.is_active = true
    )
  );

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
    AND public.payroll_period_is_current(period_start, period_end)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_payments.employee_id AND e.profile_id = auth.uid()
    )
  );
