import Brazil from "@svg-maps/brazil";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  Building2,
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
import { useCurrentCompany } from "@/lib/data";
import { periodRange, type DashboardPeriod } from "@/lib/dashboard-utils";
import { fmtBRL, todayISO } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/central-estrategica")({
  component: PulsoHotel,
});

type PulsoView = "resumo" | "receitas" | "hospedes";
type NumericRow = { name: string; value: number; share?: number; revenue?: number };
type ProductRow = {
  name: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
  share?: number;
};
type StateRow = { code: string; name: string; value: number; revenue: number };
type FinancialRow = {
  label: string;
  date: string;
  receita: number;
  despesas: number;
  gop: number;
};
type StrategicSummary = {
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
  clientCount: number;
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
  summary: StrategicSummary;
  financialSeries: FinancialRow[];
  channelRows: NumericRow[];
  roomTypeRows: NumericRow[];
  expenseRows: NumericRow[];
  productRows: ProductRow[];
  productCategoryRows: NumericRow[];
  paymentRows: NumericRow[];
  revenueMixRows: NumericRow[];
  stateRows: StateRow[];
  originRows: NumericRow[];
  ageRows: NumericRow[];
  reasonRows: NumericRow[];
  complaintRows: NumericRow[];
};

const VIEWS: { id: PulsoView; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "receitas", label: "Receitas e produtos" },
  { id: "hospedes", label: "Hóspedes e marketing" },
];

