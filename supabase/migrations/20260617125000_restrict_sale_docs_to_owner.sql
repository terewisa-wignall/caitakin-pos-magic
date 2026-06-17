-- Limit sale document access to the uploader, while keeping admin oversight.
-- Vouchers and customer IDs can contain sensitive customer/payment data.

DROP POLICY IF EXISTS "Sellers and admins read sale docs" ON storage.objects;
DROP POLICY IF EXISTS "Sellers upload sale docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete sale docs" ON storage.objects;
DROP POLICY IF EXISTS "active seller or admin upload sale docs" ON storage.objects;
DROP POLICY IF EXISTS "active seller or admin read sale docs" ON storage.objects;
DROP POLICY IF EXISTS "active seller or admin update sale docs" ON storage.objects;
DROP POLICY IF EXISTS "admin delete sale docs" ON storage.objects;
DROP POLICY IF EXISTS "sale docs upload by active owner" ON storage.objects;
DROP POLICY IF EXISTS "sale docs read by owner or admin" ON storage.objects;
DROP POLICY IF EXISTS "sale docs update by owner or admin" ON storage.objects;
DROP POLICY IF EXISTS "sale docs delete by admin" ON storage.objects;

CREATE POLICY "sale docs upload by active owner"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sale-docs'
    AND public.is_active_seller_or_admin(auth.uid())
    AND owner = auth.uid()
  );

CREATE POLICY "sale docs read by owner or admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sale-docs'
    AND (
      owner = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "sale docs update by owner or admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sale-docs'
    AND (
      owner = auth.uid()
      OR public.is_admin(auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'sale-docs'
    AND (
      owner = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "sale docs delete by admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sale-docs'
    AND public.is_admin(auth.uid())
  );
