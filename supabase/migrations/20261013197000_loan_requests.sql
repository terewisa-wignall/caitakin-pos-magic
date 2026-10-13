-- Solicitudes de préstamo: la empleada pide, la administradora acepta o rechaza
ALTER TABLE public.employee_loans DROP CONSTRAINT IF EXISTS employee_loans_status_check;
ALTER TABLE public.employee_loans ADD CONSTRAINT employee_loans_status_check
  CHECK (status IN ('active','paid','cancelled','requested','rejected'));

-- La empleada solo puede crear solicitudes (sin saldo y en estado 'requested'), no préstamos ya activos
DROP POLICY IF EXISTS "seller create own loan" ON public.employee_loans;
DROP POLICY IF EXISTS "seller request own loan" ON public.employee_loans;
CREATE POLICY "seller request own loan" ON public.employee_loans
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'requested' AND balance = 0
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_loans.employee_id AND e.profile_id = auth.uid() AND e.is_active = true
    )
  );
