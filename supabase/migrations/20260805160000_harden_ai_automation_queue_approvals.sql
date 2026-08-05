-- Restringe revisões de automações críticas ao proprietário da empresa.
-- Evita que qualquer membro da empresa aprove cancelamentos, alterações
-- financeiras, exclusões ou mudanças operacionais sensíveis.

alter table public.ai_automation_queue
  drop constraint if exists ai_automation_queue_critical_requires_confirmation;

alter table public.ai_automation_queue
  add constraint ai_automation_queue_critical_requires_confirmation
  check (
    action_type not in (
      'reservation_create',
      'booking_import',
      'reservation_cancel',
      'reservation_change',
      'financial_change',
      'record_delete'
    )
    or requires_human_confirmation = true
  );

drop policy if exists "company owners can review automation queue"
  on public.ai_automation_queue;

create policy "company owners can review automation queue"
  on public.ai_automation_queue
  for update
  to authenticated
  using (
    public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  )
  with check (
    public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
    and (
      status not in ('approved', 'executed')
      or reviewed_by = (select auth.uid())
    )
    and (
      status <> 'executed'
      or executed_at is not null
    )
  );

-- A fila é histórica e auditável: usuários autenticados não podem excluir registros.
revoke delete on public.ai_automation_queue from authenticated;

comment on policy "company owners can review automation queue"
  on public.ai_automation_queue is
  'Somente proprietários ativos da empresa podem aprovar ou rejeitar ações propostas pela IA.';
