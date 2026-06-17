
-- Revoke EXECUTE from anon on internal security-definer helpers (linter 0028)
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_active_seller_or_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cash_session_belongs_to_user(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.vacation_days_by_seniority(date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decrement_variant_stock() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_commission_for_order() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_payroll_loan_deduction() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public;
