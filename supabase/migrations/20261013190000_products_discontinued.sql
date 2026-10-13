-- Piezas que ya no se van a pedir: no deben aparecer en alertas de poco stock
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS discontinued boolean NOT NULL DEFAULT false;
