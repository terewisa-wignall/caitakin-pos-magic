REVOKE ALL ON FUNCTION public.protect_employee_sensitive_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_employee_sensitive_fields() FROM anon;
REVOKE ALL ON FUNCTION public.protect_employee_sensitive_fields() FROM authenticated;