ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id_file_path text,
  ADD COLUMN IF NOT EXISTS customer_id_file_name text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS voucher_file_path text,
  ADD COLUMN IF NOT EXISTS voucher_file_name text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('sale-docs', 'sale-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Sellers and admins read sale docs" ON storage.objects;
CREATE POLICY "Sellers and admins read sale docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sale-docs'
    AND (
      public.is_admin(auth.uid())
      OR owner = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sellers upload sale docs" ON storage.objects;
CREATE POLICY "Sellers upload sale docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sale-docs' AND owner = auth.uid());

DROP POLICY IF EXISTS "Admins delete sale docs" ON storage.objects;
CREATE POLICY "Admins delete sale docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sale-docs' AND public.is_admin(auth.uid()));
