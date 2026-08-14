import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Edit3,
  Ellipsis,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useClients,
  useComplaints,
  useCurrentCompany,
  useDelete,
  useInsert,
  useRateRules,
  useReservationGroups,
  useReservations,
  useRooms,
  useSales,
  useUpdate,
  type Client,
  type Reservation,
} from "@/lib/data";
import { fmtBRL, fmtDate, fmtTime, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState } from "@/components/ui-kit";
import { ReservaForm, type ReservaRow } from "@/components/ReservaForm";
import { GroupReservationForm, type GroupReservationPayload } from "@/components/GroupReservationForm";
import { GuestPaymentModal } from "@/components/GuestPaymentModal";
import { CompanyBillingCheckoutModal, type CompanyBillingCheckout } from "@/components/CompanyBillingCheckoutModal";
import { buildGuestAccount, type GuestAccount } from "@/lib/guest-account";
import { supabase } from "@/integrations/supabase/client";

const statusTone: Record<string, string> = {
  reservado: "brass",
  ocupado: "sage",
  saida_pendente: "brass",
  finalizado: "slate",
  cancelado: "brick",
  manutencao: "slate",
};

const statusLabel: Record<string, string> = {
  ativas: "Ativas",
  reservado: "Reservado",
  ocupado: "Ocupado",
  saida_pendente: "Saída",
  pendencias: "Pendências",
  cancelado: "Cancelado",
  finalizado: "Finalizado",
  todas: "Todas",
};

