import Brazil from "@svg-maps/brazil";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  Globe2,
  MapPinned,
  Megaphone,
  MessageSquareWarning,
  PackageSearch,
  ShoppingBasket,
  Star,
  TrendingUp,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardTvButton } from "@/components/DashboardKit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { periodRange, type DashboardPeriod } from "@/lib/dashboard-utils";
import { fmtBRL, todayISO } from "@/lib/format";

type View = "resumo" | "produtos" | "hospedagem" | "hospedes";
type NumericRow = { name: string; value: number; share?: number; revenue?: number };
type ProductRow = { name: string; quantity: number; revenue: number; averagePrice: number };
type StateRow = { code: string; name: string; value: number; revenue: number };
type FinancialRow = { label: string; date: string; receita: number; despesas: number; gop: number };
type Summary = {
  roomCount: number;
  occupiedNow: number;
  availableRooms: number;
  occupancyNow: number;
  soldRoomNights: number;
  availableRoomNights: number;
  occupancyRate: number;
  lodgingRevenue: number;
  salesRevenue: number;
  revenue: number;
  expenses: number;
  gop: number;
  margin: number;
  adr: number;
  revpar: number;
  cancellations: number;
  noShows: number;
  averageStay: number;
  averageRating: number;
  feedbackCount: number;
  openComplaints: number;
  guestCount: number;
  recurringGuests: number;
  newGuests: number;
  retentionRate: number;
  recurringRevenue: number;
  newGuestRevenue: number;
  averageGuestRevenue: number;
  productTicket: number;
  reservationCount: number;
};
type StrategicData = {
  summary: Summary;
  financialSeries: FinancialRow[];
  channelRows: NumericRow[];
  roomTypeRows: NumericRow[];
  expenseRows: NumericRow[];
  productRows: ProductRow[];
  productCategoryRows: NumericRow[];
  paymentRows: NumericRow[];
  stateRows: StateRow[];
  originRows: NumericRow[];
  ageRows: NumericRow[];
  reasonRows: NumericRow[];
  complaintRows: NumericRow[];
};

const VIEWS: { id: View; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "produtos", label: "Produtos e serviços" },
  { id: "hospedagem", label: "Hospedagem" },
  { id: "hospedes", label: "Hóspedes e marketing" },
];

