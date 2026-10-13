-- Recordatorios de nómina ligados a la empleada:
-- cuando se crea su recibo de nómina, el recordatorio se marca solo como pagado
-- (con el monto real) y se crea el siguiente si se repite.
-- Idempotente: se puede correr más de una vez.

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

-- Siguiente fecha según cómo se repite (igual que en la app).
CREATE OR REPLACE FUNCTION public.next_reminder_date(p_due DATE, p_repeat TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_last INT;
BEGIN
  IF p_repeat = 'weekly' THEN
    RETURN p_due + 7;
  ELSIF p_repeat = 'monthly' THEN
    RETURN (p_due + INTERVAL '1 month')::date;
  ELSIF p_repeat = 'semimonthly' THEN
    v_last := EXTRACT(DAY FROM (date_trunc('month', p_due) + INTERVAL '1 month - 1 day'))::int;
    IF EXTRACT(DAY FROM p_due) < 15 THEN
      RETURN date_trunc('month', p_due)::date + 14;
    ELSIF EXTRACT(DAY FROM p_due) < v_last THEN
      RETURN (date_trunc('month', p_due) + INTERVAL '1 month - 1 day')::date;
    ELSE
      RETURN (date_trunc('month', p_due) + INTERVAL '1 month')::date + 14;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Al crear un recibo de nómina (no finiquito), cierra el recordatorio pendiente
-- más antiguo de esa empleada que vence dentro de los próximos 7 días (o ya venció).
CREATE OR REPLACE FUNCTION public.close_payroll_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reminders%ROWTYPE;
  v_next DATE;
BEGIN
  IF COALESCE(NEW.is_settlement, false) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r
  FROM public.reminders
  WHERE employee_id = NEW.employee_id
    AND kind = 'nomina'
    AND done_at IS NULL
    AND due_date <= (COALESCE(NEW.paid_at, now())::date + 7)
  ORDER BY due_date
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.reminders
  SET done_at = now(),
      amount = NEW.amount,
      note = 'Pagada con recibo de nómina'
  WHERE id = r.id;

  v_next := public.next_reminder_date(r.due_date, r.repeat);
  IF v_next IS NOT NULL THEN
    INSERT INTO public.reminders (title, kind, due_date, currency, repeat, employee_id, created_by)
    VALUES (r.title, r.kind, v_next, r.currency, r.repeat, r.employee_id, r.created_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_closes_reminder ON public.payroll_payments;
CREATE TRIGGER payroll_closes_reminder
  AFTER INSERT ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.close_payroll_reminder();
