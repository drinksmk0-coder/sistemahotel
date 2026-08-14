import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

const n = (value: unknown) => Number(value || 0);
const norm = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const today = () => new Date().toISOString().slice(0, 10);

function composition(reservation: any) {
  const adults = n(reservation.adultos);
  const children = Math.max(n(reservation.criancas), n(reservation.quantidade_filhos));

  if (adults === 1 && children === 0) return "Individual";
  if (adults === 2 && children === 0) return "Dupla de adultos";
  if (adults === 1 && children > 0) return "Adulto com criança(s)";
  if (adults === 2 && children > 0) return "Dupla de adultos com criança(s)";
  if (adults >= 3 && children === 0) return "Grupo de adultos";
  if (adults >= 3 && children > 0) return "Grupo/Família com criança(s)";

  const guests = n(reservation.hospedes);
  if (guests === 1 && children === 0) return "Individual";
  if (guests === 2 && children === 0) return "Dupla de hóspedes";
  return "Composição não informada";
}

export function GuestCompositionSummary() {
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const end = today();
  const start = `${end.slice(0, 7)}-01`;

  const query = useQuery({
    queryKey: ["guest-composition-summary", companyId, start, end],
    enabled: !!companyId,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("bi_reservas_decisao")
        .select("adultos,criancas,quantidade_filhos,hospedes,status,cancelado_flag,no_show_flag,checkin,checkout")
        .eq("company_id", companyId)
        .lte("checkin", end)
        .gt("checkout", start)
        .limit(10000);
      if (result.error) throw result.error;
      return result.data || [];
    },
  });

  const rows = useMemo(() => {
    const valid = (query.data || []).filter((reservation: any) => {
      const status = norm(reservation.status);
      return n(reservation.cancelado_flag) !== 1 && n(reservation.no_show_flag) !== 1 && !status.includes("cancel") && !status.includes("no show");
    });
    const counts = new Map<string, number>();
    valid.forEach((reservation: any) => {
      const key = composition(reservation);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [query.data]);

  if (company.isLoading || query.isLoading) return null;
  if (query.error || rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <section className="mx-2 mb-8 rounded-2xl border border-border bg-card p-3 shadow-sm sm:mx-3">
      <div className="mb-3">
        <h2 className="text-sm font-extrabold text-pine-dark">Composição real da hospedagem</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Mês atual · calculado por número de adultos e crianças; não presume estado civil.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.name} className="rounded-xl border border-border/70 bg-background/50 p-3">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-bold text-foreground">{row.name}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