export function PulsoHotelDashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [view, setView] = useState<View>("resumo");
  const company = useCurrentCompany();
  const range = periodRange(period, todayISO());
  const query = useQuery({
    queryKey: ["dashboard-strategic-aggregates", company.data?.id, range.start, range.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("dashboard_strategic_aggregates", {
        p_company_id: company.data!.id,
        p_start: range.start,
        p_end: range.end,
      });
      if (error) throw error;
      return data as StrategicData;
    },
  });

  if (company.isLoading || query.isLoading) {
    return <StateCard title="Carregando o Pulso do Hotel…" text="O banco está consolidando os indicadores do período." />;
  }
  if (company.error || query.error || !query.data) {
    return <StateCard title="Não foi possível carregar os indicadores" text="Confira sua conexão e tente novamente." danger />;
  }

  const data = query.data;
  const summary = data.summary;
  const topRevenue = data.productRows[0];
  const topQuantity = [...data.productRows].sort((a, b) => b.quantity - a.quantity)[0];
  const averageReservationRevenue = summary.reservationCount > 0
    ? summary.lodgingRevenue / summary.reservationCount
    : 0;
  const averageNightRevenue = summary.soldRoomNights > 0
    ? summary.lodgingRevenue / summary.soldRoomNights
    : 0;
  const directShare = data.channelRows.find((row) => row.name.toLowerCase().includes("diret"))?.share ?? 0;

  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-1" aria-label="Visões do Pulso do Hotel">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${view === item.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Período
            <select className="field h-8 min-w-28 py-1 text-xs" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}>
              <option value="dia">Hoje</option>
              <option value="mes">Mês</option>
              <option value="ano">Ano</option>
            </select>
          </label>
          <DashboardTvButton />
          <div className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground shadow-sm">
            <p className="text-[8px] font-bold uppercase opacity-80">Resultado</p>
            <p className="text-base font-bold tabular-nums">{fmtBRL(summary.gop)}</p>
          </div>
        </div>
      </header>

      {view === "resumo" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            <MiniKpi icon={<BedDouble />} label="Ocupação" value={`${summary.occupancyRate.toFixed(1)}%`} hint={`${summary.occupancyNow.toFixed(0)}% agora`} />
            <MiniKpi icon={<CalendarDays />} label="Disponíveis" value={String(summary.availableRooms)} hint={`${summary.occupiedNow} ocupados`} />
            <MiniKpi icon={<BadgeDollarSign />} label="ADR" value={fmtBRL(summary.adr)} hint={`${summary.soldRoomNights} UH vendidas`} />
            <MiniKpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(summary.revpar)} hint="por UH disponível" />
            <MiniKpi icon={<CircleDollarSign />} label="Receita total" value={fmtBRL(summary.revenue)} hint="hotel + produtos" />
            <MiniKpi icon={<WalletCards />} label="GOP" value={fmtBRL(summary.gop)} hint={`${summary.margin.toFixed(1)}% de margem`} />
            <MiniKpi icon={<AlertTriangle />} label="Cancelamentos" value={String(summary.cancellations)} hint={`${summary.noShows} no-show`} danger={summary.cancellations > 0} />
            <MiniKpi icon={<Star />} label="Avaliação" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} hint={`${summary.feedbackCount} respostas`} />
          </section>
          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-8" title="Receita, despesas e GOP" subtitle="Resultado geral do hotel no período">
              <FinancialChart rows={data.financialSeries} />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Custos operacionais" subtitle="Categorias que mais consomem o resultado">
              <HorizontalBars rows={data.expenseRows} valueLabel="Despesa" currency minHeight={330} />
            </ChartCard>
          </section>
          <section className="grid gap-3 lg:grid-cols-3">
            <InsightCard icon={<Users />} title="Retenção e perfil">
              <StatLine label="Hóspedes" value={String(summary.guestCount)} />
              <StatLine label="Recorrentes" value={String(summary.recurringGuests)} />
              <StatLine label="Taxa de retorno" value={`${summary.retentionRate.toFixed(1)}%`} />
              <StatLine label="Receita média por hóspede" value={fmtBRL(summary.averageGuestRevenue)} />
            </InsightCard>
            <InsightCard icon={<MessageSquareWarning />} title="Experiência">
              <StatLine label="Avaliação interna" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} />
              <StatLine label="Reclamações abertas" value={String(summary.openComplaints)} />
              <StatLine label="Principal tema" value={data.complaintRows[0]?.name ?? "Sem ocorrências"} />
              <StatLine label="Booking / Google" value="Pendente de integração" muted />
            </InsightCard>
            <InsightCard icon={<Globe2 />} title="Leitura executiva">
              <ActionList rows={buildActions(summary, directShare)} />
            </InsightCard>
          </section>
        </>
      )}

      {view === "produtos" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MiniKpi icon={<ShoppingBasket />} label="Receita de produtos" value={fmtBRL(summary.salesRevenue)} hint="sem incluir hospedagem" />
            <MiniKpi icon={<CircleDollarSign />} label="Ticket de consumo" value={fmtBRL(summary.productTicket)} hint="por lançamento/reserva" />
            <MiniKpi icon={<PackageSearch />} label="Maior receita" value={topRevenue?.name ?? "—"} hint={topRevenue ? fmtBRL(topRevenue.revenue) : "sem vendas"} />
            <MiniKpi icon={<ShoppingBasket />} label="Mais vendido" value={topQuantity?.name ?? "—"} hint={topQuantity ? `${topQuantity.quantity.toFixed(0)} unidades` : "sem vendas"} />
          </section>
          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-6" title="Produtos com maior receita" subtitle="Priorize margem, exposição e negociação com fornecedores">
              <HorizontalBars rows={data.productRows.map((row) => ({ name: row.name, value: row.revenue }))} valueLabel="Receita" currency minHeight={380} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Produtos mais vendidos" subtitle="Quantidade para orientar reposição de estoque">
              <HorizontalBars rows={data.productRows.map((row) => ({ name: row.name, value: row.quantity }))} valueLabel="Unidades" minHeight={380} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Receita por categoria de produto" subtitle="Categorias para ampliar ou reduzir o mix">
              <HorizontalBars rows={data.productCategoryRows} valueLabel="Receita" currency minHeight={350} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Formas de pagamento dos produtos" subtitle="Como o consumo é recebido">
              <HorizontalBars rows={data.paymentRows} valueLabel="Receita" currency minHeight={350} />
            </ChartCard>
          </section>
          <DecisionGrid rows={[
            { question: "O que repor primeiro?", answer: topQuantity ? `${topQuantity.name} lidera em volume, com ${topQuantity.quantity.toFixed(0)} unidades.` : "Ainda não há vendas suficientes." },
            { question: "Onde investir mais?", answer: topRevenue ? `${topRevenue.name} lidera a receita com ${fmtBRL(topRevenue.revenue)}.` : "Cadastre produtos e vendas para comparar." },
            { question: "Qual o peso dos produtos?", answer: `Produtos e serviços representam ${percentage(summary.salesRevenue, summary.revenue)} da receita total do hotel.` },
            { question: "Como elevar o ticket?", answer: `O ticket atual é ${fmtBRL(summary.productTicket)}. Teste combos, ofertas no check-in e sugestões durante a hospedagem.` },
          ]} />
        </>
      )}

      {view === "hospedagem" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            <MiniKpi icon={<BedDouble />} label="Receita de hospedagem" value={fmtBRL(summary.lodgingRevenue)} hint="somente diárias" />
            <MiniKpi icon={<Users />} label="Receita por hóspede" value={fmtBRL(summary.guestCount ? summary.lodgingRevenue / summary.guestCount : 0)} hint="somente hospedagem" />
            <MiniKpi icon={<CalendarDays />} label="Receita por reserva" value={fmtBRL(averageReservationRevenue)} hint={`${summary.reservationCount} reservas`} />
            <MiniKpi icon={<BadgeDollarSign />} label="Receita por noite" value={fmtBRL(averageNightRevenue)} hint={`${summary.soldRoomNights} noites`} />
            <MiniKpi icon={<BadgeDollarSign />} label="ADR" value={fmtBRL(summary.adr)} hint="diária média" />
            <MiniKpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(summary.revpar)} hint="por UH disponível" />
            <MiniKpi icon={<CalendarDays />} label="Permanência" value={`${summary.averageStay.toFixed(1)} noites`} hint="média por estadia" />
            <MiniKpi icon={<UserRoundCheck />} label="Retorno" value={`${summary.retentionRate.toFixed(1)}%`} hint={`${summary.recurringGuests} recorrentes`} />
          </section>
          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-6" title="Receita de hospedagem por canal" subtitle="Compare receita e dependência de comissões">
              <HorizontalBars rows={data.channelRows} valueLabel="Receita" currency minHeight={380} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Receita por tipo de quarto" subtitle="Categorias com melhor resultado de hospedagem">
              <HorizontalBars rows={data.roomTypeRows} valueLabel="Receita" currency minHeight={380} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Novos x recorrentes" subtitle="Receita de hospedagem gerada pelos dois grupos">
              <HorizontalBars rows={[{ name: "Novos", value: summary.newGuestRevenue }, { name: "Recorrentes", value: summary.recurringRevenue }]} valueLabel="Receita" currency minHeight={320} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Decisões de tarifa e relacionamento" subtitle="Perguntas que os indicadores ajudam a responder">
              <DecisionGrid rows={[
                { question: "Vale aumentar a diária?", answer: priceDecision(summary) },
                { question: "Qual quarto priorizar?", answer: data.roomTypeRows[0] ? `${data.roomTypeRows[0].name} lidera a receita de hospedagem no período.` : "Ainda não há reservas suficientes." },
                { question: "Qual canal fortalecer?", answer: directShare < 35 ? `Venda direta em ${directShare.toFixed(1)}%. Reforce site, WhatsApp e remarketing para reduzir comissões.` : `Venda direta em ${directShare.toFixed(1)}%. Preserve esse canal e acompanhe recompra.` },
                { question: "Quem gera mais valor?", answer: summary.recurringRevenue > summary.newGuestRevenue ? "Recorrentes geram mais receita; invista em fidelização e retorno." : "Novos hóspedes geram mais receita; trabalhe pós-estadia para aumentar recompra." },
              ]} />
            </ChartCard>
          </section>
        </>
      )}

      {view === "hospedes" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <MiniKpi icon={<Users />} label="Hóspedes" value={String(summary.guestCount)} hint={`${summary.newGuests} novos`} />
            <MiniKpi icon={<UserRoundCheck />} label="Recorrentes" value={String(summary.recurringGuests)} hint={`${summary.retentionRate.toFixed(1)}% retornam`} />
            <MiniKpi icon={<CircleDollarSign />} label="Receita total por hóspede" value={fmtBRL(summary.averageGuestRevenue)} hint="hospedagem + consumo" />
            <MiniKpi icon={<CalendarDays />} label="Permanência" value={`${summary.averageStay.toFixed(1)} noites`} hint="média do período" />
            <MiniKpi icon={<Megaphone />} label="Venda direta" value={`${directShare.toFixed(1)}%`} hint="menor dependência de comissão" />
          </section>
          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-8" title="Origem dos hóspedes" subtitle="Estados com maior frequência e receita">
              <BrazilStateMap rows={data.stateRows} />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Cidades e origens líderes" subtitle="Mercados para campanhas geográficas">
              <HorizontalBars rows={data.originRows.map((row) => ({ name: row.name, value: row.revenue ?? row.value }))} valueLabel="Receita" currency minHeight={380} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Faixa etária" subtitle="Perfil para produto e comunicação">
              <HorizontalBars rows={data.ageRows} valueLabel="Hóspedes" minHeight={330} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Motivo da viagem" subtitle="Lazer, negócios e outras motivações">
              <HorizontalBars rows={data.reasonRows} valueLabel="Reservas" minHeight={330} />
            </ChartCard>
          </section>
          <DecisionGrid rows={[
            { question: "Onde anunciar?", answer: data.stateRows[0] ? `Priorize ${data.stateRows[0].code}, que lidera a receita de hóspedes no período.` : "Preencha estado e cidade para orientar campanhas regionais." },
            { question: "Quem receberá campanha de retorno?", answer: summary.recurringGuests ? `${summary.recurringGuests} hóspedes já retornaram; crie ofertas de fidelidade e indicação.` : "Capture contato e motivo da viagem para construir campanhas de retorno." },
            { question: "Qual mensagem usar?", answer: data.reasonRows[0] ? `O motivo mais frequente é ${data.reasonRows[0].name}; adapte anúncios, pacotes e comunicação a esse perfil.` : "Preencha o motivo da viagem nas reservas." },
            { question: "Como melhorar retenção?", answer: summary.retentionRate < 20 ? "Faça contato pós-checkout, ofereça benefício de retorno e acompanhe reclamações." : "A retenção é saudável; mensure receita e frequência dos recorrentes." },
          ]} />
        </>
      )}
    </div>
  );
}

