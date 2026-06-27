CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  classification_name TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_category ON public.suppliers(category_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read suppliers" ON public.suppliers;
CREATE POLICY "admin read suppliers"
  ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin write suppliers" ON public.suppliers;
CREATE POLICY "admin write suppliers"
  ON public.suppliers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  inventory_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  supplier_sku TEXT,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MXN',
  min_order_qty INT,
  lead_time_days INT,
  last_quoted_at DATE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON public.supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_category ON public.supplier_products(category_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_inventory_product ON public.supplier_products(inventory_product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_products TO authenticated;
GRANT ALL ON public.supplier_products TO service_role;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read supplier products" ON public.supplier_products;
CREATE POLICY "admin read supplier products"
  ON public.supplier_products FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin write supplier products" ON public.supplier_products;
CREATE POLICY "admin write supplier products"
  ON public.supplier_products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
