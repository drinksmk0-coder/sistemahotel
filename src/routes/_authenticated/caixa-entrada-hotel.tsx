import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileWarning,
  Hotel,
  Inbox,
  MailCheck,
  ReceiptText,
  RefreshCw,
  Star,
  UserRound,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState, Modal, Stars } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useCurrentCompany,
  useFeedbacks,
  useReservations,
  useRooms,
  type Feedback,
} from "@/lib/data";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/caixa-entrada-hotel")({
  component: HotelInbox,
});

type Tab = "resumo" | "booking" | "despesas" | "avaliacoes" | "fnrh";

type BookingEvent = {
  id: string;
  booking_code: string;
  event_type: "cancellation" | "new_reservation";
  subject: string | null;
  received_at: string | null;
  checkin: string | null;
  status: "pending" | "processed" | "already_cancelled" | "needs_review" | "ignored" | "error";
  reservation_id: string | null;
  error: string | null;
};

type ExpenseEvent = {
  id: string;
  gmail_message_id: string;
  original_sender: string | null;
  subject: string | null;
  received_at: string | null;
  vendor: string | null;
  document_type: string | null;
  document_number: string | null;
  due_date: string | null;
  amount: number | null;
  category: string | null;
  description: string | null;
  payment_method: string | null;
  confidence: number | null;
  business_evidence: boolean;
  personal_suspected: boolean;
  status: "pending" | "processed" | "needs_review" | "ignored" | "error";
  expense_id: string | null;
  error: string | null;
};

type CheckinEvent = {
  id: string;
  reservation_id: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  form_data: Record<string, unknown>;
};

type BookingDraft = {
  guestName: string;
  room: string;
  checkout: string;
  people: string;
  total: string;
};

type ExpenseDraft = {
  date: string;
  category: string;
  description: string;
  amount: string;
  paymentMethod: string;
  vendor: string;
};

const SCORE_FIELDS = [
  ["nota_geral", "Geral"],
  ["nota_limpeza", "Limpeza"],
  ["nota_conforto", "Conforto"],
  ["nota_atendimento", "Atendimento"],
  ["nota_wifi", "Wi-Fi"],
  ["nota_chuveiro", "Chuveiro"],
  ["nota_cama", "Cama"],
  ["nota_banheiro", "Banheiro"],
  ["nota_silencio", "Silêncio"],
  ["nota_ventilacao", "Ventilação"],
  ["nota_espaco", "Espaço"],
  ["nota_tv", "TV"],
  ["nota_frigobar", "Frigobar"],
  ["nota_iluminacao", "Iluminação"],
  ["nota_custo_beneficio", "Custo-benefício"],
] as const;

