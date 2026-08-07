import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkin-print")({ ssr: false, component: CheckinPrint });

type InviteData = {
  status: string; submitted_at: string | null; form_data: Record<string, string>;
  signature_data_url: string | null; company_name: string; company_document?: string | null;
  company_email?: string | null; company_phone?: string | null; company_address?: string | null;
  company_city?: string | null; company_state?: string | null; reservation_code: string;
  room: number; checkin: string; checkout: string; adults: number; children: number;
};

type Companion = { nome?: string; tipo?: string; parentesco?: string; cpf?: string; data_nascimento?: string; telefone?: string; email?: string; sexo?: string };

const LABELS: Array<[string, string]> = [
  ["nome_completo", "Nome completo"], ["telefone", "Telefone / WhatsApp"], ["email", "E-mail"],
  ["nascimento", "Data de nascimento"], ["genero", "Gênero"], ["estado_civil", "Estado civil"],
  ["profissao", "Profissão"], ["nacionalidade", "Nacionalidade"], ["raca_cor", "Raça/Cor"],
  ["tipo_documento", "Tipo de documento"], ["numero_documento", "Número do documento"],
  ["endereco", "Endereço"], ["numero", "Número"], ["complemento", "Complemento"],
  ["bairro", "Bairro"], ["cep", "CEP"], ["cidade", "Cidade"], ["estado", "Estado"],
  ["pais", "País"], ["ultimo_destino", "Último destino"], ["proximo_destino", "Próximo destino"],
  ["motivo_viagem", "Motivo da viagem"], ["transporte", "Meio de transporte"],
  ["placa_veiculo", "Placa do veículo"], ["deficiencia", "Pessoa com deficiência"],
  ["tipo_deficiencia", "Tipo de deficiência"],
];

