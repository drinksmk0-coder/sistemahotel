drop policy if exists kitchen_items_cafe_all on public.kitchen_items;
drop policy if exists kitchen_productions_cafe_all on public.kitchen_productions;

create policy kitchen_items_company_select on public.kitchen_items
for select to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

create policy kitchen_items_cafe_insert on public.kitchen_items
for insert to authenticated
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

create policy kitchen_items_cafe_update on public.kitchen_items
for update to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

create policy kitchen_items_cafe_delete on public.kitchen_items
for delete to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

create policy kitchen_productions_company_select on public.kitchen_productions
for select to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

create policy kitchen_productions_cafe_insert on public.kitchen_productions
for insert to authenticated
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

create policy kitchen_productions_cafe_update on public.kitchen_productions
for update to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

create policy kitchen_productions_cafe_delete on public.kitchen_productions
for delete to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);
