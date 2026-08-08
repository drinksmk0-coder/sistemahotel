create or replace function public.get_hotel_ai_snapshot(p_company_id uuid)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'generated_at', now(),
    'inventory', jsonb_build_object(
      'rooms_total', (select count(*) from public.rooms r where r.company_id = p_company_id),
      'rooms_available_now', (select count(*) from public.rooms r where r.company_id = p_company_id and coalesce(r.situacao, 'disponivel') not in ('manutencao','bloqueado'))
    ),
    'reservations', jsonb_build_object(
      'total', (select count(*) from public.reservations r where r.company_id = p_company_id),
      'contracted_revenue', (
        select coalesce(sum(r.valor_total),0) from public.reservations r
        where r.company_id = p_company_id
          and lower(coalesce(r.status,'')) not in ('cancelado','cancelada','cancelled','canceled','no_show','no-show','noshow','manutencao','manutenção','cortesia','interno','uso interno')
      ),
      'paid_revenue', (
        select coalesce(sum(r.valor_pago),0) from public.reservations r
        where r.company_id = p_company_id
          and lower(coalesce(r.status,'')) not in ('cancelado','cancelada','cancelled','canceled','no_show','no-show','noshow','manutencao','manutenção','cortesia','interno','uso interno')
      ),
      'outstanding', (
        select coalesce(sum(greatest(r.valor_total-r.valor_pago,0)),0) from public.reservations r
        where r.company_id = p_company_id
          and lower(coalesce(r.status,'')) not in ('cancelado','cancelada','cancelled','canceled','no_show','no-show','noshow','manutencao','manutenção','cortesia','interno','uso interno')
      ),
      'average_daily_rate', (
        select coalesce(avg(nullif(r.valor_diaria,0)),0) from public.reservations r
        where r.company_id = p_company_id
          and lower(coalesce(r.status,'')) not in ('cancelado','cancelada','cancelled','canceled','no_show','no-show','noshow','manutencao','manutenção','cortesia','interno','uso interno')
      ),
      'active_today', (select count(*) from public.reservations r where r.company_id = p_company_id and current_date >= r.checkin and current_date < r.checkout and lower(coalesce(r.status,'')) not in ('cancelado','cancelada','cancelled','canceled','no_show','no-show','noshow')),
      'by_status', (select coalesce(jsonb_object_agg(x.status,x.qty),'{}'::jsonb) from (select coalesce(r.status,'sem_status') status,count(*) qty from public.reservations r where r.company_id=p_company_id group by 1) x),
      'by_channel', (select coalesce(jsonb_object_agg(x.channel,x.qty),'{}'::jsonb) from (select coalesce(r.canal,'nao_informado') channel,count(*) qty from public.reservations r where r.company_id=p_company_id group by 1) x)
    ),
    'sales', jsonb_build_object(
      'total_revenue', (select coalesce(sum(s.total),0) from public.sales s where s.company_id=p_company_id and lower(coalesce(s.status,'')) <> 'cancelado'),
      'outstanding', (select coalesce(sum(greatest(s.total-s.valor_pago,0)),0) from public.sales s where s.company_id=p_company_id and lower(coalesce(s.status,'')) <> 'cancelado'),
      'by_category', (select coalesce(jsonb_object_agg(x.category,x.amount),'{}'::jsonb) from (select coalesce(s.categoria,'geral') category,sum(s.total) amount from public.sales s where s.company_id=p_company_id and lower(coalesce(s.status,'')) <> 'cancelado' group by 1) x),
      'count_by_category', (select coalesce(jsonb_object_agg(x.category,x.qty),'{}'::jsonb) from (select coalesce(s.categoria,'geral') category,count(*) qty from public.sales s where s.company_id=p_company_id and lower(coalesce(s.status,'')) <> 'cancelado' group by 1) x),
      'units_by_category', (select coalesce(jsonb_object_agg(x.category,x.units),'{}'::jsonb) from (select coalesce(s.categoria,'geral') category,sum(s.qtd) units from public.sales s where s.company_id=p_company_id and lower(coalesce(s.status,'')) <> 'cancelado' group by 1) x)
    ),
    'expenses', jsonb_build_object(
      'total', (select coalesce(sum(e.valor),0) from public.expenses e where e.company_id=p_company_id and lower(coalesce(e.categoria,'')) <> lower('Retirada / Movimentação financeira')),
      'by_category', (select coalesce(jsonb_object_agg(x.category,x.amount),'{}'::jsonb) from (select coalesce(e.categoria,'geral') category,sum(e.valor) amount from public.expenses e where e.company_id=p_company_id and lower(coalesce(e.categoria,'')) <> lower('Retirada / Movimentação financeira') group by 1) x),
      'financial_movements_total', (select coalesce(sum(e.valor),0) from public.expenses e where e.company_id=p_company_id and lower(coalesce(e.categoria,'')) = lower('Retirada / Movimentação financeira')),
      'financial_movements_by_category', (select coalesce(jsonb_object_agg(x.category,x.amount),'{}'::jsonb) from (select coalesce(e.categoria,'geral') category,sum(e.valor) amount from public.expenses e where e.company_id=p_company_id and lower(coalesce(e.categoria,'')) = lower('Retirada / Movimentação financeira') group by 1) x)
    ),
    'guest_profile', jsonb_build_object(
      'active_guests', (select count(*) from public.clients c where c.company_id=p_company_id and c.ativo=true)
    ),
    'reviews', jsonb_build_object(
      'count', (select count(*) from public.feedbacks f where f.company_id=p_company_id),
      'average_overall', (select coalesce(avg(f.nota_geral),0) from public.feedbacks f where f.company_id=p_company_id),
      'average_cleanliness', (select coalesce(avg(f.nota_limpeza),0) from public.feedbacks f where f.company_id=p_company_id),
      'average_comfort', (select coalesce(avg(f.nota_conforto),0) from public.feedbacks f where f.company_id=p_company_id),
      'average_service', (select coalesce(avg(f.nota_atendimento),0) from public.feedbacks f where f.company_id=p_company_id)
    ),
    'complaints', jsonb_build_object(
      'open', (select count(*) from public.complaints c where c.company_id=p_company_id and c.status <> 'resolvido'),
      'by_category', (select coalesce(jsonb_object_agg(x.category,x.qty),'{}'::jsonb) from (select coalesce(c.categoria,'outros') category,count(*) qty from public.complaints c where c.company_id=p_company_id group by 1) x)
    )
  );
$function$;