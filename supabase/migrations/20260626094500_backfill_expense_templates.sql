WITH recurring_sources AS (
  SELECT DISTINCT ON (
    lower(trim(concept)),
    coalesce(lower(trim(category)), ''),
    coalesce(recurring_frequency, 'monthly')
  )
    concept,
    amount,
    currency,
    type,
    category,
    payment_method,
    coalesce(recurring_frequency, 'monthly') AS frequency,
    extract(day from expense_date)::int AS due_day,
    note,
    created_by,
    expense_date
  FROM public.expenses
  WHERE is_recurring = true
  ORDER BY
    lower(trim(concept)),
    coalesce(lower(trim(category)), ''),
    coalesce(recurring_frequency, 'monthly'),
    expense_date DESC,
    created_at DESC
),
inserted_templates AS (
  INSERT INTO public.expense_templates (
    concept,
    default_amount,
    is_variable,
    currency,
    type,
    category,
    payment_method,
    frequency,
    due_day,
    is_active,
    note,
    created_by
  )
  SELECT
    rs.concept,
    rs.amount,
    (
      lower(coalesce(rs.concept, '') || ' ' || coalesce(rs.category, '')) LIKE '%impuesto%'
      OR lower(coalesce(rs.concept, '') || ' ' || coalesce(rs.category, '')) LIKE '%comision%'
      OR lower(coalesce(rs.concept, '') || ' ' || coalesce(rs.category, '')) LIKE '%comisión%'
      OR lower(coalesce(rs.concept, '') || ' ' || coalesce(rs.category, '')) LIKE '%nomina%'
      OR lower(coalesce(rs.concept, '') || ' ' || coalesce(rs.category, '')) LIKE '%nómina%'
    ) AS is_variable,
    rs.currency,
    rs.type::text,
    rs.category,
    rs.payment_method,
    rs.frequency,
    greatest(1, least(31, rs.due_day)),
    true,
    rs.note,
    rs.created_by
  FROM recurring_sources rs
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.expense_templates et
    WHERE lower(trim(et.concept)) = lower(trim(rs.concept))
      AND coalesce(lower(trim(et.category)), '') = coalesce(lower(trim(rs.category)), '')
      AND et.frequency = rs.frequency
  )
  RETURNING id, concept, category, frequency
),
available_templates AS (
  SELECT id, concept, category, frequency
  FROM public.expense_templates
  UNION ALL
  SELECT id, concept, category, frequency
  FROM inserted_templates
)
UPDATE public.expenses e
SET recurring_template_id = available_templates.id
FROM available_templates
WHERE e.is_recurring = true
  AND e.recurring_template_id IS NULL
  AND lower(trim(available_templates.concept)) = lower(trim(e.concept))
  AND coalesce(lower(trim(available_templates.category)), '') = coalesce(lower(trim(e.category)), '')
  AND available_templates.frequency = coalesce(e.recurring_frequency, 'monthly');