function FinancialChart({ rows }: { rows: FinancialRow[] }) {
  return <ResponsiveContainer width="100%" height={330}><ComposedChart data={rows} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10 }} width={62} tickFormatter={compactNumber} /><Tooltip formatter={(value: number) => fmtBRL(value)} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="receita" name="Receita" fill="var(--chart-2)" radius={[4, 4, 0, 0]} /><Bar dataKey="despesas" name="Despesas" fill="var(--chart-4)" radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="gop" name="GOP" stroke="var(--primary)" strokeWidth={2.5} dot={false} /></ComposedChart></ResponsiveContainer>;
}

function BrazilStateMap({ rows }: { rows: StateRow[] }) {
  if (!rows.length) return <EmptyState text="Cadastre estado e cidade dos hóspedes para preencher o mapa." height={380} />;
  const map = Brazil as { viewBox: string; locations: { id: string; name: string; path: string }[] };
  const rowByState = new Map(rows.map((row) => [row.code.toLowerCase(), row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.revenue));
  return <div className="grid min-h-[380px] overflow-hidden rounded-lg border border-border/70 bg-muted/20 md:grid-cols-[minmax(0,1fr)_190px]"><svg viewBox={map.viewBox} className="min-h-[360px] w-full p-4" role="img" aria-label="Mapa do Brasil com receita por estado">{map.locations.map((location) => { const row = rowByState.get(location.id.toLowerCase()); const intensity = row ? 0.25 + (row.revenue / maxRevenue) * 0.75 : 0.07; return <path key={location.id} d={location.path} fill={row ? "var(--primary)" : "var(--pine-dark)"} fillOpacity={intensity} stroke="var(--card)" strokeWidth="1.8"><title>{row ? `${row.code}: ${row.value} hóspede(s) · ${fmtBRL(row.revenue)}` : `${location.name}: sem dados`}</title></path>; })}</svg><div className="border-t border-border/70 bg-card/90 p-3 md:border-l md:border-t-0"><strong className="text-[10px] uppercase text-foreground">Estados líderes</strong><div className="mt-3 space-y-3">{rows.slice(0, 7).map((row, index) => <div key={row.code}><div className="flex items-center justify-between gap-2 text-[10px]"><span className="font-bold text-foreground">{index + 1}. {row.code}</span><span className="text-muted-foreground">{row.value} hóspedes</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }} /></div><p className="mt-0.5 text-right text-[9px] font-semibold text-primary">{fmtBRL(row.revenue)}</p></div>)}</div></div></div>;
}

