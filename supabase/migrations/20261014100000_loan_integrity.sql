-- Préstamos: el saldo debe cuadrar siempre con los abonos.
-- Solo afecta recibos/abonos nuevos o editados de ahora en adelante; no reescribe el pasado.
--  1) Un recibo solo puede abonar a un préstamo de SU empleada.
--  2) Editar o borrar un recibo con abono devuelve/ajusta el saldo.
--  3) Abono manual en una sola operación (RPC), sin pasar del saldo.

-- 1) Aplicar abono desde nómina (ahora valida dueño del préstamo y no pasa del saldo)
CREATE OR REPLACE FUNCTION public.apply_payroll_loan_deduction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  loan_owner uuid;
  current_balance numeric(12,2);
  applied numeric(12,2);
BEGIN
  IF NEW.loan_deduction IS NULL OR NEW.loan_deduction <= 0 OR NEW.loan_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT employee_id, balance INTO loan_owner, current_balance
    FROM public.employee_loans WHERE id = NEW.loan_id FOR UPDATE;
  IF loan_owner IS NULL THEN
    RAISE EXCEPTION 'Préstamo no encontrado';
  END IF;
  IF loan_owner <> NEW.employee_id THEN
    RAISE EXCEPTION 'El préstamo no pertenece a esta empleada';
  END IF;
  applied := LEAST(NEW.loan_deduction, current_balance);
  IF applied <= 0 THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.loan_payments (loan_id, amount, paid_at, source, payroll_payment_id)
  VALUES (NEW.loan_id, applied, NEW.paid_at, 'payroll', NEW.id);
  UPDATE public.employee_loans
    SET balance = GREATEST(0, balance - applied),
        status = CASE WHEN balance - applied <= 0 THEN 'paid' ELSE status END
    WHERE id = NEW.loan_id;
  RETURN NEW;
END;
$$;

-- 2) Devolver al saldo lo que un recibo había abonado (al borrar o antes de re-aplicar al editar)
CREATE OR REPLACE FUNCTION public.reverse_payroll_loan_deduction(_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, loan_id, amount FROM public.loan_payments
    WHERE payroll_payment_id = _payment_id AND source = 'payroll'
  LOOP
    UPDATE public.employee_loans
      SET balance = LEAST(principal, balance + r.amount),
          status = CASE WHEN status = 'paid' THEN 'active' ELSE status END
      WHERE id = r.loan_id;
    DELETE FROM public.loan_payments WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_loan_on_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.reverse_payroll_loan_deduction(OLD.id);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_loan_on_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.loan_deduction IS DISTINCT FROM OLD.loan_deduction
     OR NEW.loan_id IS DISTINCT FROM OLD.loan_id THEN
    PERFORM public.reverse_payroll_loan_deduction(OLD.id);
    PERFORM public.apply_payroll_loan_deduction_for(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Re-aplicar un recibo ya existente (usado al editar)
CREATE OR REPLACE FUNCTION public.apply_payroll_loan_deduction_for(_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.payroll_payments%ROWTYPE;
  loan_owner uuid;
  current_balance numeric(12,2);
  applied numeric(12,2);
BEGIN
  SELECT * INTO p FROM public.payroll_payments WHERE id = _payment_id;
  IF p.id IS NULL OR p.loan_deduction IS NULL OR p.loan_deduction <= 0 OR p.loan_id IS NULL THEN
    RETURN;
  END IF;
  SELECT employee_id, balance INTO loan_owner, current_balance
    FROM public.employee_loans WHERE id = p.loan_id FOR UPDATE;
  IF loan_owner IS NULL THEN RAISE EXCEPTION 'Préstamo no encontrado'; END IF;
  IF loan_owner <> p.employee_id THEN
    RAISE EXCEPTION 'El préstamo no pertenece a esta empleada';
  END IF;
  applied := LEAST(p.loan_deduction, current_balance);
  IF applied <= 0 THEN RETURN; END IF;
  INSERT INTO public.loan_payments (loan_id, amount, paid_at, source, payroll_payment_id)
  VALUES (p.loan_id, applied, p.paid_at, 'payroll', p.id);
  UPDATE public.employee_loans
    SET balance = GREATEST(0, balance - applied),
        status = CASE WHEN balance - applied <= 0 THEN 'paid' ELSE status END
    WHERE id = p.loan_id;
END;
$$;

DROP TRIGGER IF EXISTS payroll_loan_before_delete ON public.payroll_payments;
CREATE TRIGGER payroll_loan_before_delete
  BEFORE DELETE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.payroll_loan_on_delete();

DROP TRIGGER IF EXISTS payroll_loan_after_update ON public.payroll_payments;
CREATE TRIGGER payroll_loan_after_update
  AFTER UPDATE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.payroll_loan_on_update();

-- 3) Abono manual atómico: solo admin, no pasa del saldo
CREATE OR REPLACE FUNCTION public.register_loan_payment(
  _loan_id uuid, _amount numeric, _paid_at date, _note text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_balance numeric(12,2);
  applied numeric(12,2);
  new_balance numeric(12,2);
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo una administradora puede registrar abonos';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  SELECT balance INTO current_balance FROM public.employee_loans WHERE id = _loan_id FOR UPDATE;
  IF current_balance IS NULL THEN RAISE EXCEPTION 'Préstamo no encontrado'; END IF;
  applied := LEAST(_amount, current_balance);
  IF applied <= 0 THEN RAISE EXCEPTION 'El préstamo ya está pagado'; END IF;
  INSERT INTO public.loan_payments (loan_id, amount, paid_at, source, note)
  VALUES (_loan_id, applied, COALESCE(_paid_at, CURRENT_DATE), 'manual', _note);
  new_balance := current_balance - applied;
  UPDATE public.employee_loans
    SET balance = new_balance,
        status = CASE WHEN new_balance <= 0 THEN 'paid' ELSE 'active' END
    WHERE id = _loan_id;
  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.register_loan_payment(uuid, numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_loan_payment(uuid, numeric, date, text) TO authenticated;

-- Funciones internas: nadie puede llamarlas directo desde la app
REVOKE ALL ON FUNCTION public.reverse_payroll_loan_deduction(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payroll_loan_deduction_for(uuid) FROM PUBLIC, anon, authenticated;
