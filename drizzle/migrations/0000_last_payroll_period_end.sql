CREATE OR REPLACE FUNCTION public.last_payroll_period_end(_employee_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean;
  result date;
BEGIN
  SELECT public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = _employee_id AND e.profile_id = auth.uid()
      )
  INTO allowed;

  IF NOT allowed THEN
    RETURN NULL;
  END IF;

  SELECT max(period_end) INTO result
  FROM public.payroll_payments
  WHERE employee_id = _employee_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.last_payroll_period_end(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.last_payroll_period_end(uuid) TO authenticated;
