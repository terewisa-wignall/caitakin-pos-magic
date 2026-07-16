
-- 1) sold_at column on orders (real sale date, editable)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sold_at timestamptz NOT NULL DEFAULT now();
UPDATE public.orders SET sold_at = created_at WHERE sold_at = created_at OR sold_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_sold_at_idx ON public.orders(sold_at DESC);

-- 2) Restore stock when an order_item is deleted
CREATE OR REPLACE FUNCTION public.restore_variant_stock_on_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock = stock + OLD.quantity WHERE id = OLD.variant_id;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_restore_variant_stock ON public.order_items;
CREATE TRIGGER trg_restore_variant_stock BEFORE DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.restore_variant_stock_on_delete();

-- 3) Adjust stock when qty/variant changes on order_items
CREATE OR REPLACE FUNCTION public.adjust_variant_stock_on_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur_stock int;
BEGIN
  -- Return old
  IF OLD.variant_id IS NOT NULL THEN
    UPDATE public.product_variants SET stock = stock + OLD.quantity WHERE id = OLD.variant_id;
  END IF;
  -- Take new
  IF NEW.variant_id IS NOT NULL THEN
    SELECT stock INTO cur_stock FROM public.product_variants WHERE id = NEW.variant_id FOR UPDATE;
    IF cur_stock IS NULL THEN RAISE EXCEPTION 'Variante no existe'; END IF;
    IF cur_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para variante %', NEW.variant_id;
    END IF;
    UPDATE public.product_variants SET stock = stock - NEW.quantity WHERE id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_adjust_variant_stock ON public.order_items;
CREATE TRIGGER trg_adjust_variant_stock AFTER UPDATE OF quantity, variant_id ON public.order_items
  FOR EACH ROW WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.variant_id IS DISTINCT FROM NEW.variant_id)
  EXECUTE FUNCTION public.adjust_variant_stock_on_update();

-- 4) Recompute commission when order.total changes
CREATE OR REPLACE FUNCTION public.sync_commission_on_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.total IS DISTINCT FROM NEW.total OR OLD.currency IS DISTINCT FROM NEW.currency THEN
    UPDATE public.commissions
      SET commission_amount = ROUND(NEW.total * commission_rate / 100, 2),
          currency = NEW.currency
      WHERE order_id = NEW.id AND paid_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_commission ON public.orders;
CREATE TRIGGER trg_sync_commission AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_commission_on_order_update();

-- 5) Order audit log
CREATE TABLE IF NOT EXISTS public.order_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  diff jsonb,
  note text
);
CREATE INDEX IF NOT EXISTS order_audit_log_order_idx ON public.order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS order_audit_log_changed_at_idx ON public.order_audit_log(changed_at DESC);
GRANT SELECT, INSERT ON public.order_audit_log TO authenticated;
GRANT ALL ON public.order_audit_log TO service_role;
ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_admin_read ON public.order_audit_log;
CREATE POLICY audit_admin_read ON public.order_audit_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR changed_by = auth.uid());
DROP POLICY IF EXISTS audit_self_insert ON public.order_audit_log;
CREATE POLICY audit_self_insert ON public.order_audit_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid() OR changed_by IS NULL);

-- 6) Triggers to write audit log
CREATE OR REPLACE FUNCTION public.log_order_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
  v_diff jsonb;
  v_note text;
BEGIN
  v_note := current_setting('app.audit_note', true);
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_diff := to_jsonb(NEW);
    INSERT INTO public.order_audit_log(order_id, action, changed_by, diff, note)
      VALUES (NEW.id, v_action, auth.uid(), v_diff, v_note);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_diff := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    INSERT INTO public.order_audit_log(order_id, action, changed_by, diff, note)
      VALUES (NEW.id, v_action, auth.uid(), v_diff, v_note);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_diff := to_jsonb(OLD);
    INSERT INTO public.order_audit_log(order_id, action, changed_by, diff, note)
      VALUES (OLD.id, v_action, auth.uid(), v_diff, v_note);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_audit_ins ON public.orders;
CREATE TRIGGER trg_orders_audit_ins AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_change();
DROP TRIGGER IF EXISTS trg_orders_audit_upd ON public.orders;
CREATE TRIGGER trg_orders_audit_upd AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_change();
DROP TRIGGER IF EXISTS trg_orders_audit_del ON public.orders;
CREATE TRIGGER trg_orders_audit_del AFTER DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_change();

-- 7) Extend RLS on orders/order_items/payments so sellers can edit/delete their own within 7 days; admins anytime
-- orders
DROP POLICY IF EXISTS orders_seller_update ON public.orders;
CREATE POLICY orders_seller_update ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.is_active_seller_or_admin(auth.uid()) AND seller_id = auth.uid() AND sold_at > now() - interval '7 days')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.is_active_seller_or_admin(auth.uid()) AND seller_id = auth.uid() AND sold_at > now() - interval '7 days')
  );
DROP POLICY IF EXISTS orders_seller_delete ON public.orders;
CREATE POLICY orders_seller_delete ON public.orders FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.is_active_seller_or_admin(auth.uid()) AND seller_id = auth.uid() AND sold_at > now() - interval '7 days')
  );

-- order_items
DROP POLICY IF EXISTS order_items_seller_update ON public.order_items;
CREATE POLICY order_items_seller_update ON public.order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND (public.is_admin(auth.uid()) OR (o.seller_id = auth.uid() AND o.sold_at > now() - interval '7 days'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND (public.is_admin(auth.uid()) OR (o.seller_id = auth.uid() AND o.sold_at > now() - interval '7 days'))));
DROP POLICY IF EXISTS order_items_seller_delete ON public.order_items;
CREATE POLICY order_items_seller_delete ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND (public.is_admin(auth.uid()) OR (o.seller_id = auth.uid() AND o.sold_at > now() - interval '7 days'))));

-- payments
DROP POLICY IF EXISTS payments_seller_update ON public.payments;
CREATE POLICY payments_seller_update ON public.payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id
    AND (public.is_admin(auth.uid()) OR (o.seller_id = auth.uid() AND o.sold_at > now() - interval '7 days'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id
    AND (public.is_admin(auth.uid()) OR (o.seller_id = auth.uid() AND o.sold_at > now() - interval '7 days'))));
DROP POLICY IF EXISTS payments_seller_delete ON public.payments;
CREATE POLICY payments_seller_delete ON public.payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id
    AND (public.is_admin(auth.uid()) OR (o.seller_id = auth.uid() AND o.sold_at > now() - interval '7 days'))));

-- Cascade cleanup: when an order is deleted, remove children so triggers run
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_order_id_fkey;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_order_id_fkey;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
