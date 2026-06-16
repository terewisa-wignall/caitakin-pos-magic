ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_frequency text;

UPDATE public.expenses
SET recurring_frequency = 'monthly'
WHERE is_recurring = true
  AND recurring_frequency IS NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_recurring_frequency_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_recurring_frequency_check
  CHECK (
    recurring_frequency IS NULL
    OR recurring_frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly')
  );
