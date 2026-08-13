import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { CalendarDays, Filter, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Daily = {
  data: string;
  quartos_ocupados: number;
  quartos_total: number;
  ocupacao_pct: number;
  receita_hospedagem: number;
  receita_extras: number;
  receita_total: number;
  despesas: number;
  gop: number;
  adr: number;
  revpar: number;
  cancelamentos: number;
  no_shows: number;
};

type RevenueSource = { data: string; origem_receita: string; receita: number };
type Reservation = {
  reserva_id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  quarto: number | null;
  checkin: string;
  checkout: string;
  data_reserva: string;
  diarias: number;
  hospedes: number;
  adultos: number;
  criancas: number;
  possui_filhos: boolean;
  quantidade_filhos: number;
  perfil_familiar: string;
  idade: number | null;
  faixa_idade: string;
  motivo_estadia: string;
  canal_analitico: string;
  elegivel_cancelamento_pre_checkin: boolean;
  status: string;
  cancelado_flag: number;
  valor_diaria_real: number;
  tarifa_base_quarto: number;
  faixa_preco_base: string;
  valor_total: number;
  valor_pago: number;
  corporativo: boolean;
};

type Sale = {
  data: string;
  total: number;
  comprador_tipo: string | null;
  status: string | null;
};

type Expense = { data: string; categoria: string | null; descricao: string | null; valor: number };
type Room = {
  quarto: number;
  configuracao: string | null;
  preco: number;
  banheiro: boolean | null;
  hospedagens: number;
  diarias: number;
  receita_operacional_recente: number;
  adr_atual: number | null;
  avaliacoes: number;
  nota_media_10: number | null;
  nivel_uso: string;
};
type Forecast = { date: string; expected_occupancy: number; confirmed_rooms: number };

type SourceBundle = {
  daily: Daily[];
  revenueSources: RevenueSource[];
  reservations: Reservation[];
  sales: Sale[];
  expenses: Expense[];
  rooms: Room[];
  forecast: Forecast[];
};

type DeltaTone = "green" | "red" | "blue";

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const brDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const monthLabel = (iso: string) => new Date(`${iso}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/");
const num = (v: unknown) => Number(v || 0);
const pct = (v: number) => `${Number.isFinite(v) ? v.toFixed(1).replace(".", ",") : "0,0"}%`;
const daysBetween = (a: string, b: string) => Math.max(1, Math.floor((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000) + 1);
const inRange = (iso: string, start: string, end: string) => iso >= start && iso <= end;

export function UnifiedHotelExecutiveDashboard() {
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const today = todayISO();
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [channel, setChannel] = useState("Todos");

  const source = useQuery({
    queryKey: ["decision-dashboard-v2", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<SourceBundle> => {
      const [daily, revenueSources, reservations, sales, expenses, rooms, forecast] = await Promise.all([
        (supabase as any).from("bi_dashboard_diario")
          .select("data,quartos_ocupados,quartos_total,ocupacao_pct,receita_hospedagem,receita_extras,receita_total,despesas,gop,adr,revpar,cancelamentos,no_shows")
          .eq("company_id", companyId).lte("data", today).order("data"),
        (supabase as any).from("bi_receita_origem_diaria")
          .select("data,origem_receita,receita").eq("company_id", companyId).lte("data", today).order("data"),
        (supabase as any).from("bi_reservas_decisao").select("*").eq("company_id", companyId).limit(5000),
        (supabase as any).from("sales").select("data,total,comprador_tipo,status").eq("company_id", companyId).limit(5000),
        (supabase as any).from("expenses").select("data,categoria,descricao,valor").eq("company_id", companyId).limit(5000),
        (supabase as any).from("bi_quarto_decisao").select("*").eq("company_id", companyId).order("hospedagens", { ascending: false }),
        supabase.functions.invoke("hotel-random-forest", { body: { company_id: companyId } }),
      ]);
      for (const r of [daily, revenueSources, reservations, sales, expenses, rooms]) if (r.error) throw r.error;
      return {
        daily: (daily.data ?? []) as Daily[],
        revenueSources: (revenueSources.data ?? []) as RevenueSource[],
        reservations: (reservations.data ?? []) as Reservation[],
        sales: (sales.data ?? []) as Sale[],
        expenses: (expenses.data ?? []) as Expense[],
        rooms: (rooms.data ?? []) as Room[],
        forecast: (((forecast.data as any)?.occupancy?.forecast ?? []) as Forecast[]),
      };
    },
  });

  const model = useMemo(() => {
    const data = source.data;
    if (!data) return null;
    const selectedDays = daysBetween(start, end);
    const prevEndDate = new Date(`${start}T12:00:00`);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevEnd = prevEndDate.toISOString().slice(0, 10);
    const prevStartDate = new Date(`${prevEnd}T12:00:00`);
    prevStartDate.setDate(prevStartDate.getDate() - selectedDays + 1);
    const prevStart = prevStartDate.toISOString().slice(0, 10);

    const filteredReservations = data.reservations.filter((r) => inRange(r.checkin, start, end) && (channel === "Todos" || r.canal_analitico === channel));
    const previousReservations = data.reservations.filter((r) => inRange(r.checkin, prevStart, prevEnd) && (channel === "Todos" || r.canal_analitico === channel));
    const selectedDaily = data.daily.filter((r) => inRange(r.data, start, end));
    const previousDaily = data.daily.filter((r) => inRange(r.data, prevStart, prevEnd));
    const selectedSources = data.revenueSources.filter((r) => inRange(r.data, start, end));
    const selectedSales = data.sales.filter((r) => inRange(r.data, start, end) && (r.status ?? "") !== "cancelado");
    const selectedExpenses = data.expenses.filter((r) => inRange(r.data, start, end));

    const valid = filteredReservations.filter((r) => r.status !== "cancelado");
    const prevValid = previousReservations.filter((r) => r.status !== "cancelado");
    const roomCount = Math.max(1, data.rooms.length);
    const availableRoomNights = Math.max(1, roomCount * selectedDays);
    const previousAvailableRoomNights = Math.max(1, roomCount * selectedDays);

    const hospitalityRevenue = selectedDaily.reduce((s, r) => s + num(r.receita_hospedagem), 0);
    const extrasRevenue = selectedSales.reduce((s, r) => s + num(r.total), 0);
    const totalRevenue = hospitalityRevenue + extrasRevenue;
    const recordedExpenses = selectedExpenses.reduce((s, r) => s + num(r.valor), 0);
    const occupiedRoomNights = selectedDaily.reduce((s, r) => s + num(r.quartos_ocupados), 0);
    const occupancy = availableRoomNights ? occupiedRoomNights / availableRoomNights * 100 : 0;
    const adr = occupiedRoomNights ? hospitalityRevenue / occupiedRoomNights : 0;
    const revpar = hospitalityRevenue / availableRoomNights;
    const trevpar = totalRevenue / availableRoomNights;
    const actualGop = totalRevenue - recordedExpenses;
    const goppar = actualGop / availableRoomNights;

    const prevHospitality = previousDaily.reduce((s, r) => s + num(r.receita_hospedagem), 0);
    const prevExtras = data.sales.filter((r) => inRange(r.data, prevStart, prevEnd) && (r.status ?? "") !== "cancelado").reduce((s, r) => s + num(r.total), 0);
    const prevRevenue = prevHospitality + prevExtras;
    const prevOccupied = previousDaily.reduce((s, r) => s + num(r.quartos_ocupados), 0);
    const prevOccupancy = previousAvailableRoomNights ? prevOccupied / previousAvailableRoomNights * 100 : 0;
    const prevAdr = prevOccupied ? prevHospitality / prevOccupied : 0;
    const prevRevpar = prevHospitality / previousAvailableRoomNights;
    const prevTrevpar = prevRevenue / previousAvailableRoomNights;

    const delta = (cur: number, prev: number) => prev ? (cur - prev) / Math.abs(prev) * 100 : 0;

    const sourceMap = new Map<string, number>();
    for (const r of selectedSources) sourceMap.set(r.origem_receita, (sourceMap.get(r.origem_receita) ?? 0) + num(r.receita));
    const revenueBySource = [...sourceMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const dailyMap = new Map<string, { data: string; hospedagem: number; produtos: number; despesas: number }>();
    for (const d of selectedDaily) dailyMap.set(d.data, { data: d.data, hospedagem: num(d.receita_hospedagem), produtos: 0, despesas: num(d.despesas) });
    for (const s of selectedSales) {
      const row = dailyMap.get(s.data) ?? { data: s.data, hospedagem: 0, produtos: 0, despesas: 0 };
      row.produtos += num(s.total); dailyMap.set(s.data, row);
    }
    const revenueEvolution = aggregateTimeline([...dailyMap.values()], start, end, (r) => ({ hospedagem: r.hospedagem, produtos: r.produtos, despesas: r.despesas }));

    const actualOccupancy = aggregateOccupancy(selectedDaily, start, end);
    const forecastRows = data.forecast
      .filter((f) => f.date > today && f.date <= end)
      .map((f) => ({ iso: f.date, label: brDate(f.date), real: null as number | null, previsto: num(f.expected_occupancy), confirmados: num(f.confirmed_rooms) }));
    const occupancyTimeline = [
      ...actualOccupancy.map((r) => ({ iso: r.iso, label: r.label, real: r.value, previsto: null as number | null, confirmados: null as number | null })),
      ...forecastRows,
    ].sort((a, b) => a.iso.localeCompare(b.iso));

    const channelMap = new Map<string, { reservas: number; receita: number; canc: number; eligible: number }>();
    for (const r of filteredReservations) {
      const x = channelMap.get(r.canal_analitico) ?? { reservas: 0, receita: 0, canc: 0, eligible: 0 };
      x.reservas += 1;
      if (r.status !== "cancelado") x.receita += num(r.valor_total);
      if (r.elegivel_cancelamento_pre_checkin) { x.eligible += 1; x.canc += num(r.cancelado_flag); }
      channelMap.set(r.canal_analitico, x);
    }
    const channelPerformance = [...channelMap].map(([canal, x]) => ({
      canal,
      receita: x.receita,
      reservas: x.reservas,
      cancelamento: x.eligible ? x.canc / x.eligible * 100 : null,
    })).sort((a, b) => b.receita - a.receita);

    const profileMap = new Map<string, number>();
    const ageMap = new Map<string, number>();
    const childMap = new Map<string, number>();
    for (const r of valid) {
      profileMap.set(r.perfil_familiar, (profileMap.get(r.perfil_familiar) ?? 0) + 1);
      ageMap.set(r.faixa_idade, (ageMap.get(r.faixa_idade) ?? 0) + 1);
      const k = r.quantidade_filhos <= 0 ? "Sem filhos informados" : r.quantidade_filhos === 1 ? "1 filho" : "2+ filhos";
      childMap.set(k, (childMap.get(k) ?? 0) + 1);
    }
    const profiles = [...profileMap].map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
    const ages = [...ageMap].map(([name, value]) => ({ name, value })).sort((a,b)=>ageOrder(a.name)-ageOrder(b.name));
    const children = [...childMap].map(([name, value]) => ({ name, value }));

    const productSegments = ["hospede", "funcionario", "empresa", "outro"].map((kind) => {
      const values = selectedSales.filter((s) => normalizeBuyer(s.comprador_tipo) === kind).map((s) => num(s.total)).filter((v) => v > 0).sort((a,b)=>a-b);
      return {
        name: buyerLabel(kind),
        compras: values.length,
        total: values.reduce((a,b)=>a+b,0),
        mediana: median(values),
        mediaAparada: trimmedMean(values, .1),
      };
    }).filter((r) => r.compras > 0);

    const topRooms = [...data.rooms].sort((a,b) => num(b.hospedagens)-num(a.hospedagens)).slice(0,10);
    const lowRooms = [...data.rooms].sort((a,b) => num(a.hospedagens)-num(b.hospedagens)).slice(0,10);

    const nonPayrollRecorded = selectedExpenses.filter((e) => !/(sal[aá]rio|pessoal|folguista|padaria|caf[eé]|alimento)/i.test(`${e.categoria ?? ""} ${e.descricao ?? ""}`)).reduce((s,e)=>s+num(e.valor),0);
    const monthsEquivalent = selectedDays / 30.44;
    const rentEstimated = totalRevenue * .20;
    const salaryEstimated = (4 * 17000 + 1900) * monthsEquivalent;
    const reliefEstimated = 500 * selectedDays / 7;
    const bakeryEstimated = 2050 * monthsEquivalent;
    const projectedExpenses = nonPayrollRecorded + rentEstimated + salaryEstimated + reliefEstimated + bakeryEstimated;
    const projectedGop = totalRevenue - projectedExpenses;

    const eligible = filteredReservations.filter((r) => r.elegivel_cancelamento_pre_checkin);
    const cancellations = eligible.reduce((s,r)=>s+num(r.cancelado_flag),0);
    const cancellationRate = eligible.length ? cancellations / eligible.length * 100 : 0;

    return {
      kpis: {
        totalRevenue, occupancy, adr, revpar, trevpar, goppar,
        deltas: {
          revenue: delta(totalRevenue, prevRevenue), occupancy: occupancy - prevOccupancy,
          adr: delta(adr, prevAdr), revpar: delta(revpar, prevRevpar), trevpar: delta(trevpar, prevTrevpar),
        },
      },
      hospitalityRevenue, extrasRevenue, recordedExpenses, actualGop, projectedExpenses, projectedGop,
      revenueBySource, revenueEvolution, occupancyTimeline, channelPerformance,
      profiles, ages, children, productSegments, topRooms, lowRooms,
      cancellationRate, cancellationEligible: eligible.length,
      ageCoverage: valid.length ? valid.filter(r=>r.idade != null).length/valid.length*100 : 0,
      selectedDays,
      validReservations: valid.length,
      prevValidReservations: prevValid.length,
    };
  }, [source.data, start, end, channel, today]);

  if (source.isLoading || company.isLoading) return <State text="Carregando painel..." />;
  if (source.error || !model) return <State text="Não foi possível carregar o painel." />;

  const channels = ["Todos", "Booking", "WhatsApp", "Direto / Recepção"];

  return (
    <main className="space-y-3 px-2 pb-8 sm:px-3" data-unified-executive-dashboard>
      <header className="relative flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <h1 className="text-xl font-black text-pine-dark">Pulso do Hotel</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-background px-3 py-2 text-[11px] font-bold text-muted-foreground">{brDate(start)} — {brDate(end)}</span>
          <button type="button" onClick={() => setFiltersOpen(v=>!v)} className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-extrabold text-foreground shadow-sm hover:bg-muted">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </button>
        </div>
        {filtersOpen && (
          <div className="absolute right-3 top-14 z-30 w-[min(92vw,340px)] rounded-2xl border border-border bg-card p-3 shadow-2xl">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">De<input className="field mt-1 h-9 text-xs" type="date" value={start} onChange={(e)=>setStart(e.target.value)} /></label>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Até<input className="field mt-1 h-9 text-xs" type="date" value={end} onChange={(e)=>setEnd(e.target.value)} /></label>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Mês<input className="field mt-1 h-9 text-xs" type="month" value={start.slice(0,7)} onChange={(e)=>{ const v=e.target.value; if(!v)return; setStart(`${v}-01`); const last=new Date(Number(v.slice(0,4)),Number(v.slice(5,7)),0).toISOString().slice(0,10); setEnd(last>today?today:last); }} /></label>
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Ano<select className="field mt-1 h-9 text-xs" value={start.slice(0,4)} onChange={(e)=>{ const y=e.target.value; setStart(`${y}-01-01`); setEnd(y===today.slice(0,4)?today:`${y}-12-31`); }}><option>2024</option><option>2025</option><option>2026</option></select></label>
              <label className="col-span-2 text-[10px] font-bold uppercase text-muted-foreground">Canal<select className="field mt-1 h-9 text-xs" value={channel} onChange={(e)=>setChannel(e.target.value)}>{channels.map(c=><option key={c}>{c}</option>)}</select></label>
            </div>
          </div>
        )}
      </header>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi title="Receita" value={fmtBRL(model.kpis.totalRevenue)} delta={model.kpis.deltas.revenue} />
        <Kpi title="Ocupação" value={pct(model.kpis.occupancy)} delta={model.kpis.deltas.occupancy} points />
        <Kpi title="ADR" value={fmtBRL(model.kpis.adr)} delta={model.kpis.deltas.adr} />
        <Kpi title="RevPAR" value={fmtBRL(model.kpis.revpar)} delta={model.kpis.deltas.revpar} />
        <Kpi title="TRevPAR" value={fmtBRL(model.kpis.trevpar)} delta={model.kpis.deltas.trevpar} />
        <Kpi title="GOPPAR registrado" value={fmtBRL(model.kpis.goppar)} />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Receita por dia e mês">
          <ResponsiveContainer width="100%" height={280}><ComposedChart data={model.revenueEvolution}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v:any)=>fmtBRL(num(v))}/><Legend/><Bar dataKey="hospedagem" name="Hospedagem" stackId="r"/><Bar dataKey="produtos" name="Produtos" stackId="r"/><Line type="monotone" dataKey="total" name="Receita total" strokeWidth={2}/></ComposedChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="De onde vem a receita">
          <ResponsiveContainer width="100%" height={280}><BarChart data={model.revenueBySource} layout="vertical" margin={{left:24,right:20}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{fontSize:10}}/><YAxis type="category" dataKey="name" width={132} tick={{fontSize:10}}/><Tooltip formatter={(v:any)=>fmtBRL(num(v))}/><Bar dataKey="value" name="Receita"/></BarChart></ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Ocupação real e previsão">
          <ResponsiveContainer width="100%" height={280}><LineChart data={model.occupancyTimeline}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis domain={[0,100]} unit="%" tick={{fontSize:10}}/><Tooltip/><Legend/><Line type="monotone" dataKey="real" name="Real" strokeWidth={2} connectNulls={false}/><Line type="monotone" dataKey="previsto" name="Previsto" strokeWidth={2} strokeDasharray="5 4" connectNulls={false}/></LineChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Receita e cancelamento por canal">
          <ResponsiveContainer width="100%" height={280}><ComposedChart data={model.channelPerformance}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="canal" tick={{fontSize:10}}/><YAxis yAxisId="money" tick={{fontSize:10}}/><YAxis yAxisId="pct" orientation="right" domain={[0,100]} unit="%" tick={{fontSize:10}}/><Tooltip formatter={(v:any,n:any)=>n==="Cancelamento"?pct(num(v)):fmtBRL(num(v))}/><Legend/><Bar yAxisId="money" dataKey="receita" name="Receita"/><Line yAxisId="pct" type="monotone" dataKey="cancelamento" name="Cancelamento" strokeWidth={2}/></ComposedChart></ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <ChartCard title="Perfil dos hóspedes"><SimpleBar rows={model.profiles}/></ChartCard>
        <ChartCard title="Faixa etária"><SimpleBar rows={model.ages}/><div className="mt-1 text-right text-[10px] text-muted-foreground">Cobertura de idade: {pct(model.ageCoverage)}</div></ChartCard>
        <ChartCard title="Filhos"><SimpleBar rows={model.children}/></ChartCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Gasto com produtos por comprador">
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Comprador</th><th>Compras</th><th>Total</th><th>Mediana</th><th>Média aparada</th></tr></thead><tbody>{model.productSegments.map(r=><tr key={r.name} className="border-b last:border-0"><td className="py-2 font-bold">{r.name}</td><td>{r.compras}</td><td>{fmtBRL(r.total)}</td><td>{fmtBRL(r.mediana)}</td><td>{fmtBRL(r.mediaAparada)}</td></tr>)}</tbody></table></div>
        </ChartCard>
        <ChartCard title="Resultado operacional">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Mini title="Receita" value={fmtBRL(model.kpis.totalRevenue)}/><Mini title="Despesas registradas" value={fmtBRL(model.recordedExpenses)}/><Mini title="GOP registrado" value={fmtBRL(model.actualGop)}/><Mini title="Custos estimados" value={fmtBRL(model.projectedExpenses)}/><Mini title="GOP estimado" value={fmtBRL(model.projectedGop)}/><Mini title="Cancelamento antecipado" value={`${pct(model.cancellationRate)} · ${model.cancellationEligible} reservas`}/>
          </div>
          <details className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"><summary className="cursor-pointer font-bold text-foreground">Premissas provisórias</summary><p className="mt-2">Aluguel: 20% da receita. Salários: 4 × R$ 17.000 + 1 × R$ 1.900/mês. Folguistas: R$ 500/semana. Padaria: R$ 2.050/mês. As despesas reais continuam separadas para não mascarar o resultado.</p></details>
        </ChartCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <RoomTable title="Quartos com mais hospedagens" rooms={model.topRooms}/>
        <RoomTable title="Quartos com pouco ou nenhum uso" rooms={model.lowRooms}/>
      </section>
    </main>
  );
}

function Kpi({ title, value, delta, points=false }: { title:string; value:string; delta?:number; points?:boolean }) {
  const tone: DeltaTone = delta == null || Math.abs(delta) < .05 ? "blue" : delta > 0 ? "green" : "red";
  const cls = tone === "green" ? "text-emerald-700 bg-emerald-50" : tone === "red" ? "text-red-700 bg-red-50" : "text-blue-700 bg-blue-50";
  return <div className="rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-1 text-lg font-black text-foreground">{value}</div>{delta != null && <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${cls}`}>{delta>0?<TrendingUp className="h-3 w-3"/>:delta<0?<TrendingDown className="h-3 w-3"/>:null}{delta>0?"+":""}{delta.toFixed(1).replace(".",",")}{points?" p.p.":"%"}</div>}</div>;
}

