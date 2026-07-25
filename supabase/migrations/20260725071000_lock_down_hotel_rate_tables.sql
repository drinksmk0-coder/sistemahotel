revoke all on table public.rate_rules from anon, authenticated;
revoke all on table public.reservation_groups from anon, authenticated;

grant select, insert, update, delete on table public.rate_rules to authenticated;
grant select, insert, update, delete on table public.reservation_groups to authenticated;
