import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, TrendingUp, Layers3, Lightbulb, Trees, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/analise-preditiva")({ component: PredictiveAnalytics });

type ForecastRow = { forecast_date: string; expected_rooms: number; expected_occupancy: number; lower_occupancy: number; upper_occupancy: number; confidence: string; };
type ClusterRow = { quarto: number; preco: number; banheiro: boolean; reservas: number; room_nights: number; receita: number; adr: number; hospedes_medios: number; cancelamentos: number; no_shows: number; cluster: string; score_demanda: number; };
type PrescriptionRow = { prioridade: number; categoria: string; recomendacao: string; motivo: string; impacto: string; };
type RiskRow = { reservation_id: string; quarto: number; checkin: string; canal: string; valor_diaria: number; pessoas: number; probability: number; };
type RFData = {
  model_version?: string;
  cancellation?: { available: boolean; algorithm?: string; trees?: number; training_rows?: number; test_rows?: number; positives?: number; base_rate?: number; confidence?: string; metrics?: { accuracy?: number; precision?: number; recall?: number; brier?: number }; risks?: RiskRow[]; reason?: string };
  occupancy?: { available: boolean; algorithm?: string; trees?: number; training_days?: number; test_days?: number; confidence?: string; metrics?: { mae?: number; rmse?: number; r2?: number }; forecast?: { date: string; expected_occupancy: number; lower: number; upper: number }[]; reason?: string };
  no_show?: { available: boolean; reason?: string; examples?: number };
  data_quality?: { reservations_total?: number; resolved_reservations?: number; cancellation_examples?: number; daily_history_days?: number };
};

