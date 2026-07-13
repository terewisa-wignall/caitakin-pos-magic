
CREATE TABLE public.schedule_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  start_time time,
  end_time time,
  color text NOT NULL DEFAULT 'primary',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_shifts TO authenticated;
GRANT ALL ON public.schedule_shifts TO service_role;
ALTER TABLE public.schedule_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts read all active" ON public.schedule_shifts FOR SELECT TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()));
CREATE POLICY "shifts admin manage" ON public.schedule_shifts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_schedule_shifts_updated BEFORE UPDATE ON public.schedule_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  shift_id uuid NOT NULL REFERENCES public.schedule_shifts(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  label_override text,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_entries_date_idx ON public.schedule_entries(work_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_entries TO authenticated;
GRANT ALL ON public.schedule_entries TO service_role;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries read all active" ON public.schedule_entries FOR SELECT TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()));
CREATE POLICY "entries insert active" ON public.schedule_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_active_seller_or_admin(auth.uid()));
CREATE POLICY "entries update active" ON public.schedule_entries FOR UPDATE TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid())) WITH CHECK (public.is_active_seller_or_admin(auth.uid()));
CREATE POLICY "entries delete active" ON public.schedule_entries FOR DELETE TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()));
CREATE TRIGGER trg_schedule_entries_updated BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.schedule_shifts (code, label, start_time, end_time, color, sort_order) VALUES
  ('morning',   'Mañana',   '09:00', '15:45', 'secondary', 1),
  ('afternoon', 'Tarde',    '15:45', '22:30', 'primary',   2),
  ('off',       'Descanso', NULL,    NULL,    'muted',     3);
