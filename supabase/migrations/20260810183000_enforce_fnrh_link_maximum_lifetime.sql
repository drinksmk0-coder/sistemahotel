alter table public.guest_checkins
  drop constraint if exists guest_checkins_expires_within_72h;

alter table public.guest_checkins
  add constraint guest_checkins_expires_within_72h
  check (expires_at <= created_at + interval '72 hours');
