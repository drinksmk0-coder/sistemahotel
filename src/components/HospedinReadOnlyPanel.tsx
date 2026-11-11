import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

const OPTIONS = [
  { id: "bookings", label: "Reservas" },
  { id: "rooms", label: "Quartos" },
  { id: "room_types", label: "Categorias" },
  { id: "channels", label: "Canais de origem" },
] as const;
type Resource = typeof OPTIONS[number]["id"];
type Item = { id?: string; attributes?: Record<string, unknown> };
const label = (item: Item): string => {
  const a = item.attributes ?? {};
  return String(a.name ?? a.title ?? a.guest_name ?? a.code ?? item.id ?? "Registro");
};

export function HospedinReadOnlyPanel() {
  const company = useCurrentCompany();
  const [resource, setResource] = useState<Resource>("bookings");
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("Aguardando consulta.");
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(false);

  async function consult(nextResource: Resource) {
    const companyId = company.data?.id;
    if (!companyId) { setStatus("Selecione um hotel."); return; }
    setResource(nextResource); setBusy(true); setItems([]); setHasNext(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      if (!jwt) throw new Error("Faça login para consultar o Hospedin.");
      const response = await fetch(`/api/hospedin?resource=${encodeURIComponent(nextResource)}`, {
        headers: { Authorization: `Bearer ${jwt}`, "x-company-id": companyId }, cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao consultar Hospedin.");
      setItems(Array.isArray(result.data) ? result.data : []);
      setHasNext(Boolean(result.hasNextPage));
      setStatus("Consulta realizada. Dados externos, sem gravação no PMS.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível consultar Hospedin.");
    } finally { setBusy(false); }
  }

  return <section className="mb-5 rounded-2xl border border-pine/30 bg-card p-5">
    <h3 className="text-lg font-bold text-pine-dark">Hospedin · consulta de dados</h3>
    <p className="mt-1 text-sm text-muted-foreground">Apenas leitura pela API v3. Nenhuma reserva, pagamento ou check-in é alterado no Hospedin ou importado automaticamente para o banco do PMS. Credenciais ficam no servidor.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {OPTIONS.map(option => <button key={option.id} type="button" disabled={busy} onClick={() => void consult(option.id)} className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${option.id === resource ? "border-pine bg-sage-bg/60" : "border-border"}`}>{option.label}</button>)}
    </div>
    <p role="status" className="mt-3 text-sm text-muted-foreground">{busy ? "Consultando Hospedin..." : status}</p>
    {items.length > 0 && <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-3">ID Hospedin</th><th className="p-3">Referência</th></tr></thead>
      <tbody>{items.map((item, i) => <tr key={item.id ?? i} className="border-b"><td className="p-3 font-mono text-xs">{item.id ?? "-"}</td><td className="p-3">{label(item)}</td></tr>)}</tbody></table>
    </div>}
    {hasNext && <p className="mt-2 text-xs text-amber-700">Exibindo apenas a primeira página (até 20 registros). Paginação completa ainda não implementada.</p>}
  </section>;
}
