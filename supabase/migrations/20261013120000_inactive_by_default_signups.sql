-- Registro abierto: la llave anon es pública, así que cualquiera podía crear
-- una cuenta y quedar como vendedor activo. Ahora las cuentas nuevas nacen
-- inactivas; solo el primer usuario (admin) o un admin que las active pueden operar.
-- El alta desde /app/users sigue funcionando: el admin hace upsert con is_active = true.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;

  INSERT INTO public.profiles (id, name, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    user_count = 1
  );

  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'seller');
  END IF;
  RETURN NEW;
END;
$$;