function HotelInbox() {
  const { user } = useSession();
  const { data: role, isLoading: roleLoading } = useRole(user);
  const company = useCurrentCompany();
  const { data: reservations = [] } = useReservations();
  const { data: rooms = [] } = useRooms();
  const { data: feedbacks = [] } = useFeedbacks();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("resumo");
  const [bookingEditing, setBookingEditing] = useState<BookingEvent | null>(null);
  const [expenseEditing, setExpenseEditing] = useState<ExpenseEvent | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>({
    guestName: "",
    room: "",
    checkout: "",
    people: "1",
    total: "",
  });
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    date: "",
    category: "",
    description: "",
    amount: "",
    paymentMethod: "Pendente",
    vendor: "",
  });
  const [saving, setSaving] = useState(false);

  const canRead = role === "dono" || role === "recepcao";
  const companyId = company.data?.id;

  const bookingQuery = useQuery({
    queryKey: ["booking-email-events", companyId],
    enabled: Boolean(companyId && canRead),
    refetchInterval: 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("booking_email_events")
        .select("id,booking_code,event_type,subject,received_at,checkin,status,reservation_id,error")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []) as BookingEvent[];
    },
  });

  const expenseQuery = useQuery({
    queryKey: ["expense-email-events", companyId],
    enabled: Boolean(companyId && canRead),
    refetchInterval: 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("expense_email_events")
        .select("id,gmail_message_id,original_sender,subject,received_at,vendor,document_type,document_number,due_date,amount,category,description,payment_method,confidence,business_evidence,personal_suspected,status,expense_id,error")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []) as ExpenseEvent[];
    },
  });

  const checkinQuery = useQuery({
    queryKey: ["hotel-inbox-checkins", companyId],
    enabled: Boolean(companyId && canRead),
    refetchInterval: 30_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("guest_checkins")
        .select("id,reservation_id,status,submitted_at,reviewed_at,form_data")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []) as CheckinEvent[];
    },
  });

  const bookingEvents = bookingQuery.data ?? [];
  const expenseEvents = expenseQuery.data ?? [];
  const checkins = checkinQuery.data ?? [];
  const bookingPending = bookingEvents.filter((item) => item.status === "needs_review" || item.status === "error");
  const expensePending = expenseEvents.filter((item) => item.status === "needs_review" || item.status === "error");
  const fnrhPending = checkins.filter((item) => item.status === "preenchido" && !item.reviewed_at);
  const urgentFeedbacks = feedbacks.filter((item) => Number(item.nota_geral ?? 0) <= 2);

  const averageScore = useMemo(() => {
    const values = feedbacks.map((item) => Number(item.nota_geral)).filter((value) => value > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }, [feedbacks]);

  if (roleLoading || !role) return <div className="card-surface p-6 text-sm text-muted-foreground">Carregando permissões…</div>;
  if (!canRead) return <Navigate to="/painel" />;

  function refreshAll() {
    void bookingQuery.refetch();
    void expenseQuery.refetch();
    void checkinQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    void queryClient.invalidateQueries({ queryKey: ["feedbacks"] });
  }

  function openBooking(event: BookingEvent) {
    setBookingEditing(event);
    setBookingDraft({ guestName: "", room: "", checkout: "", people: "1", total: "" });
  }

  async function completeBooking() {
    if (!bookingEditing) return;
    setSaving(true);
    try {
      const result = await (supabase as any).rpc("complete_booking_email_reservation", {
        p_event_id: bookingEditing.id,
        p_guest_name: bookingDraft.guestName.trim(),
        p_room: Number(bookingDraft.room),
        p_checkout: bookingDraft.checkout,
        p_people: Math.max(1, Number(bookingDraft.people) || 1),
        p_total: parseMoney(bookingDraft.total),
      });
      if (result.error) throw result.error;
      toast.success(`Reserva Booking ${bookingEditing.booking_code} criada`);
      setBookingEditing(null);
      refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a reserva.");
    } finally {
      setSaving(false);
    }
  }

  function openExpense(event: ExpenseEvent) {
    setExpenseEditing(event);
    setExpenseDraft({
      date: event.due_date ?? (event.received_at?.slice(0, 10) || ""),
      category: event.category ?? "Outros",
      description: event.description ?? event.subject ?? "Despesa recebida por e-mail",
      amount: event.amount ? String(event.amount).replace(".", ",") : "",
      paymentMethod: event.payment_method ?? "Pendente",
      vendor: event.vendor ?? "",
    });
  }

  async function approveExpense() {
    if (!expenseEditing) return;
    setSaving(true);
    try {
      const result = await (supabase as any).rpc("approve_expense_email_event", {
        p_event_id: expenseEditing.id,
        p_date: expenseDraft.date || null,
        p_category: expenseDraft.category.trim(),
        p_description: expenseDraft.description.trim(),
        p_amount: parseMoney(expenseDraft.amount),
        p_payment_method: expenseDraft.paymentMethod.trim(),
        p_vendor: expenseDraft.vendor.trim(),
      });
      if (result.error) throw result.error;
      toast.success("Despesa aprovada e lançada no sistema");
      setExpenseEditing(null);
      refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível lançar a despesa.");
    } finally {
      setSaving(false);
    }
  }

  async function ignoreExpense(event: ExpenseEvent) {
    if (!window.confirm("Ignorar esta mensagem e não lançar como despesa do hotel?")) return;
    const result = await (supabase as any).rpc("ignore_expense_email_event", { p_event_id: event.id });
    if (result.error) toast.error(result.error.message);
    else {
      toast.success("Mensagem ignorada");
      refreshAll();
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "resumo", label: "Resumo" },
    { key: "booking", label: "Booking", count: bookingPending.length },
    { key: "despesas", label: "Contas e despesas", count: expensePending.length },
    { key: "avaliacoes", label: "Avaliações", count: feedbacks.length },
    { key: "fnrh", label: "FNRH", count: fnrhPending.length },
  ];

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Central de entradas do hotel"
        subtitle="Booking, contas recebidas por e-mail, avaliações completas e fichas FNRH em um só lugar."
        action={
          <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        }
      />

      <section className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-2 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${tab === item.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {item.label}
            {item.count != null && item.count > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${tab === item.key ? "bg-white/20" : "bg-brick-bg text-brick"}`}>{item.count}</span>
            )}
          </button>
        ))}
      </section>

      {tab === "resumo" && (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <SummaryCard icon={Hotel} label="Booking para conferir" value={bookingPending.length} tone="blue" onClick={() => setTab("booking")} />
            <SummaryCard icon={ReceiptText} label="Contas para conferir" value={expensePending.length} tone="amber" onClick={() => setTab("despesas")} />
            <SummaryCard icon={FileSignature} label="FNRHs para conferir" value={fnrhPending.length} tone="green" onClick={() => setTab("fnrh")} />
            <SummaryCard icon={Star} label="Avaliações críticas" value={urgentFeedbacks.length} tone="rose" onClick={() => setTab("avaliacoes")} />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="card-surface p-4">
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <h2 className="font-bold">Como a automação está trabalhando</h2>
              </div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Booking:</strong> cancelamentos são aplicados quando o código existe; novas reservas entram para conferência porque o e-mail não informa quarto, saída, hóspede e valor.</p>
                <p><strong className="text-foreground">Contas:</strong> Booking e energia podem ser lançados automaticamente quando fornecedor, valor e vínculo empresarial forem seguros.</p>
                <p><strong className="text-foreground">Mercado Livre:</strong> sempre exige confirmação para não misturar compra pessoal com despesa do hotel.</p>
                <p><strong className="text-foreground">Privacidade:</strong> o corpo completo dos e-mails não é guardado no sistema.</p>
              </div>
            </div>
            <div className="card-surface p-4">
              <h2 className="font-bold">Experiência dos hóspedes</h2>
              <div className="mt-3 flex items-center gap-4">
                <div className="grid h-20 w-20 place-items-center rounded-2xl bg-brass-bg font-serif text-3xl font-black text-pine-dark">
                  {averageScore ? averageScore.toFixed(1) : "—"}
                </div>
                <div>
                  <Stars value={averageScore} />
                  <p className="mt-1 text-sm text-muted-foreground">{feedbacks.length} avaliação(ões) recebida(s)</p>
                  <button className="mt-2 text-xs font-bold text-primary" onClick={() => setTab("avaliacoes")}>Ver todas as notas por hóspede</button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === "booking" && (
        <section className="card-surface overflow-hidden">
          <SectionHeader icon={Hotel} title="Mensagens da Booking" description="Histórico de novas reservas e cancelamentos recebidos pelo Gmail." />
          {bookingEvents.length === 0 ? (
            <EmptyState text="Nenhuma mensagem da Booking registrada." />
          ) : (
            <div className="divide-y divide-border">
              {bookingEvents.map((event) => {
                const reservation = reservations.find((item) => item.id === event.reservation_id);
                const needsAction = event.status === "needs_review" || event.status === "error";
                return (
                  <article key={event.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{event.event_type === "new_reservation" ? "Nova reserva" : "Cancelamento"}</strong>
                        <Badge tone={needsAction ? "brick" : "sage"}>{eventStatus(event.status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Código {event.booking_code}{event.checkin ? ` · entrada ${fmtDate(event.checkin)}` : ""}</p>
                      {event.error && <p className="mt-1 text-xs text-brick">{event.error}</p>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {reservation ? <>UH {reservation.quarto} · {reservation.cliente_nome}<br />{fmtDate(reservation.checkin)} a {fmtDate(reservation.checkout)}</> : <>Sem reserva local vinculada<br />Recebido em {formatDateTime(event.received_at)}</>}
                    </div>
                    {event.event_type === "new_reservation" && needsAction ? (
                      <button className="btn-primary" onClick={() => openBooking(event)}>Completar reserva</button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Registrado</span>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "despesas" && (
        <section className="card-surface overflow-hidden">
          <SectionHeader icon={ReceiptText} title="Contas e despesas recebidas por e-mail" description="Somente documentos empresariais entram nas despesas do hotel." />
          {expenseEvents.length === 0 ? (
            <EmptyState text="Nenhuma conta foi recebida pela automação ainda." />
          ) : (
            <div className="divide-y divide-border">
              {expenseEvents.map((event) => {
                const needsAction = event.status === "needs_review" || event.status === "error";
                return (
                  <article key={event.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate">{event.vendor || "Fornecedor não identificado"}</strong>
                        <Badge tone={event.status === "processed" ? "sage" : event.status === "ignored" ? "slate" : "brick"}>{expenseStatus(event.status)}</Badge>
                        {event.personal_suspected && <Badge tone="brick">Possivelmente pessoal</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{event.description || event.subject || "Conta recebida por e-mail"}</p>
                      {event.error && <p className="mt-1 text-xs text-brick">{event.error}</p>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <strong className="block text-sm text-foreground">{event.amount ? fmtBRL(event.amount) : "Valor não identificado"}</strong>
                      {event.category || "Sem categoria"}{event.due_date ? ` · vencimento ${fmtDate(event.due_date)}` : ""}
                    </div>
                    {needsAction && role === "dono" ? (
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => openExpense(event)}>Conferir</button>
                        <button className="btn-ghost" onClick={() => void ignoreExpense(event)}>Ignorar</button>
                      </div>
                    ) : event.status === "processed" ? (
                      <Link to="/despesas" className="text-xs font-bold text-primary">Ver em Despesas</Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "avaliacoes" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Todas as notas de cada hóspede</h2>
              <p className="text-xs text-muted-foreground">Notas gerais e detalhes reais do quarto, sem resumir a experiência em uma única média.</p>
            </div>
            <Link to="/avaliacoes" className="btn-ghost">Abrir análise completa</Link>
          </div>
          {feedbacks.length === 0 ? (
            <EmptyState text="Nenhuma avaliação recebida." />
          ) : feedbacks.map((feedback) => <FeedbackCard key={feedback.id} feedback={feedback} />)}
        </section>
      )}

      {tab === "fnrh" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Fichas FNRH recebidas</h2>
              <p className="text-xs text-muted-foreground">Titular, reserva, preferências do quarto, envio e conferência.</p>
            </div>
            <Link to="/fichas-checkin" className="btn-primary">Abrir central completa</Link>
          </div>
          {checkins.length === 0 ? (
            <EmptyState text="Nenhuma ficha FNRH criada." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {checkins.map((item) => {
                const reservation = reservations.find((row) => row.id === item.reservation_id);
                const form = item.form_data ?? {};
                const waiting = item.status === "preenchido" && !item.reviewed_at;
                return (
                  <article key={item.id} className={`rounded-xl border bg-card p-4 shadow-sm ${waiting ? "border-emerald-300" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="block">{stringValue(form.nome_completo) || reservation?.cliente_nome || "Hóspede"}</strong>
                        <span className="text-xs text-muted-foreground">{reservation ? `UH ${reservation.quarto} · ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}` : "Reserva não localizada"}</span>
                      </div>
                      <Badge tone={waiting ? "brick" : "sage"}>{waiting ? "Conferir" : "Registrada"}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Preference label="Barulho" value={preference(form.preferencia_ruido)} />
                      <Preference label="Ventilação" value={preference(form.preferencia_ventilacao)} />
                      <Preference label="Espaço" value={preference(form.preferencia_espaco)} />
                      <Preference label="Escadas" value={preference(form.preferencia_escadas)} />
                    </div>
                    <Link to="/fichas-checkin" className="btn-ghost mt-3 flex w-full items-center justify-center gap-1.5"><FileSignature className="h-4 w-4" /> Ver ficha e assinatura</Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {bookingEditing && (
        <Modal open title={`Completar Booking ${bookingEditing.booking_code}`} onClose={() => setBookingEditing(null)}>
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              Entrada identificada: <strong>{bookingEditing.checkin ? fmtDate(bookingEditing.checkin) : "não encontrada"}</strong>. Complete somente os dados que não vieram no e-mail.
            </div>
            <label className="block text-xs font-bold">Nome do hóspede<input className="field mt-1" value={bookingDraft.guestName} onChange={(event) => setBookingDraft((current) => ({ ...current, guestName: event.target.value }))} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold">Quarto<select className="field mt-1" value={bookingDraft.room} onChange={(event) => setBookingDraft((current) => ({ ...current, room: event.target.value }))}><option value="">Selecione</option>{rooms.map((room) => <option key={room.numero} value={room.numero}>UH {room.numero} · {room.configuracao || "Quarto"}</option>)}</select></label>
              <label className="block text-xs font-bold">Saída<input type="date" className="field mt-1" value={bookingDraft.checkout} onChange={(event) => setBookingDraft((current) => ({ ...current, checkout: event.target.value }))} /></label>
              <label className="block text-xs font-bold">Pessoas<input inputMode="numeric" className="field mt-1" value={bookingDraft.people} onChange={(event) => setBookingDraft((current) => ({ ...current, people: event.target.value.replace(/\D/g, "") }))} /></label>
              <label className="block text-xs font-bold">Valor total<input inputMode="decimal" className="field mt-1" placeholder="Vazio usa a tarifa do quarto" value={bookingDraft.total} onChange={(event) => setBookingDraft((current) => ({ ...current, total: event.target.value }))} /></label>
            </div>
            <button className="btn-primary w-full" disabled={saving} onClick={() => void completeBooking()}>{saving ? "Criando reserva…" : "Criar reserva e vincular à Booking"}</button>
          </div>
        </Modal>
      )}

      {expenseEditing && (
        <Modal open title="Conferir despesa recebida por e-mail" onClose={() => setExpenseEditing(null)}>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Confira se a conta pertence ao hotel. Compras pessoais devem ser ignoradas.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold">Data / vencimento<input type="date" className="field mt-1" value={expenseDraft.date} onChange={(event) => setExpenseDraft((current) => ({ ...current, date: event.target.value }))} /></label>
              <label className="block text-xs font-bold">Valor<input inputMode="decimal" className="field mt-1" value={expenseDraft.amount} onChange={(event) => setExpenseDraft((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label className="block text-xs font-bold">Categoria<input className="field mt-1" value={expenseDraft.category} onChange={(event) => setExpenseDraft((current) => ({ ...current, category: event.target.value }))} /></label>
              <label className="block text-xs font-bold">Fornecedor<input className="field mt-1" value={expenseDraft.vendor} onChange={(event) => setExpenseDraft((current) => ({ ...current, vendor: event.target.value }))} /></label>
              <label className="block text-xs font-bold sm:col-span-2">Descrição<input className="field mt-1" value={expenseDraft.description} onChange={(event) => setExpenseDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="block text-xs font-bold sm:col-span-2">Pagamento<input className="field mt-1" value={expenseDraft.paymentMethod} onChange={(event) => setExpenseDraft((current) => ({ ...current, paymentMethod: event.target.value }))} /></label>
            </div>
            <button className="btn-primary w-full" disabled={saving || role !== "dono"} onClick={() => void approveExpense()}>{saving ? "Lançando…" : "Aprovar e lançar em Despesas"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone, onClick }: { icon: typeof Inbox; label: string; value: number; tone: "blue" | "amber" | "green" | "rose"; onClick: () => void }) {
  const classes = { blue: "border-blue-200 bg-blue-50 text-blue-800", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-emerald-200 bg-emerald-50 text-emerald-800", rose: "border-rose-200 bg-rose-50 text-rose-800" }[tone];
  return <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${classes}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70"><Icon className="h-5 w-5" /></span><span><strong className="block text-xl leading-none">{value}</strong><span className="mt-1 block text-[10px] font-extrabold uppercase tracking-wide">{label}</span></span></button>;
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof Inbox; title: string; description: string }) {
  return <div className="flex items-center gap-3 border-b border-border p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><h2 className="font-bold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div></div>;
}

function FeedbackCard({ feedback }: { feedback: Feedback }) {
  const values = SCORE_FIELDS.map(([key, label]) => ({ key, label, value: Number((feedback as any)[key]) || 0 })).filter((item) => item.value > 0);
  const urgent = Number(feedback.nota_geral ?? 0) <= 2;
  return (
    <article className={`rounded-xl border bg-card p-4 shadow-sm ${urgent ? "border-rose-300" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /><strong>{feedback.hospede_nome || "Hóspede anônimo"}</strong>{feedback.quarto && <Badge tone="slate">UH {feedback.quarto}</Badge>}{urgent && <Badge tone="brick">Atenção</Badge>}</div><div className="mt-1 flex items-center gap-2"><Stars value={feedback.nota_geral} /><span className="text-xs text-muted-foreground">{fmtDate(feedback.created_at)}</span></div></div>
        <strong className="rounded-xl bg-brass-bg px-3 py-2 font-serif text-xl text-pine-dark">{feedback.nota_geral ?? "—"}/5</strong>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{values.map((item) => <div key={item.key} className="rounded-lg bg-muted/45 px-2.5 py-2"><span className="block text-[9px] font-bold uppercase text-muted-foreground">{item.label}</span><strong className={item.value <= 2 ? "text-brick" : "text-foreground"}>{item.value}/5</strong></div>)}</div>
      {feedback.comentario && <p className="mt-3 rounded-lg bg-sage-bg/50 p-3 text-sm">“{feedback.comentario}”</p>}
      {feedback.sugestao && <p className="mt-2 text-sm text-muted-foreground"><strong className="text-foreground">Sugestão:</strong> {feedback.sugestao}</p>}
    </article>
  );
}

function Preference({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/50 p-2"><span className="block text-[9px] font-bold uppercase text-muted-foreground">{label}</span><strong>{value || "Não informado"}</strong></div>;
}

function eventStatus(status: BookingEvent["status"]) {
  return { pending: "Pendente", processed: "Processado", already_cancelled: "Já cancelada", needs_review: "Precisa conferir", ignored: "Ignorado", error: "Erro" }[status];
}

function expenseStatus(status: ExpenseEvent["status"]) {
  return { pending: "Pendente", processed: "Lançada", needs_review: "Precisa conferir", ignored: "Ignorada", error: "Erro" }[status];
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function preference(value: unknown) {
  const raw = stringValue(value);
  const labels: Record<string, string> = {
    silencioso: "Prefere silêncio",
    movimento: "Aceita movimento",
    indiferente: "Indiferente",
    arejado: "Bem arejado",
    normal: "Normal",
    espacoso: "Mais espaço",
    compacto: "Compacto",
    sem_escadas: "Evitar escadas",
    poucas: "Poucas escadas",
  };
  return labels[raw] ?? raw.replaceAll("_", " ");
}

void AlertTriangle;
void BadgeCheck;
void CalendarDays;
void ClipboardList;
void FileWarning;
void MailCheck;
void XCircle;
