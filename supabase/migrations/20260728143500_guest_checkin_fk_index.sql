create index if not exists guest_checkins_client_id_idx
  on public.guest_checkins(client_id)
  where client_id is not null;
