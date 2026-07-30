import Brazil from "@svg-maps/brazil";
import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmtBRL } from "@/lib/format";
import type {
  ChannelSeriesRow,
  DailyStoryRow,
  FinancialRow,
  NumericRow,
  RoomPerformanceRow,
  StateRow,
} from "./types";

const FINANCIAL_COLORS = {
  revenue: "#2563eb",
  expenses: "#dc2626",
  gop: "#7c3aed",
};
const DONUT_COLORS = ["#2563eb", "#7c3aed", "#0f9f6e", "#f59e0b", "#dc2626", "#0891b2"];

export function FinancialChart({ rows, compact = false }: { rows: FinancialRow[]; compact?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={compact ? 210 : 300}>
      <ComposedChart data={rows} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} width={55} tickFormatter={compactCurrency} />
        <Tooltip
          formatter={(value: number, name: string) => [fmtBRL(Number(value)), name]}
          labelFormatter={(label) => `Data ${label}`}
          contentStyle={{ borderRadius: 10, borderColor: "var(--border)" }}
        />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
        <Bar dataKey="receita" name="Receita" fill={FINANCIAL_COLORS.revenue} radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesas" name="Despesas" fill={FINANCIAL_COLORS.expenses} radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="gop"
          name="GOP · lucro operacional"
          stroke={FINANCIAL_COLORS.gop}
          strokeWidth={3.5}
          dot={{ r: compact ? 2.5 : 3.5, fill: FINANCIAL_COLORS.gop, strokeWidth: 1.5, stroke: "#fff" }}
          activeDot={{ r: 6, fill: FINANCIAL_COLORS.gop, stroke: "#fff", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ModernDonut({
  rows,
  valueLabel = "Participação",
  compact = false,
}: {
  rows: NumericRow[];
  valueLabel?: string;
  compact?: boolean;
}) {
  const visible = rows.filter((row) => Number(row.value) > 0).slice(0, 6);
  if (!visible.length) return <EmptyChart text="Sem dados suficientes no período." height={compact ? 190 : 260} />;
  const total = visible.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const data = visible.map((row) => ({ ...row, percentage: total > 0 ? (row.value / total) * 100 : 0 }));
  return (
    <ResponsiveContainer width="100%" height={compact ? 205 : 275}>
      <PieChart margin={{ top: 8, right: compact ? 55 : 80, bottom: 8, left: compact ? 55 : 80 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={compact ? 42 : 55}
          outerRadius={compact ? 66 : 82}
          paddingAngle={2}
          labelLine={false}
          label={(props: any) => renderDonutLabel(props, compact)}
          isAnimationActive={false}
        >
          {data.map((row, index) => (
            <Cell key={`${row.name}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, _name: string, item: any) => [
            `${item?.payload?.percentage?.toFixed?.(1) ?? "0.0"}%`,
            valueLabel,
          ]}
          contentStyle={{ borderRadius: 10, borderColor: "var(--border)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function renderDonutLabel(props: any, compact: boolean) {
  const { cx, cy, midAngle, outerRadius, name, percentage, index } = props;
  const radian = Math.PI / 180;
  const cos = Math.cos(-midAngle * radian);
  const sin = Math.sin(-midAngle * radian);
  const startX = cx + (outerRadius + 3) * cos;
  const startY = cy + (outerRadius + 3) * sin;
  const bendX = cx + (outerRadius + (compact ? 12 : 18)) * cos;
  const bendY = cy + (outerRadius + (compact ? 12 : 18)) * sin;
  const endX = bendX + (cos >= 0 ? (compact ? 18 : 28) : -(compact ? 18 : 28));
  const anchor = cos >= 0 ? "start" : "end";
  const color = DONUT_COLORS[index % DONUT_COLORS.length];
  const label = String(name).length > (compact ? 12 : 18) ? `${String(name).slice(0, compact ? 11 : 17)}…` : String(name);
  return (
    <g>
      <path d={`M${startX},${startY}L${bendX},${bendY}L${endX},${bendY}`} stroke={color} fill="none" strokeWidth={1.3} />
      <circle cx={endX} cy={bendY} r={2} fill={color} />
      <text x={endX + (cos >= 0 ? 5 : -5)} y={bendY - 2} textAnchor={anchor} fontSize={compact ? 8 : 10} fontWeight={700} fill="var(--foreground)">
        {label}
      </text>
      <text x={endX + (cos >= 0 ? 5 : -5)} y={bendY + (compact ? 8 : 10)} textAnchor={anchor} fontSize={compact ? 8 : 10} fill={color} fontWeight={800}>
        {Number(percentage || 0).toFixed(1)}%
      </text>
    </g>
  );
}

export function HorizontalBars({
  rows,
  valueLabel,
  currency = false,
  compact = false,
  maxRows = 8,
  inverted = false,
}: {
  rows: NumericRow[];
  valueLabel: string;
  currency?: boolean;
  compact?: boolean;
  maxRows?: number;
  inverted?: boolean;
}) {
  const visible = rows.filter((row) => Number(row.value) > 0).slice(0, maxRows);
  if (!visible.length) return <EmptyChart text="Sem dados suficientes no período." height={compact ? 180 : 280} />;
  const height = compact ? Math.max(165, visible.length * 25) : Math.max(260, Math.min(420, visible.length * 38));
  const chartRows = inverted ? [...visible].reverse() : visible;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 18, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 8 }} tickFormatter={currency ? compactCurrency : compactNumber} />
        <YAxis dataKey="name" type="category" width={compact ? 88 : 112} tick={{ fontSize: compact ? 8 : 10 }} />
        <Tooltip formatter={(value: number) => currency ? fmtBRL(Number(value)) : Number(value).toLocaleString("pt-BR")} />
        <Bar dataKey="value" name={valueLabel} fill="#0f766e" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChannelLineChart({ rows, compact = false }: { rows: ChannelSeriesRow[]; compact?: boolean }) {
  if (!rows.length) return <EmptyChart text="Sem histórico de canais no período." height={compact ? 190 : 280} />;
  return (
    <ResponsiveContainer width="100%" height={compact ? 200 : 280}>
      <LineChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 8 }} width={52} tickFormatter={compactCurrency} />
        <Tooltip formatter={(value: number) => fmtBRL(Number(value))} />
        <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
        <Line type="monotone" dataKey="bookingRevenue" name="Booking" stroke="#2563eb" strokeWidth={2.8} dot={{ r: 2 }} />
        <Line type="monotone" dataKey="directRevenue" name="Direto" stroke="#0f9f6e" strokeWidth={2.8} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PerformanceHeatmap({ rows }: { rows: DailyStoryRow[] }) {
  if (!rows.length) return <EmptyChart text="Sem dados diários para o mapa de calor." height={140} />;
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.gop)));
  return (
    <div className="grid grid-cols-7 gap-1.5" aria-label="Mapa de calor do GOP diário">
      {rows.slice(-35).map((row) => {
        const intensity = Math.max(0.12, Math.abs(row.gop) / max);
        const positive = row.gop >= 0;
        return (
          <div
            key={row.date}
            className="group relative grid aspect-square min-h-8 place-items-center rounded-md border border-border/60 text-[8px] font-bold"
            style={{
              background: positive
                ? `color-mix(in srgb, #16a34a ${Math.round(intensity * 82)}%, var(--card))`
                : `color-mix(in srgb, #dc2626 ${Math.round(intensity * 82)}%, var(--card))`,
              color: intensity > 0.55 ? "white" : "var(--foreground)",
            }}
            title={`${row.label}: GOP ${fmtBRL(row.gop)} · Receita ${fmtBRL(row.totalRevenue)} · Despesa ${fmtBRL(row.expenses)}`}
          >
            {row.label.split("/")[0]}
          </div>
        );
      })}
    </div>
  );
}

export function RoomScatter({ rows }: { rows: RoomPerformanceRow[] }) {
  if (!rows.length) return <EmptyChart text="Sem dados por quarto no período." height={300} />;
  const data = rows.map((row) => ({ ...row, x: row.soldNights, y: row.revenue, z: Math.max(30, row.adr) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 16, right: 20, bottom: 18, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" dataKey="x" name="Noites vendidas" tick={{ fontSize: 9 }} label={{ value: "Noites vendidas", position: "insideBottom", offset: -12, fontSize: 10 }} />
        <YAxis type="number" dataKey="y" name="Receita" width={58} tick={{ fontSize: 9 }} tickFormatter={compactCurrency} />
        <ZAxis type="number" dataKey="z" range={[60, 420]} name="ADR" />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<RoomTooltip />} />
        <Scatter name="Quartos" data={data} fill="#7c3aed" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function RoomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as RoomPerformanceRow;
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-[10px] shadow-xl">
      <strong>Quarto {row.room} · {row.roomType}</strong>
      <p>Receita: {fmtBRL(row.revenue)}</p>
      <p>Noites: {row.soldNights.toFixed(0)} · Ocupação: {row.occupancyRate.toFixed(1)}%</p>
      <p>ADR: {fmtBRL(row.adr)} · Hóspedes: {row.guests}</p>
    </div>
  );
}

export function GenderAgeProfile({
  genderRows,
  ageRows,
  childrenRows,
  averageChildren,
}: {
  genderRows: NumericRow[];
  ageRows: NumericRow[];
  childrenRows: NumericRow[];
  averageChildren: number;
}) {
  const men = genderRows.find((row) => row.name === "Homens")?.value ?? 0;
  const women = genderRows.find((row) => row.name === "Mulheres")?.value ?? 0;
  const known = men + women;
  const menShare = known > 0 ? (men / known) * 100 : 50;
  const womenShare = known > 0 ? (women / known) * 100 : 50;
  const id = useId().replace(/:/g, "");
  return (
    <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="rounded-lg border border-border/70 bg-muted/20 p-2 text-center">
        <svg viewBox="0 0 100 150" className="mx-auto h-28 w-24" role="img" aria-label="Perfil por sexo">
          <defs>
            <clipPath id={`${id}-body`}>
              <circle cx="50" cy="24" r="17" />
              <path d="M28 49 Q50 38 72 49 L82 104 H65 L62 145 H38 L35 104 H18 Z" />
            </clipPath>
          </defs>
          <rect x="0" y="0" width={menShare} height="150" fill="#2563eb" clipPath={`url(#${id}-body)`} />
          <rect x={menShare} y="0" width={womenShare} height="150" fill="#a855f7" clipPath={`url(#${id}-body)`} />
          <circle cx="50" cy="24" r="17" fill="none" stroke="var(--border)" />
          <path d="M28 49 Q50 38 72 49 L82 104 H65 L62 145 H38 L35 104 H18 Z" fill="none" stroke="var(--border)" />
        </svg>
        {known > 0 ? (
          <div className="grid grid-cols-2 gap-1 text-[9px] font-bold">
            <span className="text-blue-600">Homens {menShare.toFixed(0)}%</span>
            <span className="text-purple-600">Mulheres {womenShare.toFixed(0)}%</span>
          </div>
        ) : <p className="text-[9px] text-muted-foreground">Sexo não preenchido</p>}
        <p className="mt-2 text-[9px] text-muted-foreground">
          Filhos: {childrenSummary(childrenRows)} · média {averageChildren.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">Faixa etária</p>
        <HorizontalBars rows={ageRows} valueLabel="Hóspedes" compact maxRows={6} />
      </div>
    </div>
  );
}

function childrenSummary(rows: NumericRow[]) {
  const withChildren = rows.find((row) => row.name === "Com filhos")?.value ?? 0;
  const totalKnown = rows.filter((row) => row.name !== "Não informado").reduce((sum, row) => sum + row.value, 0);
  return totalKnown > 0 ? `${((withChildren / totalKnown) * 100).toFixed(0)}% com filhos` : "não informado";
}

export function BrazilStateMap({ rows, compact = false }: { rows: StateRow[]; compact?: boolean }) {
  if (!rows.length) return <EmptyChart text="Cadastre estado e cidade dos hóspedes para preencher o mapa." height={compact ? 220 : 320} />;
  const map = Brazil as { viewBox: string; locations: { id: string; name: string; path: string }[] };
  const rowByState = new Map(rows.map((row) => [row.code.toLowerCase(), row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <div className={`grid overflow-hidden rounded-lg border border-border/70 bg-muted/15 ${compact ? "grid-cols-[minmax(0,1fr)_120px]" : "md:grid-cols-[minmax(0,1fr)_170px]"}`}>
      <svg viewBox={map.viewBox} className={compact ? "h-[215px] w-full p-2" : "h-[300px] w-full p-3"} role="img" aria-label="Mapa do Brasil com receita por estado">
        {map.locations.map((location) => {
          const row = rowByState.get(location.id.toLowerCase());
          const intensity = row ? 0.25 + (row.revenue / maxRevenue) * 0.75 : 0.06;
          return (
            <path key={location.id} d={location.path} fill={row ? "#0f766e" : "var(--muted-foreground)"} fillOpacity={intensity} stroke="var(--card)" strokeWidth="1.6">
              <title>{row ? `${row.code}: ${row.value} hóspede(s) · ${fmtBRL(row.revenue)}` : `${location.name}: sem dados`}</title>
            </path>
          );
        })}
      </svg>
      <div className="border-l border-border/70 bg-card/80 p-2">
        <strong className="text-[9px] uppercase">Estados líderes</strong>
        <div className="mt-2 space-y-2">
          {rows.slice(0, compact ? 5 : 7).map((row, index) => (
            <div key={row.code} className="text-[8px]">
              <div className="flex justify-between gap-1"><b>{index + 1}. {row.code}</b><span>{row.value}</span></div>
              <div className="mt-0.5 h-1 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }} /></div>
              <div className="text-right font-semibold text-primary">{compactCurrency(row.revenue)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ text, height }: { text: string; height: number }) {
  return <div className="grid place-items-center rounded-lg border border-dashed border-border px-4 text-center text-[10px] text-muted-foreground" style={{ minHeight: height }}>{text}</div>;
}

function compactCurrency(value: number) {
  return `R$ ${new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0)}`;
}
function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}
