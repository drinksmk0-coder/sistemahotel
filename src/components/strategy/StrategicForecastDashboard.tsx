import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CloudRain,
  CloudSun,
  Download,
  RefreshCw,
  Sparkles,
  Target,
  Thermometer,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  useCurrentCompany,
  useReservations,
  useRooms,
  type Reservation,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";

const CRUZILIA = {
  latitude: -21.83889,
  longitude: -44.80771,
  timezone: "America/Sao_Paulo",
};

const HISTORY_DAYS = 365;
const FORECAST_DAYS = 60;
const ACTIVE_RESERVATION_STATUSES = new Set([
  "reservado",
  "confirmado",
  "hospedado",
  "ocupado",
  "finalizado",
]);

type WeatherDaily = {
  id: string;
  date: string;
  data_kind: "observed" | "forecast";
  temperature_mean_c: number | null;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  apparent_temperature_mean_c: number | null;
  precipitation_mm: number | null;
  precipitation_probability_max: number | null;
  weather_code: number | null;
  fetched_at: string;
};

type WeatherObservation = {
  observed_at: string;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  relative_humidity: number | null;
  precipitation_mm: number | null;
  weather_code: number | null;
};

type CalendarEvent = {
  id: string;
  company_id: string | null;
  name: string;
  start_date: string;
  end_date: string;
  scope: "nacional" | "municipal" | "local" | "regional" | "hotel";
  event_type: "feriado" | "ponto_facultativo" | "evento";
  city: string | null;
  state: string | null;
  expected_impact: number;
  source_name: string | null;
};

type DailyRow = {
  date: string;
  shortDate: string;
  weekday: string;
  arrivals: number;
  cancelled: number;
  occupiedRooms: number;
  occupancyPct: number;
  revenue: number;
  temperature: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  precipitation: number | null;
  weatherKind: "observed" | "forecast" | "missing";
  events: CalendarEvent[];
  eventName: string;
  forecastArrivals: number | null;
  forecastOccupiedRooms: number | null;
  forecastOccupancyPct: number | null;
  confidence: number | null;
};

type ForecastProfile = {
  trendFactor: number;
  baseArrivalsByWeekday: number[];
  baseOccupancyByWeekday: number[];
  historicalTemperatureMean: number | null;
  temperatureCorrelation: number | null;
  occupancyTemperatureCorrelation: number | null;
  eventLift: number | null;
  historyPoints: number;
};

