import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileCheck2, FileText, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/AppLayout";
import {
  FnrhReservationActions,
  type GuestCheckinSummary,
} from "@/components/fnrh/FnrhReservationActions";
import { supabase } from "@/integrations/supabase/client";
import { useClients, useCurrentCompany, useReservations, type Client, type Reservation } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fnrh")({
  component: FnrhCenter,
});

type Filter = "ativas" | "sem_ficha" | "aguardando" | "recebidas" | "conferidas" | "todas";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ativas", label: "Ativas" },
  { value: "sem_ficha", label: "Sem FNRH" },
  { value: "aguardando", label: "Aguardando hóspede" },
  { value: "recebidas", label: "Para conferir" },
  { value: "conferidas", label: "Conferidas" },
  { value: "todas", label: "Todas" },
];

function FnrhCenter() {
  const company = useCurrentCompany();
  const { data: reservations = [] } = useReservations();
  const { data: clients = [] } = useClients();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("ativas");
  const [search, setSearch] = useState("");

  const checkins = useQuery({
    queryKey: ["guest-checkins", company.data?.id],
    enabled: Boolean(company.data?.id),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("guest_checkins")
        .select("id,reservation_id,public_token,status,form_data,submitted_at,reviewed_at")
        .eq("company_id", company.data!.id)
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []) as GuestCheckinSummary[];
    },
  });

  const byReservation = useMemo(
    () => new Map((checkins.data ?? []).map((item) => [item.reservation_id, item])),
    [checkins.data],
  );

  const counts = useMemo(() => {
    const records = checkins.data ?? [];
    return {
      total: records.length,
      pending: records.filter((item) => item.status === "enviado").length,
      received: records.filter((item) => item.status === "preenchido").length,
      reviewed: records.filter((item) => ["conferido", "enviado_mtur"].includes(item.status)).length,
    };
  }, [checkins.data]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    return reservations
      .filter((reservation) => {
        const record = byReservation.get(reservation.id);
        if (filter === "ativas" && ["finalizado", "cancelado"].includes(reservation.status)) return false;
        if (filter === "sem_ficha" && record) return false;
        if (filter === "aguardando" && record?.status !== "enviado") return false;
        if (filter === "recebidas" && record?.status !== "preenchido") return false;
        if (filter === "conferidas" && (!record || !["conferido", "enviado_mtur"].includes(record.status))) return false;
        if (!term) return true;
        return normalize(`${reservation.cliente_nome} ${reservation.quarto} ${reservation.codigo_externo ?? ""}`).includes(term);
      })
      .sort((a, b) => {
        const priority = statusPriority(byReservation.get(a.id)) - statusPriority(byReservation.get(b.id));
        if (priority !== 0) return priority;
        return a.checkin.localeCompare(b.checkin);
      });
  }, [byReservation, filter, reservations, search]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["guest-checkins", company.data?.id] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["clients"] });
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="FNRH e pré-check-in"
        subtitle="Envie a ficha ao hóspede, receba os dados e preferências do quarto, confira e imprima o espelho em A3."
      />

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric icon={<FileText />} label="Fichas criadas" value={counts.total} tone="blue" />
        <Metric icon={<Clock3 />} label="Aguardando hóspede" value={counts.pending} tone="amber" />
        <Metric icon={<FileCheck2 />} label="Para conferir" value={counts.received} tone="rose" />
        <Metric icon={<CheckCircle2 />} label="Conferidas" value={counts.reviewed} tone="green" />
      </section>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${filter === item.value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="field h-10 w-full pl-9 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar hóspede, quarto ou reserva"
            />
          </label>
        </div>
      </section>

      {checkins.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm font-semibold text-muted-foreground">Carregando fichas…</div>
      ) : checkins.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Não foi possível carregar as FNRHs.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FileText className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 font-black text-foreground">Nenhuma reserva neste filtro</h2>
          <p className="mt-1 text-sm text-muted-foreground">Altere o filtro ou a busca para localizar outra ficha.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/45 text-left text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Hóspede</th>
                  <th className="px-4 py-3">Quarto / período</th>
                  <th className="px-4 py-3">Situação da ficha</th>
                  <th className="px-4 py-3">Preferências</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((reservation) => (
                  <ReservationRow
                    key={reservation.id}
                    reservation={reservation}
                    record={byReservation.get(reservation.id)}
                    client={clients.find((client) => client.id === reservation.cliente_id)}
                    onChanged={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((reservation) => {
              const record = byReservation.get(reservation.id);
              const client = clients.find((item) => item.id === reservation.cliente_id);
              return (
                <article key={reservation.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-black text-foreground">{reservation.cliente_nome}</h2>
                      <p className="text-xs text-muted-foreground">Quarto {reservation.quarto} · {fmtDate(reservation.checkin)} a {fmtDate(reservation.checkout)}</p>
                    </div>
                    <StatusPill record={record} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <PreferenceHint record={record} />
                    <FnrhReservationActions reservation={reservation} client={client} record={record} onChanged={refresh} />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ReservationRow({ reservation, record, client, onChanged }: { reservation: Reservation; record?: GuestCheckinSummary; client?: Client; onChanged: () => void }) {
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/25">
      <td className="px-4 py-3">
        <strong className="block text-foreground">{reservation.cliente_nome}</strong>
        <span className="text-[11px] text-muted-foreground">{reservation.codigo_externo || reservation.id.slice(0, 8).toUpperCase()}</span>
      </td>
      <td className="px-4 py-3">
        <strong className="text-foreground">Quarto {reservation.quarto}</strong>
        <span className="ml-2 text-xs text-muted-foreground">{fmtDate(reservation.checkin)} a {fmtDate(reservation.checkout)}</span>
      </td>
      <td className="px-4 py-3"><StatusPill record={record} /></td>
      <td className="px-4 py-3"><PreferenceHint record={record} /></td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end">
          <FnrhReservationActions reservation={reservation} client={client} record={record} onChanged={onChanged} />
        </div>
      </td>
    </tr>
  );
}

function StatusPill({ record }: { record?: GuestCheckinSummary }) {
  const values = !record
    ? { label: "Sem ficha", className: "border-slate-200 bg-slate-50 text-slate-600" }
    : record.status === "enviado"
      ? { label: "Aguardando hóspede", className: "border-blue-200 bg-blue-50 text-blue-700" }
      : record.status === "preenchido"
        ? { label: "Para conferir", className: "border-amber-200 bg-amber-50 text-amber-800" }
        : record.status === "erro_mtur"
          ? { label: "Revisar", className: "border-red-200 bg-red-50 text-red-700" }
          : { label: "Conferida", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${values.className}`}>{values.label}</span>;
}

function PreferenceHint({ record }: { record?: GuestCheckinSummary }) {
  const data = record?.form_data;
  if (!data || record?.status === "enviado") return <span className="text-xs text-muted-foreground">Ainda não informadas</span>;
  const values = [
    labelValue(data.preferencia_ruido),
    labelValue(data.preferencia_ventilacao),
    labelValue(data.preferencia_espaco),
    labelValue(data.preferencia_escadas),
  ].filter(Boolean);
  return (
    <span className="inline-flex max-w-64 items-center gap-1.5 text-xs font-semibold text-foreground" title={values.join(" · ")}>
      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{values.length ? values.join(" · ") : "Sem preferência específica"}</span>
    </span>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "blue" | "amber" | "rose" | "green" }) {
  const classes = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[tone];
  return (
    <article className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 ${classes}`}>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <div className="min-w-0">
        <strong className="block text-xl font-black leading-none">{value}</strong>
        <span className="mt-1 block truncate text-[10px] font-extrabold uppercase tracking-wide">{label}</span>
      </div>
    </article>
  );
}

function statusPriority(record?: GuestCheckinSummary) {
  if (record?.status === "preenchido") return 0;
  if (!record) return 1;
  if (record.status === "enviado") return 2;
  if (record.status === "erro_mtur") return 3;
  return 4;
}

function labelValue(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value === "indiferente") return "";
  const labels: Record<string, string> = {
    silencioso: "Silencioso",
    movimento: "Aceita movimento",
    arejado: "Arejado",
    normal: "Normal",
    espacoso: "Espaçoso",
    compacto: "Compacto",
    sem_escadas: "Sem escadas",
    poucas: "Poucas escadas",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
