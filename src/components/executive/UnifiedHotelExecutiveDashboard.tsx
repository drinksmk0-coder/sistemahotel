import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, BadgeDollarSign, BedDouble, CircleDollarSign, Percent, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Daily = {
  data: string; quartos_ocupados: number; quartos_total: number; ocupacao_pct: number;
  receita_total: number; despesas: number; gop: number; adr: number; revpar: number;
  cancelamentos: number; no_shows: number;
};

type Cross = {
  canal: string; tipo_quarto: string | null; faixa_diaria: string; perfil_familiar: string;
  motivo_estadia: string; quantidade_filhos: number; status: string; reservas: number;
  receita_bruta: number; adr: number; taxa_cancelamento: number; taxa_no_show: number;
};

type Forecast = { date: string; expected_occupancy: number; lower: number; upper: number };

const pct = (n: number) => `${Number.isFinite(n) ? n.toFixed(1) : "0,0"}%`;
const labelDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function UnifiedHotelExecutiveDashboard() {
  const company = useCurrentCompany();
  const companyId = company.data?.id;

  const daily = useQuery({
    queryKey: ["unified-executive-daily", companyId], enabled: !!companyId,
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 59);
      const { data, error } = await (supabase as any).from("bi_dashboard_diario")
        .select("data,quartos_ocupados,quartos_total,ocupacao_pct,receita_total,despesas,gop,adr,revpar,cancelamentos,no_shows")
        .eq("company_id", companyId).gte("data", since.toISOString().slice(0, 10)).order("data");
      if (error) throw error;
      return (data ?? []) as Daily[];
    },
  });

  const crossings = useQuery({
    queryKey: ["unified-executive-crossings", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("bi_dashboard_cruzamentos")
        .select("canal,tipo_quarto,faixa_diaria,perfil_familiar,motivo_estadia,quantidade_filhos,status,reservas,receita_bruta,adr,taxa_cancelamento,taxa_no_show")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Cross[];
    },
  });

  const forecast = useQuery({
    queryKey: ["unified-executive-forecast", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("hotel-random-forest", { body: { company_id: companyId } });
      if (error) throw error;
      return ((data as any)?.occupancy?.forecast ?? []) as Forecast[];
    }, staleTime: 5 * 60_000,
  });

  const model = useMemo(() => {
    const rows = daily.data ?? [];
    const current = rows.slice(-30);
    const previous = rows.slice(-60, -30);
    const sum = (arr: Daily[], key: keyof Daily) => arr.reduce((s, r) => s + Number(r[key] || 0), 0);
    const avg = (arr: Daily[], key: keyof Daily) => arr.length ? sum(arr, key) / arr.length : 0;
    const availableRoomNights = current.reduce((s, r) => s + Number(r.quartos_total || 0), 0);
    const revenue = sum(current, "receita_total");
    const gop = sum(current, "gop");
    const occupied = sum(current, "quartos_ocupados");
    const adrWeighted = occupied ? current.reduce((s, r) => s + Number(r.adr || 0) * Number(r.quartos_ocupados || 0), 0) / occupied : avg(current, "adr");
    const revpar = availableRoomNights ? revenue / availableRoomNights : avg(current, "revpar");
    const cancellationRows = crossings.data ?? [];
    const totalReservations = cancellationRows.reduce((s, r) => s + Number(r.reservas || 0), 0);
    const cancelled = cancellationRows.reduce((s, r) => s + Number(r.reservas || 0) * Number(r.taxa_cancelamento || 0) / 100, 0);
    const cancellation = totalReservations ? cancelled / totalReservations * 100 : 0;

    const trend = (value: number, prev: number) => prev ? ((value - prev) / Math.abs(prev)) * 100 : 0;
    const prevRevenue = sum(previous, "receita_total");
    const prevOcc = avg(previous, "ocupacao_pct");
    const prevAdr = avg(previous, "adr");
    const prevAvail = previous.reduce((s, r) => s + Number(r.quartos_total || 0), 0);
    const prevRevpar = prevAvail ? prevRevenue / prevAvail : avg(previous, "revpar");

    const channelMap = new Map<string, { reservas: number; receita: number; cancelWeighted: number; adrWeighted: number }>();
    const familyMap = new Map<string, { reservas: number; receita: number }>();
    const reasonMap = new Map<string, { reservas: number; receita: number }>();
    const roomMap = new Map<string, { reservas: number; receita: number }>();
    for (const r of cancellationRows) {
      const n = Number(r.reservas || 0), rev = Number(r.receita_bruta || 0);
      const ch = r.canal || "Não informado";
      const c = channelMap.get(ch) ?? { reservas: 0, receita: 0, cancelWeighted: 0, adrWeighted: 0 };
      c.reservas += n; c.receita += rev; c.cancelWeighted += n * Number(r.taxa_cancelamento || 0); c.adrWeighted += n * Number(r.adr || 0); channelMap.set(ch, c);
      const fam = r.perfil_familiar || "Não informado"; const f = familyMap.get(fam) ?? { reservas: 0, receita: 0 }; f.reservas += n; f.receita += rev; familyMap.set(fam, f);
      const reason = r.motivo_estadia || "Não informado"; const m = reasonMap.get(reason) ?? { reservas: 0, receita: 0 }; m.reservas += n; m.receita += rev; reasonMap.set(reason, m);
      const room = r.tipo_quarto || "Não informado"; const rm = roomMap.get(room) ?? { reservas: 0, receita: 0 }; rm.reservas += n; rm.receita += rev; roomMap.set(room, rm);
    }
    const channels = [...channelMap].map(([canal, v]) => ({ canal, receita: v.receita, reservas: v.reservas, adr: v.reservas ? v.adrWeighted / v.reservas : 0, cancelamento: v.reservas ? v.cancelWeighted / v.reservas : 0 })).sort((a,b) => b.receita-a.receita).slice(0,8);
    const families = [...familyMap].map(([perfil, v]) => ({ perfil, ...v })).sort((a,b)=>b.reservas-a.reservas).slice(0,6);
    const reasons = [...reasonMap].map(([motivo, v]) => ({ motivo, ...v })).sort((a,b)=>b.reservas-a.reservas).slice(0,6);
    const roomTypes = [...roomMap].map(([tipo, v]) => ({ tipo, ...v })).sort((a,b)=>b.reservas-a.reservas).slice(0,6);

    const actualForecast = current.slice(-14).map(r => ({ data: labelDate(r.data), real: Number(r.ocupacao_pct || 0), previsto: null as number | null }));
    const future = (forecast.data ?? []).slice(0,14).map(r => ({ data: labelDate(r.date), real: null as number | null, previsto: Number(r.expected_occupancy || 0) }));

    return {
      current, revenue, gop, occupancy: avg(current, "ocupacao_pct"), adr: adrWeighted, revpar,
      goppar: availableRoomNights ? gop / availableRoomNights : 0, cancellation,
      trends: { revenue: trend(revenue, prevRevenue), occupancy: trend(avg(current,"ocupacao_pct"), prevOcc), adr: trend(adrWeighted, prevAdr), revpar: trend(revpar, prevRevpar) },
      channels, families, reasons, roomTypes, occupancyChart: [...actualForecast, ...future],
    };
  }, [daily.data, crossings.data, forecast.data]);

  if (daily.isLoading || crossings.isLoading) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Carregando painel executivo...</div>;

  return (
    <main className="space-y-4 px-2 pb-8 sm:px-3" data-unified-executive-dashboard>
      <header className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Painel único de decisão</p><h1 className="text-2xl font-black text-pine-dark">Pulso Executivo do Hotel</h1><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Poucos KPIs, cada gráfico responde uma pergunta: demanda, preço, rentabilidade, canal e perfil de hóspede.</p></div>
          <div className="rounded-xl bg-muted px-3 py-2 text-right text-[10px] text-muted-foreground"><strong className="block text-foreground">Janela principal</strong> últimos 30 dias</div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Kpi icon={<BedDouble />} label="Ocupação" value={pct(model.occupancy)} delta={model.trends.occupancy} hint="Uso dos quartos disponíveis" />
        <Kpi icon={<BadgeDollarSign />} label="ADR" value={fmtBRL(model.adr)} delta={model.trends.adr} hint="Diária média vendida" />
        <Kpi icon={<Activity />} label="RevPAR" value={fmtBRL(model.revpar)} delta={model.trends.revpar} hint="Receita por quarto disponível" />
        <Kpi icon={<CircleDollarSign />} label="Receita" value={fmtBRL(model.revenue)} delta={model.trends.revenue} hint="Hospedagem + extras" />
        <Kpi icon={<TrendingUp />} label="GOP / GOPPAR" value={`${fmtBRL(model.gop)} · ${fmtBRL(model.goppar)}`} hint="Lucro operacional e por quarto disponível" />
        <Kpi icon={<Percent />} label="Cancelamento" value={pct(model.cancellation)} hint="Risco comercial histórico" />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="1. Demanda: estamos enchendo ou esvaziando?" subtitle="Ocupação real recente + previsão Random Forest. A previsão é apoio, não garantia.">
          <ResponsiveContainer width="100%" height={260}><LineChart data={model.occupancyChart}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="data" tick={{fontSize:10}}/><YAxis domain={[0,100]} tick={{fontSize:10}} unit="%"/><Tooltip/><Legend/><Line type="monotone" dataKey="real" name="Real" strokeWidth={2} connectNulls={false}/><Line type="monotone" dataKey="previsto" name="Previsto" strokeWidth={2} strokeDasharray="5 4" connectNulls={false}/></LineChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="2. Dinheiro: receita está virando resultado?" subtitle="Receita total versus GOP diário. Se receita sobe e GOP não acompanha, o custo precisa ser investigado.">
          <ResponsiveContainer width="100%" height={260}><AreaChart data={model.current.slice(-30).map(r=>({data:labelDate(r.data),receita:Number(r.receita_total||0),gop:Number(r.gop||0)}))}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="data" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v:any)=>fmtBRL(Number(v))}/><Legend/><Area type="monotone" dataKey="receita" name="Receita" fillOpacity={0.15}/><Area type="monotone" dataKey="gop" name="GOP" fillOpacity={0.08}/></AreaChart></ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="3. Canal: quem traz dinheiro com menos cancelamento?" subtitle="Ranking por receita; ADR e cancelamento aparecem na leitura abaixo.">
          <ResponsiveContainer width="100%" height={260}><BarChart data={model.channels} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{fontSize:10}}/><YAxis type="category" dataKey="canal" width={90} tick={{fontSize:10}}/><Tooltip formatter={(v:any)=>fmtBRL(Number(v))}/><Bar dataKey="receita" name="Receita" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">{model.channels.slice(0,6).map(c=><div key={c.canal} className="flex items-center justify-between rounded-lg bg-muted/55 px-2.5 py-1.5 text-[10px]"><strong>{c.canal}</strong><span>ADR {fmtBRL(c.adr)} · canc. {pct(c.cancelamento)}</span></div>)}</div>
        </ChartCard>
        <ChartCard title="4. Público: quem compra qual produto?" subtitle="Perfil familiar, motivo da viagem e tipo de quarto. Use para preço, campanhas e reformas.">
          <div className="grid gap-3 sm:grid-cols-3"><MiniRanking title="Perfil familiar" rows={model.families.map(x=>[x.perfil,x.reservas])}/><MiniRanking title="Motivo da viagem" rows={model.reasons.map(x=>[x.motivo,x.reservas])}/><MiniRanking title="Tipo de quarto" rows={model.roomTypes.map(x=>[x.tipo,x.reservas])}/></div>
        </ChartCard>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <h2 className="text-sm font-black text-pine-dark">Leitura para decisão</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-3 text-xs">
          <Decision title="Preço e demanda" text={model.occupancy < 30 ? "Ocupação baixa: priorize demanda e canal antes de elevar tarifa de forma ampla." : model.occupancy > 65 ? "Ocupação forte: há espaço para testar tarifa maior nas datas/quartos mais procurados." : "Equilíbrio intermediário: ajuste preço por data e tipo de quarto, não de forma geral."}/>
          <Decision title="Rentabilidade" text={model.gop < 0 ? "GOP negativo: não basta aumentar reservas; despesas e margem precisam ser tratadas antes de expandir." : `GOP positivo de ${fmtBRL(model.gop)}. Acompanhe GOPPAR junto do RevPAR para não crescer receita destruindo margem.`}/>
          <Decision title="Canal" text={model.channels[0] ? `${model.channels[0].canal} lidera receita. Compare ADR ${fmtBRL(model.channels[0].adr)} e cancelamento ${pct(model.channels[0].cancelamento)} antes de colocar mais verba nesse canal.` : "Ainda faltam dados de canal para uma recomendação confiável."}/>
        </div>
      </section>
    </main>
  );
}

