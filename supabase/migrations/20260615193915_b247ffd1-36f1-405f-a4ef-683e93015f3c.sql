
-- 1. cash_movements: explicit admin-only UPDATE policy
CREATE POLICY "admin update movements" ON public.cash_movements
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 2. products & product_variants: split ALL into INSERT (seller+admin) and UPDATE/DELETE (admin only)
DROP POLICY IF EXISTS "seller or admin write products" ON public.products;
DROP POLICY IF EXISTS "seller or admin write variants" ON public.product_variants;

CREATE POLICY "seller or admin insert products" ON public.products
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'seller'::app_role));
CREATE POLICY "admin update products" ON public.products
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin delete products" ON public.products
  FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "seller or admin insert variants" ON public.product_variants
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'seller'::app_role));
CREATE POLICY "admin update variants" ON public.product_variants
  FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin delete variants" ON public.product_variants
  FOR DELETE USING (public.is_admin(auth.uid()));

-- 3. profiles: prevent non-admins from changing privileged columns (commission_rate, email, id)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Non-admins cannot change these columns
  NEW.commission_rate := OLD.commission_rate;
  NEW.email := OLD.email;
  NEW.id := OLD.id;
  NEW.is_active := OLD.is_active;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
