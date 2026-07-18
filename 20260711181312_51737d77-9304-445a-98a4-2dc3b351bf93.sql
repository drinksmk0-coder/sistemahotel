-- 1. Make role-check functions SECURITY INVOKER (resolves DEFINER-executable linter findings)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- 2. profiles: restrict SELECT to the user's own row
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- 3. clients: staff-only access
DROP POLICY IF EXISTS clients_all_authenticated ON public.clients;
CREATE POLICY clients_all_staff ON public.clients
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4. reservations: staff-only access
DROP POLICY IF EXISTS reservations_all_authenticated ON public.reservations;
CREATE POLICY reservations_all_staff ON public.reservations
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 5. sales: staff-only access
DROP POLICY IF EXISTS sales_all_authenticated ON public.sales;
CREATE POLICY sales_all_staff ON public.sales
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 6. complaints: staff-only access (keep anon qrcode insert as-is)
DROP POLICY IF EXISTS complaints_all_authenticated ON public.complaints;
CREATE POLICY complaints_all_staff ON public.complaints
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 7. feedbacks: staff-only read/update/delete
DROP POLICY IF EXISTS feedbacks_select_authenticated ON public.feedbacks;
CREATE POLICY feedbacks_select_staff ON public.feedbacks
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS feedbacks_update_authenticated ON public.feedbacks;
CREATE POLICY feedbacks_update_staff ON public.feedbacks
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS feedbacks_delete_authenticated ON public.feedbacks;
CREATE POLICY feedbacks_delete_staff ON public.feedbacks
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- 8. feedbacks anon insert: replace WITH CHECK (true) with bounded validation
DROP POLICY IF EXISTS feedbacks_insert_anon ON public.feedbacks;
CREATE POLICY feedbacks_insert_anon ON public.feedbacks
  FOR INSERT TO anon
  WITH CHECK (
    (quarto IS NULL OR quarto > 0)
    AND (nota_geral IS NULL OR nota_geral BETWEEN 1 AND 5)
    AND (nota_wifi IS NULL OR nota_wifi BETWEEN 1 AND 5)
    AND (nota_limpeza IS NULL OR nota_limpeza BETWEEN 1 AND 5)
    AND (nota_conforto IS NULL OR nota_conforto BETWEEN 1 AND 5)
    AND (nota_atendimento IS NULL OR nota_atendimento BETWEEN 1 AND 5)
    AND (nota_chuveiro IS NULL OR nota_chuveiro BETWEEN 1 AND 5)
  );

-- ensure grants remain intact
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedbacks TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT ON public.feedbacks TO anon;
GRANT INSERT ON public.complaints TO anon;