function PulsoHotel() {
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [view, setView] = useState<PulsoView>("resumo");
  const company = useCurrentCompany();
  const today = todayISO();
  const range = periodRange(period, today);
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
  const topProductRevenue = data.productRows[0];
  const topProductQuantity = useMemo(
    () => [...data.productRows].sort((a, b) => b.quantity - a.quantity)[0],
    [data.productRows],
  );
  const directShare = data.channelRows.find((row) => row.name.toLowerCase().includes("diret"))?.share ?? 0;
  const actions = buildRecommendedActions({
    occupancy: summary.occupancyRate,
    margin: summary.margin,
    cancelled: summary.cancellations,
    noShows: summary.noShows,
    complaintsOpen: summary.openComplaints,
    directShare,
    retention: summary.retentionRate,
    productRevenue: summary.salesRevenue,
  });

  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-1" aria-label="Visões do Pulso do Hotel">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                view === item.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Período
            <select
              className="field h-8 min-w-28 py-1 text-xs"
              value={period}
              onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            >
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
            <MiniKpi icon={<CircleDollarSign />} label="Receita" value={fmtBRL(summary.revenue)} hint="hospedagem + extras" />
            <MiniKpi icon={<WalletCards />} label="GOP" value={fmtBRL(summary.gop)} hint={`${summary.margin.toFixed(1)}% de margem`} />
            <MiniKpi icon={<AlertTriangle />} label="Cancelamentos" value={String(summary.cancellations)} hint={`${summary.noShows} no-show`} danger={summary.cancellations > 0} />
            <MiniKpi icon={<Star />} label="Avaliação" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} hint={`${summary.feedbackCount} respostas`} />
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-8" title="Receita, despesas e GOP" subtitle="Evolução do resultado no período">
              <FinancialChart rows={data.financialSeries} />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Custos operacionais" subtitle="Categorias que mais consomem o resultado">
              <HorizontalBars rows={data.expenseRows} valueLabel="Despesa" currency minHeight={320} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Receita por canal" subtitle="Onde as reservas geram receita">
              <HorizontalBars rows={data.channelRows} valueLabel="Receita" currency />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Receita por tipo de quarto" subtitle="Categorias de hospedagem com melhor resultado">
              <HorizontalBars rows={data.roomTypeRows} valueLabel="Receita" currency />
            </ChartCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <InsightCard icon={<Users />} title="Retenção e perfil">
              <StatLine label="Hóspedes no período" value={String(summary.guestCount)} />
              <StatLine label="Hóspedes recorrentes" value={String(summary.recurringGuests)} />
              <StatLine label="Taxa de retorno" value={`${summary.retentionRate.toFixed(1)}%`} />
              <StatLine label="Receita média por hóspede" value={fmtBRL(summary.averageGuestRevenue)} />
            </InsightCard>
            <InsightCard icon={<MessageSquareWarning />} title="Experiência">
              <StatLine label="Avaliação interna" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} />
              <StatLine label="Reclamações abertas" value={String(summary.openComplaints)} />
              <StatLine label="Principal tema" value={data.complaintRows[0]?.name ?? "Sem ocorrências"} />
              <StatLine label="Booking / Google" value="Pendente de integração" muted />
            </InsightCard>
            <InsightCard icon={<Globe2 />} title="Ações recomendadas">
              <ActionList rows={actions} />
            </InsightCard>
          </section>
        </>
      )}

      {view === "receitas" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MiniKpi icon={<BedDouble />} label="Hospedagem" value={fmtBRL(summary.lodgingRevenue)} hint="receita das diárias" />
            <MiniKpi icon={<ShoppingBasket />} label="Produtos e serviços" value={fmtBRL(summary.salesRevenue)} hint="separado da hospedagem" />
            <MiniKpi icon={<CircleDollarSign />} label="Ticket de consumo" value={fmtBRL(summary.productTicket)} hint="por lançamento/reserva" />
            <MiniKpi icon={<PackageSearch />} label="Produto líder" value={topProductRevenue?.name ?? "—"} hint={topProductRevenue ? fmtBRL(topProductRevenue.revenue) : "sem vendas"} />
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-4" title="Composição da receita" subtitle="Hospedagem versus produtos e serviços">
              <HorizontalBars rows={data.revenueMixRows} valueLabel="Receita" currency minHeight={300} />
            </ChartCard>
            <ChartCard className="xl:col-span-8" title="Produtos com maior receita" subtitle="Onde priorizar exposição, negociação e investimento">
              <HorizontalBars rows={data.productRows.map((row) => ({ name: row.name, value: row.revenue }))} valueLabel="Receita" currency minHeight={340} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Produtos mais vendidos" subtitle="Quantidade para orientar reposição de estoque">
              <HorizontalBars rows={data.productRows.map((row) => ({ name: row.name, value: row.quantity }))} valueLabel="Unidades" minHeight={340} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Receita por categoria de produto" subtitle="Categorias para ampliar ou reduzir o mix">
              <HorizontalBars rows={data.productCategoryRows} valueLabel="Receita" currency minHeight={340} />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Formas de pagamento" subtitle="Distribuição dos recebimentos">
              <HorizontalBars rows={data.paymentRows} valueLabel="Receita" currency />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Decisões de reposição" subtitle="Leitura direta para compras e estoque">
              <DecisionGrid
                rows={[
                  {
                    question: "O que repor primeiro?",
                    answer: topProductQuantity ? `${topProductQuantity.name}: ${topProductQuantity.quantity.toFixed(0)} unidades vendidas.` : "Ainda não há vendas suficientes.",
                  },
                  {
                    question: "Onde investir mais?",
                    answer: topProductRevenue ? `${topProductRevenue.name} lidera a receita com ${fmtBRL(topProductRevenue.revenue)}.` : "Cadastre produtos e vendas para comparar.",
                  },
                  {
                    question: "O consumo ajuda o hotel?",
                    answer: summary.salesRevenue > 0 ? `Produtos e serviços representam ${percentage(summary.salesRevenue, summary.revenue)} da receita total.` : "Ainda não há receita adicional no período.",
                  },
                  {
                    question: "Qual ticket buscar?",
                    answer: `O ticket atual de consumo é ${fmtBRL(summary.productTicket)}. Use promoções combinadas para elevá-lo sem reduzir a diária.`,
                  },
                ]}
              />
            </ChartCard>
          </section>
        </>
      )}

      {view === "hospedes" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <MiniKpi icon={<Users />} label="Hóspedes" value={String(summary.guestCount)} hint={`${summary.newGuests} novos`} />
            <MiniKpi icon={<UserRoundCheck />} label="Recorrentes" value={String(summary.recurringGuests)} hint={`${summary.retentionRate.toFixed(1)}% retornam`} />
            <MiniKpi icon={<CircleDollarSign />} label="Receita por hóspede" value={fmtBRL(summary.averageGuestRevenue)} hint="hospedagem + consumo" />
            <MiniKpi icon={<CalendarDays />} label="Permanência" value={`${summary.averageStay.toFixed(1)} noites`} hint="média do período" />
            <MiniKpi icon={<Megaphone />} label="Venda direta" value={`${directShare.toFixed(1)}%`} hint="menor dependência de comissão" />
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-8" title="Origem dos hóspedes" subtitle="Estados com maior frequência e receita">
              <BrazilStateMap rows={data.stateRows} />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Cidades e origens líderes" subtitle="Mercados para campanhas geográficas">
              <HorizontalBars rows={data.originRows.map((row) => ({ name: row.name, value: row.revenue ?? row.value }))} valueLabel="Receita" currency minHeight={360} />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Faixa etária" subtitle="Perfil para produto, comunicação e tarifa">
              <HorizontalBars rows={data.ageRows} valueLabel="Hóspedes" />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Motivo da viagem" subtitle="Lazer, negócios e outras motivações">
              <HorizontalBars rows={data.reasonRows} valueLabel="Reservas" />
            </ChartCard>
            <ChartCard className="xl:col-span-4" title="Novos x recorrentes" subtitle="Receita gerada pelos dois grupos">
              <HorizontalBars
                rows={[
                  { name: "Novos", value: summary.newGuestRevenue },
                  { name: "Recorrentes", value: summary.recurringRevenue },
                ]}
                valueLabel="Receita"
                currency
              />
            </ChartCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <InsightCard icon={<Megaphone />} title="Perguntas de marketing e preço">
              <DecisionGrid
                rows={[
                  {
                    question: "Vale aumentar a diária?",
                    answer: priceDecision(summary),
                  },
                  {
                    question: "Onde anunciar?",
                    answer: data.stateRows[0]
                      ? `Priorize ${data.stateRows[0].code}, que lidera a receita de hóspedes no período.`
                      : "Preencha estado e cidade dos hóspedes para orientar campanhas por região.",
                  },
                  {
                    question: "Quem deve receber campanha de retorno?",
                    answer: summary.recurringGuests > 0
                      ? `${summary.recurringGuests} hóspedes já demonstraram recorrência; crie ofertas de retorno e indicação.`
                      : "Ainda não há recorrência suficiente; capture contato e motivo da viagem em cada reserva.",
                  },
                  {
                    question: "Qual canal fortalecer?",
                    answer: directShare < 35
                      ? `A venda direta está em ${directShare.toFixed(1)}%. Invista em WhatsApp, site e remarketing para reduzir comissões.`
                      : `A venda direta já representa ${directShare.toFixed(1)}%; preserve esse relacionamento e mensure recompra.`,
                  },
                ]}
              />
            </InsightCard>
            <InsightCard icon={<MapPinned />} title="Dados que faltam para análises melhores">
              <ActionList
                rows={[
                  data.stateRows.length ? "Origem por estado já está disponível para segmentação." : "Preencher estado e cidade no cadastro do hóspede.",
                  data.ageRows.length ? "Faixa etária já pode orientar comunicação e serviços." : "Preencher data de nascimento para analisar faixa etária.",
                  data.reasonRows.some((row) => row.name !== "Não informado")
                    ? "Motivo da viagem já pode separar lazer e negócios."
                    : "Preencher motivo da viagem em todas as reservas.",
                  "Integrar Booking, Google e campanhas para ligar aquisição, reputação e receita.",
                ]}
              />
            </InsightCard>
          </section>
        </>
      )}
    </div>
  );
}

