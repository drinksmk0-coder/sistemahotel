import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ExternalLink, FileSignature, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState, Modal } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany, useReservations } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fichas-checkin")({
  component: FichasCheckin,
});

type GuestCheckin = {
  id: string;
  reservation_id: string;
  public_token: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  signature_data_url: string | null;
  form_data: Record<string, string>;
  created_at: string;
};

const FORM_SECTIONS = [
  {
    title: "Hóspede",
    fields: [
      ["nome_completo", "Nome completo"],
      ["telefone", "Telefone / WhatsApp"],
      ["email", "E-mail"],
      ["nascimento", "Nascimento"],
      ["genero", "Gênero"],
      ["profissao", "Profissão"],
      ["nacionalidade", "Nacionalidade"],
      ["raca_cor", "Raça / cor"],
      ["deficiencia", "Deficiência"],
      ["tipo_deficiencia", "Tipo de deficiência"],
    ],
  },
  {
    title: "Documento e endereço",
    fields: [
      ["tipo_documento", "Tipo de documento"],
      ["numero_documento", "Número do documento"],
      ["endereco", "Endereço"],
      ["numero", "Número"],
      ["complemento", "Complemento"],
      ["bairro", "Bairro"],
      ["cep", "CEP"],
      ["cidade", "Cidade"],
      ["estado", "Estado"],
      ["pais", "País"],
    ],
  },
  {
    title: "Viagem",
    fields: [
      ["motivo_viagem", "Motivo da viagem"],
      ["transporte", "Meio de transporte"],
      ["ultimo_destino", "Último destino"],
      ["proximo_destino", "Próximo destino"],
      ["acompanhantes", "Acompanhantes"],
    ],
  },
] as const;

