DROP POLICY IF EXISTS "admin write products" ON public.products;
DROP POLICY IF EXISTS "admin write variants" ON public.product_variants;

CREATE POLICY "seller or admin write products" ON public.products
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'seller')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'seller')
  );

CREATE POLICY "seller or admin write variants" ON public.product_variants
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'seller')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'seller')
  );
