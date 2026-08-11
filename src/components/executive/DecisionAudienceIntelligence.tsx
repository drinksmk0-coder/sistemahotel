import { useMemo } from "react";
import { Users, BedDouble, BadgeDollarSign, CircleCheck, Ban, UserX } from "lucide-react";
import { useReservations, useRooms } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

function profileOf(adults: number, totalGuests: number) {
  if (totalGuests >= 3 || adults >= 3) return "Família / Grupo";
  if (adults === 2 || totalGuests === 2) return "Casal provável";
  return "Individual";
}

function priceBand(value: number) {
  if (value < 100) return "Até R$ 99";
  if (value < 150) return "R$ 100–149";
  if (value < 200) return "R$ 150–199";
  if (value < 300) return "R$ 200–299";
  return "R$ 300+";
}

export function DecisionAudienceIntelligence() {
  const { data: reservations = [] } = useReservations();
  const { data: rooms = [] } = useRooms();

  const data = useMemo(() => {
    const profile = new Map<string, number>();
    const room = new Map<string, number>();
    const band = new Map<string, number>();
    const adults = new Map<string, number>();
    const status = { ok: 0, cancelado: 0, noShow: 0 };

    for (const r of reservations) {
      const raw = r as any;
      const adultCount = Math.max(1, Number(raw.adultos ?? raw.guests_adults ?? 1));
      const childCount = Math.max(0, Number(raw.criancas ?? raw.guests_children ?? 0));
      const guestCount = Math.max(adultCount + childCount, Number(raw.hospedes ?? raw.guests ?? adultCount));
      profile.set(profileOf(adultCount, guestCount), (profile.get(profileOf(adultCount, guestCount)) ?? 0) + 1);
      adults.set(`${adultCount} adulto${adultCount === 1 ? "" : "s"}`, (adults.get(`${adultCount} adulto${adultCount === 1 ? "" : "s"}`) ?? 0) + 1);
      const roomLabel = String(raw.quarto ?? raw.room_number ?? raw.room_id ?? "Sem quarto");
      room.set(roomLabel, (room.get(roomLabel) ?? 0) + 1);
      const total = Number(raw.valor_total ?? 0);
      band.set(priceBand(total), (band.get(priceBand(total)) ?? 0) + 1);
      const s = String(raw.status ?? "").toLowerCase();
      if (s.includes("cancel")) status.cancelado += 1;
      else if (s.includes("no_show") || s.includes("no-show") || s.includes("noshow")) status.noShow += 1;
      else status.ok += 1;
    }

    const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { profile: sort(profile), room: sort(room).slice(0, 10), band: sort(band), adults: sort(adults), status };
  }, [reservations]);

  const total = reservations.length || 1;
  const topProfile = data.profile[0];
  const topRoom = data.room[0];
  const avgTicket = reservations.reduce((s, r: any) => s + Number(r.valor_total ?? 0), 0) / total;

  return (
    <section className="space-y-3" data-decision-audience>
      <div>
        <h2 className="text-lg font-extrabold text-pine-dark">Quem compra e o que vende</h2>
        <p className="text-xs text-muted-foreground">Leitura comercial das reservas. Perfis são probabilísticos quando a reserva não informa a relação entre hóspedes.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icon={<Users />} label="Maior público" value={topProfile ? topProfile[0] : "Sem dados"} detail={topProfile ? `${((topProfile[1] / total) * 100).toFixed(0)}% das reservas` : ""} />
        <Kpi icon={<BedDouble />} label="Quarto mais reservado" value={topRoom ? topRoom[0] : "Sem dados"} detail={topRoom ? `${topRoom[1]} reservas` : ""} />
        <Kpi icon={<BadgeDollarSign />} label="Ticket médio/reserva" value={fmtBRL(avgTicket)} detail={`${rooms.length} quartos cadastrados`} />
        <Kpi icon={<CircleCheck />} label="Reservas OK" value={String(data.status.ok)} detail={`${((data.status.ok / total) * 100).toFixed(0)}% do total`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="Perfil provável do hóspede" rows={data.profile} total={total} />
        <Bars title="Reservas por quarto" rows={data.room} total={total} />
        <Bars title="Faixa de preço por reserva" rows={data.band} total={total} />
        <Bars title="Adultos por reserva" rows={data.adults} total={total} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Status icon={<CircleCheck />} label="OK" value={data.status.ok} />
        <Status icon={<Ban />} label="Canceladas" value={data.status.cancelado} />
        <Status icon={<UserX />} label="No-show" value={data.status.noShow} />
      </div>
      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Regra de leitura:</strong> 1 adulto = Individual; 2 hóspedes = Casal provável; 3+ hóspedes = Família/Grupo. A classificação é uma hipótese comercial, não um dado pessoal confirmado. Cruze com quarto, preço, canal, cancelamento e permanência antes de decidir investimento ou campanha.
      </div>
    </section>
  );
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span></div><p className="mt-2 text-lg font-extrabold text-pine-dark">{value}</p><p className="text-[10px] text-muted-foreground">{detail}</p></article>;
}
function Bars({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return <article className="rounded-xl border border-border bg-card p-3"><h3 className="text-sm font-bold text-pine-dark">{title}</h3><div className="mt-3 space-y-2">{rows.slice(0, 10).map(([name, value]) => <div key={name}><div className="mb-1 flex justify-between text-[11px]"><span>{name}</span><strong>{value} · {((value / total) * 100).toFixed(0)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (value / Math.max(...rows.map((r) => r[1]), 1)) * 100)}%` }} /></div></div>)}</div></article>;
}
function Status({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card p-3 text-center"><span className="mx-auto flex w-fit text-primary">{icon}</span><p className="mt-1 text-xl font-extrabold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}
