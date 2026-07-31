alter table public.reservations
  add column if not exists billing_responsibility text not null default 'guest',
  add column if not exists billing_company_name text,
  add column if not exists billing_company_document text,
  add column if not exists billing_company_email text,
  add column if not exists billing_due_date date,
  add column if not exists billing_status text not null default 'not_applicable',
  add column if not exists checkout_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_billing_responsibility_check,
  add constraint reservations_billing_responsibility_check
    check (billing_responsibility in ('guest', 'company')),
  drop constraint if exists reservations_billing_status_check,
  add constraint reservations_billing_status_check
    check (billing_status in ('not_applicable', 'pending', 'paid', 'overdue'));

create index if not exists reservations_company_billing_pending_idx
  on public.reservations (company_id, billing_status, billing_due_date)
  where billing_responsibility = 'company' and billing_status in ('pending', 'overdue');

create or replace function public.mark_overdue_departures()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  update public.reservations
     set status = 'saida_pendente',
         updated_at = now()
   where status = 'ocupado'
     and checkout < public.hotel_operational_date(now());

  get diagnostics v_updated = row_count;

  update public.reservations
     set billing_status = 'overdue',
         updated_at = now()
   where billing_responsibility = 'company'
     and billing_status = 'pending'
     and billing_due_date is not null
     and billing_due_date < public.hotel_operational_date(now());

  return v_updated;
end;
$$;

revoke all on function public.mark_overdue_departures() from public;
revoke all on function public.mark_overdue_departures() from anon;
revoke all on function public.mark_overdue_departures() from authenticated;
grant execute on function public.mark_overdue_departures() to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'mark-overdue-departures-hourly'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'mark-overdue-departures-hourly',
    '10 * * * *',
    'select public.mark_overdue_departures();'
  );
end;
$$;

select public.mark_overdue_departures();
