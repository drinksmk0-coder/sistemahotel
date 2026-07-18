-- Only the very first registrant becomes the owner ("dono").
-- All subsequent sign-ups get NO role, so is_staff() returns false and they
-- cannot read/write guest data until an existing owner grants them a role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    -- Bootstrap: first account becomes the owner.
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'dono');
  END IF;
  -- Everyone else is created with NO role and must be approved by an owner.
  RETURN NEW;
END;
$function$;

-- Allow an owner ("dono") to manage roles for other users (approve staff).
DROP POLICY IF EXISTS "user_roles_manage_dono" ON public.user_roles;
CREATE POLICY "user_roles_manage_dono"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'dono'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'dono'::app_role));