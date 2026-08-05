create table if not exists public.ai_automation_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null,
  external_id text,
  action_type text not null,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','executed','failed')),
  contact_name text,
  contact_phone text,
  contact_email text,
  payload jsonb not null default '{}'::jsonb,
  requires_human_confirmation boolean not null default true,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  executed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_automation_queue_company_external_idx
  on public.ai_automation_queue(company_id, source, external_id)
  where external_id is not null;

create index if not exists ai_automation_queue_company_status_idx
  on public.ai_automation_queue(company_id, status, created_at desc);

alter table public.ai_automation_queue enable row level security;

create policy "company members can read automation queue"
  on public.ai_automation_queue for select
  using (public.user_has_company_access(auth.uid(), company_id));

create policy "company owners can review automation queue"
  on public.ai_automation_queue for update
  using (public.user_has_company_access(auth.uid(), company_id))
  with check (public.user_has_company_access(auth.uid(), company_id));

comment on table public.ai_automation_queue is
  'Fila auditável de ações propostas pela IA e integrações. Ações críticas exigem aprovação humana antes da execução.';
