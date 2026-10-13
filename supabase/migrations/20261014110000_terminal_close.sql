-- Cierre de terminal bancaria al cerrar caja:
-- la vendedora toma foto del cierre de la terminal y captura su total;
-- se guarda junto con lo que la app registró en tarjetas ese día.
-- Idempotente: se puede correr más de una vez.

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS terminal_total_mxn NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS terminal_expected_mxn NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS terminal_receipt_path TEXT,
  ADD COLUMN IF NOT EXISTS terminal_note TEXT;

-- Total de ventas con tarjeta (débito + crédito) de TODA la tienda en un rango,
-- en pesos. Las vendedoras solo pueden leer sus propios pagos, por eso es
-- SECURITY DEFINER: devuelve solo la suma, no el detalle.
CREATE OR REPLACE FUNCTION public.card_sales_total_mxn(p_since timestamptz, p_until timestamptz)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_seller_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  RETURN COALESCE((
    SELECT SUM(p.amount * CASE WHEN p.currency = 'MXN' THEN 1 ELSE COALESCE(p.exchange_rate_used, 1) END)
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.payment_method IN ('debit_card', 'credit_card')
      AND o.sold_at >= p_since
      AND o.sold_at < p_until
  ), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.card_sales_total_mxn(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.card_sales_total_mxn(timestamptz, timestamptz) TO authenticated;
