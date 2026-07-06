
-- ============ suppliers ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  classification_name text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  contact_name text,
  phone text,
  email text,
  location text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ supplier_products ============
CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  inventory_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  supplier_sku text,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  min_order_qty integer,
  lead_time_days integer,
  last_quoted_at date,
  is_available boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_products TO authenticated;
GRANT ALL ON public.supplier_products TO service_role;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages supplier_products" ON public.supplier_products
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX supplier_products_supplier_idx ON public.supplier_products(supplier_id);
CREATE TRIGGER supplier_products_touch BEFORE UPDATE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ supplier_lists ============
CREATE TABLE public.supplier_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_type text NOT NULL DEFAULT 'file' CHECK (source_type IN ('file','google_sheets','link')),
  file_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  external_url text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_lists TO authenticated;
GRANT ALL ON public.supplier_lists TO service_role;
ALTER TABLE public.supplier_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages supplier_lists" ON public.supplier_lists
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX supplier_lists_supplier_idx ON public.supplier_lists(supplier_id);
CREATE TRIGGER supplier_lists_touch BEFORE UPDATE ON public.supplier_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ storage.objects policies for 'supplier-lists' bucket ============
CREATE POLICY "admin read supplier-lists" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));
CREATE POLICY "admin insert supplier-lists" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));
CREATE POLICY "admin update supplier-lists" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));
CREATE POLICY "admin delete supplier-lists" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));
