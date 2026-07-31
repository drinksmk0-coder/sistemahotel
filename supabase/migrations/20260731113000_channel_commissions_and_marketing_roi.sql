-- Custos comerciais por canal e campanhas de marketing para cálculo de receita líquida e ROI.
create table if not exists public.channel_cost_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_name text not null,
  commission_percent numeric(7,4) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  fixed_fee_per_reservation numeric(12,2) not null default 0 check (fixed_fee_per_reservation >= 0),
  monthly_fixed_cost numeric(12,2) not null default 0 check (monthly_fixed_cost >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, channel_name)
);

create index if not exists channel_cost_settings_company_active_idx
  on public.channel_cost_settings (company_id, active, channel_name);

alter table public.channel_cost_settings enable row level security;

drop policy if exists channel_cost_settings_owner_select on public.channel_cost_settings;
drop policy if exists channel_cost_settings_owner_insert on public.channel_cost_settings;
drop policy if exists channel_cost_settings_owner_update on public.channel_cost_settings;
drop policy if exists channel_cost_settings_owner_delete on public.channel_cost_settings;

create policy channel_cost_settings_owner_select
on public.channel_cost_settings
for select to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create policy channel_cost_settings_owner_insert
on public.channel_cost_settings
for insert to authenticated
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create policy channel_cost_settings_owner_update
on public.channel_cost_settings
for update to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create policy channel_cost_settings_owner_delete
on public.channel_cost_settings
for delete to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  platform text not null,
  start_date date not null,
  end_date date,
  invested_amount numeric(12,2) not null default 0 check (invested_amount >= 0),
  attributed_revenue numeric(12,2) not null default 0 check (attributed_revenue >= 0),
  attributed_reservations integer not null default 0 check (attributed_reservations >= 0),
  status text not null default 'active' check (status in ('planned', 'active', 'paused', 'finished', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists marketing_campaigns_company_period_idx
  on public.marketing_campaigns (company_id, start_date desc, end_date);
create index if not exists marketing_campaigns_company_status_idx
  on public.marketing_campaigns (company_id, status);

alter table public.marketing_campaigns enable row level security;

drop policy if exists marketing_campaigns_owner_select on public.marketing_campaigns;
drop policy if exists marketing_campaigns_owner_insert on public.marketing_campaigns;
drop policy if exists marketing_campaigns_owner_update on public.marketing_campaigns;
drop policy if exists marketing_campaigns_owner_delete on public.marketing_campaigns;

create policy marketing_campaigns_owner_select
on public.marketing_campaigns
for select to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create policy marketing_campaigns_owner_insert
on public.marketing_campaigns
for insert to authenticated
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create policy marketing_campaigns_owner_update
on public.marketing_campaigns
for update to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create policy marketing_campaigns_owner_delete
on public.marketing_campaigns
for delete to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create or replace function public.marketing_roi_summary(
  p_company_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.has_company_role(p_company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception using errcode = '42501', message = 'Acesso exclusivo do proprietário da empresa.';
  end if;

  select jsonb_build_object(
    'investment', coalesce(sum(mc.invested_amount), 0),
    'attributed_revenue', coalesce(sum(mc.attributed_revenue), 0),
    'attributed_reservations', coalesce(sum(mc.attributed_reservations), 0),
    'roi_percent', case
      when coalesce(sum(mc.invested_amount), 0) > 0
        then ((sum(mc.attributed_revenue) - sum(mc.invested_amount)) / sum(mc.invested_amount)) * 100
      else 0
    end,
    'campaigns', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', mc.id,
          'name', mc.name,
          'platform', mc.platform,
          'status', mc.status,
          'investment', mc.invested_amount,
          'revenue', mc.attributed_revenue,
          'reservations', mc.attributed_reservations,
          'roi_percent', case
            when mc.invested_amount > 0
              then ((mc.attributed_revenue - mc.invested_amount) / mc.invested_amount) * 100
            else 0
          end
        ) order by mc.attributed_revenue desc, mc.created_at desc
      ) filter (where mc.id is not null),
      '[]'::jsonb
    )
  )
  into v_result
  from public.marketing_campaigns mc
  where mc.company_id = p_company_id
    and mc.start_date <= p_end
    and coalesce(mc.end_date, p_end) >= p_start
    and mc.status <> 'cancelled';

  return coalesce(v_result, jsonb_build_object(
    'investment', 0,
    'attributed_revenue', 0,
    'attributed_reservations', 0,
    'roi_percent', 0,
    'campaigns', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.marketing_roi_summary(uuid, date, date) from public, anon;
grant execute on function public.marketing_roi_summary(uuid, date, date) to authenticated;
