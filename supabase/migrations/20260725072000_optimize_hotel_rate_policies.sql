drop policy if exists rate_rules_owner_write on public.rate_rules;

create policy rate_rules_owner_insert
on public.rate_rules
for insert
to authenticated
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
);

create policy rate_rules_owner_update
on public.rate_rules
for update
to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
);

create policy rate_rules_owner_delete
on public.rate_rules
for delete
to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
);

create index if not exists rate_rules_created_by_idx
  on public.rate_rules (created_by);

create index if not exists reservation_groups_created_by_idx
  on public.reservation_groups (created_by);
