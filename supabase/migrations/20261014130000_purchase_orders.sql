-- Costos y pedidos a proveedores. TODO es solo para administradores:
-- las vendedoras nunca pueden leer costos.
-- Idempotente: se puede correr más de una vez.

-- 1) Historial de precios de cada producto del proveedor.
CREATE TABLE IF NOT EXISTS public.supplier_product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  unit_cost NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  quoted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_product_prices_product_idx
  ON public.supplier_product_prices(supplier_product_id, quoted_at DESC);

-- 2) Pedidos a proveedores.
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ordered_at DATE NOT NULL DEFAULT CURRENT_DATE,
  shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pedido' CHECK (status IN ('pedido', 'recibido', 'cancelado')),
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON public.purchase_orders(supplier_id, ordered_at DESC);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  supplier_product_id UUID REFERENCES public.supplier_products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx ON public.purchase_order_items(purchase_order_id);

-- Permisos: solo admin.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_product_prices, public.purchase_orders, public.purchase_order_items TO authenticated;
GRANT ALL ON public.supplier_product_prices, public.purchase_orders, public.purchase_order_items TO service_role;
ALTER TABLE public.supplier_product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manages supplier_product_prices" ON public.supplier_product_prices;
CREATE POLICY "admin manages supplier_product_prices" ON public.supplier_product_prices
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manages purchase_orders" ON public.purchase_orders;
CREATE POLICY "admin manages purchase_orders" ON public.purchase_orders
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manages purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "admin manages purchase_order_items" ON public.purchase_order_items
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3) Cada vez que se crea o cambia el costo de un producto del proveedor,
--    se guarda en el historial automáticamente.
CREATE OR REPLACE FUNCTION public.log_supplier_product_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    INSERT INTO public.supplier_product_prices (supplier_product_id, unit_cost, currency, quoted_at, created_by)
    VALUES (NEW.id, NEW.unit_cost, NEW.currency, COALESCE(NEW.last_quoted_at::date, CURRENT_DATE), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_product_price_history ON public.supplier_products;
CREATE TRIGGER supplier_product_price_history
  AFTER INSERT OR UPDATE OF unit_cost, currency ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.log_supplier_product_price();
