-- Align local migrations with the production Supabase schema.
-- Fixes old cross-company policies and adds guest/reservation fields.

alter table public.clients add column if not exists sexo text;
alter table public.clients add column if not exists bairro text;
alter table public.clients add column if not exists estado_civil text;
alter table public.clients add column if not exists tem_filhos boolean;
alter table public.clients add column if not exists quantidade_filhos integer;

alter table public.reservations add column if not exists motivo_estadia text;

drop policy if exists feedbacks_select_authenticated on public.feedbacks;
drop policy if exists feedbacks_update_authenticated on public.feedbacks;
drop policy if exists feedbacks_delete_authenticated on public.feedbacks;
drop policy if exists feedbacks_company_staff_select on public.feedbacks;
drop policy if exists feedbacks_company_staff_update on public.feedbacks;
drop policy if exists feedbacks_company_staff_delete on public.feedbacks;

create policy feedbacks_company_staff_select on public.feedbacks
for select to authenticated
using (company_id is null or public.is_company_member(company_id, (select auth.uid())));

create policy feedbacks_company_staff_update on public.feedbacks
for update to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

create policy feedbacks_company_staff_delete on public.feedbacks
for delete to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_self_or_company on public.profiles;

create policy profiles_select_self_or_company on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.company_members cm_self
    join public.company_members cm_target
      on cm_target.company_id = cm_self.company_id
    where cm_self.user_id = (select auth.uid())
      and cm_target.user_id = profiles.id
  )
);

create unique index if not exists clients_cpf_digits_company_unique
on public.clients (company_id, regexp_replace(cpf, '\D', '', 'g'))
where cpf is not null and regexp_replace(cpf, '\D', '', 'g') <> '';

create unique index if not exists clients_telefone_digits_company_unique
on public.clients (company_id, regexp_replace(telefone, '\D', '', 'g'))
where telefone is not null and regexp_replace(telefone, '\D', '', 'g') <> '';

alter function public.reservation_has_overlap(integer, date, date, uuid) set search_path = public;
alter function public.reservation_has_overlap(uuid, integer, date, date, uuid) set search_path = public;
