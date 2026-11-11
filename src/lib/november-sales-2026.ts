// Resumo conferido a partir de "vendas produtos(1).xlsx", aba VENDAS, em 11/11/2026.
// Somente agregados: não publica nomes de hóspedes nem dados pessoais.
// TOTAL da planilha não é válido (#NAME? em 49 registros), portanto não calcular receita.
export const november2026Sales = {
  start: "2026-11-01",
  end: "2026-11-11",
  rows: 49,
  units: 57,
  totalStatus: "indisponivel_formulas_invalidas",
  source: "vendas produtos(1).xlsx · aba VENDAS",
  byDay: [
    ["01/11", 7, 10], ["02/11", 2, 2], ["03/11", 5, 5],
    ["04/11", 6, 6], ["05/11", 7, 7], ["06/11", 2, 2],
    ["07/11", 6, 7], ["08/11", 7, 10], ["09/11", 2, 2],
    ["10/11", 3, 4], ["11/11", 2, 2],
  ] as readonly (readonly [string, number, number])[],
  byProduct: [
    ["ÁGUA", 14], ["BRIGADEIRO", 10], ["COCA-ZERO", 6],
    ["FANTA LARANJA", 4], ["MONSTER MANGA", 4], ["ÁGUA 1,5", 3],
    ["KIT KAT", 3], ["FANTA UVA", 2], ["MONSTER ULTRA", 2],
    ["TRIDENTE MELANCIA", 2], ["TRIDENTE MENTA", 2], ["COCA-LATA", 1],
    ["CERVEJA EISEBAHN", 1], ["CERVEJA ESTRELLA", 1],
    ["PRINGLES", 1], ["SPRITE", 1],
  ] as readonly (readonly [string, number])[],
  paymentEntries: [
    ["A receber", 16], ["Crédito", 11], ["Débito", 9], ["Dinheiro", 8], ["PIX", 5],
  ] as readonly (readonly [string, number])[],
} as const;