function PredictiveAnalytics() {
  const company = useCurrentCompany();
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [rf, setRf] = useState<RFData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company.data?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [f, c, p, ml] = await Promise.all([
        supabase.rpc("get_hotel_occupancy_forecast", { p_company_id: company.data.id, p_horizon_days: 30 }),
        supabase.rpc("get_hotel_room_clusters", { p_company_id: company.data.id }),
        supabase.rpc("get_hotel_prescriptions", { p_company_id: company.data.id }),
        supabase.functions.invoke("hotel-random-forest", { body: { company_id: company.data.id } }),
      ]);
      if (!active) return;
      setForecast((f.data ?? []) as ForecastRow[]);
      setClusters((c.data ?? []) as ClusterRow[]);
      setPrescriptions((p.data ?? []) as PrescriptionRow[]);
      setRf(!ml.error ? (ml.data as RFData) : null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [company.data?.id]);

  const summary = useMemo(() => {
    if (!forecast.length) return { avg: 0, min: 0, max: 0, confidence: "—" };
    const values = forecast.map((x) => Number(x.expected_occupancy));
    return { avg: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values), confidence: forecast[0]?.confidence ?? "—" };
  }, [forecast]);

  const maxForecast = Math.max(1, ...forecast.map((x) => Number(x.upper_occupancy)));
  const topRisk = rf?.cancellation?.risks ?? [];

  return <div className="mx-auto max-w-6xl space-y-4 pb-10">
    <header className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2"><BrainCircuit className="text-primary"/><h1 className="text-xl font-extrabold text-pine-dark">Análise Preditiva & Prescritiva</h1></div>
      <p className="mt-1 text-sm text-muted-foreground">Forecast estatístico + Random Forest + clusters de quartos + recomendações automáticas para preço, demanda, obras, cancelamentos e receita.</p>
    </header>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Ocupação prevista · 30 dias" value={`${summary.avg.toFixed(1)}%`} />
      <Kpi label="Menor previsão" value={`${summary.min.toFixed(1)}%`} />
      <Kpi label="Maior previsão" value={`${summary.max.toFixed(1)}%`} />
      <Kpi label="Confiança estatística" value={summary.confidence} />
    </div>

    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><Trees className="h-5 w-5 text-primary"/><h2 className="font-bold">Random Forest · Machine Learning</h2></div>
      {loading ? <p className="text-sm text-muted-foreground">Treinando os modelos com os dados do hotel...</p> : !rf ? <p className="text-sm text-muted-foreground">O modelo de machine learning não respondeu nesta tentativa.</p> : <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded-xl border border-border p-3">
            <div className="text-xs font-bold uppercase text-primary">Risco de cancelamento</div>
            {rf.cancellation?.available ? <>
              <p className="mt-1 font-semibold">Random Forest com {rf.cancellation.trees} árvores · confiança {rf.cancellation.confidence}</p>
              <p className="mt-2 text-xs text-muted-foreground">Treino: {rf.cancellation.training_rows} reservas · teste: {rf.cancellation.test_rows} · cancelamentos conhecidos: {rf.cancellation.positives}.</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><Mini label="Acurácia" value={pct01(rf.cancellation.metrics?.accuracy)} /><Mini label="Recall cancelamento" value={pct01(rf.cancellation.metrics?.recall)} /></div>
            </> : <p className="mt-2 text-sm text-muted-foreground">{rf.cancellation?.reason}</p>}
          </article>
          <article className="rounded-xl border border-border p-3">
            <div className="text-xs font-bold uppercase text-primary">Previsão de ocupação · Random Forest</div>
            {rf.occupancy?.available ? <>
              <p className="mt-1 font-semibold">{rf.occupancy.trees} árvores · confiança {rf.occupancy.confidence}</p>
              <p className="mt-2 text-xs text-muted-foreground">Erro médio no teste: {Number(rf.occupancy.metrics?.mae ?? 0).toFixed(1)} pontos percentuais. R²: {Number(rf.occupancy.metrics?.r2 ?? 0).toFixed(2)}.</p>
            </> : <p className="mt-2 text-sm text-muted-foreground">{rf.occupancy?.reason}</p>}
          </article>
        </div>

        <article className="rounded-xl border border-amber-300/40 bg-amber-50/40 p-3 dark:bg-amber-950/10">
          <div className="flex items-center gap-2 text-sm font-bold"><ShieldAlert className="h-4 w-4"/> No-show</div>
          <p className="mt-1 text-xs text-muted-foreground">{rf.no_show?.reason || "Modelo ainda não disponível."}</p>
          <p className="mt-1 text-xs text-muted-foreground">O sistema não cria probabilidade artificial sem exemplos reais suficientes.</p>
        </article>

        {topRisk.length > 0 && <div>
          <h3 className="mb-2 text-sm font-bold">Reservas atuais com maior risco estimado de cancelamento</h3>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Quarto</th><th>Check-in</th><th>Canal</th><th>Diária</th><th>Pessoas</th><th>Risco</th><th>Ação</th></tr></thead><tbody>
            {topRisk.slice(0, 10).map((r) => <tr key={r.reservation_id} className="border-b border-border/60"><td className="py-2 font-bold">{r.quarto}</td><td>{new Date(`${r.checkin}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{r.canal}</td><td>R$ {Number(r.valor_diaria).toFixed(0)}</td><td>{r.pessoas}</td><td className="font-bold">{(r.probability * 100).toFixed(0)}%</td><td className="text-xs">{r.probability >= .45 ? "Confirmar reserva antes do check-in" : r.probability >= .25 ? "Acompanhar" : "Rotina normal"}</td></tr>)}
          </tbody></table></div>
        </div>}
        <p className="text-xs text-muted-foreground">Probabilidade é apoio à decisão, não certeza. O modelo deve ser reavaliado à medida que mais reservas, cancelamentos e no-shows forem registrados.</p>
      </div>}
    </section>

    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary"/><h2 className="font-bold">Forecast estatístico de ocupação · próximos 30 dias</h2></div>
      {loading ? <p className="text-sm text-muted-foreground">Calculando...</p> : <div className="space-y-2">
        {forecast.map((row) => <div key={row.forecast_date} className="grid grid-cols-[82px_1fr_58px] items-center gap-2 text-xs">
          <span>{new Date(`${row.forecast_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
          <div className="h-6 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (Number(row.expected_occupancy) / maxForecast) * 100)}%` }} /></div>
          <strong className="text-right">{Number(row.expected_occupancy).toFixed(1)}%</strong>
        </div>)}
      </div>}
      <p className="mt-3 text-xs text-muted-foreground">A faixa inferior/superior representa a incerteza. Compare este forecast estatístico com o Random Forest: quando ambos apontarem a mesma direção, a decisão fica mais robusta.</p>
    </section>

    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary"/><h2 className="font-bold">Clusters de quartos</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Quarto</th><th>Preço</th><th>Reservas</th><th>Diárias</th><th>Receita</th><th>ADR</th><th>Hóspedes</th><th>Cluster</th><th>Score</th></tr></thead><tbody>
        {clusters.map((row) => <tr key={row.quarto} className="border-b border-border/60"><td className="py-2 font-bold">{row.quarto}</td><td>R$ {Number(row.preco).toFixed(0)}</td><td>{row.reservas}</td><td>{Number(row.room_nights).toFixed(0)}</td><td>R$ {Number(row.receita).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td><td>R$ {Number(row.adr).toFixed(0)}</td><td>{Number(row.hospedes_medios).toFixed(1)}</td><td>{row.cluster}</td><td>{Number(row.score_demanda).toFixed(1)}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary"/><h2 className="font-bold">Prescrição · o que fazer agora</h2></div>
      <div className="grid gap-3 md:grid-cols-2">{prescriptions.map((row) => <article key={`${row.prioridade}-${row.categoria}`} className="rounded-xl border border-border p-3">
        <div className="text-xs font-bold uppercase text-primary">{row.prioridade}. {row.categoria}</div><p className="mt-1 font-semibold">{row.recomendacao}</p><p className="mt-2 text-xs text-muted-foreground"><strong>Por quê:</strong> {row.motivo}</p><p className="mt-1 text-xs text-muted-foreground"><strong>Impacto:</strong> {row.impacto}</p>
      </article>)}</div>
    </section>
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-border bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div className="mt-1 text-xl font-extrabold">{value}</div></div>; }
function Mini({label,value}:{label:string;value:string}) { return <div className="rounded-lg bg-muted p-2"><div className="text-muted-foreground">{label}</div><strong>{value}</strong></div>; }
function pct01(v?:number){return v == null ? "—" : `${(v*100).toFixed(0)}%`;}
