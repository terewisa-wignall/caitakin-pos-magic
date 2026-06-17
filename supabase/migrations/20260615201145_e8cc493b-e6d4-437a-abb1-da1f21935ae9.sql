
-- Add new payroll frequencies
ALTER TYPE public.payroll_frequency ADD VALUE IF NOT EXISTS 'daily';
ALTER TYPE public.payroll_frequency ADD VALUE IF NOT EXISTS 'biweekly';

-- Extend employees with HR fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS nss text,
  ADD COLUMN IF NOT EXISTS curp text,
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ===== employment_contracts =====
CREATE TABLE IF NOT EXISTS public.employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type text NOT NULL DEFAULT 'indefinido',
  start_date date NOT NULL,
  end_date date,
  pay_schedule public.payroll_frequency NOT NULL DEFAULT 'monthly',
  base_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  currency text NOT NULL DEFAULT 'MXN',
  imss_enrolled boolean NOT NULL DEFAULT false,
  imss_employer_number text,
  infonavit_enrolled boolean NOT NULL DEFAULT false,
  infonavit_type text,
  infonavit_value numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_contracts TO authenticated;
GRANT ALL ON public.employment_contracts TO service_role;
ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contracts" ON public.employment_contracts
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_contracts_employee ON public.employment_contracts(employee_id);

-- ===== vacation_records =====
CREATE TABLE IF NOT EXISTS public.vacation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,2) NOT NULL CHECK (days >= 0),
  status text NOT NULL DEFAULT 'planned',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_records TO authenticated;
GRANT ALL ON public.vacation_records TO service_role;
ALTER TABLE public.vacation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vacations" ON public.vacation_records
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER vacations_updated_at BEFORE UPDATE ON public.vacation_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_vacations_employee ON public.vacation_records(employee_id);

-- ===== employee_loans =====
CREATE TABLE IF NOT EXISTS public.employee_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  principal numeric(12,2) NOT NULL CHECK (principal > 0),
  balance numeric(12,2) NOT NULL CHECK (balance >= 0),
  currency text NOT NULL DEFAULT 'MXN',
  mode text NOT NULL DEFAULT 'manual',
  installment_amount numeric(12,2),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mode IN ('auto','manual')),
  CHECK (status IN ('active','paid','cancelled'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_loans TO authenticated;
GRANT ALL ON public.employee_loans TO service_role;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage loans" ON public.employee_loans
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER loans_updated_at BEFORE UPDATE ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_loans_employee ON public.employee_loans(employee_id);

-- ===== Add deduction columns on payroll_payments BEFORE loan_payments references it =====
ALTER TABLE public.payroll_payments
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS imss_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infonavit_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_id uuid REFERENCES public.employee_loans(id) ON DELETE SET NULL;

-- ===== loan_payments =====
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual',
  payroll_payment_id uuid REFERENCES public.payroll_payments(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source IN ('manual','payroll'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_payments TO authenticated;
GRANT ALL ON public.loan_payments TO service_role;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage loan payments" ON public.loan_payments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON public.loan_payments(loan_id);

-- ===== employee_documents =====
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  note text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage employee docs" ON public.employee_documents
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_docs_employee ON public.employee_documents(employee_id);

-- ===== Vacation days by seniority (LFT México 2023) =====
CREATE OR REPLACE FUNCTION public.vacation_days_by_seniority(hire date)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  years int;
BEGIN
  IF hire IS NULL THEN RETURN 0; END IF;
  years := GREATEST(0, date_part('year', age(CURRENT_DATE, hire))::int);
  IF years < 1 THEN RETURN 0; END IF;
  IF years = 1 THEN RETURN 12; END IF;
  IF years = 2 THEN RETURN 14; END IF;
  IF years = 3 THEN RETURN 16; END IF;
  IF years = 4 THEN RETURN 18; END IF;
  IF years = 5 THEN RETURN 20; END IF;
  IF years <= 10 THEN RETURN 22; END IF;
  -- +2 every 5 additional years after year 10
  RETURN 22 + 2 * ((years - 6) / 5);
END;
$$;

-- ===== Trigger: when payroll has loan_deduction, register loan_payment and reduce balance =====
CREATE OR REPLACE FUNCTION public.apply_payroll_loan_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance numeric(12,2);
BEGIN
  IF NEW.loan_deduction IS NULL OR NEW.loan_deduction <= 0 OR NEW.loan_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT balance INTO current_balance FROM public.employee_loans WHERE id = NEW.loan_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Préstamo no encontrado';
  END IF;
  IF NEW.loan_deduction > current_balance THEN
    NEW.loan_deduction := current_balance;
  END IF;
  INSERT INTO public.loan_payments (loan_id, amount, paid_at, source, payroll_payment_id)
  VALUES (NEW.loan_id, NEW.loan_deduction, NEW.paid_at, 'payroll', NEW.id);
  UPDATE public.employee_loans
    SET balance = GREATEST(0, balance - NEW.loan_deduction),
        status = CASE WHEN balance - NEW.loan_deduction <= 0 THEN 'paid' ELSE status END
    WHERE id = NEW.loan_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_apply_loan_deduction ON public.payroll_payments;
CREATE TRIGGER payroll_apply_loan_deduction
  AFTER INSERT ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payroll_loan_deduction();

-- ===== Storage policies for employee-docs bucket (admin-only) =====
CREATE POLICY "Admins read employee docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-docs' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins insert employee docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-docs' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update employee docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-docs' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'employee-docs' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete employee docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-docs' AND public.is_admin(auth.uid()));
