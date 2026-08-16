import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSignature,
  RefreshCw,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState, Modal } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany, useReservations } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { maskCpf } from "@/lib/privacy";

export const Route = createFileRoute("/_authenticated/fichas-checkin")({
  component: FichasCheckin,
});

type GuestCheckin = {
  id: string;
  reservation_id: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  signature_data_url: string | null;
  form_data: Record<string, string>;
  created_at: string;
};

type ReservationGuest = {
  id: string;
  reservation_id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  parentesco: string | null;
  titular: boolean;
};

type FormCompanion = {
  nome?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  data_nascimento?: string;
  sexo?: string;
  parentesco?: string;
};

const FORM_FIELDS = [
  ["nome_completo", "Nome completo"],
  ["telefone", "Telefone / WhatsApp"],
  ["email", "E-mail"],
  ["nascimento", "Nascimento"],
  ["genero", "Gênero"],
  ["profissao", "Profissão"],
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
  ["motivo_viagem", "Motivo da viagem"],
  ["transporte", "Meio de transporte"],
  ["ultimo_destino", "Último destino"],
  ["proximo_destino", "Próximo destino"],
] as const;

function FichasCheckin() {
  const { user } = useSession();
  const { data: role, isLoading: roleLoading } = useRole(user);
  const company = useCurrentCompany();
  const { data: reservations = [] } = useReservations();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<GuestCheckin | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["guest-checkins-with-guests", company.data?.id],
    enabled: Boolean(company.data?.id && (role === "dono" || role === "recepcao")),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const checkinsResult = await (supabase as any)
        .from("guest_checkins")
        .select(
          "id,reservation_id,status,submitted_at,reviewed_at,signature_data_url,form_data,created_at",
        )
        .eq("company_id", company.data!.id)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (checkinsResult.error) throw checkinsResult.error;

      const guestsResult = await (supabase as any)
        .from("reservation_guests")
        .select(
          "id,reservation_id,nome,cpf,telefone,email,data_nascimento,sexo,parentesco,titular",
        )
        .eq("company_id", company.data!.id)
        .order("titular", { ascending: false })
        .order("created_at", { ascending: true });

      return {
        checkins: (checkinsResult.data ?? []) as GuestCheckin[],
        guests: guestsResult.error
          ? ([] as ReservationGuest[])
          : ((guestsResult.data ?? []) as ReservationGuest[]),
      };
    },
  });

  const rows = query.data?.checkins ?? [];
  const guests = query.data?.guests ?? [];
  const guestsByReservation = useMemo(() => {
    const map = new Map<string, ReservationGuest[]>();
    guests.forEach((guest) =>
      map.set(guest.reservation_id, [
        ...(map.get(guest.reservation_id) ?? []),
        guest,
      ]),
    );
    return map;
  }, [guests]);

  if (roleLoading || !role) {
    return (
      <div className="card-surface p-6 text-sm text-muted-foreground">
        Carregando permissões…
      </div>
    );
  }
  if (role !== "dono" && role !== "recepcao") {
    return <Navigate to="/painel" />;
  }

  const pending = rows.filter(
    (row) => row.status === "preenchido" && !row.reviewed_at,
  );

  function openForm(row: GuestCheckin) {
    setSelected(row);
  }

  async function confirmReview(row: GuestCheckin) {
    if (!company.data?.id || row.reviewed_at) return;
    setConfirming(true);
    const reviewedAt = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("guest_checkins")
      .update({ reviewed_at: reviewedAt })
      .eq("id", row.id)
      .eq("company_id", company.data.id)
      .eq("status", "preenchido");
    setConfirming(false);

    if (error) {
      toast.error(`Não foi possível confirmar a ficha: ${error.message}`);
      return;
    }

    setSelected((current) =>
      current?.id === row.id ? { ...current, reviewed_at: reviewedAt } : current,
    );
    await queryClient.invalidateQueries({
      queryKey: ["guest-checkins-with-guests"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["guest-checkins-pending"],
    });
    toast.success("Ficha conferida e confirmada.");
  }

  async function deleteCheckin(row: GuestCheckin) {
    if (!company.data?.id || deletingId) return;
    const confirmed = window.confirm(
      "Excluir somente esta ficha de check-in? A reserva, o cadastro do hóspede, pagamentos e histórico financeiro serão mantidos.",
    );
    if (!confirmed) return;

    setDeletingId(row.id);
    const { error } = await (supabase as any)
      .from("guest_checkins")
      .delete()
      .eq("id", row.id)
      .eq("company_id", company.data.id);
    setDeletingId(null);

    if (error) {
      toast.error(`Não foi possível excluir a ficha: ${error.message}`);
      return;
    }

    setSelected((current) => (current?.id === row.id ? null : current));
    await queryClient.invalidateQueries({
      queryKey: ["guest-checkins-with-guests"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["guest-checkins-pending"],
    });
    toast.success("Ficha de check-in excluída. Reserva e histórico foram preservados.");
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
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
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
                {pending.length} ficha(s) aguardando conferência
              </strong>
              <p className="mt-0.5 text-xs">
                O alerta permanece até a recepção abrir, conferir e confirmar a ficha.
              </p>
            </div>
          </div>
        </section>
      )}

      {query.isLoading ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">
          Carregando fichas…
        </div>
      ) : query.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Não foi possível carregar as fichas. Atualize a página e tente novamente.
        </div>
      ) : rows.length === 0 ? (
        <EmptyState text="Nenhuma ficha de check-in foi criada nesta empresa." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => {
            const reservation = reservations.find(
              (item) => item.id === row.reservation_id,
            );
            const reservationGuests =
              guestsByReservation.get(row.reservation_id) ?? [];
            const waiting = row.status === "preenchido" && !row.reviewed_at;
            const holder = reservationGuests.find((guest) => guest.titular);
            const companionCount = Math.max(
              reservationGuests.filter((guest) => !guest.titular).length,
              parseFormCompanions(row.form_data).length,
            );

            return (
              <article
                key={row.id}
                className={`rounded-xl border bg-card p-4 shadow-sm ${
                  waiting
                    ? "border-emerald-300 ring-1 ring-emerald-200"
                    : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-foreground">
                        {holder?.nome ||
                          reservation?.cliente_nome ||
                          row.form_data?.nome_completo ||
                          "Hóspede não identificado"}
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
                  <Info label="Entrada" value={reservation ? fmtDate(reservation.checkin) : "—"} />
                  <Info label="Saída" value={reservation ? fmtDate(reservation.checkout) : "—"} />
                  <Info label="Total de hóspedes" value={String(Math.max(reservation?.pessoas ?? 1, 1 + companionCount))} />
                  <Info label="Acompanhantes identificados" value={String(companionCount)} />
                  <Info label="Assinatura" value={row.signature_data_url ? "Recebida" : "Não encontrada"} />
                  <Info label="Recebida em" value={formatDateTime(row.submitted_at)} />
                </dl>

                <button
                  type="button"
                  className="btn-primary mt-3 flex w-full items-center justify-center gap-2"
                  onClick={() => openForm(row)}
                >
                  <FileSignature className="h-4 w-4" />
                  {waiting ? "Conferir ficha completa" : "Ver ficha completa"}
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
          title={`Ficha — ${selected.form_data?.nome_completo || "Hóspede"}`}
        >
          <FichaDetalhes
            row={selected}
            guests={guestsByReservation.get(selected.reservation_id) ?? []}
            confirming={confirming}
            deleting={deletingId === selected.id}
            onConfirm={() => void confirmReview(selected)}
            onDelete={() => void deleteCheckin(selected)}
            onClose={() => setSelected(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function FichaDetalhes({
  row,
  guests,
  confirming,
  deleting,
  onConfirm,
  onDelete,
  onClose,
}: {
  row: GuestCheckin;
  guests: ReservationGuest[];
  confirming: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const holder = guests.find((guest) => guest.titular);
  const syncedCompanions = guests.filter((guest) => !guest.titular);
  const formCompanions = parseFormCompanions(row.form_data);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <strong>Ficha recebida e salva.</strong>
        <span className="mt-1 block text-xs">
          Enviada em {formatDateTime(row.submitted_at)} ·{" "}
          {row.reviewed_at ? "conferida" : "aguardando confirmação da recepção"}.
        </span>
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <UserRound className="h-4 w-4" /> Titular
        </h3>
        {holder ? <GuestCard guest={holder} /> : <FormGuestCard form={row.form_data} />}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UsersRound className="h-4 w-4" /> Acompanhantes
          </h3>
          <Badge tone="slate">{Math.max(syncedCompanions.length, formCompanions.length)}</Badge>
        </div>
        {syncedCompanions.length > 0 ? (
          <div className="space-y-2">{syncedCompanions.map((guest) => <GuestCard key={guest.id} guest={guest} />)}</div>
        ) : formCompanions.length > 0 ? (
          <div className="space-y-2">{formCompanions.map((guest, index) => <FormCompanionCard key={`${guest.nome}-${index}`} guest={guest} />)}</div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nenhum acompanhante informado.</div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-foreground">Dados complementares da ficha</h3>
        <dl className="grid gap-2 sm:grid-cols-2">
          {FORM_FIELDS.map(([key, label]) => (
            <div key={key} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-foreground">{displayFormValue(key, row.form_data?.[key])}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-foreground">Assinatura do hóspede titular</h3>
        {row.signature_data_url ? (
          <img src={row.signature_data_url} alt="Assinatura do hóspede" className="h-40 w-full rounded-lg border border-border bg-white object-contain" />
        ) : (
          <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">Assinatura não encontrada.</div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="mr-auto flex items-center gap-2 rounded-md border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-50"
          onClick={onDelete}
          disabled={deleting}
          title="Excluir somente esta ficha de check-in"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "Excluindo…" : "Excluir ficha"}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={deleting}>Fechar</button>
        <button
          type="button"
          className="btn-ghost flex items-center gap-2"
          disabled={deleting}
          onClick={() => window.open(`/checkin-print?id=${row.id}`, "_blank", "noopener")}
        >
          <ExternalLink className="h-4 w-4" /> Abrir para impressão
        </button>
        {!row.reviewed_at && (
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={onConfirm}
            disabled={confirming || deleting || !row.signature_data_url}
          >
            <CheckCircle2 className="h-4 w-4" />
            {confirming ? "Confirmando…" : "Confirmar ficha conferida"}
          </button>
        )}
      </div>
    </div>
  );
}

function GuestCard({ guest }: { guest: ReservationGuest }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-foreground">{guest.nome}</strong>
        <Badge tone={guest.titular ? "sage" : "slate"}>{guest.titular ? "Titular" : guest.parentesco || "Acompanhante"}</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>CPF: {maskCpf(guest.cpf)}</span>
        <span>Nascimento: {guest.data_nascimento ? fmtDate(guest.data_nascimento) : "não informado"}</span>
        <span>Telefone: {guest.telefone || "não informado"}</span>
        <span>E-mail: {guest.email || "não informado"}</span>
      </div>
    </div>
  );
}

function FormGuestCard({ form }: { form: Record<string, string> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-foreground">{form.nome_completo || "Hóspede titular"}</strong>
        <Badge tone="sage">Titular</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>Documento: {protectDocument(form.numero_documento)}</span>
        <span>Nascimento: {displayFormValue("nascimento", form.nascimento)}</span>
        <span>Telefone: {form.telefone || "não informado"}</span>
        <span>E-mail: {form.email || "não informado"}</span>
      </div>
    </div>
  );
}

function FormCompanionCard({ guest }: { guest: FormCompanion }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-foreground">{guest.nome || "Acompanhante"}</strong>
        <Badge tone="slate">{guest.parentesco || "Acompanhante"}</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>CPF: {maskCpf(guest.cpf)}</span>
        <span>Nascimento: {guest.data_nascimento ? displayFormValue("nascimento", guest.data_nascimento) : "não informado"}</span>
        <span>Telefone: {guest.telefone || "não informado"}</span>
        <span>E-mail: {guest.email || "não informado"}</span>
      </div>
    </div>
  );
}

function parseFormCompanions(form: Record<string, string>): FormCompanion[] {
  const raw = form?.acompanhantes_detalhes;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold text-foreground">{value}</dd></div>;
}

function protectDocument(value?: string | null) {
  if (!value?.trim()) return "não informado";
  return value.replace(/\D/g, "").length === 11 ? maskCpf(value) : value;
}

function displayFormValue(key: string, value?: string | null) {
  if (!value?.trim()) return "Não informado";
  if (key === "numero_documento" && value.replace(/\D/g, "").length === 11) return maskCpf(value);
  if (key === "nascimento") {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
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
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
