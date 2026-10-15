-- Un administrador desactivado (o sin perfil) ya no cuenta como administrador.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'
      AND p.is_active = true
  )
$$;

-- Comprobación: debe salir al menos 1 administradora activa.
SELECT count(*) AS administradoras_activas
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin' AND p.is_active = true;
