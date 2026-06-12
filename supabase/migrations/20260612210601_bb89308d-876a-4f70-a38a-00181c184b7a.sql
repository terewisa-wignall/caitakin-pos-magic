
-- 1. cash_sessions: restrict SELECT and UPDATE
DROP POLICY IF EXISTS "auth read cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "auth update cash sessions" ON public.cash_sessions;

CREATE POLICY "read own or admin cash sessions" ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (opened_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "update own or admin cash sessions" ON public.cash_sessions
  FOR UPDATE TO authenticated
  USING (opened_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (opened_by = auth.uid() OR public.is_admin(auth.uid()));

-- 2. cash_movements: restrict SELECT
DROP POLICY IF EXISTS "auth read movements" ON public.cash_movements;

CREATE POLICY "read own or admin movements" ON public.cash_movements
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- 3. customers: restrict SELECT to admin only; tighten INSERT check
DROP POLICY IF EXISTS "auth read customers" ON public.customers;
DROP POLICY IF EXISTS "auth write customers" ON public.customers;

CREATE POLICY "admin read customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "auth insert customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. tickets: remove public read; public access goes via server function with service role
DROP POLICY IF EXISTS "public read tickets" ON public.tickets;

CREATE POLICY "seller or admin read tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = tickets.order_id
        AND (o.seller_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- 5. user_roles: explicit admin-only write policies
CREATE POLICY "admin insert user roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin update user roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin delete user roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. is_admin: revoke from anon (RLS for authenticated tables doesn't need anon execute)
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;