function FichasCheckin() {
  const { user } = useSession();
  const { data: role, isLoading: roleLoading } = useRole(user);
  const company = useCurrentCompany();
  const { data: reservations = [] } = useReservations();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<GuestCheckin | null>(null);

  const query = useQuery({
    queryKey: ["guest-checkins", company.data?.id],
    enabled: Boolean(company.data?.id && (role === "dono" || role === "recepcao")),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("guest_checkins")
        .select(
          "id,reservation_id,public_token,status,submitted_at,reviewed_at,signature_data_url,form_data,created_at",
        )
        .eq("company_id", company.data!.id)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GuestCheckin[];
    },
  });

  if (roleLoading || !role) {
    return <div className="card-surface p-6 text-sm text-muted-foreground">Carregando permissões…</div>;
  }
  if (role !== "dono" && role !== "recepcao") return <Navigate to="/painel" />;

  const rows = query.data ?? [];
  const pending = rows.filter((row) => row.status === "preenchido" && !row.reviewed_at);

  async function openForm(row: GuestCheckin) {
    setSelected(row);
    if (!row.reviewed_at) {
      const reviewedAt = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("guest_checkins")
        .update({ reviewed_at: reviewedAt })
        .eq("id", row.id)
        .eq("company_id", company.data!.id);
      if (error) {
        toast.error(`Não foi possível marcar a ficha como conferida: ${error.message}`);
      } else {
        setSelected((current) => (current?.id === row.id ? { ...current, reviewed_at: reviewedAt } : current));
        await queryClient.invalidateQueries({ queryKey: ["guest-checkins"] });
        await queryClient.invalidateQueries({ queryKey: ["guest-checkins-pending"] });
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Fichas de check-in"
        subtitle={`${pending.length} aguardando conferência · ${rows.length} ficha(s) no histórico`}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost flex items-center gap-1.5"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <Link to="/reservas" className="btn-primary">
              Ver reservas
            </Link>
          </div>
        }
      />

      {pending.length > 0 && (
        <section className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 shadow-sm">
          <div className="flex items-start gap-2">
            <FileSignature className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong className="block text-sm">
                {pending.length} nova(s) ficha(s) preenchida(s) aguardando conferência
              </strong>
              <p className="mt-0.5 text-xs">
                Abra a ficha para conferir os dados e a assinatura. Ela será marcada como conferida automaticamente.
              </p>
            </div>
          </div>
        </section>
      )}

      {query.isLoading ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">Carregando fichas recebidas…</div>
      ) : query.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Não foi possível carregar as fichas de check-in.
        </div>
      ) : rows.length === 0 ? (
        <EmptyState text="Nenhuma ficha de check-in foi criada nesta empresa." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => {
            const reservation = reservations.find((item) => item.id === row.reservation_id);
            const waiting = row.status === "preenchido" && !row.reviewed_at;
            const filledFields = Object.values(row.form_data ?? {}).filter((value) => String(value ?? "").trim()).length;
            return (
              <article
                key={row.id}
                className={`rounded-xl border bg-card p-4 shadow-sm ${
                  waiting ? "border-emerald-300 ring-1 ring-emerald-200" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-foreground">
                        {reservation?.cliente_nome || row.form_data?.nome_completo || "Hóspede não identificado"}
                      </h2>
                      <Badge tone={waiting ? "sage" : "slate"}>
                        {waiting ? "Aguardando conferência" : statusLabel(row)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reserva #{row.reservation_id.slice(0, 6).toUpperCase()}
                      {reservation ? ` · UH ${reservation.quarto}` : ""}
                    </p>
                  </div>
                  {waiting ? (
                    <Clock3 className="h-5 w-5 shrink-0 text-emerald-700" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Entrada</dt>
                    <dd className="font-semibold text-foreground">
                      {reservation ? fmtDate(reservation.checkin) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Saída</dt>
                    <dd className="font-semibold text-foreground">
                      {reservation ? fmtDate(reservation.checkout) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dados preenchidos</dt>
                    <dd className="font-semibold text-foreground">{filledFields} campos</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Assinatura</dt>
                    <dd className="font-semibold text-foreground">
                      {row.signature_data_url ? "Recebida" : "Não encontrada"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Recebida em</dt>
                    <dd className="font-semibold text-foreground">{formatDateTime(row.submitted_at)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="btn-primary mt-3 flex w-full items-center justify-center gap-2"
                  onClick={() => void openForm(row)}
                >
                  <FileSignature className="h-4 w-4" />
                  {waiting ? "Conferir dados e assinatura" : "Ver ficha completa"}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`Ficha preenchida — ${selected.form_data?.nome_completo || "Hóspede"}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <strong>Ficha recebida e salva.</strong>
              <span className="mt-1 block text-xs">
                Enviada em {formatDateTime(selected.submitted_at)} · {selected.reviewed_at ? "conferida" : "aguardando conferência"}.
              </span>
            </div>

            {FORM_SECTIONS.map((section) => (
              <section key={section.title}>
                <h3 className="mb-2 text-sm font-bold text-foreground">{section.title}</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {section.fields.map(([key, label]) => (
                    <div key={key} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                        {displayFormValue(key, selected.form_data?.[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}

            <section>
              <h3 className="mb-2 text-sm font-bold text-foreground">Assinatura do hóspede</h3>
              {selected.signature_data_url ? (
                <img
                  src={selected.signature_data_url}
                  alt="Assinatura do hóspede"
                  className="h-40 w-full rounded-lg border border-border bg-white object-contain"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
                  Assinatura não encontrada.
                </div>
              )}
            </section>

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={() => window.open(`/checkin-online?token=${selected.public_token}`, "_blank", "noopener")}
              >
                <ExternalLink className="h-4 w-4" /> Abrir versão para impressão
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function displayFormValue(key: string, value?: string | null) {
  if (!value?.trim()) return "Não informado";
  if (key === "nascimento") {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  if (key === "deficiencia") {
    if (value === "nao") return "Não";
    if (value === "sim") return "Sim";
    if (value === "nao_informar") return "Prefere não informar";
  }
  return value;
}

function statusLabel(row: GuestCheckin) {
  if (row.reviewed_at) return "Conferida";
  if (row.status === "preenchido") return "Preenchida";
  if (row.status === "enviado") return "Link enviado";
  return row.status.replaceAll("_", " ");
}

function formatDateTime(value: string | null) {
  if (!value) return "Ainda não enviada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
