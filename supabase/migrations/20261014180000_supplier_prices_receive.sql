-- Lista de precios con foto y medidas + "Recibir mercancía".
-- Todo solo para administradores. Idempotente: se puede correr más de una vez.

-- 1) Foto y medidas en cada producto del proveedor.
ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_thumb_url TEXT,
  ADD COLUMN IF NOT EXISTS dimensions TEXT;

-- 2) Qué talla/color llegó en cada renglón recibido.
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- 3) Recibir mercancía: en un solo paso guarda la recepción y suma las piezas al inventario.
--    p_items = [{ "variant_id": uuid, "quantity": int, "unit_cost": num,
--                 "supplier_product_id": uuid|null, "description": text }]
CREATE OR REPLACE FUNCTION public.receive_merchandise(p_supplier_id UUID, p_items JSONB, p_note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order UUID;
  v_item JSONB;
  v_qty INT;
  v_rows INT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay piezas para recibir';
  END IF;

  INSERT INTO public.purchase_orders (supplier_id, status, received_at, notes, created_by)
  VALUES (p_supplier_id, 'recibido', now(), p_note, auth.uid())
  RETURNING id INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;

    UPDATE public.product_variants
    SET stock = stock + v_qty
    WHERE id = (v_item->>'variant_id')::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'No se encontró la talla/color del producto';
    END IF;

    INSERT INTO public.purchase_order_items
      (purchase_order_id, supplier_product_id, variant_id, description, quantity, unit_cost, received_qty)
    VALUES (
      v_order,
      NULLIF(v_item->>'supplier_product_id', '')::uuid,
      (v_item->>'variant_id')::uuid,
      COALESCE(NULLIF(v_item->>'description', ''), 'Producto'),
      v_qty,
      COALESCE((v_item->>'unit_cost')::numeric, 0),
      v_qty
    );
  END LOOP;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_merchandise(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_merchandise(UUID, JSONB, TEXT) TO authenticated;