function Kpi({ icon, label, value, delta, hint }: { icon: React.ReactNode; label: string; value: string; delta?: number; hint: string }) {
  return <article className="rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{label}</span></div><p className="mt-2 text-lg font-black text-pine-dark">{value}</p>{delta !== undefined && <p className={`text-[10px] font-bold ${delta >= 0 ? "text-sage" : "text-brick"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs. 30 dias anteriores</p>}<p className="mt-1 text-[9px] text-muted-foreground">{hint}</p></article>;
}
function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="text-sm font-black text-pine-dark">{title}</h2><p className="mb-3 text-[10px] text-muted-foreground">{subtitle}</p>{children}</article>; }
function MiniRanking({ title, rows }: { title: string; rows: [string, number][] }) { const max=Math.max(1,...rows.map(r=>r[1])); return <div><h3 className="mb-2 text-[10px] font-black uppercase text-muted-foreground">{title}</h3><div className="space-y-2">{rows.slice(0,5).map(([name,value])=><div key={name}><div className="flex justify-between gap-2 text-[10px]"><span className="truncate">{name}</span><strong>{value}</strong></div><div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${Math.max(4,value/max*100)}%`}}/></div></div>)}</div></div>; }
function Decision({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-primary/15 bg-card p-3"><strong className="text-primary">{title}</strong><p className="mt-1 text-muted-foreground">{text}</p></div>; }
