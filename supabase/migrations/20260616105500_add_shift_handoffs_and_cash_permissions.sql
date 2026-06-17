CREATE TABLE IF NOT EXISTS public.shift_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  to_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  from_seller_id uuid NOT NULL REFERENCES auth.users(id),
  to_seller_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  handoff_amount_mxn numeric(12,2) NOT NULL DEFAULT 0,
  handoff_amount_usd numeric(12,2) NOT NULL DEFAULT 0,
  handoff_amount_eur numeric(12,2) NOT NULL DEFAULT 0,
  received_amount_mxn numeric(12,2),
  received_amount_usd numeric(12,2),
  received_amount_eur numeric(12,2),
  sales_amount_mxn numeric(12,2) NOT NULL DEFAULT 0,
  sales_amount_usd numeric(12,2) NOT NULL DEFAULT 0,
  sales_amount_eur numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT shift_handoffs_status_check CHECK (status IN ('pending', 'accepted', 'cancelled'))
);

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS source_handoff_id uuid REFERENCES public.shift_handoffs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shift_handoffs_from_seller ON public.shift_handoffs(from_seller_id);
CREATE INDEX IF NOT EXISTS idx_shift_handoffs_to_seller ON public.shift_handoffs(to_seller_id);
CREATE INDEX IF NOT EXISTS idx_shift_handoffs_status ON public.shift_handoffs(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_handoffs TO authenticated;
GRANT ALL ON public.shift_handoffs TO service_role;
ALTER TABLE public.shift_handoffs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cash_session_belongs_to_user(_session_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cash_sessions cs
    WHERE cs.id = _session_id
      AND cs.opened_by = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.cash_session_belongs_to_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_session_belongs_to_user(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "auth read cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "auth insert cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "auth update cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "admin delete cash sessions" ON public.cash_sessions;

CREATE POLICY "cash sessions visible to owner recipient or admin"
  ON public.cash_sessions FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR opened_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.shift_handoffs h
      WHERE h.to_session_id = cash_sessions.id
        AND h.to_seller_id = auth.uid()
    )
  );

CREATE POLICY "seller opens own cash session"
  ON public.cash_sessions FOR INSERT TO authenticated
  WITH CHECK (opened_by = auth.uid());

CREATE POLICY "seller updates own cash session"
  ON public.cash_sessions FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR opened_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR opened_by = auth.uid());

CREATE POLICY "admin deletes cash sessions"
  ON public.cash_sessions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read movements" ON public.cash_movements;
DROP POLICY IF EXISTS "auth insert movements" ON public.cash_movements;
DROP POLICY IF EXISTS "admin update movements" ON public.cash_movements;
DROP POLICY IF EXISTS "admin delete movements" ON public.cash_movements;

CREATE POLICY "cash movements visible to owner or admin"
  ON public.cash_movements FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.cash_session_belongs_to_user(cash_session_id, auth.uid())
  );

CREATE POLICY "seller inserts own cash movements"
  ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.cash_session_belongs_to_user(cash_session_id, auth.uid())
  );

CREATE POLICY "admin updates cash movements"
  ON public.cash_movements FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admin deletes cash movements"
  ON public.cash_movements FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "handoffs visible to participants or admin"
  ON public.shift_handoffs FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR from_seller_id = auth.uid()
    OR to_seller_id = auth.uid()
  );

CREATE POLICY "seller creates own handoff"
  ON public.shift_handoffs FOR INSERT TO authenticated
  WITH CHECK (
    from_seller_id = auth.uid()
    AND public.cash_session_belongs_to_user(from_session_id, auth.uid())
  );

CREATE POLICY "participants update pending handoff"
  ON public.shift_handoffs FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR from_seller_id = auth.uid()
    OR to_seller_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR from_seller_id = auth.uid()
    OR to_seller_id = auth.uid()
  );

CREATE POLICY "admin deletes handoffs"
  ON public.shift_handoffs FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
