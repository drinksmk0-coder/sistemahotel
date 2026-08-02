create index if not exists corporate_accounts_created_by_idx
  on public.corporate_accounts (created_by)
  where created_by is not null;
