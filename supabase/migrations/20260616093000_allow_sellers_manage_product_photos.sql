DROP POLICY IF EXISTS "admin upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "admin update product photos" ON storage.objects;
DROP POLICY IF EXISTS "admin delete product photos" ON storage.objects;
DROP POLICY IF EXISTS "seller or admin upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "seller or admin update product photos" ON storage.objects;
DROP POLICY IF EXISTS "seller or admin delete product photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update product photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete product photos" ON storage.objects;

CREATE POLICY "authenticated upload product photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
  );

CREATE POLICY "authenticated update product photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
  )
  WITH CHECK (
    bucket_id = 'product-photos'
  );

CREATE POLICY "authenticated delete product photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
  );
