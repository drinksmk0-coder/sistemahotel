create index if not exists guest_checkins_pending_review_idx
on public.guest_checkins (company_id, submitted_at desc)
where status = 'preenchido' and reviewed_at is null;
