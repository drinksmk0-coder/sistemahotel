import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Droplets, MessageCircle, Printer, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppLayout";
import { useRole, useSession } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useClients, useCurrentCompany } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorio-consumo-agua")({
  component: WaterConsumptionReportPage,
});

type WaterReport = {
  company: {
    name?: string | null;
    document?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  period: { start: string; end: string };
  summary: {
    lines: number;
    quantity: number;
    total: number;
    paid: number;
    pending: number;
    guests: number;
    rooms: number;
  };
  rows: Array<{
    id: string;
    date: string;
    room: number;
    reservation_id?: string | null;
    client_id?: string | null;
    guest_name: string;
    item: string;
    quantity: number;
    unit_value: number;
    total: number;
    paid: number;
    pending: number;
    status?: string | null;
    payment?: string | null;
    notes?: string | null;
  }>;
  unquantified_notes: Array<{
    reservation_id: string;
    room: number;
    guest_name: string;
    checkin: string;
    checkout: string;
    note: string;
  }>;
  generated_at: string;
  document_type: string;
};

function firstDayOfMonth() {
  return `${todayISO().slice(0, 8)}01`;
}

function WaterConsumptionReportPage() {
  const { user } = useSession();
  const { data: role, isLoading: roleLoading } = useRole(user);
  const company = useCurrentCompany();
  const { data: clients = [] } = useClients();
  const [start, setStart] = useState(firstDayOfMonth);
  const [end, setEnd] = useState(todayISO);
  const [clientId, setClientId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientDocument, setRecipientDocument] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notes, setNotes] = useState("");

  const query = useQuery({
    queryKey: ["water-consumption-report", company.data?.id, start, end, clientId],
    enabled: Boolean(company.data?.id && role === "dono" && start && end && end >= start),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("water_consumption_report", {
        p_company_id: company.data!.id,
        p_start: start,
        p_end: end,
        p_client_id: clientId || null,
      });
      if (error) throw error;
      return data as WaterReport;
    },
  });

  const report = query.data;
  const selectedClient = clients.find((client) => client.id === clientId);
  const summaryText = useMemo(() => {
    if (!report) return "";
    return [
      `RELATÓRIO DE CONSUMO DE ÁGUA — ${report.company.name ?? "Hotel"}`,
      `Período: ${fmtDate(start)} a ${fmtDate(end)}`,
      recipientName ? `Empresa pagadora: ${recipientName}` : "",
      selectedClient ? `Hóspede: ${selectedClient.nome}` : "",
      `Quantidade total: ${Number(report.summary.quantity).toLocaleString("pt-BR")} unidade(s)`,
      `Valor total: ${fmtBRL(report.summary.total)}`,
      `Valor pendente: ${fmtBRL(report.summary.pending)}`,
      "Documento gerencial de consumo. Não é nota fiscal.",
    ]
      .filter(Boolean)
      .join("\n");
  }, [end, recipientName, report, selectedClient, start]);

  if (roleLoading || !role) {
    return <div className="card-surface p-6 text-sm text-muted-foreground">Carregando permissões…</div>;
  }
  if (role !== "dono") return <Navigate to="/painel" />;

  return (
    <div className="space-y-3 pb-8">
      <div className="print:hidden">
        <PageHeader
          title="Relatório de consumo de água"
          subtitle="Espelho de cobrança por hóspede, quarto e período. Não substitui nota fiscal."
          action={
            <div className="flex flex-wrap gap-2">
              <Link to="/vendas" className="btn-ghost">Ver vendas</Link>
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-2"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-2"
                disabled={!report}
                onClick={() => {
                  if (!summaryText) return;
                  window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, "_blank", "noopener");
                }}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2"
                disabled={!report}
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" /> Imprimir / salvar PDF
              </button>
            </div>
          }
        />

        <section className="card-surface grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-muted-foreground">
            Data inicial
            <input className="field mt-1" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Data final
            <input className="field mt-1" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground md:col-span-2">
            Hóspede — opcional
            <select className="field mt-1" value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Todos os hóspedes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.nome}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Empresa pagadora
            <input className="field mt-1" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nome da empresa" />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            CNPJ / documento
            <input className="field mt-1" value={recipientDocument} onChange={(event) => setRecipientDocument(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground md:col-span-2">
            E-mail da empresa
            <input className="field mt-1" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground md:col-span-4">
            Observações do relatório
            <textarea className="field mt-1 min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: consumo autorizado pela empresa durante a hospedagem." />
          </label>
        </section>
      </div>

      {query.isLoading ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">Consolidando o consumo de água…</div>
      ) : query.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Não foi possível gerar o relatório: {query.error instanceof Error ? query.error.message : "erro desconhecido"}
        </div>
      ) : report ? (
        <article className="mx-auto max-w-[210mm] rounded-xl border border-border bg-white p-5 text-slate-950 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex items-start justify-between gap-4 border-b border-slate-300 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Droplets className="h-7 w-7" />
                <h1 className="text-xl font-black uppercase">Relatório de consumo de água</h1>
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Espelho de consumo — não é nota fiscal
              </p>
            </div>
            <div className="text-right text-xs leading-5">
              <strong className="block text-sm">{report.company.name}</strong>
              {report.company.document && <span className="block">CNPJ: {report.company.document}</span>}
              <span className="block">{[report.company.city, report.company.state].filter(Boolean).join(" - ")}</span>
            </div>
          </header>

          <section className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-slate-300 p-3">
              <strong className="block uppercase text-slate-500">Período</strong>
              {fmtDate(report.period.start)} a {fmtDate(report.period.end)}
            </div>
            <div className="rounded-lg border border-slate-300 p-3">
              <strong className="block uppercase text-slate-500">Emitido para</strong>
              {recipientName || selectedClient?.nome || "Não informado"}
              {recipientDocument && <span className="block">Documento: {recipientDocument}</span>}
              {recipientEmail && <span className="block">E-mail: {recipientEmail}</span>}
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Summary label="Unidades" value={Number(report.summary.quantity).toLocaleString("pt-BR")} />
            <Summary label="Hóspedes" value={String(report.summary.guests)} />
            <Summary label="Total" value={fmtBRL(report.summary.total)} />
            <Summary label="Pendente" value={fmtBRL(report.summary.pending)} />
          </section>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-slate-400 bg-slate-100 text-left uppercase">
                  <th className="p-2">Data</th>
                  <th className="p-2">Hóspede</th>
                  <th className="p-2">UH</th>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-right">Qtd.</th>
                  <th className="p-2 text-right">Unitário</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhuma venda de água registrada no período.</td></tr>
                ) : report.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-200">
                    <td className="p-2">{fmtDate(row.date)}</td>
                    <td className="p-2 font-semibold">{row.guest_name}</td>
                    <td className="p-2">{row.room}</td>
                    <td className="p-2">{row.item}</td>
                    <td className="p-2 text-right">{row.quantity}</td>
                    <td className="p-2 text-right">{fmtBRL(row.unit_value)}</td>
                    <td className="p-2 text-right font-bold">{fmtBRL(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-500 font-black">
                  <td colSpan={6} className="p-2 text-right uppercase">Total geral</td>
                  <td className="p-2 text-right">{fmtBRL(report.summary.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {report.unquantified_notes.length > 0 && (
            <section className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs">
              <h2 className="font-black uppercase">Observações que mencionam água sem lançamento de venda</h2>
              <p className="mt-1 text-amber-900">
                Estes registros não entram no total porque não possuem quantidade e preço confirmados.
              </p>
              <ul className="mt-2 space-y-1">
                {report.unquantified_notes.map((item) => (
                  <li key={item.reservation_id}>
                    UH {item.room} · {item.guest_name} · {item.note}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {notes && (
            <section className="mt-4 rounded-lg border border-slate-300 p-3 text-xs">
              <strong className="block uppercase text-slate-500">Observações</strong>
              <p className="mt-1 whitespace-pre-line">{notes}</p>
            </section>
          )}

          <footer className="mt-8 grid grid-cols-2 gap-10 text-center text-xs">
            <div className="border-t border-slate-500 pt-2">Responsável pelo hotel</div>
            <div className="border-t border-slate-500 pt-2">Responsável da empresa / recebedor</div>
          </footer>
        </article>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-300 p-3">
      <span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span>
      <strong className="mt-1 block text-base">{value}</strong>
    </div>
  );
}
