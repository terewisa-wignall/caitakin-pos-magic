DROP POLICY IF EXISTS "seller read own employee record" ON public.employees;
CREATE POLICY "seller read own employee record"
  ON public.employees FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "seller read own payroll" ON public.payroll_payments;
CREATE POLICY "seller read own payroll"
  ON public.payroll_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = payroll_payments.employee_id
        AND e.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "seller creates own payroll receipt" ON public.payroll_payments;
CREATE POLICY "seller creates own payroll receipt"
  ON public.payroll_payments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = payroll_payments.employee_id
        AND e.profile_id = auth.uid()
        AND e.is_active = true
    )
  );
