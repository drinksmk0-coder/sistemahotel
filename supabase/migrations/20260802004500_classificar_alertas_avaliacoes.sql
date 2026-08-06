create schema if not exists private;

revoke all on schema private from public;

create or replace function private.create_complaints_from_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is null
     or new.quarto is null
     or not exists (
       select 1
       from public.rooms
       where company_id = new.company_id
         and numero = new.quarto
     ) then
    return new;
  end if;

  with raw_issues(categoria, label, score) as (
    values
      ('outros', 'Nota geral', new.nota_geral),
      ('limpeza', 'Limpeza do quarto', new.nota_limpeza),
      ('cama_colchao', 'Cama e conforto para dormir', new.nota_cama),
      ('manutencao', 'Banheiro', new.nota_banheiro),
      ('chuveiro_frio', 'Chuveiro e água quente', new.nota_chuveiro),
      ('barulho', 'Silêncio e nível de barulho', new.nota_silencio),
      ('ar_ventilacao', 'Ventilação e temperatura', new.nota_ventilacao),
      ('outros', 'Espaço do quarto', new.nota_espaco),
      ('tv', 'TV e entretenimento', new.nota_tv),
      ('manutencao', 'Frigobar', new.nota_frigobar),
      (
        'wifi',
        'Wi-Fi',
        case
          when new.wifi_problema then least(coalesce(new.nota_wifi, 2), 2)
          else new.nota_wifi
        end
      ),
      ('energia', 'Iluminação', new.nota_iluminacao),
      ('outros', 'Custo-benefício', new.nota_custo_beneficio),
      ('atendimento', 'Atendimento da equipe', new.nota_atendimento),
      (
        case new.problema_principal
          when 'Barulho' then 'barulho'
          when 'Banheiro pequeno' then 'manutencao'
          when 'TV pequena ou antiga' then 'tv'
          when 'Sem frigobar' then 'manutencao'
          when 'Calor ou pouca ventilação' then 'ar_ventilacao'
          when 'Wi-Fi' then 'wifi'
          when 'Limpeza' then 'limpeza'
          when 'Cama' then 'cama_colchao'
          when 'Chuveiro' then 'chuveiro_frio'
          else 'outros'
        end,
        'Problema informado: ' || coalesce(new.problema_principal, ''),
        case
          when coalesce(new.problema_principal, '') not in ('', 'Nenhum') then 2
          else null
        end
      )
  ),
  grouped_issues as (
    select
      categoria,
      min(score) as lowest_score,
      string_agg(
        format('%s: nota %s/5', label, score),
        ' · '
        order by score, label
      ) as details
    from raw_issues
    where score between 1 and 2
    group by categoria
  )
  insert into public.complaints (
    company_id,
    quarto,
    categoria,
    descricao,
    gravidade,
    dispositivo,
    origem,
    hospede_nome,
    status,
    feedback_id
  )
  select
    new.company_id,
    new.quarto,
    issue.categoria,
    issue.details
      || case
        when nullif(btrim(new.sugestao), '') is not null
          then '. Relato: ' || btrim(new.sugestao)
        else '.'
      end,
    case when issue.lowest_score = 1 then 'alta' else 'media' end,
    case when issue.categoria = 'wifi' then new.wifi_dispositivo else null end,
    'avaliacao',
    new.hospede_nome,
    'aberto',
    new.id
  from grouped_issues issue;

  return new;
end;
$$;

revoke all on function private.create_complaints_from_feedback() from public;
revoke all on function private.create_complaints_from_feedback() from anon;
revoke all on function private.create_complaints_from_feedback() from authenticated;

drop trigger if exists feedbacks_create_complaints on public.feedbacks;

create trigger feedbacks_create_complaints
after insert on public.feedbacks
for each row
execute function private.create_complaints_from_feedback();
