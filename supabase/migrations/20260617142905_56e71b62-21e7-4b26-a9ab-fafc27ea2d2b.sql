
-- Policies para sale-docs (vouchers e IDs de cliente)
-- Vendedora activa o admin puede subir, leer, actualizar y borrar sus archivos
CREATE POLICY "active seller or admin upload sale docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sale-docs' AND public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin read sale docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sale-docs' AND public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "active seller or admin update sale docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sale-docs' AND public.is_active_seller_or_admin(auth.uid()))
  WITH CHECK (bucket_id = 'sale-docs' AND public.is_active_seller_or_admin(auth.uid()));

CREATE POLICY "admin delete sale docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sale-docs' AND public.is_admin(auth.uid()));
