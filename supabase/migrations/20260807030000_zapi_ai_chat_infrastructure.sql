alter table public.zapi_integrations
  add column if not exists auto_reply_enabled boolean not null default false,
  add column if not exists webhook_secret_hash text,
  add column if not exists ai_updated_at timestamptz;

create table if not exists public.zapi_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone text not null,
  contact_name text,
  status text not null default 'bot' check (status in ('bot','human','closed')),
  handoff_reason text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, phone)
);

create table if not exists public.zapi_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.zapi_conversations(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  message_text text,
  ai_generated boolean not null default false,
  delivery_status text,
  created_at timestamptz not null default now(),
  unique(company_id, external_message_id)
);

create index if not exists zapi_conversations_company_last_idx
  on public.zapi_conversations(company_id, last_message_at desc);
create index if not exists zapi_messages_conversation_created_idx
  on public.zapi_messages(conversation_id, created_at desc);

alter table public.zapi_conversations enable row level security;
alter table public.zapi_messages enable row level security;

drop policy if exists zapi_conversations_company_members on public.zapi_conversations;
create policy zapi_conversations_company_members on public.zapi_conversations
for all to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = zapi_conversations.company_id
    and cm.user_id = auth.uid()
    and cm.ativo = true
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = zapi_conversations.company_id
    and cm.user_id = auth.uid()
    and cm.ativo = true
));

drop policy if exists zapi_messages_company_members on public.zapi_messages;
create policy zapi_messages_company_members on public.zapi_messages
for all to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = zapi_messages.company_id
    and cm.user_id = auth.uid()
    and cm.ativo = true
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = zapi_messages.company_id
    and cm.user_id = auth.uid()
    and cm.ativo = true
));