export function StrategicForecastDashboard() {
  const today = todayISO();
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const { data: reservations = [], isLoading: reservationsLoading } = useReservations();
  const { data: rooms = [], isLoading: roomsLoading } = useRooms();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const historyStart = addDays(today, -HISTORY_DAYS);
  const forecastEnd = addDays(today, FORECAST_DAYS);

  const weatherQuery = useQuery({
    queryKey: ["strategy-weather-daily", companyId, historyStart, forecastEnd],
    enabled: Boolean(companyId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("weather_daily")
        .select(
          "id,date,data_kind,temperature_mean_c,temperature_min_c,temperature_max_c,apparent_temperature_mean_c,precipitation_mm,precipitation_probability_max,weather_code,fetched_at",
        )
        .eq("company_id", companyId)
        .gte("date", historyStart)
        .lte("date", forecastEnd)
        .order("date", { ascending: true });
      if (result.error) throw result.error;
      return (result.data ?? []) as WeatherDaily[];
    },
  });

  const observationQuery = useQuery({
    queryKey: ["strategy-weather-current", companyId],
    enabled: Boolean(companyId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("weather_observations")
        .select(
          "observed_at,temperature_c,apparent_temperature_c,relative_humidity,precipitation_mm,weather_code",
        )
        .eq("company_id", companyId)
        .order("observed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw result.error;
      return (result.data ?? null) as WeatherObservation | null;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["strategy-calendar-events", companyId, historyStart, forecastEnd],
    enabled: Boolean(companyId),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("calendar_events")
        .select(
          "id,company_id,name,start_date,end_date,scope,event_type,city,state,expected_impact,source_name",
        )
        .eq("active", true)
        .lte("start_date", forecastEnd)
        .gte("end_date", historyStart)
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .order("start_date", { ascending: true });
      if (result.error) throw result.error;
      return (result.data ?? []) as CalendarEvent[];
    },
  });

  useEffect(() => {
    if (!companyId) return;
    const key = `hotelreal:weather-sync:${companyId}`;
    const lastSync = Number(window.localStorage.getItem(key) ?? "0");
    if (Date.now() - lastSync < 30 * 60_000) return;
    window.localStorage.setItem(key, String(Date.now()));
    void syncWeather(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function syncWeather(showMessage = true) {
    if (!companyId || syncing) return;
    setSyncing(true);
    if (showMessage) setSyncMessage("Atualizando clima observado e previsão…");
    try {
      const archiveEnd = addDays(today, -1);
      const archiveUrl = buildArchiveUrl(historyStart, archiveEnd);
      const forecastUrl = buildForecastUrl();
      const [archiveResponse, forecastResponse] = await Promise.all([
        fetch(archiveUrl),
        fetch(forecastUrl),
      ]);
      if (!archiveResponse.ok || !forecastResponse.ok) {
        throw new Error("O serviço climático não respondeu corretamente.");
      }

      const [archive, forecast] = await Promise.all([
        archiveResponse.json(),
        forecastResponse.json(),
      ]);

      const archiveRows = mapDailyWeather(archive, companyId, "observed");
      const forecastRows = mapDailyWeather(forecast, companyId, "forecast");
      const currentRow = mapCurrentWeather(forecast, companyId);

      if (archiveRows.length) {
        const result = await (supabase as any)
          .from("weather_daily")
          .upsert(archiveRows, { onConflict: "company_id,date,data_kind" });
        if (result.error) throw result.error;
      }
      if (forecastRows.length) {
        const result = await (supabase as any)
          .from("weather_daily")
          .upsert(forecastRows, { onConflict: "company_id,date,data_kind" });
        if (result.error) throw result.error;
      }
      if (currentRow) {
        const result = await (supabase as any)
          .from("weather_observations")
          .upsert(currentRow, { onConflict: "company_id,observed_at" });
        if (result.error) throw result.error;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["strategy-weather-daily", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["strategy-weather-current", companyId] }),
      ]);
      if (showMessage) setSyncMessage("Clima atualizado e armazenado no histórico.");
    } catch (error) {
      if (showMessage) {
        setSyncMessage(
          error instanceof Error ? error.message : "Não foi possível atualizar o clima.",
        );
      }
    } finally {
      setSyncing(false);
      if (showMessage) window.setTimeout(() => setSyncMessage(""), 5000);
    }
  }

  const weatherByDate = useMemo(
    () => selectBestWeatherByDate(weatherQuery.data ?? []),
    [weatherQuery.data],
  );
  const eventsByDate = useMemo(
    () => indexEventsByDate(eventsQuery.data ?? [], historyStart, forecastEnd),
    [eventsQuery.data, forecastEnd, historyStart],
  );

  const historicalRows = useMemo(
    () =>
      buildBaseRows({
        start: historyStart,
        end: addDays(today, -1),
        reservations,
        roomCount: rooms.length,
        weatherByDate,
        eventsByDate,
      }),
    [eventsByDate, historyStart, reservations, rooms.length, today, weatherByDate],
  );

  const profile = useMemo(
    () => buildForecastProfile(historicalRows),
    [historicalRows],
  );

  const futureRows = useMemo(() => {
    const base = buildBaseRows({
      start: today,
      end: forecastEnd,
      reservations,
      roomCount: rooms.length,
      weatherByDate,
      eventsByDate,
    });
    return applyForecast(base, profile, rooms.length);
  }, [eventsByDate, forecastEnd, profile, reservations, rooms.length, today, weatherByDate]);

  const allRows = useMemo(
    () => [...historicalRows, ...futureRows],
    [futureRows, historicalRows],
  );

  const recentRows = historicalRows.slice(-60);
  const forecast30 = futureRows.slice(0, 30);
  const nextEvents = (eventsQuery.data ?? [])
    .filter((event) => event.end_date >= today)
    .slice(0, 8);

  const bookedRoomNights30 = forecast30.reduce((sum, row) => sum + row.occupiedRooms, 0);
  const forecastRoomNights30 = forecast30.reduce(
    (sum, row) => sum + (row.forecastOccupiedRooms ?? row.occupiedRooms),
    0,
  );
  const capacity30 = Math.max(1, rooms.length * forecast30.length);
  const bookedOccupancy30 = (bookedRoomNights30 / capacity30) * 100;
  const forecastOccupancy30 = (forecastRoomNights30 / capacity30) * 100;
  const forecastArrivals30 = forecast30.reduce(
    (sum, row) => sum + (row.forecastArrivals ?? row.arrivals),
    0,
  );
  const confirmedRevenue30 = forecast30.reduce((sum, row) => sum + row.revenue, 0);
  const averageDailyRate = safeDivide(
    historicalRows.reduce((sum, row) => sum + row.revenue, 0),
    historicalRows.reduce((sum, row) => sum + row.occupiedRooms, 0),
  );
  const forecastRevenue30 = forecastRoomNights30 * averageDailyRate;

  const chartRows = useMemo(
    () =>
      [...recentRows.slice(-30), ...futureRows.slice(0, 45)].map((row) => ({
        ...row,
        real: row.date < today ? row.arrivals : row.arrivals || null,
        previsto: row.date >= today ? round1(row.forecastArrivals ?? row.arrivals) : null,
        temp: row.temperature,
        ocupacaoPrevista:
          row.date >= today ? round1(row.forecastOccupancyPct ?? row.occupancyPct) : null,
      })),
    [futureRows, recentRows, today],
  );

  const weekdayRows = useMemo(
    () => buildWeekdayRows(historicalRows, profile),
    [historicalRows, profile],
  );

  const eventPerformance = useMemo(
    () => buildEventPerformance(historicalRows),
    [historicalRows],
  );

  const loading = reservationsLoading || roomsLoading || weatherQuery.isLoading || eventsQuery.isLoading;
  const correlationText = describeCorrelation(profile.temperatureCorrelation);
  const currentWeather = observationQuery.data;

  function exportCsv() {
    const header = [
      "data",
      "dia_semana",
      "reservas_entrada_reais",
      "reservas_canceladas",
      "quartos_ocupados",
      "ocupacao_real_pct",
      "receita_rateada",
      "reservas_previstas",
      "quartos_previstos",
      "ocupacao_prevista_pct",
      "temperatura_media_c",
      "temperatura_min_c",
      "temperatura_max_c",
      "precipitacao_mm",
      "tipo_dado_clima",
      "evento_ou_feriado",
      "escopo_evento",
      "impacto_esperado",
      "confianca_previsao_pct",
    ];
    const lines = allRows.map((row) => [
      row.date,
      row.weekday,
      row.arrivals,
      row.cancelled,
      row.occupiedRooms,
      round1(row.occupancyPct),
      round2(row.revenue),
      row.forecastArrivals == null ? "" : round1(row.forecastArrivals),
      row.forecastOccupiedRooms == null ? "" : round1(row.forecastOccupiedRooms),
      row.forecastOccupancyPct == null ? "" : round1(row.forecastOccupancyPct),
      row.temperature ?? "",
      row.temperatureMin ?? "",
      row.temperatureMax ?? "",
      row.precipitation ?? "",
      row.weatherKind,
      row.eventName,
      row.events.map((event) => event.scope).join(" | "),
      row.events.map((event) => event.expected_impact).join(" | "),
      row.confidence ?? "",
    ]);
    downloadCsv(
      `estrategia-previsao-${today}.csv`,
      [header, ...lines],
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <PageHeader
        title="Estratégia e previsão"
        subtitle="Previsão de reservas, demanda, feriados, eventos de Cruzília e influência da temperatura."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/painel-executivo"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-extrabold text-foreground shadow-sm hover:bg-muted"
            >
              <BarChart3 className="h-4 w-4 text-primary" /> Painel executivo
            </Link>
            <button
              type="button"
              onClick={() => void syncWeather(true)}
              disabled={syncing}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-extrabold text-foreground shadow-sm hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 text-primary ${syncing ? "animate-spin" : ""}`} />
              Atualizar clima
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-sm hover:opacity-95"
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </button>
          </div>
        }
      />

      {syncMessage && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-foreground">
          {syncMessage}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <MetricCard
          icon={<Target />}
          label="Ocupação prevista — 30 dias"
          value={`${forecastOccupancy30.toFixed(1)}%`}
          hint={`${bookedOccupancy30.toFixed(1)}% já confirmado`}
          tone="blue"
        />
        <MetricCard
          icon={<TrendingUp />}
          label="Reservas previstas — 30 dias"
          value={forecastArrivals30.toFixed(0)}
          hint={`tendência ${formatFactor(profile.trendFactor)}`}
          tone="green"
        />
        <MetricCard
          icon={<Sparkles />}
          label="Receita potencial — 30 dias"
          value={fmtBRL(forecastRevenue30)}
          hint={`${fmtBRL(confirmedRevenue30)} confirmado`}
          tone="gold"
        />
        <MetricCard
          icon={<Thermometer />}
          label="Temperatura agora"
          value={currentWeather?.temperature_c == null ? "—" : `${Number(currentWeather.temperature_c).toFixed(1)}°C`}
          hint={
            currentWeather
              ? `sensação ${formatNullableTemperature(currentWeather.apparent_temperature_c)}`
              : "aguardando primeira captura"
          }
          tone="red"
        />
        <MetricCard
          icon={<CloudRain />}
          label="Clima x reservas"
          value={formatCorrelation(profile.temperatureCorrelation)}
          hint={correlationText}
          tone="purple"
        />
      </section>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm font-semibold text-muted-foreground">
          Preparando previsão e cruzando os dados…
        </div>
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-2">
            <ChartCard
              title="Reservas reais x previsão"
              subtitle="Últimos 30 dias e próximos 45 dias. A previsão considera histórico, tendência, eventos e clima."
              icon={<TrendingUp />}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="shortDate" minTickGap={28} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<StrategyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine x={formatShortDate(today)} stroke="var(--brick)" strokeDasharray="4 4" label={{ value: "Hoje", fontSize: 10 }} />
                  <Bar dataKey="real" name="Reservas reais" fill="var(--primary)" radius={[5, 5, 0, 0]} maxBarSize={18} />
                  <Line dataKey="previsto" name="Reservas previstas" stroke="var(--brass)" strokeWidth={2.5} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Ocupação futura e temperatura"
              subtitle="Ajuda a identificar períodos em que frio, calor ou chuva coincidem com mudança na procura."
              icon={<CloudSun />}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows.filter((row) => row.date >= today)} margin={{ top: 12, right: 0, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="shortDate" minTickGap={26} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="°" />
                  <Tooltip content={<StrategyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="left" dataKey="ocupacaoPrevista" name="Ocupação prevista" stroke="var(--primary)" fill="color-mix(in srgb, var(--primary) 22%, transparent)" strokeWidth={2} />
                  <Line yAxisId="right" dataKey="temp" name="Temperatura média" stroke="var(--brick)" strokeWidth={2.5} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>

          <section className="grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
            <ChartCard
              title="Procura por dia da semana"
              subtitle="Média histórica de entradas e ocupação utilizada como base do modelo."
              icon={<CalendarDays />}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weekdayRows} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="weekday" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="arrivals" name="Entradas médias" fill="var(--primary)" radius={[5, 5, 0, 0]} />
                  <Line yAxisId="right" dataKey="occupancy" name="Ocupação média" stroke="var(--sage)" strokeWidth={2.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <article className="min-h-[21rem] rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Thermometer className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black text-foreground">Leitura da influência da temperatura</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Correlação mede associação, não prova causa. Quanto mais histórico climático for armazenado, mais confiável fica a leitura.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <InsightValue label="Temperatura x entradas" value={formatCorrelation(profile.temperatureCorrelation)} />
                <InsightValue label="Temperatura x ocupação" value={formatCorrelation(profile.occupancyTemperatureCorrelation)} />
                <InsightValue label="Dias analisados" value={String(profile.historyPoints)} />
                <InsightValue label="Média histórica" value={profile.historicalTemperatureMean == null ? "—" : `${profile.historicalTemperatureMean.toFixed(1)}°C`} />
              </div>

              <div className="mt-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                <strong>{correlationText}.</strong> {correlationRecommendation(profile.temperatureCorrelation)}
              </div>

              {profile.historyPoints < 45 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Ainda há poucos dias com clima e reservas cruzados. O sistema continuará armazenando os dados para melhorar a análise.
                </div>
              )}
            </article>
          </section>

          <section className="grid gap-3 xl:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-foreground">Próximos feriados e eventos</h2>
                  <p className="text-xs text-muted-foreground">Datas nacionais, municipais e eventos públicos de Cruzília.</p>
                </div>
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 space-y-2">
                {nextEvents.length ? nextEvents.map((event) => (
                  <div key={event.id} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 rounded-xl border border-border bg-muted/25 px-3 py-2.5">
                    <div>
                      <strong className="block text-sm text-primary">{formatDateRange(event.start_date, event.end_date)}</strong>
                      <span className="text-[9px] font-extrabold uppercase text-muted-foreground">{event.scope}</span>
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-xs text-foreground">{event.name}</strong>
                      <span className="text-[10px] text-muted-foreground">{event.source_name ?? "Calendário do hotel"}</span>
                    </div>
                    <ImpactBadge impact={event.expected_impact} />
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-semibold text-muted-foreground">Nenhum evento futuro cadastrado.</p>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-foreground">Impacto já observado em eventos</h2>
                  <p className="text-xs text-muted-foreground">Compara dias de evento com dias normais do histórico disponível.</p>
                </div>
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 space-y-2">
                {eventPerformance.length ? eventPerformance.slice(0, 7).map((item) => (
                  <div key={item.name} className="rounded-xl border border-border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate text-xs text-foreground">{item.name}</strong>
                      <span className={`text-xs font-black ${item.lift >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {item.lift >= 0 ? "+" : ""}{item.lift.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.abs(item.lift))}%` }} />
                    </div>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{item.days} dia(s) analisado(s) · {item.averageArrivals.toFixed(1)} entrada(s) em média</span>
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs font-semibold text-muted-foreground">Os eventos cadastrados ainda não possuem histórico suficiente.</p>
                )}
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "green" | "gold" | "red" | "purple";
}) {
  const classes = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    gold: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-rose-200 bg-rose-50 text-rose-800",
    purple: "border-violet-200 bg-violet-50 text-violet-800",
  }[tone];
  return (
    <article className={`min-w-0 rounded-2xl border p-3 shadow-sm ${classes}`}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
        <div className="min-w-0">
          <span className="block truncate text-[9px] font-extrabold uppercase tracking-wide">{label}</span>
          <strong className="mt-1 block truncate text-xl font-black leading-none">{value}</strong>
          <span className="mt-1 block truncate text-[10px] opacity-75">{hint}</span>
        </div>
      </div>
    </article>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-h-[22rem] flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </article>
  );
}

function InsightValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3">
      <span className="block text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-lg font-black text-foreground">{value}</strong>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: number }) {
  const label = impact >= 3 ? "alto" : impact >= 2 ? "médio" : impact > 0 ? "leve" : "neutro";
  const classes = impact >= 3
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : impact >= 2
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase ${classes}`}>impacto {label}</span>;
}

function StrategyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as DailyRow & { temp?: number | null };
  return (
    <div className="max-w-64 rounded-xl border border-border bg-card p-3 text-xs shadow-xl">
      <strong className="block text-foreground">{label}</strong>
      {payload.map((item: any) => (
        <div key={item.dataKey} className="mt-1 flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{item.name}</span>
          <strong style={{ color: item.color }}>{formatTooltipValue(item.value, item.dataKey)}</strong>
        </div>
      ))}
      {row?.eventName && <p className="mt-2 border-t border-border pt-2 text-[10px] font-semibold text-primary">{row.eventName}</p>}
    </div>
  );
}

function buildBaseRows({
  start,
  end,
  reservations,
  roomCount,
  weatherByDate,
  eventsByDate,
}: {
  start: string;
  end: string;
  reservations: Reservation[];
  roomCount: number;
  weatherByDate: Map<string, WeatherDaily>;
  eventsByDate: Map<string, CalendarEvent[]>;
}) {
  const arrivals = new Map<string, number>();
  const cancelled = new Map<string, number>();
  const occupied = new Map<string, number>();
  const revenue = new Map<string, number>();

  for (const reservation of reservations) {
    const checkin = reservation.checkin;
    if (reservation.status === "cancelado") {
      cancelled.set(checkin, (cancelled.get(checkin) ?? 0) + 1);
      continue;
    }
    if (!isActiveReservation(reservation)) continue;
    arrivals.set(checkin, (arrivals.get(checkin) ?? 0) + 1);

    const dailyRevenue = safeDivide(Number(reservation.valor_total) || 0, Math.max(1, Number(reservation.diarias) || daysBetween(reservation.checkin, reservation.checkout)));
    const stayStart = maxDate(start, reservation.checkin);
    const stayEnd = minDate(addDays(end, 1), reservation.checkout);
    for (const date of eachDate(stayStart, addDays(stayEnd, -1))) {
      occupied.set(date, (occupied.get(date) ?? 0) + 1);
      revenue.set(date, (revenue.get(date) ?? 0) + dailyRevenue);
    }
  }

  return eachDate(start, end).map((date): DailyRow => {
    const weather = weatherByDate.get(date);
    const events = eventsByDate.get(date) ?? [];
    const occupiedRooms = occupied.get(date) ?? 0;
    return {
      date,
      shortDate: formatShortDate(date),
      weekday: weekdayName(date),
      arrivals: arrivals.get(date) ?? 0,
      cancelled: cancelled.get(date) ?? 0,
      occupiedRooms,
      occupancyPct: roomCount > 0 ? (occupiedRooms / roomCount) * 100 : 0,
      revenue: revenue.get(date) ?? 0,
      temperature: numberOrNull(weather?.temperature_mean_c),
      temperatureMin: numberOrNull(weather?.temperature_min_c),
      temperatureMax: numberOrNull(weather?.temperature_max_c),
      precipitation: numberOrNull(weather?.precipitation_mm),
      weatherKind: weather?.data_kind ?? "missing",
      events,
      eventName: events.map((event) => event.name).join(" | "),
      forecastArrivals: null,
      forecastOccupiedRooms: null,
      forecastOccupancyPct: null,
      confidence: null,
    };
  });
}

function buildForecastProfile(rows: DailyRow[]): ForecastProfile {
  const validRows = rows.filter((row) => row.date < todayISO());
  const recent = validRows.slice(-28);
  const previous = validRows.slice(-56, -28);
  const recentAverage = average(recent.map((row) => row.arrivals));
  const previousAverage = average(previous.map((row) => row.arrivals));
  const trendFactor = clamp(previousAverage > 0 ? recentAverage / previousAverage : 1, 0.65, 1.5);

  const baseArrivalsByWeekday = Array.from({ length: 7 }, (_, weekday) =>
    average(validRows.filter((row) => weekdayIndex(row.date) === weekday).map((row) => row.arrivals)),
  );
  const baseOccupancyByWeekday = Array.from({ length: 7 }, (_, weekday) =>
    average(validRows.filter((row) => weekdayIndex(row.date) === weekday).map((row) => row.occupancyPct)),
  );

  const weatherRows = validRows.filter((row) => row.temperature != null);
  const temperatureCorrelation = pearson(
    weatherRows.map((row) => row.temperature as number),
    weatherRows.map((row) => row.arrivals),
  );
  const occupancyTemperatureCorrelation = pearson(
    weatherRows.map((row) => row.temperature as number),
    weatherRows.map((row) => row.occupancyPct),
  );
  const eventRows = validRows.filter((row) => row.events.length > 0);
  const normalRows = validRows.filter((row) => row.events.length === 0);
  const normalAverage = average(normalRows.map((row) => row.arrivals));
  const eventAverage = average(eventRows.map((row) => row.arrivals));

  return {
    trendFactor,
    baseArrivalsByWeekday,
    baseOccupancyByWeekday,
    historicalTemperatureMean: weatherRows.length ? average(weatherRows.map((row) => row.temperature as number)) : null,
    temperatureCorrelation,
    occupancyTemperatureCorrelation,
    eventLift: normalAverage > 0 && eventRows.length ? (eventAverage / normalAverage) - 1 : null,
    historyPoints: weatherRows.length,
  };
}

function applyForecast(rows: DailyRow[], profile: ForecastProfile, roomCount: number) {
  return rows.map((row, index): DailyRow => {
    const weekday = weekdayIndex(row.date);
    const eventImpact = row.events.reduce((max, event) => Math.max(max, event.expected_impact), 0);
    const eventFactor = 1 + Math.max(0, eventImpact) * 0.12;
    const climateFactor = calculateClimateFactor(row.temperature, profile);
    const horizonPenalty = Math.max(0.72, 1 - index * 0.0035);
    const predictedArrivals = Math.max(
      row.arrivals,
      profile.baseArrivalsByWeekday[weekday] * profile.trendFactor * eventFactor * climateFactor,
    );
    const predictedOccupancyPct = clamp(
      Math.max(
        row.occupancyPct,
        profile.baseOccupancyByWeekday[weekday] * profile.trendFactor * eventFactor * climateFactor,
      ),
      0,
      100,
    );
    const confidence = clamp(
      (Math.min(1, profile.historyPoints / 180) * 70 + 20) * horizonPenalty,
      25,
      92,
    );
    return {
      ...row,
      forecastArrivals: round1(predictedArrivals),
      forecastOccupiedRooms: round1((predictedOccupancyPct / 100) * roomCount),
      forecastOccupancyPct: round1(predictedOccupancyPct),
      confidence: round1(confidence),
    };
  });
}

function buildWeekdayRows(rows: DailyRow[], profile: ForecastProfile) {
  return Array.from({ length: 7 }, (_, index) => ({
    weekday: weekdayNameFromIndex(index),
    arrivals: round1(profile.baseArrivalsByWeekday[index]),
    occupancy: round1(profile.baseOccupancyByWeekday[index]),
    samples: rows.filter((row) => weekdayIndex(row.date) === index).length,
  }));
}

function buildEventPerformance(rows: DailyRow[]) {
  const normalAverage = average(rows.filter((row) => row.events.length === 0).map((row) => row.arrivals));
  const grouped = new Map<string, DailyRow[]>();
  for (const row of rows) {
    for (const event of row.events) {
      const current = grouped.get(event.name) ?? [];
      current.push(row);
      grouped.set(event.name, current);
    }
  }
  return [...grouped.entries()]
    .map(([name, eventRows]) => {
      const averageArrivals = average(eventRows.map((row) => row.arrivals));
      return {
        name,
        days: eventRows.length,
        averageArrivals,
        lift: normalAverage > 0 ? ((averageArrivals / normalAverage) - 1) * 100 : 0,
      };
    })
    .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
}

function selectBestWeatherByDate(rows: WeatherDaily[]) {
  const result = new Map<string, WeatherDaily>();
  for (const row of rows) {
    const current = result.get(row.date);
    if (!current || row.data_kind === "observed") result.set(row.date, row);
  }
  return result;
}

function indexEventsByDate(events: CalendarEvent[], start: string, end: string) {
  const result = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const eventStart = maxDate(start, event.start_date);
    const eventEnd = minDate(end, event.end_date);
    for (const date of eachDate(eventStart, eventEnd)) {
      const current = result.get(date) ?? [];
      current.push(event);
      result.set(date, current);
    }
  }
  return result;
}

function buildArchiveUrl(start: string, end: string) {
  const params = new URLSearchParams({
    latitude: String(CRUZILIA.latitude),
    longitude: String(CRUZILIA.longitude),
    start_date: start,
    end_date: end,
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "temperature_2m_mean",
      "apparent_temperature_mean",
      "precipitation_sum",
    ].join(","),
    timezone: CRUZILIA.timezone,
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

function buildForecastUrl() {
  const params = new URLSearchParams({
    latitude: String(CRUZILIA.latitude),
    longitude: String(CRUZILIA.longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "temperature_2m_mean",
      "apparent_temperature_mean",
      "precipitation_sum",
      "precipitation_probability_max",
    ].join(","),
    forecast_days: "16",
    timezone: CRUZILIA.timezone,
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function mapDailyWeather(payload: any, companyId: string, kind: "observed" | "forecast") {
  const daily = payload?.daily;
  if (!daily?.time?.length) return [];
  return daily.time.map((date: string, index: number) => ({
    company_id: companyId,
    date,
    data_kind: kind,
    temperature_mean_c: nullableNumber(daily.temperature_2m_mean?.[index]),
    temperature_min_c: nullableNumber(daily.temperature_2m_min?.[index]),
    temperature_max_c: nullableNumber(daily.temperature_2m_max?.[index]),
    apparent_temperature_mean_c: nullableNumber(daily.apparent_temperature_mean?.[index]),
    precipitation_mm: nullableNumber(daily.precipitation_sum?.[index]),
    precipitation_probability_max: nullableNumber(daily.precipitation_probability_max?.[index]),
    weather_code: nullableNumber(daily.weather_code?.[index]),
    source: "open-meteo",
    fetched_at: new Date().toISOString(),
  }));
}

function mapCurrentWeather(payload: any, companyId: string) {
  const current = payload?.current;
  if (!current?.time) return null;
  const observedAt = /[zZ]|[+-]\d\d:\d\d$/.test(current.time)
    ? new Date(current.time).toISOString()
    : new Date(`${current.time}:00-03:00`).toISOString();
  return {
    company_id: companyId,
    observed_at: observedAt,
    temperature_c: nullableNumber(current.temperature_2m),
    apparent_temperature_c: nullableNumber(current.apparent_temperature),
    relative_humidity: nullableNumber(current.relative_humidity_2m),
    precipitation_mm: nullableNumber(current.precipitation),
    weather_code: nullableNumber(current.weather_code),
    source: "open-meteo",
    fetched_at: new Date().toISOString(),
  };
}

function calculateClimateFactor(temperature: number | null, profile: ForecastProfile) {
  if (
    temperature == null ||
    profile.historicalTemperatureMean == null ||
    profile.temperatureCorrelation == null
  ) return 1;
  const deviation = (temperature - profile.historicalTemperatureMean) / 10;
  return clamp(1 + profile.temperatureCorrelation * deviation * 0.18, 0.82, 1.18);
}

function isActiveReservation(reservation: Reservation) {
  if (reservation.status === "cancelado" || reservation.status === "manutencao") return false;
  return ACTIVE_RESERVATION_STATUSES.has(reservation.status) || !reservation.status;
}

function pearson(xs: number[], ys: number[]) {
  if (xs.length < 12 || xs.length !== ys.length) return null;
  const meanX = average(xs);
  const meanY = average(ys);
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }
  const denominator = Math.sqrt(sumX * sumY);
  return denominator > 0 ? numerator / denominator : null;
}

function describeCorrelation(value: number | null) {
  if (value == null) return "Histórico insuficiente";
  const abs = Math.abs(value);
  const strength = abs >= 0.7 ? "forte" : abs >= 0.4 ? "moderada" : abs >= 0.2 ? "fraca" : "muito baixa";
  const direction = value > 0.05 ? "positiva" : value < -0.05 ? "negativa" : "neutra";
  return `Relação ${strength} e ${direction}`;
}

function correlationRecommendation(value: number | null) {
  if (value == null) return "O histórico climático continuará sendo acumulado automaticamente.";
  if (value >= 0.4) return "Dias mais quentes aparecem associados a maior procura; campanhas podem destacar lazer e passeios quando a previsão subir.";
  if (value <= -0.4) return "Dias mais frios aparecem associados a maior procura; vale testar ofertas ligadas ao clima de serra e conforto.";
  return "A temperatura, isoladamente, ainda não explica grande parte da procura. Feriados, eventos, canal e antecedência devem ter peso maior nas decisões.";
}

function formatCorrelation(value: number | null) {
  return value == null ? "—" : value.toFixed(2);
}

function formatFactor(value: number) {
  const percentage = (value - 1) * 100;
  if (Math.abs(percentage) < 0.5) return "estável";
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(0)}%`;
}

function formatNullableTemperature(value: number | null) {
  return value == null ? "—" : `${Number(value).toFixed(1)}°C`;
}

function formatTooltipValue(value: unknown, key: string) {
  if (value == null) return "—";
  if (key.toLowerCase().includes("ocupacao")) return `${Number(value).toFixed(1)}%`;
  if (key === "temp") return `${Number(value).toFixed(1)}°C`;
  return Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1);
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const content = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function eachDate(start: string, end: string) {
  if (start > end) return [];
  const result: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.max(1, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000));
}

function weekdayIndex(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function weekdayName(date: string) {
  return weekdayNameFromIndex(weekdayIndex(date));
}

function weekdayNameFromIndex(index: number) {
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][index] ?? "";
}

function formatShortDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function formatDateRange(start: string, end: string) {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)}–${formatShortDate(end)}`;
}

function minDate(a: string, b: string) {
  return a <= b ? a : b;
}

function maxDate(a: string, b: string) {
  return a >= b ? a : b;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function safeDivide(value: number, divisor: number) {
  return divisor > 0 ? value / divisor : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? null : number;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? null : number;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
