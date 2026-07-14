-- Seed the default room inventory used by the room map and QR code pages.
-- Keeps any existing manual room situation (cleaning/maintenance) on conflict.
INSERT INTO public.rooms (numero, andar, configuracao, preco, banheiro, situacao)
VALUES
  (101, 1, 'casal', 90, true, null),
  (102, 1, 'casal', 90, true, null),
  (103, 1, 'casal/solteiro', 110, true, null),
  (104, 1, 'casal/solteiro', 110, true, null),
  (105, 1, 'solteiro', 90, true, null),
  (202, 2, 'casal/solteiro', 80, false, null),
  (203, 2, 'casal/solteiro', 80, false, null),
  (204, 2, 'casal/solteiro', 80, false, null),
  (205, 2, 'casal', 90, true, null),
  (206, 2, 'casal', 90, true, null),
  (207, 2, 'casal', 110, true, null),
  (208, 2, '2 solteiro', 90, true, null),
  (209, 2, '2 solteiro', 90, true, null),
  (210, 2, 'casal/solteiro', 110, true, null),
  (211, 2, '2 solteiro', 90, true, null),
  (212, 2, 'casal', 80, false, null),
  (214, 2, 'solteiro', 110, true, null),
  (215, 2, '2 solteiro', 90, true, null),
  (216, 2, 'solteiro', 90, true, null),
  (217, 2, 'solteiro', 90, true, null),
  (218, 2, 'casal', 90, true, null),
  (219, 2, 'casal', 90, true, null),
  (220, 2, 'casal', 90, true, null),
  (221, 2, 'casal/solteiro', 110, true, null),
  (222, 2, 'casal/solteiro', 90, true, null),
  (223, 2, '2 solteiro', 90, true, null),
  (230, 2, '2 solteiro', 90, true, null),
  (301, 3, 'casal/solteiro', 80, false, null),
  (302, 3, 'casal/solteiro', 80, false, null),
  (303, 3, 'casal/solteiro', 80, false, null),
  (304, 3, 'solteiro', 80, false, null),
  (305, 3, 'casal/solteiro', 90, true, null),
  (306, 3, 'casal/solteiro', 110, true, null),
  (307, 3, 'casal/solteiro', 110, true, null),
  (308, 3, 'casal/solteiro', 90, true, null)
ON CONFLICT (numero) DO UPDATE
SET
  andar = EXCLUDED.andar,
  configuracao = EXCLUDED.configuracao,
  preco = EXCLUDED.preco,
  banheiro = EXCLUDED.banheiro,
  situacao = public.rooms.situacao;

-- Normalize CPF to digits-only and prevent duplicate CPF values.
-- Empty CPF remains allowed.
CREATE UNIQUE INDEX IF NOT EXISTS clients_cpf_digits_unique
ON public.clients ((regexp_replace(cpf, '\D', '', 'g')))
WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') <> '';
