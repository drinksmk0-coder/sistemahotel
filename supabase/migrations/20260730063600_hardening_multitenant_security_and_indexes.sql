-- Fecha gravações públicas inseguras. Submissões públicas devem usar RPC/Edge Function com token validado.
drop policy if exists complaints_public_insert on public.complaints;
drop policy if exists complaints_insert_anon on public.complaints;
drop policy if exists feedbacks_insert_anon on public.feedbacks;
revoke insert on table public.complaints from anon;
revoke insert on table public.feedbacks from anon;

-- Remove o fallback global que vinculava registros sem empresa à primeira empresa ativa.
drop trigger if exists clients_default_company_id on public.clients;
drop trigger if exists complaints_default_company_id on public.complaints;
drop trigger if exists feedbacks_default_company_id on public.feedbacks;
drop trigger if exists integration_events_default_company_id on public.integration_events;
drop trigger if exists products_default_company_id on public.products;
drop trigger if exists reservations_default_company_id on public.reservations;
drop trigger if exists sales_default_company_id on public.sales;
drop trigger if exists whatsapp_sessions_default_company_id on public.whatsapp_reservation_sessions;
drop function if exists public.set_default_company_id();
drop function if exists public.default_company_id();

-- Funções internas de autorização não devem ser endpoints públicos anônimos.
revoke all on function public.has_company_role(uuid, uuid, public.app_role) from public, anon;
revoke all on function public.is_company_member(uuid, uuid) from public, anon;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_company_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.is_company_member(uuid, uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- Função de trigger não deve ser chamável pela Data API.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- RPCs de check-in foram desenhadas para funcionar com token público.
revoke all on function public.get_guest_checkin(uuid) from public;
revoke all on function public.submit_guest_checkin(uuid, jsonb, text, boolean) from public;
grant execute on function public.get_guest_checkin(uuid) to anon, authenticated;
grant execute on function public.submit_guest_checkin(uuid, jsonb, text, boolean) to anon, authenticated;

-- RPC sensível permanece autenticada e valida internamente o papel de dono.
revoke all on function public.delete_clients_with_history(uuid, uuid[]) from public, anon;
grant execute on function public.delete_clients_with_history(uuid, uuid[]) to authenticated;

-- Índices para consultas por empresa, período e situação.
create index if not exists company_members_user_company_idx
  on public.company_members (user_id, company_id)
  where ativo;
create index if not exists reservations_company_checkin_idx
  on public.reservations (company_id, checkin desc);
create index if not exists reservations_company_checkout_idx
  on public.reservations (company_id, checkout desc);
create index if not exists reservations_company_status_checkin_idx
  on public.reservations (company_id, status, checkin desc);
create index if not exists reservations_company_client_idx
  on public.reservations (company_id, cliente_id)
  where cliente_id is not null;
create index if not exists complaints_company_status_created_idx
  on public.complaints (company_id, status, created_at desc);
create index if not exists feedbacks_company_created_idx
  on public.feedbacks (company_id, created_at desc);
create index if not exists integration_events_company_created_idx
  on public.integration_events (company_id, created_at desc);
create index if not exists products_company_idx
  on public.products (company_id);
create index if not exists company_integrations_company_idx
  on public.company_integrations (company_id);

-- Remove índice único duplicado.
drop index if exists public.clients_cpf_digits_company_unique;

-- Evita reavaliar auth.uid() a cada linha nas políticas sinalizadas pelo advisor.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
for select to authenticated
using ((select auth.uid()) = user_id);