function FinancialChart({ rows }: { rows: FinancialRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={rows} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} width={62} tickFormatter={compactCurrency} />
        <Tooltip formatter={(value: number) => fmtBRL(value)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="receita" name="Receita" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesas" name="Despesas" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="gop" name="GOP" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function BrazilStateMap({ rows }: { rows: StateRow[] }) {
  if (!rows.length) {
    return <EmptyState text="Cadastre estado e cidade dos hóspedes para preencher o mapa e orientar campanhas regionais." height={380} />;
  }
  const map = Brazil as { viewBox: string; locations: { id: string; name: string; path: string }[] };
  const rowByState = new Map(rows.map((row) => [row.code.toLowerCase(), row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <div className="grid min-h-[380px] overflow-hidden rounded-lg border border-border/70 bg-[radial-gradient(circle_at_38%_45%,color-mix(in_srgb,var(--primary)_12%,var(--card)),var(--card)_70%)] md:grid-cols-[minmax(0,1fr)_190px]">
      <svg viewBox={map.viewBox} className="min-h-[360px] w-full p-4" role="img" aria-label="Mapa do Brasil com receita por estado">
        <defs>
          <filter id="state-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
          </filter>
        </defs>
        {map.locations.map((location) => {
          const row = rowByState.get(location.id.toLowerCase());
          const intensity = row ? 0.25 + (row.revenue / maxRevenue) * 0.75 : 0.07;
          return (
            <path
              key={location.id}
              d={location.path}
              fill={row ? "var(--primary)" : "var(--pine-dark)"}
              fillOpacity={intensity}
              stroke="var(--card)"
              strokeWidth="1.8"
              filter={row ? "url(#state-shadow)" : undefined}
              className="transition hover:fill-opacity-100"
            >
              <title>{row ? `${row.code}: ${row.value} hóspede(s) · ${fmtBRL(row.revenue)}` : `${location.name}: sem dados`}</title>
            </path>
          );
        })}
      </svg>
      <div className="border-t border-border/70 bg-card/90 p-3 md:border-l md:border-t-0">
        <strong className="text-[10px] uppercase text-foreground">Estados líderes</strong>
        <div className="mt-3 space-y-3">
          {rows.slice(0, 7).map((row, index) => (
            <div key={row.code}>
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-bold text-foreground">{index + 1}. {row.code}</span>
                <span className="text-muted-foreground">{row.value} hóspedes</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }} />
              </div>
              <p className="mt-0.5 text-right text-[9px] font-semibold text-primary">{fmtBRL(row.revenue)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ icon, label, value, hint, danger = false }: { icon: ReactNode; label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <article className="min-h-[82px] min-w-0 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <div className={`h-4 w-4 ${danger ? "text-destructive" : "text-primary"}`}>{icon}</div>
      <p className="mt-1 truncate text-[9px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-base font-bold tabular-nums text-foreground" title={value}>{value}</p>
      <p className="truncate text-[9px] text-muted-foreground" title={hint}>{hint}</p>
    </article>
  );
}

function ChartCard({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: ReactNode }) {
  return (
    <article className={`min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mb-2 text-[11px] text-muted-foreground">{subtitle}</p>
      {children}
    </article>
  );
}

function InsightCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-primary">{icon}<h2 className="text-sm font-bold text-foreground">{title}</h2></div>
      <div className="space-y-2">{children}</div>
    </article>
  );
}

function StatLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 text-xs last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-right text-muted-foreground" : "text-right font-semibold text-foreground"}>{value}</span>
    </div>
  );
}

function HorizontalBars({ rows, valueLabel, currency = false, minHeight = 300 }: { rows: NumericRow[]; valueLabel: string; currency?: boolean; minHeight?: number }) {
  const visible = rows.filter((row) => row.value > 0).slice(0, 10);
  if (!visible.length) return <EmptyState text="Sem dados suficientes no período." height={minHeight} />;
  const height = Math.max(minHeight, Math.min(440, visible.length * 42));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={visible} layout="vertical" margin={{ left: 20, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={currency ? compactCurrency : compactNumber} />
        <YAxis dataKey="name" type="category" width={118} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : Number(value).toLocaleString("pt-BR")} />
        <Bar dataKey="value" name={valueLabel} fill="var(--primary)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActionList({ rows }: { rows: string[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row} className="flex gap-2 text-xs text-foreground">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{row}</span>
        </li>
      ))}
    </ul>
  );
}

function DecisionGrid({ rows }: { rows: { question: string; answer: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.question} className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <p className="text-[10px] font-bold uppercase text-primary">{row.question}</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground">{row.answer}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text, height = 300 }: { text: string; height?: number }) {
  return <div className="grid place-items-center rounded-lg border border-dashed border-border px-5 text-center text-xs text-muted-foreground" style={{ minHeight: height }}>{text}</div>;
}

function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) {
  return <section className="rounded-xl border border-border bg-card p-6"><h1 className={danger ? "font-bold text-destructive" : "font-bold text-foreground"}>{title}</h1><p className="mt-1 text-sm text-muted-foreground">{text}</p></section>;
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
function percentage(value: number, total: number) {
  return `${total > 0 ? ((value / total) * 100).toFixed(1) : "0.0"}%`;
}
function priceDecision(summary: StrategicSummary) {
  if (summary.occupancyRate >= 80 && summary.retentionRate >= 25) {
    return `Ocupação de ${summary.occupancyRate.toFixed(1)}% e retorno de ${summary.retentionRate.toFixed(1)}% indicam espaço para testar aumento gradual da ADR.`;
  }
  if (summary.occupancyRate >= 70) {
    return `A ocupação está em ${summary.occupancyRate.toFixed(1)}%. Teste reajustes apenas nas datas de maior demanda e acompanhe o RevPAR.`;
  }
  return `Com ocupação de ${summary.occupancyRate.toFixed(1)}%, priorize demanda, venda direta e pacotes antes de aumentar a diária de forma ampla.`;
}
function buildRecommendedActions(input: {
  occupancy: number;
  margin: number;
  cancelled: number;
  noShows: number;
  complaintsOpen: number;
  directShare: number;
  retention: number;
  productRevenue: number;
}) {
  const rows: string[] = [];
  if (input.occupancy < 45) rows.push("Ocupação baixa: reforçar venda direta e campanhas para as datas com maior disponibilidade.");
  if (input.cancelled > 0 || input.noShows > 0) rows.push("Revisar confirmação, política de cancelamento e lembretes antes do check-in.");
  if (input.margin < 25) rows.push("Margem pressionada: revisar despesas operacionais, desperdícios e comissões por canal.");
  if (input.directShare < 35) rows.push("Aumentar reservas diretas para reduzir dependência de canais com comissão.");
  if (input.retention < 20) rows.push("Retenção baixa: criar campanha de retorno, indicação e relacionamento pós-checkout.");
  if (input.productRevenue <= 0) rows.push("Cadastrar e acompanhar produtos/serviços para identificar oportunidades de receita adicional.");
  if (input.complaintsOpen > 0) rows.push("Priorizar reclamações abertas antes que afetem reputação e recorrência.");
  if (!rows.length) rows.push("Indicadores estáveis: acompanhar preço, ocupação futura, retenção e oportunidades de aumento de ticket.");
  return rows.slice(0, 5);
}
