create table if not exists public.meta_integrations (
  company_id uuid primary key references public.companies(id) on delete cascade,
  app_id text,
  app_secret_encrypted text,
  verify_token_encrypted text,
  whatsapp_access_token_encrypted text,
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  page_access_token_encrypted text,
  facebook_page_id text,
  instagram_account_id text,
  auto_reply_enabled boolean not null default false,
  webhook_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.meta_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram','messenger')),
  contact_id text not null,
  contact_name text,
  status text not null default 'bot' check (status in ('bot','human','closed')),
  handoff_reason text,
  last_message_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(company_id, channel, contact_id)
);

create table if not exists public.meta_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.meta_conversations(id) on delete cascade,
  external_message_id text,
  channel text not null check (channel in ('whatsapp','instagram','messenger')),
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  message_text text,
  ai_generated boolean not null default false,
  delivery_status text,
  created_at timestamptz not null default now()
);

create unique index if not exists meta_messages_external_unique on public.meta_messages(company_id, channel, external_message_id) where external_message_id is not null;
create index if not exists meta_conversations_company_last_idx on public.meta_conversations(company_id, last_message_at desc);
create index if not exists meta_messages_conversation_created_idx on public.meta_messages(conversation_id, created_at);

alter table public.meta_integrations enable row level security;
alter table public.meta_conversations enable row level security;
alter table public.meta_messages enable row level security;

drop policy if exists meta_integrations_owner_select on public.meta_integrations;
create policy meta_integrations_owner_select on public.meta_integrations for select to authenticated using (public.has_company_role(company_id, auth.uid(), 'dono'::public.app_role));
drop policy if exists meta_conversations_company_select on public.meta_conversations;
create policy meta_conversations_company_select on public.meta_conversations for select to authenticated using (public.is_company_member(company_id, auth.uid()));
drop policy if exists meta_conversations_company_update on public.meta_conversations;
create policy meta_conversations_company_update on public.meta_conversations for update to authenticated using (public.is_company_member(company_id, auth.uid())) with check (public.is_company_member(company_id, auth.uid()));
drop policy if exists meta_messages_company_select on public.meta_messages;
create policy meta_messages_company_select on public.meta_messages for select to authenticated using (public.is_company_member(company_id, auth.uid()));