function CheckinPrint() {
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError("Link de impressão incompleto."); setLoading(false); return; }
    (supabase as any).rpc("get_guest_checkin", { p_token: token })
      .then(({ data: payload, error: requestError }: { data: InviteData | null; error: Error | null }) => {
        if (requestError || !payload) { setError("Não foi possível carregar a ficha assinada."); return; }
        setData(payload);
      }).finally(() => setLoading(false));
  }, [token]);

  const companions = useMemo(() => parseCompanions(data?.form_data?.acompanhantes_detalhes), [data]);
  if (loading) return <main className="grid min-h-screen place-items-center bg-neutral-100"><Loader2 className="h-8 w-8 animate-spin" /></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-neutral-100 p-6"><div className="rounded-lg border bg-white p-6 text-center text-sm text-red-700">{error}</div></main>;

  const form = data.form_data ?? {};
  const totalGuests = Math.max(1, 1 + companions.length, Number(data.adults ?? 1) + Number(data.children ?? 0));

  return <main className="min-h-screen bg-neutral-100 py-5 print:bg-white print:py-0">
    <style>{`
      @page { size: A4 portrait; margin: 0; }
      @media print {
        html, body { width: 210mm; min-height: 297mm; margin: 0 !important; background: #fff !important; color: #000 !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
        .print-sheet {
          box-shadow: none !important;
          box-sizing: border-box !important;
          display: flex !important;
          flex-direction: column !important;
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          padding: 6mm !important;
          color: #000 !important;
          background: #fff !important;
        }
        .print-sheet, .print-sheet * { color: #000 !important; }
        .print-sheet header { border-color: #000 !important; }
        .print-sheet h2 { border-color: #000 !important; }
        .holder-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 2mm !important; }
        .print-section { margin-top: 4mm !important; }
        .print-sheet h2 { margin-bottom: 2mm !important; padding-bottom: 1.5mm !important; font-size: 12px !important; }
        .print-row > p { margin-bottom: 1mm !important; font-size: 8px !important; }
        .print-row > div { min-height: 8mm !important; padding: 1.5mm 2mm !important; font-size: 10px !important; line-height: 1.25 !important; }
        .print-row > div, .companion-card { border-color: #000 !important; background: #fff !important; }
        .signature-block > div > div { border-color: #000 !important; }
        .signature-block { margin-top: auto !important; padding-top: 7mm !important; }
        .print-section, .print-row, .signature-block, .companion-card { break-inside: avoid; page-break-inside: avoid; }
        img { filter: grayscale(1) contrast(1.2); }
      }
    `}</style>

    <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end px-3">
      <button type="button" onClick={() => window.print()} className="btn-primary flex items-center gap-2"><Printer className="h-4 w-4" /> Imprimir ou salvar em PDF</button>
    </div>

    <article className="print-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[10mm] py-[9mm] text-black shadow-xl">
      <header className="print-section border-b-2 border-black pb-3">
        <div className="grid grid-cols-[68px_1fr] gap-3">
          <img src="/hotel-real-logo.png" alt={data.company_name} className="h-[60px] w-[68px] object-contain grayscale contrast-125" />
          <div><h1 className="text-center text-[17px] font-black uppercase tracking-tight text-black">Ficha Nacional de Registro de Hóspedes</h1>
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-[8.5px] leading-4 text-black">
              <div><strong>{data.company_name}</strong>{data.company_document ? ` · CNPJ ${data.company_document}` : ""}</div><div className="text-right">Reserva {data.reservation_code}</div>
              <div>{data.company_email || "—"} · {data.company_phone || "—"}</div><div className="text-right">{[data.company_address, data.company_city, data.company_state].filter(Boolean).join(", ")}</div>
            </div>
          </div>
        </div>
      </header>

      <Section title="Hospedagem"><div className="grid grid-cols-5 gap-1.5">
        <Field label="UH" value={String(data.room)} /><Field label="Total de hóspedes" value={String(totalGuests)} />
        <Field label="Entrada" value={formatDate(data.checkin)} /><Field label="Saída" value={formatDate(data.checkout)} />
        <Field label="Recebida em" value={formatDateTime(data.submitted_at)} />
      </div></Section>

      <Section title="Hóspede titular"><div className="holder-grid grid grid-cols-4 gap-1.5">{LABELS.map(([key, label]) => <Field key={key} label={label} value={displayValue(key, form[key])} className={wideField(key)} />)}</div></Section>

      <Section title={`Acompanhantes (${companions.length})`}>
        {companions.length === 0 ? <div className="rounded border border-black px-2 py-2 text-[9px] text-black">Reserva somente para o titular.</div> : <div className="space-y-2">{companions.map((guest, index) => <div key={`${guest.nome}-${index}`} className="companion-card grid grid-cols-4 gap-1.5 rounded border border-black bg-white p-2 text-black">
          <Field label={`Acompanhante ${index + 1}`} value={guest.nome || "Não informado"} className="col-span-2" />
          <Field label="Tipo / parentesco" value={[guest.tipo, guest.parentesco].filter(Boolean).join(" · ") || "Não informado"} />
          <Field label="Documento" value={guest.cpf || "Não informado"} /><Field label="Nascimento" value={formatDate(guest.data_nascimento)} />
          <Field label="Telefone" value={guest.telefone || "Não informado"} /><Field label="E-mail" value={guest.email || "Não informado"} /><Field label="Gênero" value={guest.sexo || "Não informado"} />
        </div>)}</div>}
      </Section>

      <section className="signature-block mt-4 grid grid-cols-[1fr_78mm] items-end gap-5 text-black">
        <div className="text-[8px] leading-4 text-black"><p><strong>Declaração:</strong> o hóspede declara que as informações fornecidas são verdadeiras e autoriza seu tratamento para reserva, hospedagem, identificação, segurança, FNRH e cumprimento de obrigações legais.</p><p className="mt-1"><strong>Proteção de dados:</strong> acesso restrito a pessoas autorizadas e tratamento conforme a LGPD e as finalidades informadas.</p></div>
        <div><div className="flex h-[28mm] items-center justify-center border-b border-black">{data.signature_data_url ? <img src={data.signature_data_url} alt="Assinatura do hóspede" className="max-h-[23mm] max-w-[72mm] object-contain grayscale contrast-125" /> : <span className="text-[9px] text-black">Assinatura não encontrada</span>}</div><p className="pt-1 text-center text-[9px] font-semibold text-black">Assinatura do hóspede titular</p></div>
      </section>
    </article>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="print-section mt-3 text-black"><h2 className="mb-1.5 border-b border-black pb-1 text-[11px] font-black uppercase tracking-wide text-black">{title}</h2>{children}</section>; }
function Field({ label, value, className = "" }: { label: string; value: string; className?: string }) { return <div className={`print-row ${className}`}><p className="mb-0.5 text-[7px] font-black uppercase tracking-wide text-black">{label}</p><div className="min-h-[21px] rounded border border-black bg-white px-1.5 py-1 text-[8.5px] font-medium leading-3.5 text-black">{value || "Não informado"}</div></div>; }
function parseCompanions(value?: string): Companion[] { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function displayValue(key: string, value?: string) { if (!value?.trim()) return "Não informado"; if (key === "nascimento") return formatDate(value); if (key === "deficiencia") return value === "nao" ? "Não" : value === "sim" ? "Sim" : "Prefere não informar"; return value; }
function wideField(key: string) { if (["nome_completo", "endereco", "email", "complemento"].includes(key)) return "col-span-2"; return ""; }
function formatDate(value?: string | null) { if (!value) return "Não informado"; const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : value; }
function formatDateTime(value?: string | null) { if (!value) return "Não informado"; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
