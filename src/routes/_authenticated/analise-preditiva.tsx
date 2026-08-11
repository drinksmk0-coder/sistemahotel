import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, TrendingUp, Layers3, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/analise-preditiva")({ component: PredictiveAnalytics });

type ForecastRow = {
  forecast_date: string;
  expected_rooms: number;
  expected_occupancy: number;
  lower_occupancy: number;
  upper_occupancy: number;
  confidence: string;
};

type ClusterRow = {
  quarto: number;
  preco: number;
  banheiro: boolean;
  reservas: number;
  room_nights: number;
  receita: number;
  adr: number;
  hospedes_medios: number;
  cancelamentos: number;
  no_shows: number;
  cluster: string;
  score_demanda: number;
};

type PrescriptionRow = {
  prioridade: number;
  categoria: string;
  recomendacao: string;
  motivo: string;
  impacto: string;
};

function PredictiveAnalytics() {
  const company = useCurrentCompany();
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company.data?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [f, c, p] = await Promise.all([
        supabase.rpc("get_hotel_occupancy_forecast", { p_company_id: company.data.id, p_horizon_days: 30 }),
        supabase.rpc("get_hotel_room_clusters", { p_company_id: company.data.id }),
        supabase.rpc("get_hotel_prescriptions", { p_company_id: company.data.id }),
      ]);
      if (!active) return;
      setForecast((f.data ?? []) as ForecastRow[]);
      setClusters((c.data ?? []) as ClusterRow[]);
      setPrescriptions((p.data ?? []) as PrescriptionRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [company.data?.id]);

  const summary = useMemo(() => {
    if (!forecast.length) return { avg: 0, min: 0, max: 0, confidence: "—" };
    const values = forecast.map((x) => Number(x.expected_occupancy));
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      confidence: forecast[0]?.confidence ?? "—",
    };
  }, [forecast]);

  const maxForecast = Math.max(1, ...forecast.map((x) => Number(x.upper_occupancy)));

  return <div className="mx-auto max-w-6xl space-y-4 pb-10">
    <header className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2"><BrainCircuit className="text-primary"/><h1 className="text-xl font-extrabold text-pine-dark">Análise Preditiva & Prescritiva</h1></div>
      <p className="mt-1 text-sm text-muted-foreground">Forecast estatístico de ocupação + clusters de quartos + recomendações automáticas para preço, demanda, obras e receita.</p>
    </header>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Ocupação prevista · 30 dias" value={`${summary.avg.toFixed(1)}%`} />
      <Kpi label="Menor previsão" value={`${summary.min.toFixed(1)}%`} />
      <Kpi label="Maior previsão" value={`${summary.max.toFixed(1)}%`} />
      <Kpi label="Confiança estatística" value={summary.confidence} />
    </div>

    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary"/><h2 className="font-bold">Forecast de ocupação · próximos 30 dias</h2></div>
      {loading ? <p className="text-sm text-muted-foreground">Calculando...</p> : <div className="space-y-2">
        {forecast.map((row) => <div key={row.forecast_date} className="grid grid-cols-[82px_1fr_58px] items-center gap-2 text-xs">
          <span>{new Date(`${row.forecast_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
          <div className="h-6 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (Number(row.expected_occupancy) / maxForecast) * 100)}%` }} /></div>
          <strong className="text-right">{Number(row.expected_occupancy).toFixed(1)}%</strong>
        </div>)}
      </div>}
      <p className="mt-3 text-xs text-muted-foreground">A faixa inferior/superior representa a incerteza do modelo. Confiança baixa significa que o sistema ainda precisa de mais histórico para estreitar a previsão.</p>
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
        <div className="text-xs font-bold uppercase text-primary">{row.prioridade}. {row.categoria}</div>
        <p className="mt-1 font-semibold">{row.recomendacao}</p>
        <p className="mt-2 text-xs text-muted-foreground"><strong>Por quê:</strong> {row.motivo}</p>
        <p className="mt-1 text-xs text-muted-foreground"><strong>Impacto:</strong> {row.impacto}</p>
      </article>)}</div>
    </section>
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div className="mt-1 text-xl font-extrabold">{value}</div></div>;
}
