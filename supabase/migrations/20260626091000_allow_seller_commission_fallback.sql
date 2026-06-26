-- Allows the app to create a seller's commission if the automatic trigger is missing
-- or has not been applied yet in a deployed environment.
DROP POLICY IF EXISTS "seller creates own commission fallback" ON public.commissions;
CREATE POLICY "seller creates own commission fallback"
  ON public.commissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = commissions.order_id
        AND orders.seller_id = auth.uid()
    )
  );
