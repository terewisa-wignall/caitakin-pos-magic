-- Finiquito automático en cada recibo (aguinaldo + vacaciones + prima, proporcional a los días pagados)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS weekly_settlement BOOLEAN NOT NULL DEFAULT true;
UPDATE public.employees SET weekly_settlement = false WHERE position ILIKE '%cubre%';
