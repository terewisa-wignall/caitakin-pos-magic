-- Cada producto puede tener su proveedor (a quién se le pide), separado de la categoría.
-- Además crea los 7 proveedores que hoy son categorías y les asigna sus productos.
-- Idempotente: se puede correr más de una vez.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_supplier_id_idx ON public.products(supplier_id);

-- Crear un proveedor por cada una de estas categorías, si aún no hay uno ligado a ella.
INSERT INTO public.suppliers (name, category_id, is_active)
SELECT trim(c.name), c.id, true
FROM public.categories c
WHERE lower(trim(c.name)) IN (
  'tenango', 'tehuacanes', 'temozon', 'oaxaca',
  'chiapas peluches', 'gina bordados', 'campeche jipi japa'
)
AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.category_id = c.id);

-- Asignar cada producto de esas categorías a su proveedor (solo si aún no tiene uno).
UPDATE public.products p
SET supplier_id = (
  SELECT s.id FROM public.suppliers s
  WHERE s.category_id = p.category_id
  ORDER BY s.created_at
  LIMIT 1
)
WHERE p.supplier_id IS NULL
  AND p.category_id IN (
    SELECT c.id FROM public.categories c
    WHERE lower(trim(c.name)) IN (
      'tenango', 'tehuacanes', 'temozon', 'oaxaca',
      'chiapas peluches', 'gina bordados', 'campeche jipi japa'
    )
  );