function ChartCard({ title, children }: { title:string; children:React.ReactNode }) { return <section className="rounded-2xl border border-border bg-card p-3 shadow-sm"><h2 className="mb-2 text-sm font-black text-primary">{title}</h2>{children}</section>; }
function State({ text }: { text:string }) { return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{text}</div>; }
function Mini({title,value}:{title:string;value:string}) { return <div className="rounded-xl border border-border bg-background p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">{title}</div><div className="mt-1 text-sm font-black text-foreground">{value}</div></div>; }

function SimpleBar({ rows }: { rows:{name:string;value:number}[] }) { return <ResponsiveContainer width="100%" height={230}><BarChart data={rows} layout="vertical" margin={{left:18,right:18}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:10}}/><YAxis type="category" dataKey="name" width={128} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="value" name="Reservas"/></BarChart></ResponsiveContainer>; }

function RoomTable({ title, rooms }: { title:string; rooms:Room[] }) { return <section className="rounded-2xl border border-border bg-card p-3 shadow-sm"><h2 className="mb-2 text-sm font-black text-primary">{title}</h2><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Quarto</th><th>Hospedagens</th><th>Diárias</th><th>Receita recente</th><th>Avaliação</th></tr></thead><tbody>{rooms.map(r=><tr key={r.quarto} className="border-b last:border-0"><td className="py-2 font-black">{r.quarto}</td><td>{r.hospedagens}</td><td>{r.diarias}</td><td>{fmtBRL(num(r.receita_operacional_recente))}</td><td>{r.avaliacoes ? `${num(r.nota_media_10).toFixed(1).replace(".",",")} (${r.avaliacoes})` : "—"}</td></tr>)}</tbody></table></div></section>; }

