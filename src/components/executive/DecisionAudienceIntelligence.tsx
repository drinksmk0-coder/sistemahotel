import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, BedDouble, BadgeDollarSign, CircleCheck, Ban, UserX, Waypoints } from "lucide-react";
import { useCurrentCompany, useRooms } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/format";

type Crossing = {
  canal: string;
  quarto_numero: number;
  tipo_quarto: string | null;
  faixa_diaria: string;
  perfil_hospede_provavel: string;
  status: string;
  reservas: number;
  hospedes: number;
  diarias: number;
  receita_bruta: number;
  recebido: number;
  saldo: number;
  adr: number;
  antecedencia_media: number;
  taxa_cancelamento: number;
  taxa_no_show: number;
};

export function DecisionAudienceIntelligence() {
  const company = useCurrentCompany();
  const { data: rooms = [] } = useRooms();
  const crossings = useQuery({
    queryKey: ["bi-dashboard-cruzamentos", company.data?.id],
    enabled: !!company.data?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bi_dashboard_cruzamentos")
        .select("canal,quarto_numero,tipo_quarto,faixa_diaria,perfil_hospede_provavel,status,reservas,hospedes,diarias,receita_bruta,recebido,saldo,adr,antecedencia_media,taxa_cancelamento,taxa_no_show")
        .eq("company_id", company.data!.id);
      if (error) throw error;
      return (data ?? []) as Crossing[];
    },
  });

  const data = useMemo(() => {
    const profile = new Map<string, number>();
    const room = new Map<string, number>();
    const band = new Map<string, number>();
    const channel = new Map<string, number>();
    const status = { ok: 0, cancelado: 0, noShow: 0 };
    let revenue = 0;
    let reservations = 0;

    for (const row of crossings.data ?? []) {
      const n = Number(row.reservas || 0);
      reservations += n;
      revenue += Number(row.receita_bruta || 0);
      profile.set(row.perfil_hospede_provavel || "Não informado", (profile.get(row.perfil_hospede_provavel || "Não informado") ?? 0) + n);
      room.set(String(row.quarto_numero ?? "Sem quarto"), (room.get(String(row.quarto_numero ?? "Sem quarto")) ?? 0) + n);
      band.set(row.faixa_diaria || "Não informado", (band.get(row.faixa_diaria || "Não informado") ?? 0) + n);
      channel.set(row.canal || "Não informado", (channel.get(row.canal || "Não informado") ?? 0) + n);
      const s = String(row.status || "").toLowerCase();
      if (s.includes("cancel")) status.cancelado += n;
      else if (Number(row.taxa_no_show || 0) > 0 || s.includes("no_show") || s.includes("no-show")) status.noShow += n;
      else status.ok += n;
    }

    const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]) as [string, number][];
    const segments = [...(crossings.data ?? [])]
      .filter((r) => Number(r.reservas) > 0)
      .sort((a, b) => Number(b.reservas) - Number(a.reservas));
    const topSegment = segments[0];
    const cancelHotspot = [...segments]
      .filter((r) => Number(r.reservas) >= 2)
      .sort((a, b) => Number(b.taxa_cancelamento) - Number(a.taxa_cancelamento))[0];

    return {
      profile: sort(profile),
      room: sort(room).slice(0, 10),
      band: sort(band),
      channel: sort(channel),
      status,
      reservations,
      revenue,
      topSegment,
      cancelHotspot,
    };
  }, [crossings.data]);

  const total = data.reservations || 1;
  const topProfile = data.profile[0];
  const topRoom = data.room[0];
  const avgTicket = data.revenue / total;

  return (
    <section className="space-y-3" data-decision-audience>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-pine-dark">Quem compra e o que vende</h2>
          <p className="text-xs text-muted-foreground">Agora calculado pela camada analítica em modelo estrela: canal × quarto × perfil × faixa de diária × status.</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">Fonte BI · modelo estrela</span>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icon={<Users />} label="Maior público" value={topProfile ? topProfile[0] : "Sem dados"} detail={topProfile ? `${((topProfile[1] / total) * 100).toFixed(0)}% das reservas` : ""} />
        <Kpi icon={<BedDouble />} label="Quarto mais reservado" value={topRoom ? topRoom[0] : "Sem dados"} detail={topRoom ? `${topRoom[1]} reservas` : ""} />
        <Kpi icon={<BadgeDollarSign />} label="Ticket médio/reserva" value={fmtBRL(avgTicket)} detail={`${rooms.length} quartos cadastrados`} />
        <Kpi icon={<CircleCheck />} label="Reservas OK" value={String(data.status.ok)} detail={`${((data.status.ok / total) * 100).toFixed(0)}% do total`} />
      </div>

      {(data.topSegment || data.cancelHotspot) && (
        <div className="grid gap-2 lg:grid-cols-2">
          {data.topSegment && (
            <Insight
              icon={<Waypoints />}
              title="Segmento mais frequente"
              text={`${data.topSegment.canal} · ${data.topSegment.perfil_hospede_provavel} · ${data.topSegment.faixa_diaria}`}
              detail={`${data.topSegment.reservas} reservas · ADR ${fmtBRL(Number(data.topSegment.adr || 0))}`}
            />
          )}
          {data.cancelHotspot && (
            <Insight
              icon={<Ban />}
              title="Ponto para investigar"
              text={`${data.cancelHotspot.canal} · ${data.cancelHotspot.perfil_hospede_provavel} · quarto ${data.cancelHotspot.quarto_numero}`}
              detail={`${Number(data.cancelHotspot.taxa_cancelamento || 0).toFixed(1)}% de cancelamento nesse cruzamento`}
            />
          )}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="Perfil provável do hóspede" rows={data.profile} total={total} />
        <Bars title="Reservas por quarto" rows={data.room} total={total} />
        <Bars title="Faixa da diária" rows={data.band} total={total} />
        <Bars title="Canal de venda" rows={data.channel} total={total} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Status icon={<CircleCheck />} label="OK" value={data.status.ok} />
        <Status icon={<Ban />} label="Canceladas" value={data.status.cancelado} />
        <Status icon={<UserX />} label="No-show" value={data.status.noShow} />
      </div>

      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Como ler:</strong> “Casal provável” e “Família/Grupo” são segmentos comerciais inferidos pela quantidade de hóspedes, não relações pessoais confirmadas. Os cruzamentos vêm de uma única camada BI, evitando que cada gráfico aplique uma regra diferente.
      </div>
    </section>
  );
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span></div><p className="mt-2 text-lg font-extrabold text-pine-dark">{value}</p><p className="text-[10px] text-muted-foreground">{detail}</p></article>;
}
function Insight({ icon, title, text, detail }: { icon: React.ReactNode; title: string; text: string; detail: string }) {
  return <article className="rounded-xl border border-primary/20 bg-primary/5 p-3"><div className="flex items-center gap-2 text-primary">{icon}<strong className="text-xs">{title}</strong></div><p className="mt-1 text-sm font-extrabold text-pine-dark">{text}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></article>;
}
function Bars({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return <article className="rounded-xl border border-border bg-card p-3"><h3 className="text-sm font-bold text-pine-dark">{title}</h3><div className="mt-3 space-y-2">{rows.slice(0, 10).map(([name, value]) => <div key={name}><div className="mb-1 flex justify-between text-[11px]"><span>{name}</span><strong>{value} · {((value / total) * 100).toFixed(0)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (value / max) * 100)}%` }} /></div></div>)}</div></article>;
}
function Status({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card p-3 text-center"><span className="mx-auto flex w-fit text-primary">{icon}</span><p className="mt-1 text-xl font-extrabold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}
