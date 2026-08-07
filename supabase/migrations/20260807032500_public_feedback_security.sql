create table if not exists public.public_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  room_number integer not null,
  source_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_feedback_submissions_source_idx
  on public.public_feedback_submissions(source_hash, created_at desc);
create index if not exists public_feedback_submissions_company_room_idx
  on public.public_feedback_submissions(company_id, room_number, created_at desc);

alter table public.public_feedback_submissions enable row level security;
revoke all on public.public_feedback_submissions from anon, authenticated;

-- O formulário público passa a enviar pela Edge Function submit-feedback.
-- O acesso direto anônimo à tabela de avaliações é removido após a publicação do frontend.
drop policy if exists feedbacks_public_insert on public.feedbacks;
revoke execute on function public.submit_guest_feedback(jsonb) from anon;
