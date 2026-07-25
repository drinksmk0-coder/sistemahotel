import type { RateRule, Room } from "@/lib/data";
import { nightsBetween } from "@/lib/format";

export type RateQuote = {
  total: number;
  averageNightly: number;
  nights: number;
  appliedRules: { date: string; name: string; value: number }[];
};

export function quoteStay(
  room: Room | undefined,
  rules: RateRule[],
  checkin: string,
  checkout: string,
  guests: number,
): RateQuote {
  const nights = nightsBetween(checkin, checkout);
  if (!room || nights <= 0) {
    return { total: 0, averageNightly: Number(room?.preco ?? 0), nights: 0, appliedRules: [] };
  }

  const appliedRules: RateQuote["appliedRules"] = [];
  let total = 0;

  for (let index = 0; index < nights; index += 1) {
    const date = addDaysISO(checkin, index);
    const rule = bestRule(rules, room, date, nights);
    const base = Number(rule?.valor_base ?? room.preco ?? 0);
    const includedGuests = Math.max(1, Number(rule?.hospedes_inclusos ?? guests));
    const extraGuests = Math.max(0, guests - includedGuests);
    const value = base + extraGuests * Number(rule?.adicional_hospede ?? 0);
    total += value;
    appliedRules.push({
      date,
      name: rule?.nome ?? "Tarifa padrão do quarto",
      value,
    });
  }

  return {
    total,
    averageNightly: nights ? total / nights : 0,
    nights,
    appliedRules,
  };
}

function bestRule(rules: RateRule[], room: Room, date: string, nights: number) {
  return rules
    .filter(
      (rule) =>
        rule.ativo &&
        rule.inicio <= date &&
        rule.fim >= date &&
        nights >= Number(rule.minimo_diarias) &&
        (!rule.configuracao_quarto ||
          normalize(rule.configuracao_quarto) === normalize(room.configuracao)),
    )
    .sort((left, right) => {
      const priority = Number(right.prioridade) - Number(left.prioridade);
      if (priority !== 0) return priority;
      const specificity =
        Number(Boolean(right.configuracao_quarto)) - Number(Boolean(left.configuracao_quarto));
      if (specificity !== 0) return specificity;
      return right.inicio.localeCompare(left.inicio);
    })[0];
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function addDaysISO(date: string, days: number) {
  const current = new Date(`${date}T12:00:00`);
  current.setDate(current.getDate() + days);
  return current.toISOString().slice(0, 10);
}
