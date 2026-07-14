-- ===== ROLES =====
CREATE TYPE public.app_role AS ENUM ('dono', 'recepcao');

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- First registered user becomes dono, everyone else recepcao. Also creates profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'dono');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcao');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== ROOMS =====
CREATE TABLE public.rooms (
  numero INT NOT NULL PRIMARY KEY,
  andar INT NOT NULL,
  configuracao TEXT NOT NULL,
  preco NUMERIC NOT NULL DEFAULT 0,
  banheiro BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT SELECT ON public.rooms TO anon;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_select_all" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "rooms_write_dono" ON public.rooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'dono')) WITH CHECK (public.has_role(auth.uid(),'dono'));

-- ===== CLIENTS =====
CREATE TABLE public.clients (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'hóspede',
  telefone TEXT,
  documento TEXT,
  visitas INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_all_authenticated" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== RESERVATIONS =====
CREATE TABLE public.reservations (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  quarto INT NOT NULL REFERENCES public.rooms(numero),
  cliente_id UUID REFERENCES public.clients(id),
  cliente_nome TEXT NOT NULL,
  checkin DATE NOT NULL,
  checkout DATE NOT NULL,
  diarias INT NOT NULL DEFAULT 1,
  valor_diaria NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  pagamento TEXT NOT NULL DEFAULT '-',
  pago BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'reservado',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations_all_authenticated" ON public.reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== SALES (linked to reservation) =====
CREATE TABLE public.sales (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  quarto INT NOT NULL REFERENCES public.rooms(numero),
  reserva_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  item TEXT NOT NULL,
  qtd INT NOT NULL DEFAULT 1,
  valor_unit NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  pagamento TEXT NOT NULL DEFAULT 'dinheiro',
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_all_authenticated" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== COMPLAINTS (staff issue tracking per room) =====
CREATE TABLE public.complaints (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  quarto INT REFERENCES public.rooms(numero),
  categoria TEXT NOT NULL DEFAULT 'outros',
  descricao TEXT,
  gravidade TEXT NOT NULL DEFAULT 'media',
  dispositivo TEXT,
  origem TEXT NOT NULL DEFAULT 'equipe',
  hospede_nome TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',
  feedback_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complaints_all_authenticated" ON public.complaints FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== FEEDBACKS (guest evaluations via QR, public insert handled server-side) =====
CREATE TABLE public.feedbacks (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  quarto INT,
  hospede_nome TEXT,
  nota_geral INT,
  nota_wifi INT,
  nota_limpeza INT,
  nota_conforto INT,
  nota_atendimento INT,
  nota_chuveiro INT,
  wifi_problema BOOLEAN NOT NULL DEFAULT false,
  wifi_dispositivo TEXT,
  recomendaria BOOLEAN,
  comentario TEXT,
  sugestao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedbacks TO authenticated;
GRANT ALL ON public.feedbacks TO service_role;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedbacks_select_authenticated" ON public.feedbacks FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedbacks_update_authenticated" ON public.feedbacks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "feedbacks_delete_authenticated" ON public.feedbacks FOR DELETE TO authenticated USING (true);