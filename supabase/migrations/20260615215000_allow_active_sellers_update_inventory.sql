CREATE OR REPLACE FUNCTION public.is_active_seller_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = _user_id
        AND ur.role = 'seller'::public.app_role
        AND p.is_active = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_seller_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_seller_or_admin(uuid) TO service_role;

DROP POLICY IF EXISTS "seller or admin insert products" ON public.products;
DROP POLICY IF EXISTS "admin update products" ON public.products;
DROP POLICY IF EXISTS "admin delete products" ON public.products;
DROP POLICY IF EXISTS "seller or admin insert variants" ON public.product_variants;
DROP POLICY IF EXISTS "admin update variants" ON public.product_variants;
DROP POLICY IF EXISTS "admin delete variants" ON public.product_variants;

CREATE POLICY "active seller or admin insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin update products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()))
  WITH CHECK (public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin delete products" ON public.products
  FOR DELETE TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin insert variants" ON public.product_variants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin update variants" ON public.product_variants
  FOR UPDATE TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()))
  WITH CHECK (public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin delete variants" ON public.product_variants
  FOR DELETE TO authenticated
  USING (public.is_active_seller_or_admin(auth.uid()));

DROP POLICY IF EXISTS "admin upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "admin update product photos" ON storage.objects;
DROP POLICY IF EXISTS "admin delete product photos" ON storage.objects;

CREATE POLICY "active seller or admin upload product photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.is_active_seller_or_admin(auth.uid())
  );

CREATE POLICY "active seller or admin update product photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_active_seller_or_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'product-photos'
    AND public.is_active_seller_or_admin(auth.uid())
  );

CREATE POLICY "active seller or admin delete product photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND public.is_active_seller_or_admin(auth.uid())
  );