export function ReservasModern() {
  const { data: rooms = [] } = useRooms();
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: complaints = [] } = useComplaints();
  const { data: rateRules = [] } = useRateRules();
  const { data: reservationGroups = [] } = useReservationGroups();
  const { data: sales = [] } = useSales();
  const currentCompany = useCurrentCompany();
  const queryClient = useQueryClient();
  const insert = useInsert("reservations", ["reservations"]);
  const insertClient = useInsert("clients", ["clients"]);
  const update = useUpdate("reservations", ["reservations"]);
  const remove = useDelete("reservations", ["reservations"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);

  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ativas");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(todayISO());

  useEffect(() => {
    const reservationId = new URLSearchParams(window.location.search).get("editar");
    if (!reservationId || !reservations.length) return;
    const reservation = reservations.find((item) => item.id === reservationId);
    if (!reservation) return;
    setEditing(reservation);
    window.history.replaceState({}, "", window.location.pathname);
  }, [reservations]);

  const filtered = useMemo(() => {
    let rows = [...reservations];
    if (filter === "ativas") rows = rows.filter((r) => !["finalizado", "cancelado"].includes(r.status));
    else if (filter === "pendencias") rows = rows.filter((r) => r.status !== "cancelado" && buildGuestAccount(r, sales).balance > 0);
    else if (filter !== "todas") rows = rows.filter((r) => r.status === filter);

    if (dateFilter) {
      rows = rows.filter((r) => r.checkin <= dateFilter && r.checkout >= dateFilter);
    }

    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (term) {
      rows = rows.filter((r) => [r.id, r.cliente_nome, r.quarto, r.canal, r.billing_company_name]
        .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term)));
    }

    return rows.sort((a, b) => `${b.checkin}${b.horario_checkin ?? ""}`.localeCompare(`${a.checkin}${a.horario_checkin ?? ""}`));
  }, [reservations, sales, filter, search, dateFilter]);

  const selected = reservations.find((r) => r.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const base = dateFilter ? reservations.filter((r) => r.checkin <= dateFilter && r.checkout >= dateFilter) : reservations;
    return {
      reservado: base.filter((r) => r.status === "reservado").length,
      ocupado: base.filter((r) => r.status === "ocupado").length,
      saida_pendente: base.filter((r) => r.status === "saida_pendente").length,
      pendencias: base.filter((r) => r.status !== "cancelado" && buildGuestAccount(r, sales).balance > 0).length,
      cancelado: base.filter((r) => r.status === "cancelado").length,
      finalizado: base.filter((r) => r.status === "finalizado").length,
    };
  }, [reservations, sales, dateFilter]);

  const phoneDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");
  async function rowWithClient(row: ReservaRow) {
    const cleanRow = { ...row } as any;
    const transient = ["cliente_telefone","cliente_email","cliente_cpf","cliente_tipo","cliente_data_nascimento","cliente_sexo","cliente_profissao","cliente_cidade","cliente_estado","cliente_cep","cliente_bairro","cliente_estado_civil","cliente_tem_filhos","cliente_quantidade_filhos"];
    transient.forEach((key) => delete cleanRow[key]);
    if (row.cliente_id) return cleanRow;

    const telefoneDigits = phoneDigits(row.cliente_telefone);
    const existing = telefoneDigits
      ? clients.find((c) => phoneDigits(c.telefone) === telefoneDigits)
      : clients.find((c) => c.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase());
    if (existing) return { ...cleanRow, cliente_id: existing.id, cliente_nome: existing.nome };

    const created = (await insertClient.mutateAsync({
      nome: row.cliente_nome,
      telefone: row.cliente_telefone || null,
      email: row.cliente_email || null,
      cpf: row.cliente_cpf || null,
      tipo: row.cliente_tipo || "hóspede normal",
      data_nascimento: row.cliente_data_nascimento || null,
      sexo: row.cliente_sexo || null,
      profissao: row.cliente_profissao || null,
      cidade: row.cliente_cidade || null,
      estado: row.cliente_estado || null,
      cep: row.cliente_cep || null,
      bairro: row.cliente_bairro || null,
      estado_civil: row.cliente_estado_civil || null,
      tem_filhos: row.cliente_tem_filhos ?? null,
      quantidade_filhos: row.cliente_tem_filhos ? (row.cliente_quantidade_filhos ?? 0) : null,
    })) as unknown as Client[];
    const client = created[0];
    return client ? { ...cleanRow, cliente_id: client.id, cliente_nome: client.nome } : cleanRow;
  }

  async function createGroupReservation(payload: GroupReservationPayload) {
    if (!currentCompany.data?.id) return toast.error("Empresa não encontrada.");
    setGroupBusy(true);
    try {
      const { error } = await (supabase as any).rpc("create_group_reservation", {
        p_group: { ...payload.group, company_id: currentCompany.data.id },
        p_reservations: payload.reservations,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["reservations"] });
      await queryClient.invalidateQueries({ queryKey: ["reservation_groups"] });
      toast.success(`${payload.reservations.length} reservas criadas no grupo.`);
      setGroupOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar reserva em grupo.");
    } finally {
      setGroupBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Reservas"
        subtitle="Hospedagem, consumo e pagamentos em uma visão mais simples"
        action={
          <div className="flex gap-2">
            <button onClick={() => setGroupOpen(true)} className="btn-ghost hidden items-center gap-1.5 sm:flex">
              <UsersRound className="h-4 w-4" /> Reserva em grupo
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova reserva
            </button>
          </div>
        }
      />

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="field h-10 bg-muted/35 pl-9" placeholder="Buscar hóspede, quarto, código ou canal..." />
          </label>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
          </label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="field h-10">
            <option value="ativas">Ativas</option>
            <option value="reservado">Reservado</option>
            <option value="ocupado">Ocupado</option>
            <option value="saida_pendente">Saída</option>
            <option value="pendencias">Pendências</option>
            <option value="cancelado">Cancelado</option>
            <option value="finalizado">Finalizado</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
          {(["reservado","ocupado","saida_pendente","pendencias","cancelado","finalizado"] as const).map((key) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {statusLabel[key]} {counts[key] ? `· ${counts[key]}` : ""}
            </button>
          ))}
          <button type="button" onClick={() => setFilter("todas")} className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">Todas</button>
        </div>
      </section>

      <div className={`grid gap-3 ${selected ? "xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]" : ""}`}>
        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{filtered.length}</strong> reserva(s) encontradas</span>
            {dateFilter && <button className="font-semibold text-primary" onClick={() => setDateFilter("")}>Ver todas as datas</button>}
          </div>
          {filtered.length === 0 ? <EmptyState text="Nenhuma reserva neste filtro." /> : filtered.map((r) => (
            <ReservationCard key={r.id} reservation={r} account={buildGuestAccount(r, sales)} active={selectedId === r.id} groupName={r.group_id ? reservationGroups.find((g) => g.id === r.group_id)?.nome : undefined} onClick={() => setSelectedId((id) => id === r.id ? null : r.id)} />
          ))}
        </section>

        {selected && (
          <ReservationDetail
            reservation={selected}
            account={buildGuestAccount(selected, sales)}
            client={clients.find((c) => c.id === selected.cliente_id)}
            update={update}
            remove={remove}
            updateRoom={updateRoom}
            onEdit={() => setEditing(selected)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {(open || editing) && (
        <ReservaForm
          rooms={rooms}
          clients={clients}
          reservations={reservations}
          complaints={complaints}
          rateRules={rateRules}
          editing={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSave={(row) => {
            rowWithClient(row).then((prepared) => {
              if (editing) {
                update.mutate({ id: editing.id, patch: prepared }, { onSuccess: () => { toast.success("Reserva atualizada"); setEditing(null); }, onError: (e: Error) => toast.error(e.message) });
              } else {
                insert.mutate(prepared as never, { onSuccess: () => { toast.success("Reserva criada"); setOpen(false); }, onError: (e: Error) => toast.error(e.message) });
              }
            }).catch((e: Error) => toast.error(e.message));
          }}
        />
      )}

      {groupOpen && <GroupReservationForm rooms={rooms} reservations={reservations} rateRules={rateRules} busy={groupBusy} onClose={() => setGroupOpen(false)} onSave={createGroupReservation} />}
    </div>
  );
}

function ReservationCard({ reservation, account, active, groupName, onClick }: { reservation: Reservation; account: GuestAccount; active: boolean; groupName?: string; onClick: () => void }) {
  const accent = reservation.status === "ocupado" ? "bg-sage" : reservation.status === "cancelado" ? "bg-brick" : reservation.status === "saida_pendente" ? "bg-violet-500" : "bg-primary";
  return (
    <button type="button" onClick={onClick} className={`relative w-full overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? "border-primary/50 ring-2 ring-primary/10" : "border-border"}`}>
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${accent}`} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-lg text-pine-dark">UH {reservation.quarto}</strong>
            <Badge tone={statusTone[reservation.status]}>{reservation.status === "saida_pendente" ? "saída" : reservation.status}</Badge>
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{reservation.cliente_nome}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{fmtDate(reservation.checkin)} → {fmtDate(reservation.checkout)}</span>
            <span>• {reservation.diarias} diária(s)</span>
            <span>• {reservation.canal || "Direto"}</span>
          </div>
          {groupName && <div className="mt-1 text-[10px] font-bold text-primary">{groupName}</div>}
        </div>
        <div className="shrink-0 text-right">
          <strong className="block text-base text-primary">{fmtBRL(account.total)}</strong>
          <span className={`text-[11px] font-bold ${account.balance > 0 ? "text-brick" : "text-sage"}`}>{account.balance > 0 ? `Falta ${fmtBRL(account.balance)}` : "Conta quitada"}</span>
          <ChevronRight className="ml-auto mt-2 h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}

function ReservationDetail({ reservation, account, client, update, remove, updateRoom, onEdit, onClose }: {
  reservation: Reservation;
  account: GuestAccount;
  client?: Client;
  update: ReturnType<typeof useUpdate>;
  remove: ReturnType<typeof useDelete>;
  updateRoom: ReturnType<typeof useUpdate>;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const done = ["finalizado", "cancelado"].includes(reservation.status);
  const balance = account.balance;

  const finishCheckout = (patch: Record<string, unknown> = {}, companyBilling = false) => {
    if (companyBilling) setBillingBusy(true);
    update.mutate({ id: reservation.id, patch: { status: "finalizado", horario_checkout: reservation.horario_checkout ?? currentTime(), checkout_at: new Date().toISOString(), ...patch } }, {
      onSuccess: () => updateRoom.mutate({ id: reservation.quarto, patch: { situacao: "limpeza" } }, {
        onSuccess: () => { toast.success(companyBilling ? "Check-out realizado e saldo faturado para empresa." : "Check-out realizado; quarto enviado para limpeza."); setBillingOpen(false); setBillingBusy(false); },
        onError: (e: Error) => toast.error(e.message),
      }),
      onError: (e: Error) => { toast.error(e.message); setBillingBusy(false); },
    });
  };

  const checkin = () => {
    const today = todayISO();
    if (reservation.checkin > today) return toast.error(`Check-in disponível apenas em ${fmtDate(reservation.checkin)}.`);
    if (reservation.checkin === today && Number(currentTime().slice(0, 2)) < 12) return toast.error("Check-in de hoje fica disponível a partir das 12:00.");
    update.mutate({ id: reservation.id, patch: { status: "ocupado", checkin_at: reservation.checkin_at ?? new Date().toISOString(), horario_checkin: reservation.horario_checkin ?? currentTime() } }, {
      onSuccess: () => updateRoom.mutate({ id: reservation.quarto, patch: { situacao: "ocupado" } }, { onSuccess: () => toast.success("Check-in realizado"), onError: (e: Error) => toast.error(e.message) }),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const guestLeft = () => update.mutate({ id: reservation.id, patch: { status: "saida_pendente", presence_status: "checkout", horario_checkout: currentTime(), checkout_at: new Date().toISOString() } }, {
    onSuccess: () => updateRoom.mutate({ id: reservation.quarto, patch: { situacao: "limpeza" } }, { onSuccess: () => toast.success("Saída registrada; quarto enviado para limpeza."), onError: (e: Error) => toast.error(e.message) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendWhatsApp = () => {
    const digits = (client?.telefone ?? "").replace(/\D/g, "");
    if (!digits) return toast.error("Cadastre o telefone do hóspede.");
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    const msg = `Olá, ${reservation.cliente_nome}! Referente à sua hospedagem no Hotel Real, quarto ${reservation.quarto}, de ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  return (
    <aside className="sticky top-2 h-fit rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-xs font-bold text-muted-foreground">Reserva #{String(reservation.id).slice(0, 6).toUpperCase()}</div>
          <div className="mt-1 flex items-center gap-2"><strong className="text-xl text-pine-dark">UH {reservation.quarto}</strong><Badge tone={statusTone[reservation.status]}>{reservation.status}</Badge></div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-muted p-2 text-muted-foreground hover:text-foreground"><XCircle className="h-5 w-5" /></button>
      </div>

      <div className="grid grid-cols-2 gap-2 py-4 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
        <Info icon={UserRound} label="Hóspede" value={reservation.cliente_nome} />
        <Info icon={CalendarDays} label="Check-in" value={`${fmtDate(reservation.checkin)} ${fmtTime(reservation.horario_checkin)}`} />
        <Info icon={CalendarDays} label="Check-out" value={`${fmtDate(reservation.checkout)} ${fmtTime(reservation.horario_checkout)}`} />
        <Info icon={Building2} label="Origem" value={reservation.canal || "Direto"} />
      </div>

      <section className="rounded-2xl bg-muted/35 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-pine-dark"><CircleDollarSign className="h-4 w-4 text-primary" /> Financeiro</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Money label="Total" value={account.total} tone="text-primary" />
          <Money label="Pago" value={account.total - account.balance} tone="text-sage" />
          <Money label="Falta" value={account.balance} tone={account.balance > 0 ? "text-brick" : "text-sage"} />
        </div>
        {balance > 0 && reservation.status !== "cancelado" && <button type="button" onClick={() => setPaymentOpen(true)} className="btn-primary mt-4 w-full">Receber conta</button>}
      </section>

      <section className="mt-3">
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Ações rápidas</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
          {reservation.status === "reservado" && <Action icon={LogIn} label="Check-in" onClick={checkin} />}
          {reservation.status === "ocupado" && <Action icon={LogOut} label="Hóspede saiu" onClick={guestLeft} danger />}
          {!done && <Action icon={Edit3} label="Editar / Estender" onClick={onEdit} />}
          {!done && <Action icon={MessageCircle} label="Mensagem" onClick={sendWhatsApp} />}
          {reservation.status === "saida_pendente" && balance <= 0 && <Action icon={BedDouble} label="Check-out" onClick={() => finishCheckout()} />}
          {["ocupado","saida_pendente"].includes(reservation.status) && balance > 0 && <Action icon={Building2} label="Faturar empresa" onClick={() => setBillingOpen(true)} />}
        </div>
      </section>

      <details className="mt-3 rounded-xl border border-border bg-background p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-pine-dark">Mais ações <Ellipsis className="h-4 w-4" /></summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {!done && <Action icon={Send} label="Check-in online" onClick={() => void sendOnlineCheckin(reservation, client)} compact />}
          {!done && <Action icon={XCircle} label="Cancelar reserva" danger compact onClick={() => {
            if (!window.confirm(`Cancelar a reserva de ${reservation.cliente_nome}?`)) return;
            update.mutate({ id: reservation.id, patch: { status: "cancelado" } }, { onSuccess: () => toast.success("Reserva cancelada"), onError: (e: Error) => toast.error(e.message) });
          }} />}
          <Action icon={Trash2} label="Excluir" danger compact onClick={() => {
            if (!window.confirm(`Excluir definitivamente a reserva de ${reservation.cliente_nome}?`)) return;
            remove.mutate(reservation.id, { onSuccess: () => { toast.success("Reserva excluída"); onClose(); }, onError: (e: Error) => toast.error(e.message) });
          }} />
        </div>
      </details>

      {paymentOpen && <GuestPaymentModal account={account} onClose={() => setPaymentOpen(false)} />}
      {billingOpen && <CompanyBillingCheckoutModal reservation={reservation} balance={balance} busy={billingBusy} onClose={() => setBillingOpen(false)} onConfirm={(billing: CompanyBillingCheckout) => finishCheckout(billing, true)} />}
    </aside>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background p-3"><Icon className="mb-2 h-4 w-4 text-primary" /><div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div><div className="mt-1 text-xs font-bold text-foreground">{value}</div></div>;
}
function Money({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div><div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div><div className={`mt-1 text-sm font-black ${tone}`}>{fmtBRL(value)}</div></div>;
}
function Action({ icon: Icon, label, onClick, danger = false, compact = false }: { icon: any; label: string; onClick: () => void; danger?: boolean; compact?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-bold transition hover:-translate-y-0.5 ${danger ? "border-brick/20 bg-brick-bg/50 text-brick" : "border-border bg-background text-pine-dark hover:border-primary/30"} ${compact ? "min-h-12" : "min-h-16 flex-col items-start justify-center"}`}><Icon className="h-4 w-4" />{label}</button>;
}

async function sendOnlineCheckin(reservation: Reservation, client?: Client) {
  const digits = (client?.telefone ?? "").replace(/\D/g, "");
  if (!digits) return toast.error("Cadastre o telefone do cliente para enviar o check-in online.");
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const existing = await (supabase as any).from("guest_checkins").select("public_token,status").eq("reservation_id", reservation.id).maybeSingle();
  if (existing.error) return toast.error(existing.error.message);
  let token = existing.data?.public_token as string | undefined;
  if (!token) {
    const created = await (supabase as any).from("guest_checkins").insert({ company_id: reservation.company_id, reservation_id: reservation.id, client_id: reservation.cliente_id ?? null }).select("public_token").single();
    if (created.error) return toast.error(created.error.message);
    token = created.data.public_token;
  }
  const formUrl = `${window.location.origin}/checkin-online?token=${token}`;
  const message = `Olá, ${reservation.cliente_nome}! Para agilizar seu check-in, preencha a FNRH pelo celular:\n\n${formUrl}`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function currentTime() { return new Date().toTimeString().slice(0, 5); }
