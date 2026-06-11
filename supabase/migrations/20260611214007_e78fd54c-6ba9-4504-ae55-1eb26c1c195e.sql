
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'seller');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- profile RLS
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR auth.uid() = id);
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- user_roles RLS
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Auto-create profile + default seller role on signup. First user becomes admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'seller');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CATEGORÍAS ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.categories (name) VALUES
  ('Niñas'), ('Dama'), ('Accesorios'), ('Sombreros'), ('Bolsas'), ('Muñecos'), ('Manteles');

-- ============ PRODUCTOS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  photo_url TEXT,
  base_price_mxn NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_price_usd NUMERIC(12,2),
  base_price_eur NUMERIC(12,2),
  sku TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read active products" ON public.products FOR SELECT TO authenticated USING (is_active OR public.is_admin(auth.uid()));
CREATE POLICY "admin write products" ON public.products FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  size TEXT,
  color TEXT,
  stock INT NOT NULL DEFAULT 0,
  price_override_mxn NUMERIC(12,2),
  price_override_usd NUMERIC(12,2),
  price_override_eur NUMERIC(12,2),
  sku TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON public.product_variants(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read variants" ON public.product_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write variants" ON public.product_variants FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ CLIENTES ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin delete customers" ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ ÓRDENES ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MXN',
  exchange_rate_used NUMERIC(12,4) NOT NULL DEFAULT 1,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_seller ON public.orders(seller_id);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller read own orders" ON public.orders FOR SELECT TO authenticated USING (seller_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "seller insert own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "admin update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin delete orders" ON public.orders FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  variant_snapshot TEXT,
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read order items via order" ON public.order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR public.is_admin(auth.uid())))
);
CREATE POLICY "insert order items via own order" ON public.order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.seller_id = auth.uid())
);
CREATE POLICY "admin update order items" ON public.order_items FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin delete order items" ON public.order_items FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Descuento de stock al insertar item
CREATE OR REPLACE FUNCTION public.decrement_variant_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_stock INT;
BEGIN
  IF NEW.variant_id IS NULL THEN RETURN NEW; END IF;
  SELECT stock INTO current_stock FROM public.product_variants WHERE id = NEW.variant_id FOR UPDATE;
  IF current_stock IS NULL THEN RAISE EXCEPTION 'Variante no existe'; END IF;
  IF current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para variante %', NEW.variant_id;
  END IF;
  UPDATE public.product_variants SET stock = stock - NEW.quantity WHERE id = NEW.variant_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_variant_stock();

-- ============ PAGOS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  exchange_rate_used NUMERIC(12,4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON public.payments(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read payments via order" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR public.is_admin(auth.uid())))
);
CREATE POLICY "insert payments via own order" ON public.payments FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.seller_id = auth.uid())
);
CREATE POLICY "admin update payments" ON public.payments FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admin delete payments" ON public.payments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ TIPOS DE CAMBIO ============
CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL DEFAULT 'MXN',
  rate NUMERIC(12,4) NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read rates" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write rates" ON public.exchange_rates FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.exchange_rates (base_currency, target_currency, rate) VALUES
  ('USD', 'MXN', 18.50),
  ('EUR', 'MXN', 20.00);

-- ============ CAJA ============
CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  opening_amount_mxn NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_amount_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_amount_mxn NUMERIC(12,2),
  closing_amount_usd NUMERIC(12,2),
  closing_amount_eur NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cash sessions" ON public.cash_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert cash sessions" ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK (opened_by = auth.uid());
CREATE POLICY "auth update cash sessions" ON public.cash_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete cash sessions" ON public.cash_sessions FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  concept TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  payment_method TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_session ON public.cash_movements(cash_session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read movements" ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert movements" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admin delete movements" ON public.cash_movements FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ COMISIONES ============
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  commission_rate NUMERIC(5,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commissions_seller ON public.commissions(seller_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller read own commissions" ON public.commissions FOR SELECT TO authenticated USING (seller_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin write commissions" ON public.commissions FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Generación automática de comisión al crear orden
CREATE OR REPLACE FUNCTION public.create_commission_for_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rate NUMERIC;
BEGIN
  SELECT commission_rate INTO rate FROM public.profiles WHERE id = NEW.seller_id;
  IF rate IS NULL THEN rate := 5.00; END IF;
  INSERT INTO public.commissions (seller_id, order_id, commission_rate, commission_amount, currency)
  VALUES (NEW.seller_id, NEW.id, rate, ROUND(NEW.total * rate / 100, 2), NEW.currency);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_create_commission
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_commission_for_order();

-- ============ TICKETS ============
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  public_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  qr_code_url TEXT,
  sent_by_email BOOLEAN NOT NULL DEFAULT false,
  sent_by_whatsapp BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT SELECT ON public.tickets TO anon;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tickets" ON public.tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seller insert tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.seller_id = auth.uid())
);
CREATE POLICY "seller update own ticket flags" ON public.tickets FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR public.is_admin(auth.uid())))
);

-- Storage policies for product-photos bucket (public read, admin write)
CREATE POLICY "public read product photos" ON storage.objects FOR SELECT USING (bucket_id = 'product-photos');
CREATE POLICY "admin upload product photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-photos' AND public.is_admin(auth.uid()));
CREATE POLICY "admin update product photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-photos' AND public.is_admin(auth.uid()));
CREATE POLICY "admin delete product photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-photos' AND public.is_admin(auth.uid()));
