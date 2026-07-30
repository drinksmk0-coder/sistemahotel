import Brazil from "@svg-maps/brazil";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
  { id: "resumo", label: "Visão gerencial" },
  { id: "receitas", label: "Receitas e custos" },
  { id: "hospedes", label: "Clientes e mercado" },
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
    return (
      <StateCard
        title="Carregando o Pulso do Hotel…"
        text="O banco está consolidando os indicadores gerenciais do período."
      />
    );
  }
  if (company.error || query.error || !query.data) {
    return (
      <StateCard
        title="Não foi possível carregar os indicadores"
        text="Confira sua conexão e tente novamente."
        danger
      />
    );
  }

  const data = query.data;
  const summary = data.summary;
  const topProductRevenue = data.productRows[0];
  const topProductQuantity = [...data.productRows].sort((a, b) => b.quantity - a.quantity)[0];
  const directShare =
    data.channelRows.find((row) => row.name.toLowerCase().includes("diret"))?.share ?? 0;
  const roomNights = Math.max(0, summary.availableRoomNights);
  const trevpar = roomNights > 0 ? summary.revenue / roomNights : 0;
  const goppar = roomNights > 0 ? summary.gop / roomNights : 0;
  const operatingExpenseRate = ratio(summary.expenses, summary.revenue);
  const expensePerSoldRoom =
    summary.soldRoomNights > 0 ? summary.expenses / summary.soldRoomNights : 0;
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
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Painel gerencial contábil · desempenho hoteleiro
          </p>
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Competência
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
          <div
            className={`rounded-lg px-3 py-1.5 shadow-sm ${
              summary.gop < 0
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <p className="text-[8px] font-bold uppercase opacity-80">Resultado operacional · GOP</p>
            <p className="font-mono text-base font-bold tabular-nums">{fmtBRL(summary.gop)}</p>
            <p className="text-[8px] opacity-80">Margem {summary.margin.toFixed(1)}%</p>
          </div>
        </div>
      </header>

      {view === "resumo" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            <MiniKpi
              icon={<CircleDollarSign />}
              label="Receita operacional"
              value={fmtBRL(summary.revenue)}
              hint="hospedagem + receitas acessórias"
            />
            <MiniKpi
              icon={<WalletCards />}
              label="Despesas operacionais"
              value={fmtBRL(summary.expenses)}
              hint={`${operatingExpenseRate.toFixed(1)}% da receita`}
              danger={operatingExpenseRate > 75}
            />
            <MiniKpi
              icon={<BadgeDollarSign />}
              label="Resultado operacional"
              value={fmtBRL(summary.gop)}
              hint="GOP do período"
              danger={summary.gop < 0}
            />
            <MiniKpi
              icon={<TrendingUp />}
              label="Margem operacional"
              value={`${summary.margin.toFixed(1)}%`}
              hint="resultado ÷ receita"
              danger={summary.margin < 20}
            />
            <MiniKpi
              icon={<BedDouble />}
              label="Taxa de ocupação"
              value={`${summary.occupancyRate.toFixed(1)}%`}
              hint={`${summary.soldRoomNights} UH vendidas`}
            />
            <MiniKpi
              icon={<CalendarDays />}
              label="Diária média · ADR"
              value={fmtBRL(summary.adr)}
              hint="receita de quartos ÷ UH vendidas"
            />
            <MiniKpi
              icon={<CircleDollarSign />}
              label="TRevPAR"
              value={fmtBRL(trevpar)}
              hint="receita total por UH disponível"
            />
            <MiniKpi
              icon={<WalletCards />}
              label="GOPPAR"
              value={fmtBRL(goppar)}
              hint="resultado por UH disponível"
              danger={goppar < 0}
            />
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard
              className="xl:col-span-4"
              title="DRE gerencial simplificada"
              subtitle="Leitura econômica do período, em formato de demonstrativo"
            >
              <ManagerialIncomeStatement summary={summary} />
            </ChartCard>
            <ChartCard
              className="xl:col-span-8"
              title="Evolução da receita, despesas e resultado"
              subtitle="Comportamento da DRE gerencial ao longo da competência"
            >
              <FinancialChart rows={data.financialSeries} />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Composição das despesas operacionais"
              subtitle="Categorias que mais pressionam o resultado"
            >
              <HorizontalBars
                rows={data.expenseRows}
                valueLabel="Despesa operacional"
                currency
                minHeight={340}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Receita operacional por canal"
              subtitle="Origem do faturamento e exposição a comissões"
            >
              <HorizontalBars
                rows={data.channelRows}
                valueLabel="Receita operacional"
                currency
                minHeight={340}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Receita de hospedagem por tipo de quarto"
              subtitle="Categorias de UH com maior participação no faturamento"
            >
              <HorizontalBars
                rows={data.roomTypeRows}
                valueLabel="Receita de hospedagem"
                currency
                minHeight={330}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Índices de eficiência econômica"
              subtitle="Relações para acompanhar custo, receita e rentabilidade"
            >
              <AccountingRatios
                expenseRate={operatingExpenseRate}
                expensePerSoldRoom={expensePerSoldRoom}
                revenueAccessoryShare={ratio(summary.salesRevenue, summary.revenue)}
                directShare={directShare}
                revpar={summary.revpar}
                trevpar={trevpar}
                goppar={goppar}
              />
            </ChartCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <InsightCard icon={<AlertTriangle />} title="Riscos que afetam o resultado">
              <StatLine label="Cancelamentos" value={String(summary.cancellations)} />
              <StatLine label="No-show" value={String(summary.noShows)} />
              <StatLine label="Reclamações abertas" value={String(summary.openComplaints)} />
              <StatLine
                label="Avaliação interna"
                value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"}
              />
            </InsightCard>
            <InsightCard icon={<Users />} title="Clientes e recorrência">
              <StatLine label="Hóspedes no período" value={String(summary.guestCount)} />
              <StatLine label="Hóspedes recorrentes" value={String(summary.recurringGuests)} />
              <StatLine label="Taxa de retorno" value={`${summary.retentionRate.toFixed(1)}%`} />
              <StatLine
                label="Receita média por hóspede"
                value={fmtBRL(summary.averageGuestRevenue)}
              />
            </InsightCard>
            <InsightCard icon={<Globe2 />} title="Parecer gerencial do período">
              <ActionList rows={actions} />
            </InsightCard>
          </section>

          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
            A DRE apresentada é gerencial e usa os lançamentos disponíveis no sistema. Ela apoia a
            tomada de decisão, mas não substitui escrituração contábil, conciliação bancária,
            apuração tributária ou demonstrações elaboradas pelo contador.
          </p>
        </>
      )}

      {view === "receitas" && (
        <>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MiniKpi
              icon={<BedDouble />}
              label="Receita de hospedagem"
              value={fmtBRL(summary.lodgingRevenue)}
              hint={`${percentage(summary.lodgingRevenue, summary.revenue)} da receita`}
            />
            <MiniKpi
              icon={<ShoppingBasket />}
              label="Receitas acessórias"
              value={fmtBRL(summary.salesRevenue)}
              hint="produtos e serviços"
            />
            <MiniKpi
              icon={<CircleDollarSign />}
              label="Ticket médio de consumo"
              value={fmtBRL(summary.productTicket)}
              hint="por lançamento ou reserva"
            />
            <MiniKpi
              icon={<PackageSearch />}
              label="Maior faturamento"
              value={topProductRevenue?.name ?? "—"}
              hint={topProductRevenue ? fmtBRL(topProductRevenue.revenue) : "sem vendas"}
            />
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard
              className="xl:col-span-4"
              title="Composição da receita operacional"
              subtitle="Participação da hospedagem e das receitas acessórias"
            >
              <HorizontalBars
                rows={data.revenueMixRows}
                valueLabel="Receita operacional"
                currency
                minHeight={300}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-8"
              title="Faturamento por produto e serviço"
              subtitle="Itens com maior contribuição para a receita acessória"
            >
              <HorizontalBars
                rows={data.productRows.map((row) => ({ name: row.name, value: row.revenue }))}
                valueLabel="Faturamento"
                currency
                minHeight={340}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Volume vendido por item"
              subtitle="Quantidade para orientar compras e reposição"
            >
              <HorizontalBars
                rows={data.productRows.map((row) => ({ name: row.name, value: row.quantity }))}
                valueLabel="Unidades"
                minHeight={340}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Receita por categoria"
              subtitle="Categorias para ampliar, revisar ou reduzir no mix"
            >
              <HorizontalBars
                rows={data.productCategoryRows}
                valueLabel="Receita"
                currency
                minHeight={340}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Recebimentos por forma de pagamento"
              subtitle="Distribuição financeira dos valores registrados"
            >
              <HorizontalBars rows={data.paymentRows} valueLabel="Recebimento" currency />
            </ChartCard>
            <ChartCard
              className="xl:col-span-6"
              title="Análise gerencial de estoque e mix"
              subtitle="Leitura para compras, faturamento e controle de margem"
            >
              <DecisionGrid
                rows={[
                  {
                    question: "O que repor primeiro?",
                    answer: topProductQuantity
                      ? `${topProductQuantity.name}: ${topProductQuantity.quantity.toFixed(0)} unidades vendidas.`
                      : "Ainda não há vendas suficientes.",
                  },
                  {
                    question: "Qual item mais fatura?",
                    answer: topProductRevenue
                      ? `${topProductRevenue.name} lidera com ${fmtBRL(topProductRevenue.revenue)}.`
                      : "Cadastre produtos e vendas para comparar.",
                  },
                  {
                    question: "Quanto as receitas acessórias representam?",
                    answer:
                      summary.salesRevenue > 0
                        ? `${percentage(summary.salesRevenue, summary.revenue)} da receita operacional total.`
                        : "Ainda não há receita acessória no período.",
                  },
                  {
                    question: "Qual dado contábil ainda falta?",
                    answer:
                      "Registrar custo de aquisição e consumo por item permitirá calcular margem de contribuição, giro e perda de estoque.",
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
            <MiniKpi
              icon={<Users />}
              label="Clientes atendidos"
              value={String(summary.guestCount)}
              hint={`${summary.newGuests} novos`}
            />
            <MiniKpi
              icon={<UserRoundCheck />}
              label="Clientes recorrentes"
              value={String(summary.recurringGuests)}
              hint={`${summary.retentionRate.toFixed(1)}% retornam`}
            />
            <MiniKpi
              icon={<CircleDollarSign />}
              label="Receita por cliente"
              value={fmtBRL(summary.averageGuestRevenue)}
              hint="hospedagem + consumo"
            />
            <MiniKpi
              icon={<CalendarDays />}
              label="Permanência média"
              value={`${summary.averageStay.toFixed(1)} noites`}
              hint="média do período"
            />
            <MiniKpi
              icon={<Megaphone />}
              label="Venda direta"
              value={`${directShare.toFixed(1)}%`}
              hint="menor exposição a comissão"
            />
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard
              className="xl:col-span-8"
              title="Origem geográfica da receita"
              subtitle="Estados com maior quantidade de clientes e faturamento"
            >
              <BrazilStateMap rows={data.stateRows} />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Praças de mercado líderes"
              subtitle="Cidades e origens para segmentar campanhas"
            >
              <HorizontalBars
                rows={data.originRows.map((row) => ({
                  name: row.name,
                  value: row.revenue ?? row.value,
                }))}
                valueLabel="Receita"
                currency
                minHeight={360}
              />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Faixa etária dos clientes"
              subtitle="Perfil para produto, comunicação e política tarifária"
            >
              <HorizontalBars rows={data.ageRows} valueLabel="Clientes" />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Motivo da estadia"
              subtitle="Demanda de lazer, negócios e outras finalidades"
            >
              <HorizontalBars rows={data.reasonRows} valueLabel="Reservas" />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Receita de novos e recorrentes"
              subtitle="Participação financeira dos dois grupos"
            >
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
            <InsightCard icon={<Megaphone />} title="Análise comercial e de preço">
              <DecisionGrid
                rows={[
                  { question: "Há espaço para reajustar a diária?", answer: priceDecision(summary) },
                  {
                    question: "Em qual mercado anunciar?",
                    answer: data.stateRows[0]
                      ? `Priorize ${data.stateRows[0].code}, que lidera a receita de hóspedes no período.`
                      : "Preencha estado e cidade dos hóspedes para orientar campanhas por região.",
                  },
                  {
                    question: "Quem deve receber campanha de retorno?",
                    answer:
                      summary.recurringGuests > 0
                        ? `${summary.recurringGuests} clientes já demonstraram recorrência; crie ofertas de retorno e indicação.`
                        : "Ainda não há recorrência suficiente; capture contato e motivo da viagem em cada reserva.",
                  },
                  {
                    question: "Qual canal reduz despesas comerciais?",
                    answer:
                      directShare < 35
                        ? `A venda direta está em ${directShare.toFixed(1)}%. WhatsApp, site e remarketing podem reduzir comissões.`
                        : `A venda direta já representa ${directShare.toFixed(1)}%; preserve o relacionamento e acompanhe a recompra.`,
                  },
                ]}
              />
            </InsightCard>
            <InsightCard icon={<MapPinned />} title="Dados para análise contábil e comercial">
              <ActionList
                rows={[
                  data.stateRows.length
                    ? "Origem por estado já está disponível para segmentação."
                    : "Preencher estado e cidade no cadastro do hóspede.",
                  data.ageRows.length
                    ? "Faixa etária já pode orientar comunicação e serviços."
                    : "Preencher data de nascimento para analisar faixa etária.",
                  data.reasonRows.some((row) => row.name !== "Não informado")
                    ? "Motivo da viagem já separa lazer e negócios."
                    : "Preencher motivo da viagem em todas as reservas.",
                  "Registrar comissão e investimento por canal para calcular custo de aquisição e retorno sobre marketing.",
                  "Integrar Booking, Google e campanhas para relacionar aquisição, reputação e receita.",
                ]}
              />
            </InsightCard>
          </section>
        </>
      )}
    </div>
  );
}

function ManagerialIncomeStatement({ summary }: { summary: StrategicSummary }) {
  const expenseRate = ratio(summary.expenses, summary.revenue);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/20 font-mono text-xs">
      <div className="border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Demonstração do resultado gerencial
      </div>
      <DreLine label="Receita operacional bruta" value={summary.revenue} strong />
      <DreLine label="Receita de hospedagem" value={summary.lodgingRevenue} indent />
      <DreLine label="Receitas acessórias" value={summary.salesRevenue} indent />
      <DreLine label="(-) Despesas operacionais" value={-summary.expenses} negative />
      <DreLine
        label="(=) Resultado operacional · GOP"
        value={summary.gop}
        strong
        result
        negative={summary.gop < 0}
      />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-3 py-2">
        <span className="text-muted-foreground">Margem operacional</span>
        <strong className={summary.margin < 0 ? "text-destructive" : "text-primary"}>
          {summary.margin.toFixed(1)}%
        </strong>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span>Despesas sobre receita</span>
        <span>{expenseRate.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function DreLine({
  label,
  value,
  strong = false,
  indent = false,
  negative = false,
  result = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  indent?: boolean;
  negative?: boolean;
  result?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2 ${
        result ? "bg-primary/10" : "bg-card"
      }`}
    >
      <span
        className={`${indent ? "pl-3 text-muted-foreground" : "text-foreground"} ${
          strong ? "font-bold" : ""
        }`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "font-bold" : ""} ${
          negative ? "text-destructive" : result ? "text-primary" : "text-foreground"
        }`}
      >
        {fmtBRL(value)}
      </span>
    </div>
  );
}

function AccountingRatios({
  expenseRate,
  expensePerSoldRoom,
  revenueAccessoryShare,
  directShare,
  revpar,
  trevpar,
  goppar,
}: {
  expenseRate: number;
  expensePerSoldRoom: number;
  revenueAccessoryShare: number;
  directShare: number;
  revpar: number;
  trevpar: number;
  goppar: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <RatioBox label="Despesas / receita" value={`${expenseRate.toFixed(1)}%`} />
      <RatioBox label="Despesa por UH vendida" value={fmtBRL(expensePerSoldRoom)} />
      <RatioBox label="RevPAR" value={fmtBRL(revpar)} />
      <RatioBox label="TRevPAR" value={fmtBRL(trevpar)} />
      <RatioBox label="GOPPAR" value={fmtBRL(goppar)} danger={goppar < 0} />
      <RatioBox label="Receita acessória" value={`${revenueAccessoryShare.toFixed(1)}%`} />
      <RatioBox label="Venda direta" value={`${directShare.toFixed(1)}%`} />
      <RatioBox
        label="Leitura"
        value={expenseRate > 75 ? "Custos pressionando margem" : "Estrutura sob controle"}
        compact
        danger={expenseRate > 75}
      />
    </div>
  );
}

function RatioBox({
  label,
  value,
  compact = false,
  danger = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-mono font-bold tabular-nums ${compact ? "text-xs" : "text-base"} ${
          danger ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
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
        <Bar
          dataKey="receita"
          name="Receita operacional"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="despesas"
          name="Despesas operacionais"
          fill="var(--chart-4)"
          radius={[4, 4, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="gop"
          name="Resultado operacional · GOP"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function BrazilStateMap({ rows }: { rows: StateRow[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        text="Cadastre estado e cidade dos hóspedes para preencher o mapa e orientar campanhas regionais."
        height={380}
      />
    );
  }
  const map = Brazil as {
    viewBox: string;
    locations: { id: string; name: string; path: string }[];
  };
  const rowByState = new Map(rows.map((row) => [row.code.toLowerCase(), row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <div className="grid min-h-[380px] overflow-hidden rounded-lg border border-border/70 bg-[radial-gradient(circle_at_38%_45%,color-mix(in_srgb,var(--primary)_12%,var(--card)),var(--card)_70%)] md:grid-cols-[minmax(0,1fr)_190px]">
      <svg
        viewBox={map.viewBox}
        className="min-h-[360px] w-full p-4"
        role="img"
        aria-label="Mapa do Brasil com receita por estado"
      >
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
              <title>
                {row
                  ? `${row.code}: ${row.value} hóspede(s) · ${fmtBRL(row.revenue)}`
                  : `${location.name}: sem dados`}
              </title>
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
                <span className="font-bold text-foreground">
                  {index + 1}. {row.code}
                </span>
                <span className="text-muted-foreground">{row.value} hóspedes</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-right text-[9px] font-semibold text-primary">
                {fmtBRL(row.revenue)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  hint,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <article className="min-h-[88px] min-w-0 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <div className={`h-4 w-4 ${danger ? "text-destructive" : "text-primary"}`}>{icon}</div>
      <p className="mt-1 truncate text-[9px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={`truncate font-mono text-base font-bold tabular-nums ${
          danger ? "text-destructive" : "text-foreground"
        }`}
        title={value}
      >
        {value}
      </p>
      <p className="truncate text-[9px] text-muted-foreground" title={hint}>
        {hint}
      </p>
    </article>
  );
}

function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}
    >
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mb-2 text-[11px] text-muted-foreground">{subtitle}</p>
      {children}
    </article>
  );
}

function InsightCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-primary">
        {icon}
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </article>
  );
}

function StatLine({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 text-xs last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          muted
            ? "text-right text-muted-foreground"
            : "text-right font-mono font-semibold tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function HorizontalBars({
  rows,
  valueLabel,
  currency = false,
  minHeight = 300,
}: {
  rows: NumericRow[];
  valueLabel: string;
  currency?: boolean;
  minHeight?: number;
}) {
  const visible = rows.filter((row) => row.value > 0).slice(0, 10);
  if (!visible.length) return <EmptyState text="Sem dados suficientes no período." height={minHeight} />;
  const height = Math.max(minHeight, Math.min(440, visible.length * 42));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={visible} layout="vertical" margin={{ left: 20, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 9 }}
          tickFormatter={currency ? compactCurrency : compactNumber}
        />
        <YAxis dataKey="name" type="category" width={118} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(value: number) =>
            currency ? fmtBRL(value) : Number(value).toLocaleString("pt-BR")
          }
        />
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
  return (
    <div
      className="grid place-items-center rounded-lg border border-dashed border-border px-5 text-center text-xs text-muted-foreground"
      style={{ minHeight: height }}
    >
      {text}
    </div>
  );
}

function StateCard({
  title,
  text,
  danger = false,
}: {
  title: string;
  text: string;
  danger?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h1 className={danger ? "font-bold text-destructive" : "font-bold text-foreground"}>{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </section>
  );
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function percentage(value: number, total: number) {
  return `${ratio(value, total).toFixed(1)}%`;
}

function ratio(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function priceDecision(summary: StrategicSummary) {
  if (summary.occupancyRate >= 80 && summary.retentionRate >= 25) {
    return `Ocupação de ${summary.occupancyRate.toFixed(1)}% e retorno de ${summary.retentionRate.toFixed(1)}% indicam espaço para testar aumento gradual da ADR.`;
  }
  if (summary.occupancyRate >= 70) {
    return `A ocupação está em ${summary.occupancyRate.toFixed(1)}%. Teste reajustes nas datas de maior demanda e acompanhe RevPAR, TRevPAR e GOPPAR.`;
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
  if (input.occupancy < 45) {
    rows.push("Ocupação baixa: reforçar venda direta e campanhas nas datas com maior disponibilidade.");
  }
  if (input.cancelled > 0 || input.noShows > 0) {
    rows.push("Revisar confirmação, política de cancelamento e garantias para reduzir perda de receita.");
  }
  if (input.margin < 25) {
    rows.push("Margem pressionada: revisar despesas operacionais, desperdícios e comissões por canal.");
  }
  if (input.directShare < 35) {
    rows.push("Elevar reservas diretas para reduzir despesas comerciais e dependência de intermediários.");
  }
  if (input.retention < 20) {
    rows.push("Retenção baixa: criar campanha de retorno, indicação e relacionamento pós-checkout.");
  }
  if (input.productRevenue <= 0) {
    rows.push("Cadastrar produtos e serviços para ampliar receitas acessórias e o TRevPAR.");
  }
  if (input.complaintsOpen > 0) {
    rows.push("Priorizar reclamações abertas para proteger reputação, recorrência e faturamento futuro.");
  }
  if (!rows.length) {
    rows.push("Indicadores estáveis: acompanhar margem, GOPPAR, ocupação futura e fluxo de recebimentos.");
  }
  return rows.slice(0, 5);
}
