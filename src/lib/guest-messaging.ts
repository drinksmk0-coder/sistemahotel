import { supabase } from "@/integrations/supabase/client";
import type { Client, Reservation } from "@/lib/data";
import type { GuestAccount } from "@/lib/guest-account";
import { fmtBRL, fmtDate } from "@/lib/format";
import { publicAppUrl } from "@/lib/brand";

export type GuestMessageKind = "fnrh" | "cobranca" | "avaliacao";

export type GuestMessageSettings = {
  pixKey: string;
  reviewUrl: string;
};

export function whatsappPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function whatsappUrl(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function createCheckinConfirmationMessage(
  reservation: Reservation,
  client: Client,
) {
  return [
    `Olá, ${firstName(client.nome || reservation.cliente_nome)}! Tudo bem?`,
    `Estamos confirmando sua hospedagem no Hotel Real Cruzília com entrada em ${fmtDate(reservation.checkin)} e saída em ${fmtDate(reservation.checkout)}.`,
    `Sua reserva está vinculada ao quarto ${reservation.quarto}.`,
    "Pode nos confirmar se sua chegada está mantida? Se já souber aproximadamente o horário, pode informar por aqui também.",
    "Aguardamos você!",
  ].join("\n\n");
}

export async function createFnrhMessage(
  reservation: Reservation,
  client: Client,
): Promise<string> {
  const existing = await (supabase as any)
    .from("guest_checkins")
    .select("public_token")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let token = existing.data?.public_token as string | undefined;
  if (!token) {
    const created = await (supabase as any)
      .from("guest_checkins")
      .insert({
        company_id: reservation.company_id,
        reservation_id: reservation.id,
        client_id: reservation.cliente_id ?? null,
      })
      .select("public_token")
      .single();
    if (created.error) throw created.error;
    token = created.data.public_token;
  }

  const formUrl = publicAppUrl(`/checkin-online#token=${encodeURIComponent(token)}`);
  return [
    `Olá, ${firstName(client.nome || reservation.cliente_nome)}!`,
    `Recebemos o sinal da sua reserva no Hotel Real Cruzília, de ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}.`,
    "Para agilizar sua chegada, preencha e assine a Ficha Nacional de Registro de Hóspedes pelo celular:",
    formUrl,
    "Ao finalizar, nossa recepção receberá os dados para conferência. Até breve!",
  ].join("\n\n");
}

export function createDebtMessage(
  reservation: Reservation,
  client: Client,
  account: GuestAccount,
  pixKey: string,
) {
  const details = [
    account.lodgingTotal > account.lodgingPaid
      ? `${fmtBRL(account.lodgingTotal - account.lodgingPaid)} de hospedagem`
      : "",
    account.extrasTotal > account.extrasPaid
      ? `${fmtBRL(account.extrasTotal - account.extrasPaid)} de consumos/serviços`
      : "",
  ].filter(Boolean);

  return [
    `Olá, ${firstName(client.nome || reservation.cliente_nome)}!`,
    `Consta na conta da sua hospedagem no quarto ${reservation.quarto} um saldo pendente de ${fmtBRL(account.balance)}${details.length ? ` (${details.join(" + ")})` : ""}.`,
    pixKey
      ? `Chave Pix para pagamento: ${pixKey}`
      : "Entre em contato com a recepção para receber os dados de pagamento.",
    "Após o pagamento, por favor envie o comprovante por aqui para conferência da recepção.",
    "Se o pagamento já foi realizado, desconsidere esta mensagem e nos envie o comprovante. Obrigado!",
  ].join("\n\n");
}

export function createReviewMessage(
  reservation: Reservation,
  client: Client,
  configuredReviewUrl: string,
) {
  const reviewUrl =
    configuredReviewUrl.trim() ||
    publicAppUrl(`/avaliar?quarto=${reservation.quarto}&empresa=${reservation.company_id}`);
  return [
    `Olá, ${firstName(client.nome || reservation.cliente_nome)}!`,
    "Agradecemos por se hospedar no Hotel Real Cruzília. Esperamos que tenha aproveitado sua estadia!",
    "Você poderia contar como foi sua experiência? É rápido e ajuda muito nossa equipe:",
    reviewUrl,
    "Muito obrigado e esperamos receber você novamente!",
  ].join("\n\n");
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "hóspede";
}
