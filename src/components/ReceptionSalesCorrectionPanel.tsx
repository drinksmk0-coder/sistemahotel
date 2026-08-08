import { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate } from "@/lib/format";

type SaleRow = {
  id: string;
  quarto: number | null;
  data: string;
  item: string;
  qtd: number;
  valor_unit: number;
  total: number;
  comprador_nome: string | null;
  status: string | null;
  created_at: string;
};

type RoomRow = { numero: number };

export function ReceptionSalesCorrectionPanel({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [room, setRoom] = useState<number | "">("");
  const [total, setTotal] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [salesResult, roomsResult] = await Promise.all([
      (supabase as any)
        .from("sales")
        .select("id,quarto,data,item,qtd,valor_unit,total,comprador_nome,status,created_at")
        .eq("company_id", companyId)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(80),
      (supabase as any)
        .from("rooms")
        .select("numero")
        .eq("company_id", companyId)
        .order("numero"),
    ]);
    if (salesResult.error) throw salesResult.error;
    if (roomsResult.error) throw roomsResult.error;
    setRows((salesResult.data ?? []) as SaleRow[]);
    setRooms((roomsResult.data ?? []) as RoomRow[]);
  }

  useEffect(() => {
    if (!open) return;
    void load().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as vendas."),
    );
  }, [open, companyId]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return rows;
    return rows.filter((row) =>
      [row.item, row.comprador_nome ?? "", row.quarto == null ? "" : String(row.quarto)]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [rows, search]);

  function startEdit(row: SaleRow) {
    setEditing(row);
    setRoom(row.quarto ?? "");
    setTotal(Number(row.total));
  }

  async function save() {
    if (!editing) return;
    const nextTotal = Number(total);
    const nextRoom = room === "" ? null : Number(room);
    if (!Number.isFinite(nextTotal) || nextTotal < 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (nextRoom != null && (!Number.isFinite(nextRoom) || nextRoom <= 0)) {
      toast.error("Informe um quarto válido.");
      return;
    }
    const quantity = Math.max(1, Number(editing.qtd || 1));
    const unit = Math.round((nextTotal / quantity) * 100) / 100;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("sales")
        .update({ quarto: nextRoom, valor_unit: unit, total: nextTotal })
        .eq("id", editing.id)
        .eq("company_id", companyId);
      if (error) throw error;
      toast.success("Venda corrigida. Somente quarto e valor foram alterados.");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível corrigir a venda.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-[70] inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-card px-3 py-2 text-sm font-bold text-primary shadow-xl md:bottom-5"
        title="Corrigir quarto ou valor de uma venda"
      >
        <Pencil className="h-4 w-4" /> Corrigir venda
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" onMouseDown={() => setOpen(false)}>
          <section className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="font-serif text-xl font-bold">Corrigir venda</h2>
                <p className="mt-1 text-sm text-muted-foreground">A recepção pode corrigir somente o quarto e o valor. Exclusão e demais alterações permanecem bloqueadas.</p>
              </div>
              <button type="button" className="rounded-lg p-2 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-5 w-5" /></button>
            </header>

            <div className="p-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar hóspede, item ou quarto"
                className="mb-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <div className="max-h-[58vh] overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="sticky top-0 bg-muted/95 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="p-2.5">Data</th><th className="p-2.5">Hóspede/Comprador</th><th className="p-2.5">Item</th><th className="p-2.5">Quarto</th><th className="p-2.5">Valor</th><th className="p-2.5 text-right">Ação</th></tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="p-2.5">{fmtDate(row.data)}</td>
                        <td className="p-2.5 font-semibold">{row.comprador_nome || "Não informado"}</td>
                        <td className="p-2.5">{row.qtd}× {row.item}</td>
                        <td className="p-2.5">{row.quarto ?? "—"}</td>
                        <td className="p-2.5 font-semibold">{fmtBRL(row.total)}</td>
                        <td className="p-2.5 text-right"><button type="button" className="btn-ghost py-1 text-xs" onClick={() => startEdit(row)}>Corrigir</button></td>
                      </tr>
                    ))}
                    {!visible.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma venda encontrada.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3" onMouseDown={() => !saving && setEditing(null)}>
          <section className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold">{editing.item}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{editing.comprador_nome || "Comprador não informado"} · {fmtDate(editing.data)}</p>
            <label className="mb-3 block text-sm font-semibold">Quarto
              <select value={room} onChange={(event) => setRoom(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal">
                <option value="">Sem quarto</option>
                {rooms.map((entry) => <option key={entry.numero} value={entry.numero}>{entry.numero}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Valor total
              <input type="number" min="0" step="0.01" value={total} onChange={(event) => setTotal(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 font-normal" />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">Quantidade original: {editing.qtd}. O valor unitário será recalculado automaticamente.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar correção"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
