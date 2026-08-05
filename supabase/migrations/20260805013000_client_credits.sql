-- Permite comandas de funcionários sem quarto.
ALTER TABLE public.sales
ALTER COLUMN quarto DROP NOT NULL;

-- Créditos antecipados de clientes, independentes de hospedagem.
CREATE TABLE IF NOT EXISTS public.client_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('credito', 'uso', 'ajuste')),
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  descricao text,
  reserva_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  pagamento text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_credits_company_client_idx
  ON public.client_credits(company_id, client_id, created_at DESC);

ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_credits_select ON public.client_credits;
CREATE POLICY client_credits_select
ON public.client_credits
FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS client_credits_write ON public.client_credits;
CREATE POLICY client_credits_write
ON public.client_credits
FOR ALL TO authenticated
USING (public.has_company_role(auth.uid(), company_id, ARRAY['dono', 'recepcao']))
WITH CHECK (public.has_company_role(auth.uid(), company_id, ARRAY['dono', 'recepcao']));

CREATE OR REPLACE VIEW public.client_credit_balances AS
SELECT
  company_id,
  client_id,
  COALESCE(
    SUM(
      CASE
        WHEN tipo = 'credito' THEN valor
        WHEN tipo = 'uso' THEN -valor
        ELSE valor
      END
    ),
    0
  )::numeric(12,2) AS saldo
FROM public.client_credits
GROUP BY company_id, client_id;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_credits TO authenticated;
GRANT SELECT ON public.client_credit_balances TO authenticated;