function aggregateTimeline(rows:{data:string;hospedagem:number;produtos:number;despesas:number}[], start:string, end:string) {
  if (daysBetween(start,end) <= 62) return rows.sort((a,b)=>a.data.localeCompare(b.data)).map(r=>({label:brDate(r.data),hospedagem:r.hospedagem,produtos:r.produtos,total:r.hospedagem+r.produtos,despesas:r.despesas}));
  const m=new Map<string,{hospedagem:number;produtos:number;despesas:number}>(); for(const r of rows){const k=r.data.slice(0,7),x=m.get(k)??{hospedagem:0,produtos:0,despesas:0};x.hospedagem+=r.hospedagem;x.produtos+=r.produtos;x.despesas+=r.despesas;m.set(k,x)} return [...m].sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>({label:monthLabel(k),...x,total:x.hospedagem+x.produtos}));
}
function aggregateOccupancy(rows:Daily[],start:string,end:string){ if(daysBetween(start,end)<=62)return rows.sort((a,b)=>a.data.localeCompare(b.data)).map(r=>({iso:r.data,label:brDate(r.data),value:num(r.ocupacao_pct)})); const m=new Map<string,{sum:number,n:number}>();for(const r of rows){const k=r.data.slice(0,7),x=m.get(k)??{sum:0,n:0};x.sum+=num(r.ocupacao_pct);x.n++;m.set(k,x)}return [...m].sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>({iso:`${k}-01`,label:monthLabel(k),value:x.n?x.sum/x.n:0})); }
function median(values:number[]){if(!values.length)return 0;const n=values.length,m=Math.floor(n/2);return n%2?values[m]:(values[m-1]+values[m])/2;}
function trimmedMean(values:number[],trim:number){if(!values.length)return 0;const cut=Math.floor(values.length*trim),v=values.slice(cut,Math.max(cut+1,values.length-cut));return v.reduce((a,b)=>a+b,0)/v.length;}
function normalizeBuyer(v:string|null){const x=(v??"").toLowerCase();if(x.includes("hosp"))return "hospede";if(x.includes("func"))return "funcionario";if(x.includes("empresa"))return "empresa";return "outro";}
function buyerLabel(v:string){return v==="hospede"?"Hóspedes":v==="funcionario"?"Funcionários":v==="empresa"?"Empresas":"Outros";}
function ageOrder(v:string){return ["Até 24","25–34","35–44","45–54","55–64","65+","Não informado"].indexOf(v);}
