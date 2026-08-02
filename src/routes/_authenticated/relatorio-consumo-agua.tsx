import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Droplets, MessageCircle, Plus, Printer, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useClients, useCurrentCompany, type Client } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorio-consumo-agua")({
  component: WaterConsumptionReportPage,
});

type CorporateAccount = {
  id: string;
  company_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type CorporateClient = Client & {
  ativo?: boolean;
  corporate_account_id?: string | null;
};

type WaterReport = {
  company: {
    name?: string | null;
    document?: string | null;
    city?: string | null;
    state?: string | null;
  };
  recipient_company: CorporateAccount;
  period: { start: string; end: string };
  summary: {
    lines: number;
    quantity: number;
    total: number;
    paid: number;
    pending: number;
    employees: number;
    rooms: number;
  };
  rows: Array<{
    id: string;
    date: string;
    room: number;
    employee_name: string;
    item: string;
    quantity: number;
    unit_value: number;
    total: number;
  }>;
  unquantified_notes: Array<{
    reservation_id: string;
    room: number;
    employee_name: string;
    note: string;
  }>;
};

function firstDayOfMonth() {
  return `${todayISO().slice(0, 8)}01`;
}

function WaterConsumptionReportPage() {
  const { user } = useSession();
  const { data: role, isLoading: roleLoading } = useRole(user);
  const company = useCurrentCompany();
  const queryClient = useQueryClient();
  const { data: rawClients = [] } = useClients();
  const clients = rawClients as CorporateClient[];
  const [start, setStart] = useState(firstDayOfMonth);
  const [end, setEnd] = useState(todayISO);
  const [corporateAccountId, setCorporateAccountId] = useState("");
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [employeesModalOpen, setEmployeesModalOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const accounts = useQuery({
    queryKey: ["corporate-accounts", company.data?.id],
    enabled: Boolean(company.data?.id && role === "dono"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("corporate_accounts")
        .select("id, company_id, name, document, email, phone, active")
        .eq("company_id", company.data!.id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CorporateAccount[];
    },
  });

  useEffect(() => {
    const list = accounts.data ?? [];
    if (list.length > 0 && !list.some((account) => account.id === corporateAccountId)) {
      setCorporateAccountId(list[0].id);
    }
  }, [accounts.data, corporateAccountId]);

  const selectedAccount = accounts.data?.find((account) => account.id === corporateAccountId);
  const linkedEmployees = clients.filter(
    (client) => client.corporate_account_id === corporateAccountId && client.ativo !== false,
  );

  const reportQuery = useQuery({
    queryKey: ["water-consumption-report", company.data?.id, start, end, corporateAccountId],
    enabled: Boolean(
      company.data?.id && role === "dono" && corporateAccountId && start && end && end >= start,
    ),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("water_consumption_report", {
        p_company_id: company.data!.id,
        p_start: start,
        p_end: end,
        p_corporate_account_id: corporateAccountId,
      });
      if (error) throw error;
      return data as WaterReport;
    },
  });

  const report = reportQuery.data;
  const summaryText = useMemo(() => {
    if (!report) return "";
    return [
      `RELATÓRIO DE CONSUMO DE ÁGUA — ${report.company.name ?? "Hotel"}`,
      `Empresa: ${report.recipient_company.name}`,
      `Período: ${fmtDate(start)} a ${fmtDate(end)}`,
      `Funcionários: ${report.summary.employees}`,
      `Quantidade total: ${Number(report.summary.quantity).toLocaleString("pt-BR")} unidade(s)`,
      `Valor total: ${fmtBRL(report.summary.total)}`,
      `Valor pendente: ${fmtBRL(report.summary.pending)}`,
      "Documento gerencial de consumo. Não é nota fiscal.",
    ].join("\n");
  }, [end, report, start]);

  if (roleLoading || !role) {
    return <div className="card-surface p-6 text-sm text-muted-foreground">Carregando permissões…</div>;
  }
  if (role !== "dono") return <Navigate to="/painel" />;

  return (
    <div className="space-y-3 pb-8">
      <div className="print:hidden">
        <PageHeader
          title="Relatório empresarial de água"
          subtitle="Mostra somente funcionários vinculados à empresa selecionada. Hóspedes comuns nunca entram no relatório."
          action={
            <div className="flex flex-wrap gap-2">
              <Link to="/vendas" className="btn-ghost">Ver vendas</Link>
              <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={() => void reportQuery.refetch()} disabled={reportQuery.isFetching || !corporateAccountId}>
                <RefreshCw className={`h-4 w-4 ${reportQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar
              </button>
              <button type="button" className="btn-ghost inline-flex items-center gap-2" disabled={!report} onClick={() => summaryText && window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, "_blank", "noopener")}>
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!report} onClick={() => window.print()}>
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
            Empresa obrigatória
            <select className="field mt-1" value={corporateAccountId} onChange={(event) => setCorporateAccountId(event.target.value)}>
              <option value="">Selecione uma empresa cadastrada</option>
              {(accounts.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-4">
            <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={() => setCompanyModalOpen(true)}>
              <Plus className="h-4 w-4" /> Cadastrar empresa
            </button>
            <button type="button" className="btn-ghost inline-flex items-center gap-2" disabled={!selectedAccount} onClick={() => setEmployeesModalOpen(true)}>
              <Users className="h-4 w-4" /> Vincular funcionários
            </button>
            {selectedAccount && <span className="self-center text-xs text-muted-foreground">{linkedEmployees.length} funcionário(s) vinculado(s) à {selectedAccount.name}</span>}
          </div>
          <label className="text-xs font-semibold text-muted-foreground md:col-span-4">
            Observações do relatório
            <textarea className="field mt-1 min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: consumo autorizado pela empresa durante a hospedagem." />
          </label>
        </section>
      </div>

      {accounts.isLoading ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">Carregando empresas…</div>
      ) : (accounts.data ?? []).length === 0 ? (
        <EmptyState text="Cadastre uma empresa e vincule os funcionários antes de emitir o relatório." />
      ) : reportQuery.isLoading ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">Consolidando somente o consumo dos funcionários vinculados…</div>
      ) : reportQuery.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Não foi possível gerar o relatório: {reportQuery.error instanceof Error ? reportQuery.error.message : "erro desconhecido"}</div>
      ) : report ? (
        <ReportDocument report={report} notes={notes} />
      ) : null}

      {companyModalOpen && company.data?.id && (
        <CompanyForm companyId={company.data.id} onClose={() => setCompanyModalOpen(false)} onCreated={(account) => {
          void queryClient.invalidateQueries({ queryKey: ["corporate-accounts", company.data?.id] });
          setCorporateAccountId(account.id);
          setCompanyModalOpen(false);
        }} />
      )}
      {employeesModalOpen && selectedAccount && company.data?.id && (
        <EmployeeLinkForm account={selectedAccount} companyId={company.data.id} clients={clients} onClose={() => setEmployeesModalOpen(false)} onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["clients"] });
          void reportQuery.refetch();
          setEmployeesModalOpen(false);
        }} />
      )}
    </div>
  );
}

function ReportDocument({ report, notes }: { report: WaterReport; notes: string }) {
  return (
    <article className="mx-auto max-w-[210mm] rounded-xl border border-border bg-white p-5 text-slate-950 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b border-slate-300 pb-4">
        <div>
          <div className="flex items-center gap-2"><Droplets className="h-7 w-7" /><h1 className="text-xl font-black uppercase">Relatório empresarial de consumo de água</h1></div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Somente funcionários vinculados — não é nota fiscal</p>
        </div>
        <div className="text-right text-xs leading-5"><strong className="block text-sm">{report.company.name}</strong>{report.company.document && <span className="block">CNPJ: {report.company.document}</span>}<span className="block">{[report.company.city, report.company.state].filter(Boolean).join(" - ")}</span></div>
      </header>
      <section className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-slate-300 p-3"><strong className="block uppercase text-slate-500">Período</strong>{fmtDate(report.period.start)} a {fmtDate(report.period.end)}</div>
        <div className="rounded-lg border border-slate-300 p-3"><strong className="block uppercase text-slate-500">Empresa responsável</strong>{report.recipient_company.name}{report.recipient_company.document && <span className="block">Documento: {report.recipient_company.document}</span>}{report.recipient_company.email && <span className="block">E-mail: {report.recipient_company.email}</span>}</div>
      </section>
      <section className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Summary label="Unidades" value={Number(report.summary.quantity).toLocaleString("pt-BR")} />
        <Summary label="Funcionários" value={String(report.summary.employees)} />
        <Summary label="Total" value={fmtBRL(report.summary.total)} />
        <Summary label="Pendente" value={fmtBRL(report.summary.pending)} />
      </section>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead><tr className="border-y border-slate-400 bg-slate-100 text-left uppercase"><th className="p-2">Data</th><th className="p-2">Funcionário</th><th className="p-2">UH</th><th className="p-2">Item</th><th className="p-2 text-right">Qtd.</th><th className="p-2 text-right">Unitário</th><th className="p-2 text-right">Total</th></tr></thead>
          <tbody>{report.rows.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhum consumo dos funcionários desta empresa no período.</td></tr> : report.rows.map((row) => <tr key={row.id} className="border-b border-slate-200"><td className="p-2">{fmtDate(row.date)}</td><td className="p-2 font-semibold">{row.employee_name}</td><td className="p-2">{row.room}</td><td className="p-2">{row.item}</td><td className="p-2 text-right">{row.quantity}</td><td className="p-2 text-right">{fmtBRL(row.unit_value)}</td><td className="p-2 text-right font-bold">{fmtBRL(row.total)}</td></tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-slate-500 font-black"><td colSpan={6} className="p-2 text-right uppercase">Total da empresa</td><td className="p-2 text-right">{fmtBRL(report.summary.total)}</td></tr></tfoot>
        </table>
      </div>
      {report.unquantified_notes.length > 0 && <section className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs"><h2 className="font-black uppercase">Menções de água sem lançamento de venda</h2><ul className="mt-2 space-y-1">{report.unquantified_notes.map((item) => <li key={item.reservation_id}>UH {item.room} · {item.employee_name} · {item.note}</li>)}</ul></section>}
      {notes && <section className="mt-4 rounded-lg border border-slate-300 p-3 text-xs"><strong className="block uppercase text-slate-500">Observações</strong><p className="mt-1 whitespace-pre-line">{notes}</p></section>}
      <footer className="mt-8 grid grid-cols-2 gap-10 text-center text-xs"><div className="border-t border-slate-500 pt-2">Responsável pelo hotel</div><div className="border-t border-slate-500 pt-2">Responsável da empresa</div></footer>
    </article>
  );
}

function CompanyForm({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: (account: CorporateAccount) => void }) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).from("corporate_accounts").insert({ company_id: companyId, name: name.trim(), document: document.trim() || null, email: email.trim() || null }).select("id, company_id, name, document, email, phone, active").single();
      if (error) throw error;
      return data as CorporateAccount;
    },
    onSuccess: onCreated,
    onError: (error) => toast.error(error.message),
  });
  return <Modal open onClose={onClose} title="Cadastrar empresa"><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (name.trim().length < 2) return toast.error("Informe o nome da empresa"); mutation.mutate(); }}><Field label="Nome da empresa"><input className="field" value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="CNPJ / documento"><input className="field" value={document} onChange={(event) => setDocument(event.target.value)} /></Field><Field label="E-mail"><input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field><div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? "Salvando…" : "Cadastrar"}</button></div></form></Modal>;
}

function EmployeeLinkForm({ account, companyId, clients, onClose, onSaved }: { account: CorporateAccount; companyId: string; clients: CorporateClient[]; onClose: () => void; onSaved: () => void }) {
  const [selectedIds, setSelectedIds] = useState(() => clients.filter((client) => client.corporate_account_id === account.id).map((client) => client.id));
  const activeClients = clients.filter((client) => client.ativo !== false);
  const mutation = useMutation({
    mutationFn: async () => {
      const previousIds = clients.filter((client) => client.corporate_account_id === account.id).map((client) => client.id);
      const removedIds = previousIds.filter((id) => !selectedIds.includes(id));
      if (removedIds.length > 0) {
        const { error } = await (supabase as any).from("clients").update({ corporate_account_id: null }).eq("company_id", companyId).in("id", removedIds);
        if (error) throw error;
      }
      if (selectedIds.length > 0) {
        const { error } = await (supabase as any).from("clients").update({ corporate_account_id: account.id }).eq("company_id", companyId).in("id", selectedIds);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Funcionários vinculados à empresa"); onSaved(); },
    onError: (error) => toast.error(error.message),
  });
  return <Modal open onClose={onClose} title={`Funcionários da ${account.name}`}><div className="space-y-3"><p className="text-sm text-muted-foreground">Somente os clientes marcados abaixo poderão aparecer no relatório desta empresa.</p><div className="max-h-[55vh] space-y-1 overflow-y-auto rounded-lg border border-border p-2">{activeClients.map((client) => <label key={client.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedIds.includes(client.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...new Set([...ids, client.id])] : ids.filter((id) => id !== client.id))} /><span>{client.nome}</span>{client.corporate_account_id && client.corporate_account_id !== account.id && <span className="ml-auto text-[10px] text-amber-700">vinculado a outra empresa</span>}</label>)}</div><div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Salvando…" : "Salvar vínculos"}</button></div></div></Modal>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-300 p-3"><span className="block text-[10px] font-bold uppercase text-slate-500">{label}</span><strong className="mt-1 block text-base">{value}</strong></div>;
}
