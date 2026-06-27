INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-lists', 'supplier-lists', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.supplier_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'file' CHECK (source_type IN ('file', 'google_sheets', 'link')),
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  external_url TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (source_type = 'file' AND file_path IS NOT NULL)
    OR (source_type IN ('google_sheets', 'link') AND external_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_supplier_lists_supplier ON public.supplier_lists(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_lists_source_type ON public.supplier_lists(source_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_lists TO authenticated;
GRANT ALL ON public.supplier_lists TO service_role;
ALTER TABLE public.supplier_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read supplier lists" ON public.supplier_lists;
CREATE POLICY "admin read supplier lists"
  ON public.supplier_lists FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin write supplier lists" ON public.supplier_lists;
CREATE POLICY "admin write supplier lists"
  ON public.supplier_lists FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin read supplier list files" ON storage.objects;
CREATE POLICY "admin read supplier list files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin upload supplier list files" ON storage.objects;
CREATE POLICY "admin upload supplier list files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin update supplier list files" ON storage.objects;
CREATE POLICY "admin update supplier list files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin delete supplier list files" ON storage.objects;
CREATE POLICY "admin delete supplier list files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-lists' AND public.is_admin(auth.uid()));
