-- Importacao deduplicada do historico Hotel Real.
-- Rode no Supabase SQL Editor depois de conferir o preview.
-- Nao apaga dados existentes. Ignora reservas ja cadastradas pela mesma combinacao quarto/cliente/datas/total.

with target_company as (
  select id from public.companies
  where slug = 'hotel-real-cruzilia' or nome ilike '%Hotel Real%'
  order by created_at
  limit 1
), input_rows(quarto, cliente_nome, checkin, checkout, diarias, pessoas, valor_diaria, valor_total, valor_pago, pagamento, pago, status, canal) as (
  values
    (307, 'Vancelei', '2026-07-15', '2026-07-18', 3, 1, 110.00, 330.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'Michel', '2026-07-15', '2026-07-18', 3, 2, 110.00, 330.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'Osmar', '2026-07-15', '2026-07-16', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'Antônio Ávila Lara junior', '2026-07-15', '2026-07-16', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'Fabiano (potencial)', '2026-07-15', '2026-07-17', 2, 1, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (218, 'Danilo Mendonça', '2026-07-15', '2026-07-16', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (214, 'Flávio José de souza', '2026-07-15', '2026-07-16', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (101, 'MARCOS ANTÔNIO PEREIRA', '2026-07-15', '2026-07-16', 1, 3, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (103, 'THAIS CARNEVALE BENFATTI', '2026-07-15', '2026-07-16', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'Alexandre', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (104, 'Ketlin', '2026-07-14', '2026-07-15', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (205, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (206, 'ANGÉLICA FERREIRA (EMPRESA JYAS)', '2025-06-30', '2025-07-01', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (206, 'FABIANO (POTENCIAL)', '2026-06-25', '2026-06-26', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (206, 'Luiz Cláudio', '2026-07-24', '2026-07-25', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (206, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (207, 'DOUGLAS (POTENCIAL)', '2026-06-15', '2026-06-18', 3, 1, 110.00, 330.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (207, 'FLAVIO BORGES (POTENCIAL)', '2026-07-01', '2026-07-03', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (207, 'DOUGLAS - POTENCIAL', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (207, 'Douglas (potencial)', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (207, 'JOSÉ DO CARMO', '2026-07-19', '2026-07-20', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (207, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (208, 'GABRIEL WESLEY', '2025-10-03', '2025-10-17', 14, 1, 90.00, 1260.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (208, 'José Micaço Gomes', '2025-10-26', '2025-10-27', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (208, 'PAVICAN (RICARDO)', '2026-07-03', '2026-07-04', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (209, 'LUCAS', '2025-06-26', '2025-07-02', 6, 2, 90.00, 540.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (209, 'HELIAB SOUZA', '2025-10-03', '2025-10-17', 14, 1, 90.00, 1260.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (103, 'marina marcelino e Guilherme', '2026-07-14', '2026-07-15', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (103, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (103, 'Renato Mechica Vieira', '2026-07-28', '2026-07-29', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (103, 'William Cleber Domingues Silva', '2026-09-05', '2026-09-07', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'Claudirene Marcelino', '2026-07-14', '2026-07-15', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'MARCOS ANTÔNIO PEREIRA', '2026-07-15', '2026-07-16', 1, 3, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'LEONARDO RAMOS PAES DE LIMA', '2026-07-19', '2026-07-20', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'Tulio Barros', '2026-07-25', '2026-07-26', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'Renato Mechica Vieira', '2026-07-28', '2026-07-29', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'Sergio Roberto De Sampaio Melo', '2026-08-21', '2026-08-23', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'André Moura', '2026-09-04', '2026-09-07', 3, 2, 110.00, 330.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'GERALDA PEDROSA/ PATRICIA RODRIGUES', '2026-09-12', '2026-09-13', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (104, 'Sueli Ferreira', '2026-12-26', '2027-01-04', 9, 1, 110.00, 990.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (208, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (205, 'Zé Renato', '2026-07-24', '2026-07-25', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (207, 'NELSON PRADO JUNIOR', '2026-09-05', '2026-09-07', 2, 2, 110.00, 220.00, 220.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (209, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (209, 'FLAVIO BORGES (POTENCIAL)', '2026-07-09', '2026-07-10', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'MILTON CESAR DA SILVA MARTINS', '2025-02-19', '2025-02-21', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'ANDRÉ (POTENCIAL)', '2026-06-15', '2026-06-18', 3, 1, 110.00, 330.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'FLAVIO BORGES (POTENCIAL)', '2026-07-08', '2026-07-09', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'PAULO SERGIO DOS REIS', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'Paulo Sérgio', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (210, 'TÂNIA/ ANA BEATRIZ', '2026-07-19', '2026-07-20', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (210, 'Marcelo De Jesus Pereira', '2026-09-04', '2026-09-07', 3, 1, 110.00, 330.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (211, 'LUCAS', '2025-06-25', '2025-07-02', 7, 2, 90.00, 630.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (211, 'PAVICAN', '2025-11-22', '2025-11-24', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (211, 'PAVICAN', '2025-11-24', '2025-11-28', 4, 2, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (211, 'FLAVIO BORGES (POTENCIAL)', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (211, 'Flávio Borges', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (211, 'Dedê Bonito', '2026-07-24', '2026-07-25', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (214, 'Igor WS', '2025-10-03', '2025-10-17', 14, 1, 90.00, 1260.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (214, 'Cristiano Cordeiro Da Silva', '2025-10-20', '2025-11-07', 18, 1, 90.00, 1620.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (214, 'PAVICAN (RICARDO)', '2026-06-17', '2026-06-18', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (214, 'ALEX LUIS SILVA BARBOSA', '2026-07-09', '2026-07-13', 4, 1, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (214, 'Diorgem  Júnior', '2026-07-24', '2026-07-27', 3, 1, 90.00, 270.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (215, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (216, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 1, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (216, 'PAVICAN (RICARDO)', '2026-07-02', '2026-07-03', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (216, 'Wesley Ramos Longo', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (216, 'Wesley', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (216, 'JOSÉ ROBERTO CORREA RIBEIRO', '2026-07-25', '2026-07-26', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (217, 'Rafael WS', '2025-10-04', '2025-10-06', 2, 1, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (217, 'SILVANIO CARLOS DA SILVA', '2026-02-23', '2026-02-24', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (217, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 1, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (217, 'PAVICAN (RICARDO)', '2026-07-02', '2026-07-03', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (217, 'GUSTAVO ALOISIO SILVA SOARES', '2026-07-09', '2026-07-13', 4, 1, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (217, 'LAUDISMAR DEPTULSKI', '2026-07-25', '2026-07-27', 2, 1, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (218, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (218, 'RONEY - POTENCIAL', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (218, 'Roney', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (218, 'Roney', '2026-07-13', '2026-07-15', 2, 1, 110.00, 220.00, 220.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (218, 'Roney potencial', '2026-07-13', '2026-07-15', 2, 1, 90.00, 180.00, 180.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (218, 'GABRIELA LUDUVICE', '2026-07-18', '2026-07-19', 1, 2, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (218, 'Thaciane Ferreira Avelar Borges', '2026-08-15', '2026-08-16', 1, 2, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'PAVICAN (RICARDO)', '2026-06-18', '2026-06-19', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'FABIANO (POTENCIAL)', '2026-07-01', '2026-07-02', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'FABIANO (POTENCIAL)', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'Fabiano', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (219, 'Fabiano potencial', '2026-07-14', '2026-07-15', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (219, 'Fabiano', '2026-07-14', '2026-07-15', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (219, 'HELENA NASCIMENTO', '2026-07-18', '2026-07-19', 1, 2, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (219, 'Lara Helena Campos Ferreira', '2026-08-15', '2026-08-16', 1, 2, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'MARCOS ABEL S. PEREIRA', '2025-02-19', '2025-02-21', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'FERNANDO AUGUSTO SOARES (SUZANO)', '2026-03-17', '2026-03-18', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'Plinio de Souza Neto (POTENCIAL)', '2026-07-01', '2026-07-02', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'Andreia', '2026-07-13', '2026-07-14', 1, 1, 130.00, 130.00, 130.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (221, 'ANDRÉA AP S DINIZ', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'EUSTÁQUIO/ ELLEN/ HELENA', '2026-07-19', '2026-07-20', 1, 3, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'Claudio Felga Gobbi', '2026-07-24', '2026-07-26', 2, 2, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (221, 'Evelyne Nascimento', '2026-09-05', '2026-09-07', 2, 2, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (222, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 3, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (222, 'Samuel Flávio', '2026-07-13', '2026-07-15', 2, 2, 180.00, 360.00, 360.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (222, 'Samuel Meireles/  Flávio José', '2026-07-13', '2026-07-15', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (222, 'Samuel flavio', '2026-07-13', '2026-07-15', 2, 2, 90.00, 180.00, 180.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (222, 'JOSÉ RENATO LEITE', '2026-07-23', '2026-07-27', 4, 4, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (222, 'DIEGO/ AMANDA', '2026-09-12', '2026-09-13', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'PAVICAN', '2025-11-22', '2025-11-24', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'PAVICAN', '2025-11-24', '2025-11-28', 4, 2, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'Carlos/ Luiz Henrique', '2026-02-23', '2026-02-24', 1, 2, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'PAVICAN (RICARDO)', '2026-06-16', '2026-06-18', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'Osmar Francisco', '2026-07-13', '2026-07-15', 2, 2, 180.00, 360.00, 360.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (223, 'Osmar Marciano/ Francisco Da Chagas', '2026-07-13', '2026-07-15', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (223, 'Osmar Francisco', '2026-07-14', '2026-07-15', 1, 2, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (223, 'Ana Luiza do Amaral Pinto', '2026-07-25', '2026-07-27', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (305, 'KATIA MAYSE (AMERICA)', '2025-05-20', '2025-05-21', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (305, 'ROBSON PEIXOTO (EMPRESA JYAS)', '2025-06-30', '2025-07-01', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (305, 'WELISSON DE OLIVEIRA VILELA', '2026-07-24', '2026-07-26', 2, 2, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'FLAVIO BORGES (POTENCIAL)', '2026-06-16', '2026-06-18', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'FLAVIO BORGES (POTENCIAL)', '2026-06-18', '2026-06-19', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'FLAVIO BORGES (POTENCIAL)', '2026-06-23', '2026-06-24', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'JOSUEL - MICHEL (POTENCIAL)', '2026-07-02', '2026-07-03', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'JOSUEL - POTENCIAL', '2026-07-03', '2026-07-04', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'JOSUEL - ALISSON - POTENCIAL', '2026-07-04', '2026-07-08', 4, 2, 110.00, 440.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'ALISSON - POTENCIAL', '2026-07-08', '2026-07-09', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'ALISSON - MICHEL - POTENCIAL', '2026-07-09', '2026-07-13', 4, 2, 110.00, 440.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'MICHEL  (POTENCIAL)', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'Michel potência', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (306, 'Michel', '2026-07-14', '2026-07-15', 1, 2, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (306, 'Michel josuel', '2026-07-14', '2026-07-15', 1, 2, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (306, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (306, 'Cantisani Angelina', '2026-09-11', '2026-09-13', 2, 2, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'VALDEMIR (POTENCIAL)', '2026-06-17', '2026-06-18', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'Plinio de Souza Neto (POTENCIAL)', '2026-06-25', '2026-06-26', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'VANCLEI - POTENCIAL', '2026-07-02', '2026-07-04', 2, 1, 110.00, 220.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'VANCLEI - JOÃO VITOR - POTENCIAL', '2026-07-04', '2026-07-08', 4, 2, 110.00, 440.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'JOÃO VITOR - POTENCIAL', '2026-07-08', '2026-07-13', 5, 1, 110.00, 550.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'ALISSON (POTENCIAL)', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (307, 'Alisson', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (307, 'Vancelei potencial', '2026-07-14', '2026-07-15', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (307, 'Vancelei', '2026-07-14', '2026-07-15', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (307, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 2, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (308, 'PAVICAN', '2025-11-22', '2025-11-24', 2, 1, 90.00, 180.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (308, 'PAVICAN', '2025-11-24', '2025-11-28', 4, 2, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (101, 'José Afonso', '2026-07-14', '2026-07-15', 1, 1, 80.00, 80.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (102, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (101, 'Isabela Rezende', '2026-07-25', '2026-07-26', 1, 1, 90.00, 90.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (102, 'Simero Paz De Almeida Filho Das Graças', '2025-08-06', '2025-08-11', 5, 1, 90.00, 450.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (102, 'EDMÁRCIO JOSÉ GONÇALVES', '2026-07-13', '2026-07-17', 4, 1, 90.00, 360.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (102, 'Edmarcio', '2026-07-13', '2026-07-14', 1, 1, 90.00, 90.00, 90.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (102, 'Edmarcio empresa', '2026-07-14', '2026-07-17', 3, 1, 90.00, 270.00, 270.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (103, 'Mauro Cesar Dos Santos', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV'),
    (103, 'Mauro cesar', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 110.00, 'CSV historico', true, 'finalizado', 'Importacao CSV'),
    (104, 'Alexandre Ferreira Gabriel', '2026-07-13', '2026-07-14', 1, 1, 110.00, 110.00, 0.00, 'CSV historico', false, 'reservado', 'Importacao CSV')
)
insert into public.reservations (company_id, quarto, cliente_nome, checkin, checkout, diarias, pessoas, valor_diaria, valor_total, valor_pago, pagamento, pago, status, canal)
select c.id, i.quarto, i.cliente_nome, i.checkin::date, i.checkout::date, i.diarias, i.pessoas, i.valor_diaria, i.valor_total, i.valor_pago, i.pagamento, i.pago, i.status, i.canal
from input_rows i
cross join target_company c
where exists (select 1 from public.rooms r where r.company_id = c.id and r.numero = i.quarto)
  and not exists (
    select 1 from public.reservations r
    where r.company_id = c.id
      and r.quarto = i.quarto
      and lower(r.cliente_nome) = lower(i.cliente_nome)
      and r.checkin = i.checkin::date
      and r.checkout = i.checkout::date
      and r.valor_total = i.valor_total
  );

-- Despesas inferidas do extrato Booking: comissoes por reserva.
with target_company as (
  select id from public.companies
  where slug = 'hotel-real-cruzilia' or nome ilike '%Hotel Real%'
  order by created_at
  limit 1
), booking_expenses(data, categoria, descricao, valor, pagamento, fornecedor, observacoes) as (
  values
    ('2025-12-29', 'Comissao Booking', 'Comissao Booking reserva 6231043028', 103.35, 'Fatura Booking', 'Booking.com', 'Hospede: Rebelo Alana. Valor bruto Booking: R$ 795.00. Comissao: 13.00%.'),
    ('2025-12-30', 'Comissao Booking', 'Comissao Booking reserva 5330608903', 103.35, 'Fatura Booking', 'Booking.com', 'Hospede: Leonardo Cruz. Valor bruto Booking: R$ 795.00. Comissao: 13.00%.'),
    ('2025-12-30', 'Comissao Booking', 'Comissao Booking reserva 5889309452', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Faria Ihasmym. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2025-12-30', 'Comissao Booking', 'Comissao Booking reserva 6522255677', 220.35, 'Fatura Booking', 'Booking.com', 'Hospede: Paulo Liberato
Paulo Liberato
Paulo Liberato. Valor bruto Booking: R$ 1695.00. Comissao: 13.00%.'),
    ('2025-12-30', 'Comissao Booking', 'Comissao Booking reserva 6631486980', 103.35, 'Fatura Booking', 'Booking.com', 'Hospede: Leonardo Cruz. Valor bruto Booking: R$ 795.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5180192228', 221.00, 'Fatura Booking', 'Booking.com', 'Hospede: Samanta Palomares
Samanta Palomares
Samanta Palomares. Valor bruto Booking: R$ 1700.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5221182311', 49.40, 'Fatura Booking', 'Booking.com', 'Hospede: Arielly Farias. Valor bruto Booking: R$ 380.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5358002328', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: José turra. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5358013234', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: Bruno Marques. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5358067876', 103.35, 'Fatura Booking', 'Booking.com', 'Hospede: Marielen Damascena. Valor bruto Booking: R$ 795.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5383984085', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: Tais Marques. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5410281640', 127.40, 'Fatura Booking', 'Booking.com', 'Hospede: Priscilla Keila Nogueira Lopes. Valor bruto Booking: R$ 980.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5637593953', 49.40, 'Fatura Booking', 'Booking.com', 'Hospede: ana maria alves da silva torres. Valor bruto Booking: R$ 380.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5671281807', 68.90, 'Fatura Booking', 'Booking.com', 'Hospede: -
Arielly Farias. Valor bruto Booking: R$ 530.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 5718722034', 95.55, 'Fatura Booking', 'Booking.com', 'Hospede: Letícia Machado De Oliveira. Valor bruto Booking: R$ 735.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6038907946', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: Maria Eduarda Alves Ribeiro. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6185461972', 19.50, 'Fatura Booking', 'Booking.com', 'Hospede: José Olimpio Domingues Junior. Valor bruto Booking: R$ 150.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6200467946', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: Emanuelli Zerbinatto. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6288548384', 58.50, 'Fatura Booking', 'Booking.com', 'Hospede: MARIA LUCIA RUFINO. Valor bruto Booking: R$ 450.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6383951803', 49.40, 'Fatura Booking', 'Booking.com', 'Hospede: Arielly Farias. Valor bruto Booking: R$ 380.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6425332929', 49.40, 'Fatura Booking', 'Booking.com', 'Hospede: Arielly Farias. Valor bruto Booking: R$ 380.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6538554654', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: -. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6592669531', 103.35, 'Fatura Booking', 'Booking.com', 'Hospede: André Matias. Valor bruto Booking: R$ 795.00. Comissao: 13.00%.'),
    ('2025-12-31', 'Comissao Booking', 'Comissao Booking reserva 6724480075', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: martins welliton. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2026-01-01', 'Comissao Booking', 'Comissao Booking reserva 6048900907', 34.45, 'Fatura Booking', 'Booking.com', 'Hospede: Angelo Gomide Mendes. Valor bruto Booking: R$ 265.00. Comissao: 13.00%.'),
    ('2026-01-03', 'Comissao Booking', 'Comissao Booking reserva 6775047110', 133.25, 'Fatura Booking', 'Booking.com', 'Hospede: Gilberto Araújo Silva
Gilberto Araújo Silva
Gilberto Araújo Silva. Valor bruto Booking: R$ 1025.00. Comissao: 13.00%.'),
    ('2026-01-07', 'Comissao Booking', 'Comissao Booking reserva 5153522720', 33.80, 'Fatura Booking', 'Booking.com', 'Hospede: Alfredo Ayres. Valor bruto Booking: R$ 260.00. Comissao: 13.00%.'),
    ('2026-01-10', 'Comissao Booking', 'Comissao Booking reserva 6758644361', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Paulo Eduardo S De Assunção. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-01-11', 'Comissao Booking', 'Comissao Booking reserva 5305244752', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: -
Everton Waldman. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-01-14', 'Comissao Booking', 'Comissao Booking reserva 6323974736', 33.80, 'Fatura Booking', 'Booking.com', 'Hospede: Amanda Silveira
Amanda Silveira. Valor bruto Booking: R$ 260.00. Comissao: 13.00%.'),
    ('2026-01-17', 'Comissao Booking', 'Comissao Booking reserva 5007777569', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Olivia Marques. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-01-17', 'Comissao Booking', 'Comissao Booking reserva 5144409089', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Paulo Vitor Da Costa Costa. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-01-27', 'Comissao Booking', 'Comissao Booking reserva 5476924762', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: ACÁCIO FRANCISCO DE OLIVEIRA. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-01-29', 'Comissao Booking', 'Comissao Booking reserva 6995174045', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Luana Silveira. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-01-30', 'Comissao Booking', 'Comissao Booking reserva 6659546047', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Risa Andrade Sousa. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-02-02', 'Comissao Booking', 'Comissao Booking reserva 5296854740', 97.50, 'Fatura Booking', 'Booking.com', 'Hospede: Anjos Camila
Anjos Camila. Valor bruto Booking: R$ 750.00. Comissao: 13.00%.'),
    ('2026-02-05', 'Comissao Booking', 'Comissao Booking reserva 6702770210', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: irimar novaes silva. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-02-06', 'Comissao Booking', 'Comissao Booking reserva 5016661939', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Alexandre Antonio Miranda Vianna. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-02-06', 'Comissao Booking', 'Comissao Booking reserva 5149542647', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Affonso Lopes de Aguiar Júnior. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-02-06', 'Comissao Booking', 'Comissao Booking reserva 6842386769', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Lucas Gomes de Carvalho. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-02-06', 'Comissao Booking', 'Comissao Booking reserva 6932795735', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Tiago Oliveira Prates da Fonseca. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-02-10', 'Comissao Booking', 'Comissao Booking reserva 6334115674', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Volker Totzauer. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-02-13', 'Comissao Booking', 'Comissao Booking reserva 5969264400', 115.05, 'Fatura Booking', 'Booking.com', 'Hospede: Sthephane Trigolo. Valor bruto Booking: R$ 885.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5078653131', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: silva antonio de assis. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5255270168', 153.40, 'Fatura Booking', 'Booking.com', 'Hospede: Fernando Jhonis Pereira Junior. Valor bruto Booking: R$ 1180.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5666981296', 61.75, 'Fatura Booking', 'Booking.com', 'Hospede: Silva Davi
Silva Davi. Valor bruto Booking: R$ 475.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5729546605', 153.40, 'Fatura Booking', 'Booking.com', 'Hospede: Natelze Santos. Valor bruto Booking: R$ 1180.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5732580123', 148.20, 'Fatura Booking', 'Booking.com', 'Hospede: Qualiato Malu. Valor bruto Booking: R$ 1140.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5894912167', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Suélen Aparecida. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 5921429634', 115.05, 'Fatura Booking', 'Booking.com', 'Hospede: Joana Darc Barcelos Da Silva. Valor bruto Booking: R$ 885.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 6045628819', 111.15, 'Fatura Booking', 'Booking.com', 'Hospede: Janete Nagasawa Sato. Valor bruto Booking: R$ 855.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 6329449190', 178.10, 'Fatura Booking', 'Booking.com', 'Hospede: frederico Akira Miyasawa
frederico Akira Miyasawa. Valor bruto Booking: R$ 1370.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 6392213843', 127.40, 'Fatura Booking', 'Booking.com', 'Hospede: Carla Albaneze. Valor bruto Booking: R$ 980.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 6746490936', 148.20, 'Fatura Booking', 'Booking.com', 'Hospede: albaneze daniela. Valor bruto Booking: R$ 1140.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 6834620800', 153.40, 'Fatura Booking', 'Booking.com', 'Hospede: Natelze Santos. Valor bruto Booking: R$ 1180.00. Comissao: 13.00%.'),
    ('2026-02-14', 'Comissao Booking', 'Comissao Booking reserva 6949091067', 111.15, 'Fatura Booking', 'Booking.com', 'Hospede: Si Kok Tjioe. Valor bruto Booking: R$ 855.00. Comissao: 13.00%.'),
    ('2026-02-15', 'Comissao Booking', 'Comissao Booking reserva 5238532595', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Lethícia Cristiny. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-15', 'Comissao Booking', 'Comissao Booking reserva 5751377011', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Alexandre Laredo. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-15', 'Comissao Booking', 'Comissao Booking reserva 6150460638', 23.40, 'Fatura Booking', 'Booking.com', 'Hospede: molina iqueoka Danilo Yutaka. Valor bruto Booking: R$ 180.00. Comissao: 13.00%.'),
    ('2026-02-15', 'Comissao Booking', 'Comissao Booking reserva 6196390166', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Thomás Viana de Souza. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-16', 'Comissao Booking', 'Comissao Booking reserva 5081879695', 74.10, 'Fatura Booking', 'Booking.com', 'Hospede: Beatriz Francisco
Maria Eduarda Assis. Valor bruto Booking: R$ 570.00. Comissao: 13.00%.'),
    ('2026-02-16', 'Comissao Booking', 'Comissao Booking reserva 6685913718', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Julio Fernandes. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-16', 'Comissao Booking', 'Comissao Booking reserva 6773961115', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Danielle Agra. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-16', 'Comissao Booking', 'Comissao Booking reserva 6950572186', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Pimenta Vitoria. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-17', 'Comissao Booking', 'Comissao Booking reserva 5162274129', 44.20, 'Fatura Booking', 'Booking.com', 'Hospede: Carla Oliveira. Valor bruto Booking: R$ 340.00. Comissao: 13.00%.'),
    ('2026-02-17', 'Comissao Booking', 'Comissao Booking reserva 5978210123', 38.35, 'Fatura Booking', 'Booking.com', 'Hospede: Gomes Acacio. Valor bruto Booking: R$ 295.00. Comissao: 13.00%.'),
    ('2026-02-21', 'Comissao Booking', 'Comissao Booking reserva 5452906758', 48.75, 'Fatura Booking', 'Booking.com', 'Hospede: João Pedro Magalhães Terena
-. Valor bruto Booking: R$ 375.00. Comissao: 13.00%.'),
    ('2026-03-03', 'Comissao Booking', 'Comissao Booking reserva 5230113510', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Leonardo José de Souza. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-03-03', 'Comissao Booking', 'Comissao Booking reserva 6367957065', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: William Cleber Domingues Silva. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-03-05', 'Comissao Booking', 'Comissao Booking reserva 5789274078', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Flavio Soares. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-03-06', 'Comissao Booking', 'Comissao Booking reserva 5281434655', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Ricardo Bastos. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-03-08', 'Comissao Booking', 'Comissao Booking reserva 6617468621', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: -. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-03-13', 'Comissao Booking', 'Comissao Booking reserva 5954708861', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Rocha Vinicius. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-03-14', 'Comissao Booking', 'Comissao Booking reserva 5385341164', 48.75, 'Fatura Booking', 'Booking.com', 'Hospede: Alexandre Laredo
Alexandre Laredo. Valor bruto Booking: R$ 375.00. Comissao: 13.00%.'),
    ('2026-03-17', 'Comissao Booking', 'Comissao Booking reserva 5865562911', 84.50, 'Fatura Booking', 'Booking.com', 'Hospede: Jakub Frączek. Valor bruto Booking: R$ 650.00. Comissao: 13.00%.'),
    ('2026-03-18', 'Comissao Booking', 'Comissao Booking reserva 5866668667', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Renan Miranda. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-03-22', 'Comissao Booking', 'Comissao Booking reserva 6842288159', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Antônio Ivair Franceschini. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-03-23', 'Comissao Booking', 'Comissao Booking reserva 6307361842', 67.60, 'Fatura Booking', 'Booking.com', 'Hospede: Hilde Van Maele. Valor bruto Booking: R$ 520.00. Comissao: 13.00%.'),
    ('2026-04-02', 'Comissao Booking', 'Comissao Booking reserva 5120890185', 70.20, 'Fatura Booking', 'Booking.com', 'Hospede: Junia Elcio de Souza Silva. Valor bruto Booking: R$ 540.00. Comissao: 13.00%.'),
    ('2026-04-03', 'Comissao Booking', 'Comissao Booking reserva 5610476003', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Erica Pereira. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-03', 'Comissao Booking', 'Comissao Booking reserva 5765139481', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Luciana Alcatrao. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-03', 'Comissao Booking', 'Comissao Booking reserva 6307304582', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Elisangela Serigioli. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-03', 'Comissao Booking', 'Comissao Booking reserva 6746531885', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Trindade Edson. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-04', 'Comissao Booking', 'Comissao Booking reserva 5303474944', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Jose Luis Neves. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-05', 'Comissao Booking', 'Comissao Booking reserva 6596698098', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: silva claudio. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-09', 'Comissao Booking', 'Comissao Booking reserva 5116290437', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Andre Luiz Fidelis. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-09', 'Comissao Booking', 'Comissao Booking reserva 5648004820', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Jessica Valianti. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-10', 'Comissao Booking', 'Comissao Booking reserva 6392829243', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: ALFREDO LEMOS. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-14', 'Comissao Booking', 'Comissao Booking reserva 5486155601', 159.25, 'Fatura Booking', 'Booking.com', 'Hospede: Washington Fernando De Lima. Valor bruto Booking: R$ 1225.00. Comissao: 13.00%.'),
    ('2026-04-14', 'Comissao Booking', 'Comissao Booking reserva 6151742132', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Francine Fernandes. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-15', 'Comissao Booking', 'Comissao Booking reserva 6395026946', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Antonio Ricardo Pimentel. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-15', 'Comissao Booking', 'Comissao Booking reserva 6636680392', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Antonio Ricardo Pimentel. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-17', 'Comissao Booking', 'Comissao Booking reserva 6526633549', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Marcelo Vieira. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-17', 'Comissao Booking', 'Comissao Booking reserva 6977937624', 33.80, 'Fatura Booking', 'Booking.com', 'Hospede: Costa Daniel. Valor bruto Booking: R$ 260.00. Comissao: 13.00%.'),
    ('2026-04-18', 'Comissao Booking', 'Comissao Booking reserva 5445792547', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Aline Alvarenga. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-18', 'Comissao Booking', 'Comissao Booking reserva 5480155297', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Antônio Alceu de Araújo junior Araujo. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-18', 'Comissao Booking', 'Comissao Booking reserva 6132438007', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Milena Neves. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-18', 'Comissao Booking', 'Comissao Booking reserva 6841088057', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: leandro vieira soares da silva. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-18', 'Comissao Booking', 'Comissao Booking reserva 6993078661', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Elizabeth Antunes. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-04-21', 'Comissao Booking', 'Comissao Booking reserva 5456254119', 46.80, 'Fatura Booking', 'Booking.com', 'Hospede: Francisco Marques. Valor bruto Booking: R$ 360.00. Comissao: 13.00%.'),
    ('2026-04-21', 'Comissao Booking', 'Comissao Booking reserva 6574975341', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Cristina Costa. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-04-21', 'Comissao Booking', 'Comissao Booking reserva 6685648190', 67.60, 'Fatura Booking', 'Booking.com', 'Hospede: Leandro Cordeiro
Fernando Viana
Marcos Juliano Pereira
Gustavo Alves. Valor bruto Booking: R$ 520.00. Comissao: 13.00%.'),
    ('2026-04-25', 'Comissao Booking', 'Comissao Booking reserva 6450333881', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Erika Da Silva. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-28', 'Comissao Booking', 'Comissao Booking reserva 5077744152', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: luciana garcia. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-29', 'Comissao Booking', 'Comissao Booking reserva 5044215687', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Hector Amaral Nunes de Oliveira. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-04-30', 'Comissao Booking', 'Comissao Booking reserva 6600357530', 46.80, 'Fatura Booking', 'Booking.com', 'Hospede: Warlem Fernandes da Silva. Valor bruto Booking: R$ 360.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 5060611244', 161.20, 'Fatura Booking', 'Booking.com', 'Hospede: Daniel Donola
Daniel Donola
Daniel Donola. Valor bruto Booking: R$ 1240.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 6144507760', 33.80, 'Fatura Booking', 'Booking.com', 'Hospede: Leticia Delciello Eugenio Silva. Valor bruto Booking: R$ 260.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 6263114276', 95.55, 'Fatura Booking', 'Booking.com', 'Hospede: Adriana Araujo. Valor bruto Booking: R$ 735.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 6520009096', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Rafael Lanza Gonçalves. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 6585433598', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Daniel Piologro. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 6617226812', 93.60, 'Fatura Booking', 'Booking.com', 'Hospede: Simone Anjos. Valor bruto Booking: R$ 720.00. Comissao: 13.00%.'),
    ('2026-05-01', 'Comissao Booking', 'Comissao Booking reserva 6845605226', 95.55, 'Fatura Booking', 'Booking.com', 'Hospede: Rodrigues Helane. Valor bruto Booking: R$ 735.00. Comissao: 13.00%.'),
    ('2026-05-02', 'Comissao Booking', 'Comissao Booking reserva 6955333141', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Eduardo Ferreira de Castro. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-03', 'Comissao Booking', 'Comissao Booking reserva 6529386745', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: JOSIAS FELIX DA SILVA. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-03', 'Comissao Booking', 'Comissao Booking reserva 6603000402', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Danuza Maria Oliveira de Melo. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-08', 'Comissao Booking', 'Comissao Booking reserva 5246520682', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Aline Cezar Nogueira. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-05-08', 'Comissao Booking', 'Comissao Booking reserva 5340845753', 33.80, 'Fatura Booking', 'Booking.com', 'Hospede: Clezio Fernando Clézio. Valor bruto Booking: R$ 260.00. Comissao: 13.00%.'),
    ('2026-05-09', 'Comissao Booking', 'Comissao Booking reserva 5469774485', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Raphael César Estevão. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-09', 'Comissao Booking', 'Comissao Booking reserva 5905313864', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Efigenia Marino. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-09', 'Comissao Booking', 'Comissao Booking reserva 6206303949', 46.80, 'Fatura Booking', 'Booking.com', 'Hospede: André Luis Esteves. Valor bruto Booking: R$ 360.00. Comissao: 13.00%.'),
    ('2026-05-09', 'Comissao Booking', 'Comissao Booking reserva 6534556430', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Matheus César. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-10', 'Comissao Booking', 'Comissao Booking reserva 5359669635', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Arrelaro Luciana. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-05-14', 'Comissao Booking', 'Comissao Booking reserva 5954176302', 48.75, 'Fatura Booking', 'Booking.com', 'Hospede: Otacilio Batista
-. Valor bruto Booking: R$ 375.00. Comissao: 13.00%.'),
    ('2026-05-14', 'Comissao Booking', 'Comissao Booking reserva 6265718049', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Bia Carvalho. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-05-15', 'Comissao Booking', 'Comissao Booking reserva 6639453074', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Ariane julia Serafim. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-05-16', 'Comissao Booking', 'Comissao Booking reserva 5712167322', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Hermes Arcanjo Teixeira. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-05-22', 'Comissao Booking', 'Comissao Booking reserva 6499326661', 97.50, 'Fatura Booking', 'Booking.com', 'Hospede: Renato Henrique Camargo
Renato Henrique Camargo. Valor bruto Booking: R$ 750.00. Comissao: 13.00%.'),
    ('2026-05-23', 'Comissao Booking', 'Comissao Booking reserva 5157014461', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: NICOLE DOS SANTOS. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-03', 'Comissao Booking', 'Comissao Booking reserva 5640205650', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Paula Castor de Freitas Ferreira. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 5069115732', 95.55, 'Fatura Booking', 'Booking.com', 'Hospede: Aline Martin. Valor bruto Booking: R$ 735.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 5240910133', 95.55, 'Fatura Booking', 'Booking.com', 'Hospede: jaisson silva. Valor bruto Booking: R$ 735.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 5242841200', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: SAULO CUNHA GUIMARÃES. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 5594761505', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Ricardo Picoli. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 5742689415', 93.60, 'Fatura Booking', 'Booking.com', 'Hospede: Queiroz Cássia. Valor bruto Booking: R$ 720.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 6519702833', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: David Falcão. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-06-04', 'Comissao Booking', 'Comissao Booking reserva 6664635609', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Joao Vitor  Martins. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-05', 'Comissao Booking', 'Comissao Booking reserva 5193511448', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Elisangela Dalmolin Do Amaral. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-06-05', 'Comissao Booking', 'Comissao Booking reserva 5525182184', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Toscanini Batista. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-05', 'Comissao Booking', 'Comissao Booking reserva 5814832744', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Fernanda Torres. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-05', 'Comissao Booking', 'Comissao Booking reserva 6401975088', 97.50, 'Fatura Booking', 'Booking.com', 'Hospede: -
Rodrigo Castro. Valor bruto Booking: R$ 750.00. Comissao: 13.00%.'),
    ('2026-06-05', 'Comissao Booking', 'Comissao Booking reserva 6587920528', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Eliasar Pereira Eduardo. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 5087301679', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Italo Guimarães. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 5277710661', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Ricardo de Araújo Da Silva Faustino. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 5798948219', 46.80, 'Fatura Booking', 'Booking.com', 'Hospede: Gabriela Moreira Gualberto de Souza. Valor bruto Booking: R$ 360.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 6355258228', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Felipe Andrade Silva. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 6546137253', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Silva Rodrigo. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 6579872774', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Alessandra Barbosa Lima. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 6757296574', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Alessandra Barbosa Lima. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.'),
    ('2026-06-06', 'Comissao Booking', 'Comissao Booking reserva 6911791583', 63.70, 'Fatura Booking', 'Booking.com', 'Hospede: Andreza Souza. Valor bruto Booking: R$ 490.00. Comissao: 13.00%.'),
    ('2026-06-10', 'Comissao Booking', 'Comissao Booking reserva 5894283338', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Maitê Marques. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-23', 'Comissao Booking', 'Comissao Booking reserva 5177306458', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: paula ondir. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-23', 'Comissao Booking', 'Comissao Booking reserva 5383157670', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Luiz Carlos Rodrigues da Slva. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-24', 'Comissao Booking', 'Comissao Booking reserva 5538373046', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Luiz Carlos Rodrigues da Slva. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-24', 'Comissao Booking', 'Comissao Booking reserva 6929827111', 50.70, 'Fatura Booking', 'Booking.com', 'Hospede: Júlio Filho. Valor bruto Booking: R$ 390.00. Comissao: 13.00%.'),
    ('2026-06-25', 'Comissao Booking', 'Comissao Booking reserva 5360919557', 33.80, 'Fatura Booking', 'Booking.com', 'Hospede: Eduardo Fonseca. Valor bruto Booking: R$ 260.00. Comissao: 13.00%.'),
    ('2026-06-26', 'Comissao Booking', 'Comissao Booking reserva 6720928748', 16.90, 'Fatura Booking', 'Booking.com', 'Hospede: Donisete Lima. Valor bruto Booking: R$ 130.00. Comissao: 13.00%.'),
    ('2026-06-28', 'Comissao Booking', 'Comissao Booking reserva 6205456973', 31.85, 'Fatura Booking', 'Booking.com', 'Hospede: Arnaldo Leite Pinto Garcia. Valor bruto Booking: R$ 245.00. Comissao: 13.00%.')
)
insert into public.expenses (company_id, data, categoria, descricao, valor, pagamento, fornecedor, observacoes)
select c.id, e.data::date, e.categoria, e.descricao, e.valor, e.pagamento, e.fornecedor, e.observacoes
from booking_expenses e
cross join target_company c
where e.data is not null
  and not exists (
    select 1 from public.expenses x
    where x.company_id = c.id
      and x.data = e.data::date
      and x.descricao = e.descricao
      and x.valor = e.valor
  );

-- Linhas originais uteis: 153
-- Linhas apos remover duplicadas: 153
-- Comissoes Booking para despesas: 158
