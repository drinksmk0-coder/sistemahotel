create table if not exists public.weather_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  observed_at timestamptz not null,
  temperature_c numeric(6,2),
  apparent_temperature_c numeric(6,2),
  relative_humidity numeric(6,2),
  precipitation_mm numeric(8,2),
  weather_code integer,
  source text not null default 'open-meteo',
  fetched_at timestamptz not null default now(),
  unique (company_id, observed_at)
);

create table if not exists public.weather_daily (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  data_kind text not null default 'observed' check (data_kind in ('observed','forecast')),
  temperature_mean_c numeric(6,2),
  temperature_min_c numeric(6,2),
  temperature_max_c numeric(6,2),
  apparent_temperature_mean_c numeric(6,2),
  precipitation_mm numeric(8,2),
  precipitation_probability_max numeric(6,2),
  weather_code integer,
  source text not null default 'open-meteo',
  fetched_at timestamptz not null default now(),
  unique (company_id, date, data_kind)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  scope text not null check (scope in ('nacional','municipal','local','regional','hotel')),
  event_type text not null default 'evento' check (event_type in ('feriado','ponto_facultativo','evento')),
  city text,
  state text,
  expected_impact smallint not null default 1 check (expected_impact between -3 and 3),
  source_name text,
  source_url text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists weather_observations_company_time_idx
  on public.weather_observations (company_id, observed_at desc);
create index if not exists weather_daily_company_date_idx
  on public.weather_daily (company_id, date desc);
create index if not exists calendar_events_dates_idx
  on public.calendar_events (start_date, end_date)
  where active;
create index if not exists calendar_events_company_idx
  on public.calendar_events (company_id, start_date)
  where active;

alter table public.weather_observations enable row level security;
alter table public.weather_daily enable row level security;
alter table public.calendar_events enable row level security;

drop policy if exists weather_observations_member_select on public.weather_observations;
create policy weather_observations_member_select
on public.weather_observations for select to authenticated
using (public.is_company_member(company_id, auth.uid()));

drop policy if exists weather_observations_member_insert on public.weather_observations;
create policy weather_observations_member_insert
on public.weather_observations for insert to authenticated
with check (public.is_company_member(company_id, auth.uid()));

drop policy if exists weather_observations_member_update on public.weather_observations;
create policy weather_observations_member_update
on public.weather_observations for update to authenticated
using (public.is_company_member(company_id, auth.uid()))
with check (public.is_company_member(company_id, auth.uid()));

drop policy if exists weather_daily_member_select on public.weather_daily;
create policy weather_daily_member_select
on public.weather_daily for select to authenticated
using (public.is_company_member(company_id, auth.uid()));

drop policy if exists weather_daily_member_insert on public.weather_daily;
create policy weather_daily_member_insert
on public.weather_daily for insert to authenticated
with check (public.is_company_member(company_id, auth.uid()));

drop policy if exists weather_daily_member_update on public.weather_daily;
create policy weather_daily_member_update
on public.weather_daily for update to authenticated
using (public.is_company_member(company_id, auth.uid()))
with check (public.is_company_member(company_id, auth.uid()));

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select
on public.calendar_events for select to authenticated
using (company_id is null or public.is_company_member(company_id, auth.uid()));

drop policy if exists calendar_events_member_insert on public.calendar_events;
create policy calendar_events_member_insert
on public.calendar_events for insert to authenticated
with check (company_id is not null and public.is_company_member(company_id, auth.uid()));

drop policy if exists calendar_events_member_update on public.calendar_events;
create policy calendar_events_member_update
on public.calendar_events for update to authenticated
using (company_id is not null and public.is_company_member(company_id, auth.uid()))
with check (company_id is not null and public.is_company_member(company_id, auth.uid()));

drop policy if exists calendar_events_member_delete on public.calendar_events;
create policy calendar_events_member_delete
on public.calendar_events for delete to authenticated
using (company_id is not null and public.is_company_member(company_id, auth.uid()));

grant select, insert, update on public.weather_observations to authenticated;
grant select, insert, update on public.weather_daily to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;

insert into public.calendar_events
  (company_id, name, start_date, end_date, scope, event_type, city, state, expected_impact, source_name, source_url)
values
  (null, 'Confraternização Universal', '2026-01-01', '2026-01-01', 'nacional', 'feriado', null, null, 1, 'Calendário nacional', null),
  (null, 'Carnaval', '2026-02-16', '2026-02-17', 'nacional', 'ponto_facultativo', null, null, 2, 'Calendário nacional', null),
  (null, 'Sexta-feira Santa', '2026-04-03', '2026-04-03', 'nacional', 'feriado', null, null, 2, 'Calendário nacional', null),
  (null, 'Tiradentes', '2026-04-21', '2026-04-21', 'nacional', 'feriado', null, null, 1, 'Calendário nacional', null),
  (null, 'Dia do Trabalho', '2026-05-01', '2026-05-01', 'nacional', 'feriado', null, null, 2, 'Calendário nacional', null),
  (null, 'Corpus Christi', '2026-06-04', '2026-06-04', 'nacional', 'ponto_facultativo', null, null, 2, 'Calendário nacional', null),
  (null, 'Independência do Brasil', '2026-09-07', '2026-09-07', 'nacional', 'feriado', null, null, 2, 'Calendário nacional', null),
  (null, 'Nossa Senhora Aparecida', '2026-10-12', '2026-10-12', 'nacional', 'feriado', null, null, 2, 'Calendário nacional', null),
  (null, 'Finados', '2026-11-02', '2026-11-02', 'nacional', 'feriado', null, null, 1, 'Calendário nacional', null),
  (null, 'Proclamação da República', '2026-11-15', '2026-11-15', 'nacional', 'feriado', null, null, 1, 'Calendário nacional', null),
  (null, 'Dia Nacional de Zumbi e da Consciência Negra', '2026-11-20', '2026-11-20', 'nacional', 'feriado', null, null, 2, 'Calendário nacional', null),
  (null, 'Natal', '2026-12-25', '2026-12-25', 'nacional', 'feriado', null, null, 3, 'Calendário nacional', null),
  (null, 'Dia do Padroeiro São Sebastião', '2026-01-20', '2026-01-20', 'municipal', 'feriado', 'Cruzília', 'MG', 1, 'Prefeitura de Cruzília', 'https://cruzilia.mg.gov.br/feriados/'),
  (null, 'Dia da Exaltação da Santa Cruz', '2026-09-14', '2026-09-14', 'municipal', 'feriado', 'Cruzília', 'MG', 2, 'Prefeitura de Cruzília', 'https://cruzilia.mg.gov.br/feriados/'),
  (null, 'Emancipação Político-Administrativa de Cruzília', '2026-12-27', '2026-12-27', 'municipal', 'feriado', 'Cruzília', 'MG', 2, 'Prefeitura de Cruzília', 'https://cruzilia.mg.gov.br/feriados/'),
  (null, '44º Festival de Música de Cruzília', '2026-07-24', '2026-07-26', 'local', 'evento', 'Cruzília', 'MG', 3, 'Prefeitura de Cruzília', 'https://cruzilia.mg.gov.br/festival-musica-2026/'),
  (null, 'Festa da Colheita', '2026-07-05', '2026-07-05', 'local', 'evento', 'Cruzília', 'MG', 2, 'Prefeitura de Cruzília', 'https://cruzilia.mg.gov.br/vigilancia-em-saude-orienta-sobre-endemias-e-agua-na-festa-da-colheita/')
on conflict do nothing;
