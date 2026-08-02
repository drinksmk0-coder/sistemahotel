import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  ExternalLink,
  FileCheck2,
  FileText,
  MessageCircle,
  Printer,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany, type Client, type Reservation } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export type GuestCheckinSummary = {
  id: string;
  reservation_id: string;
  public_token: string;
  status: "enviado" | "preenchido" | "conferido" | "enviado_mtur" | "erro_mtur";
  form_data: Record<string, unknown> | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type Props = {
  reservation: Reservation;
  client?: Client;
  record?: GuestCheckinSummary;
  onChanged: () => void;
};

const SELECT_FIELDS = "id,reservation_id,public_token,status,form_data,submitted_at,reviewed_at";

const STATUS: Record<GuestCheckinSummary["status"], { label: string; short: string; className: string }> = {
  enviado: {
    label: "Aguardando preenchimento do hóspede",
    short: "Enviada",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  preenchido: {
    label: "FNRH recebida — aguardando conferência",
    short: "Recebida",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  conferido: {
    label: "FNRH conferida pela recepção",
    short: "Conferida",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  enviado_mtur: {
    label: "FNRH enviada ao MTur",
    short: "MTur",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  erro_mtur: {
    label: "FNRH exige revisão",
    short: "Revisar",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

export function FnrhReservationActions({ reservation, client, record, onChanged }: Props) {
  const company = useCurrentCompany();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<GuestCheckinSummary | undefined>(record);
  const [busy, setBusy] = useState(false);

  useEffect(() => setCurrent(record), [record]);

  useEffect(() => {
    if (!open || !company.data?.id || !current?.id) return;
    let active = true;
    void (supabase as any)
      .from("guest_checkins")
      .select(SELECT_FIELDS)
      .eq("company_id", company.data.id)
      .eq("id", current.id)
      .maybeSingle()
      .then((result: { data?: GuestCheckinSummary | null; error?: Error | null }) => {
        if (active && !result.error && result.data) setCurrent(result.data);
      });
    return () => {
      active = false;
    };
  }, [company.data?.id, current?.id, open]);

  const link = useMemo(() => {
    if (!current?.public_token || typeof window === "undefined") return "";
    return `${window.location.origin}/checkin-online?token=${current.public_token}`;
  }, [current?.public_token]);

  const printable = Boolean(current && ["preenchido", "conferido", "enviado_mtur"].includes(current.status));
  const status = current ? STATUS[current.status] : null;
  const preferences = useMemo(() => preferenceRows(current?.form_data), [current?.form_data]);
  const otherPreference = textValue(current?.form_data?.outras_preferencias);
  const accessibility = textValue(current?.form_data?.necessidade_acessibilidade);

  async function createLink() {
    if (!company.data?.id) {
      toast.error("Não foi possível identificar o hotel.");
      return;
    }

    setBusy(true);
    try {
      const existing = await (supabase as any)
        .from("guest_checkins")
        .select(SELECT_FIELDS)
        .eq("company_id", company.data.id)
        .eq("reservation_id", reservation.id)
        .maybeSingle();
      if (existing.error) throw existing.error;

      let next = existing.data as GuestCheckinSummary | null;
      if (!next) {
        const inserted = await (supabase as any)
          .from("guest_checkins")
          .insert({
            company_id: company.data.id,
            reservation_id: reservation.id,
            client_id: reservation.cliente_id ?? null,
            status: "enviado",
          })
          .select(SELECT_FIELDS)
          .single();
        if (inserted.error) throw inserted.error;
        next = inserted.data as GuestCheckinSummary;
      }

      setCurrent(next ?? undefined);
      onChanged();
      toast.success("Link individual da FNRH criado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o link da FNRH.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      window.prompt("Copie o link da FNRH:", link);
    }
  }

  async function markReviewed() {
    if (!current || current.status !== "preenchido") return;
    setBusy(true);
    try {
      const result = await (supabase as any)
        .from("guest_checkins")
        .update({ status: "conferido", reviewed_at: new Date().toISOString() })
        .eq("id", current.id)
        .select(SELECT_FIELDS)
        .single();
      if (result.error) throw result.error;
      setCurrent(result.data as GuestCheckinSummary);
      onChanged();
      toast.success("FNRH conferida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conferir a FNRH.");
    } finally {
      setBusy(false);
    }
  }

  const whatsappUrl = link ? buildWhatsappUrl(client?.telefone, reservation, link) : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-w-[7.4rem] items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold transition hover:-translate-y-px hover:shadow-sm ${status?.className ?? "border-border bg-background text-muted-foreground"}`}
        title={status?.label ?? "Gerar e enviar FNRH"}
      >
        <span className="flex items-center gap-1.5">
          {current?.status === "conferido" || current?.status === "enviado_mtur" ? <FileCheck2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          FNRH
        </span>
        <span className="whitespace-nowrap text-[9px]">{status?.short ?? "Criar"}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`FNRH — ${reservation.cliente_nome}`}>
        <div className="space-y-4">
          <div className="grid gap-2 rounded-xl border border-border bg-muted/35 p-3 text-xs sm:grid-cols-3">
            <Info label="Reserva" value={reservation.codigo_externo || reservation.id.slice(0, 8).toUpperCase()} />
            <Info label="Quarto atual" value={String(reservation.quarto)} />
            <Info label="Período" value={`${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}`} />
          </div>

          {!current ? (
            <div className="rounded-xl border border-dashed border-primary/35 bg-primary/5 p-5 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-primary" />
              <h3 className="font-black text-foreground">Criar formulário individual</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                O hóspede preencherá a FNRH, informará preferências como silêncio, ventilação, espaço e escadas, assinará e enviará tudo diretamente para esta reserva.
              </p>
              <button type="button" className="btn-primary mt-4 inline-flex items-center gap-2" onClick={() => void createLink()} disabled={busy}>
                <Send className="h-4 w-4" /> {busy ? "Criando…" : "Gerar link da FNRH"}
              </button>
            </div>
          ) : (
            <>
              <div className={`flex items-start gap-3 rounded-xl border p-3 ${STATUS[current.status].className}`}>
                {current.status === "preenchido" ? <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" /> : <FileText className="mt-0.5 h-5 w-5 shrink-0" />}
                <div>
                  <strong className="block text-sm">{STATUS[current.status].label}</strong>
                  <span className="text-[11px] opacity-80">
                    {current.submitted_at ? `Enviada pelo hóspede em ${formatDateTime(current.submitted_at)}` : "O formulário ainda não foi concluído."}
                  </span>
                </div>
              </div>

              {printable && (
                <section className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-foreground">Preferências para escolha do quarto</h3>
                      <p className="text-[10px] text-muted-foreground">Compare estas respostas com as características cadastradas dos quartos.</p>
                    </div>
                  </div>
                  {preferences.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {preferences.map((item) => (
                        <div key={item.label} className="rounded-lg border border-border bg-card px-3 py-2">
                          <span className="block text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">{item.label}</span>
                          <strong className="text-xs text-foreground">{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-xs font-semibold text-muted-foreground">O hóspede não informou preferências específicas.</p>
                  )}
                  {(accessibility || otherPreference) && (
                    <div className="mt-2 space-y-2">
                      {accessibility && <Detail label="Acessibilidade" value={accessibility} />}
                      {otherPreference && <Detail label="Outras necessidades" value={otherPreference} />}
                    </div>
                  )}
                </section>
              )}

              <label className="block text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Link do hóspede
                <div className="mt-1 flex min-w-0 gap-2">
                  <input className="field min-w-0 flex-1 text-xs" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
                  <button type="button" className="btn-ghost grid h-10 w-10 shrink-0 place-items-center p-0" onClick={() => void copyLink()} title="Copiar link">
                    <Clipboard className="h-4 w-4" />
                  </button>
                </div>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                {whatsappUrl ? (
                  <a className="btn-primary flex items-center justify-center gap-2" href={whatsappUrl} target="_blank" rel="noopener">
                    <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
                  </a>
                ) : (
                  <button type="button" className="btn-ghost flex items-center justify-center gap-2" onClick={() => toast.error("Cadastre o telefone do hóspede para usar o WhatsApp.")}>
                    <MessageCircle className="h-4 w-4" /> Sem telefone cadastrado
                  </button>
                )}
                <a className="btn-ghost flex items-center justify-center gap-2" href={link} target="_blank" rel="noopener">
                  <ExternalLink className="h-4 w-4" /> Abrir formulário
                </a>
              </div>

              {(current.status === "preenchido" || printable) && (
                <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
                  {current.status === "preenchido" ? (
                    <button type="button" className="btn-primary flex items-center justify-center gap-2" onClick={() => void markReviewed()} disabled={busy}>
                      <Check className="h-4 w-4" /> {busy ? "Salvando…" : "Conferir dados"}
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                      <Check className="h-4 w-4" /> Conferida pela recepção
                    </div>
                  )}
                  <a
                    className="btn-ghost flex items-center justify-center gap-2"
                    href={`/imprimir?tipo=fnrh&token=${current.public_token}`}
                    target="_blank"
                    rel="noopener"
                  >
                    <Printer className="h-4 w-4" /> Imprimir em A3
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="block truncate text-foreground" title={value}>{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <strong className="text-foreground">{label}: </strong>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function preferenceRows(data?: Record<string, unknown> | null) {
  if (!data) return [];
  const definitions = [
    ["Barulho", "preferencia_ruido"],
    ["Ventilação", "preferencia_ventilacao"],
    ["Espaço", "preferencia_espaco"],
    ["Escadas", "preferencia_escadas"],
    ["Garagem", "preferencia_garagem"],
    ["Tipo de janela", "preferencia_janela"],
    ["Tamanho da janela", "preferencia_tamanho_janela"],
  ] as const;
  return definitions
    .map(([label, key]) => ({ label, value: preferenceLabel(key, textValue(data[key])) }))
    .filter((item) => Boolean(item.value));
}

function preferenceLabel(key: string, value: string) {
  if (!value) return "";
  const labels: Record<string, Record<string, string>> = {
    preferencia_ruido: {
      silencioso: "Prefere quarto silencioso",
      indiferente: "Indiferente",
      movimento: "Não se incomoda com movimento",
    },
    preferencia_ventilacao: { arejado: "Bem arejado", normal: "Normal", indiferente: "Indiferente" },
    preferencia_espaco: { espacoso: "Mais espaçoso", normal: "Normal", compacto: "Compacto está bom" },
    preferencia_escadas: { sem_escadas: "Precisa evitar escadas", poucas: "Prefere poucas escadas", indiferente: "Indiferente" },
    preferencia_garagem: { proximo: "Perto da garagem", longe: "Longe da garagem", indiferente: "Indiferente" },
    preferencia_janela: { vidro: "Vidro", madeira: "Madeira", mista: "Mista", indiferente: "Indiferente" },
    preferencia_tamanho_janela: { grande: "Grande", media: "Média", pequena: "Pequena", indiferente: "Indiferente" },
  };
  return labels[key]?.[value] ?? humanize(value);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function buildWhatsappUrl(phoneValue: string | null | undefined, reservation: Reservation, link: string) {
  const phone = whatsappPhone(phoneValue);
  if (!phone) return "";
  const message = [
    `Olá, ${reservation.cliente_nome}!`,
    "",
    "Para agilizar seu check-in no Hotel Real Cruzília, preencha sua FNRH Digital e informe suas preferências de quarto pelo link abaixo:",
    link,
    "",
    `Reserva: ${reservation.codigo_externo || reservation.id.slice(0, 8).toUpperCase()}`,
    `Entrada: ${fmtDate(reservation.checkin)}`,
    `Saída: ${fmtDate(reservation.checkout)}`,
    "",
    "O formulário é individual, seguro e vinculado à sua reserva.",
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function whatsappPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