function MiniKpi({ icon, label, value, hint, danger = false }: { icon: ReactNode; label: string; value: string; hint: string; danger?: boolean }) {
  return <article className="min-h-[82px] min-w-0 rounded-xl border border-border bg-card px-3 py-2 shadow-sm"><div className={`h-4 w-4 ${danger ? "text-destructive" : "text-primary"}`}>{icon}</div><p className="mt-1 truncate text-[9px] font-semibold uppercase text-muted-foreground">{label}</p><p className="truncate text-base font-bold tabular-nums text-foreground" title={value}>{value}</p><p className="truncate text-[9px] text-muted-foreground" title={hint}>{hint}</p></article>;
}
function ChartCard({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: ReactNode }) {
  return <article className={`min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}><h2 className="text-sm font-bold text-foreground">{title}</h2><p className="mb-2 text-[11px] text-muted-foreground">{subtitle}</p>{children}</article>;
}
function InsightCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <article className="rounded-xl border border-border bg-card p-3 shadow-sm"><div className="mb-3 flex items-center gap-2 text-primary">{icon}<h2 className="text-sm font-bold text-foreground">{title}</h2></div><div className="space-y-2">{children}</div></article>;
}
function StatLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 text-xs last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><span className={muted ? "text-right text-muted-foreground" : "text-right font-semibold text-foreground"}>{value}</span></div>;
}
function HorizontalBars({ rows, valueLabel, currency = false, minHeight = 320 }: { rows: NumericRow[]; valueLabel: string; currency?: boolean; minHeight?: number }) {
  const visible = rows.filter((row) => row.value > 0).slice(0, 10);
  if (!visible.length) return <EmptyState text="Sem dados suficientes no período." height={minHeight} />;
  const height = Math.max(minHeight, Math.min(440, visible.length * 42));
  return <ResponsiveContainer width="100%" height={height}><BarChart data={visible} layout="vertical" margin={{ left: 20, right: 24, top: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} /><XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={compactNumber} /><YAxis dataKey="name" type="category" width={118} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => currency ? fmtBRL(value) : Number(value).toLocaleString("pt-BR")} /><Bar dataKey="value" name={valueLabel} fill="var(--primary)" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>;
}
function ActionList({ rows }: { rows: string[] }) { return <ul className="space-y-2">{rows.map((row) => <li key={row} className="flex gap-2 text-xs text-foreground"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{row}</span></li>)}</ul>; }
function DecisionGrid({ rows }: { rows: { question: string; answer: string }[] }) { return <div className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <div key={row.question} className="rounded-xl border border-border bg-card p-3 shadow-sm"><p className="text-[10px] font-bold uppercase text-primary">{row.question}</p><p className="mt-1 text-xs leading-relaxed text-foreground">{row.answer}</p></div>)}</div>; }
function EmptyState({ text, height = 300 }: { text: string; height?: number }) { return <div className="grid place-items-center rounded-lg border border-dashed border-border px-5 text-center text-xs text-muted-foreground" style={{ minHeight: height }}>{text}</div>; }
function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) { return <section className="rounded-xl border border-border bg-card p-6"><h1 className={danger ? "font-bold text-destructive" : "font-bold text-foreground"}>{title}</h1><p className="mt-1 text-sm text-muted-foreground">{text}</p></section>; }
function compactNumber(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function percentage(value: number, total: number) { return `${total > 0 ? ((value / total) * 100).toFixed(1) : "0.0"}%`; }
function priceDecision(summary: Summary) { if (summary.occupancyRate >= 80 && summary.retentionRate >= 25) return `Ocupação de ${summary.occupancyRate.toFixed(1)}% e retorno de ${summary.retentionRate.toFixed(1)}% indicam espaço para testar aumento gradual.`; if (summary.occupancyRate >= 70) return `Ocupação em ${summary.occupancyRate.toFixed(1)}%. Teste reajustes apenas nas datas de maior demanda e acompanhe o RevPAR.`; return `Com ocupação de ${summary.occupancyRate.toFixed(1)}%, priorize demanda e venda direta antes de aumentar a diária amplamente.`; }
function buildActions(summary: Summary, directShare: number) { const rows: string[] = []; if (summary.occupancyRate < 45) rows.push("Ocupação baixa: reforçar venda direta e campanhas para datas com disponibilidade."); if (summary.cancellations || summary.noShows) rows.push("Revisar confirmação, cancelamento e lembretes antes do check-in."); if (summary.margin < 25) rows.push("Margem pressionada: revisar despesas, desperdícios e comissões."); if (directShare < 35) rows.push("Aumentar reservas diretas para reduzir comissões."); if (summary.retentionRate < 20) rows.push("Criar campanha de retorno e relacionamento pós-checkout."); if (!rows.length) rows.push("Indicadores estáveis: acompanhar preço, ocupação futura, retenção e ticket."); return rows.slice(0, 5); }
