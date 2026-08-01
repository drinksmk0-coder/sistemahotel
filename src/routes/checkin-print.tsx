import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkin-print")({
  ssr: false,
  component: CheckinPrint,
});

type InviteData = {
  status: string;
  submitted_at: string | null;
  form_data: Record<string, string>;
  signature_data_url: string | null;
  company_name: string;
  company_document?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  company_address?: string | null;
  company_city?: string | null;
  company_state?: string | null;
  reservation_code: string;
  room: number;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  guest?: Record<string, string | null>;
};

type Companion = {
  nome?: string;
  tipo?: string;
  parentesco?: string;
  cpf?: string;
  data_nascimento?: string;
  telefone?: string;
  email?: string;
  sexo?: string;
};

const LABELS: Array<[string, string]> = [
  ["nome_completo", "Nome completo"],
  ["telefone", "Telefone / WhatsApp"],
  ["email", "E-mail"],
  ["nascimento", "Data de nascimento"],
  ["genero", "Gênero"],
  ["profissao", "Profissão"],
  ["nacionalidade", "Nacionalidade"],
  ["tipo_documento", "Tipo de documento"],
  ["numero_documento", "Número do documento"],
  ["endereco", "Endereço"],
  ["numero", "Número"],
  ["complemento", "Complemento"],
  ["bairro", "Bairro"],
  ["cep", "CEP"],
  ["cidade", "Cidade"],
  ["estado", "Estado"],
  ["pais", "País"],
  ["ultimo_destino", "Último destino"],
  ["proximo_destino", "Próximo destino"],
  ["motivo_viagem", "Motivo da viagem"],
  ["transporte", "Meio de transporte"],
  ["deficiencia", "Pessoa com deficiência"],
  ["tipo_deficiencia", "Tipo de deficiência"],
];

function CheckinPrint() {
  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Link de impressão incompleto.");
      setLoading(false);
      return;
    }
    (supabase as any)
      .rpc("get_guest_checkin", { p_token: token })
      .then(({ data: payload, error: requestError }: { data: InviteData | null; error: Error | null }) => {
        if (requestError || !payload) {
          setError("Não foi possível carregar a ficha assinada.");
          return;
        }
        setData(payload);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const companions = useMemo(() => parseCompanions(data?.form_data?.acompanhantes_detalhes), [data]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-neutral-100"><Loader2 className="h-8 w-8 animate-spin" /></main>;
  }
  if (error || !data) {
    return <main className="grid min-h-screen place-items-center bg-neutral-100 p-6"><div className="rounded-lg border bg-white p-6 text-center text-sm text-red-700">{error}</div></main>;
  }

  const form = data.form_data ?? {};
  const totalGuests = Math.max(1, 1 + companions.length, Number(data.adults ?? 1) + Number(data.children ?? 0));

  return (
    <main className="min-h-screen bg-neutral-100 py-5 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-sheet { box-shadow: none !important; width: auto !important; min-height: auto !important; margin: 0 !important; padding: 0 !important; }
          .print-section, .print-row, .signature-block, .companion-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end px-3">
        <button type="button" onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer className="h-4 w-4" /> Imprimir FNRH em A4
        </button>
      </div>

      <article className="print-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[10mm] py-[9mm] text-[#1f2f46] shadow-xl">
        <header className="print-section border-b-2 border-[#243b5a] pb-3">
          <div className="grid grid-cols-[72px_1fr] gap-3">
            <img src="/hotel-real-logo.png" alt={data.company_name} className="h-[64px] w-[72px] object-contain" />
            <div>
              <h1 className="text-center text-[18px] font-black uppercase tracking-tight">Ficha Nacional de Registro de Hóspedes</h1>
              <div className="mt-2 grid grid-cols-2 gap-x-4 text-[9px] leading-4">
                <div><strong>{data.company_name}</strong>{data.company_document ? ` · CNPJ ${data.company_document}` : ""}</div>
                <div className="text-right">Reserva {data.reservation_code}</div>
                <div>{data.company_email || "hotelreal@gmail.com"} · {data.company_phone || "+55 (35) 98800-1372"}</div>
                <div className="text-right">{[data.company_address || "Rua Capitão Pinto, 70, Centro", data.company_city || "Cruzília", data.company_state || "MG"].filter(Boolean).join(", ")}</div>
              </div>
            </div>
          </div>
        </header>

        <Section title="Hospedagem">
          <div className="grid grid-cols-5 gap-1.5">
            <Field label="UH" value={String(data.room)} />
            <Field label="Total de hóspedes" value={String(totalGuests)} />
            <Field label="Entrada" value={formatDate(data.checkin)} />
            <Field label="Saída" value={formatDate(data.checkout)} />
            <Field label="Ficha recebida em" value={formatDateTime(data.submitted_at)} />
          </div>
        </Section>

        <Section title="Hóspede titular">
          <div className="grid grid-cols-4 gap-1.5">
            {LABELS.map(([key, label]) => (
              <Field key={key} label={label} value={displayValue(key, form[key])} className={wideField(key)} />
            ))}
          </div>
        </Section>

        <Section title={`Acompanhantes (${companions.length})`}>
          {companions.length === 0 ? (
            <div className="rounded border border-[#9aa8b8] px-2 py-2 text-[9px]">Reserva somente para o titular.</div>
          ) : (
            <div className="space-y-2">
              {companions.map((guest, index) => (
                <div key={`${guest.nome}-${index}`} className="companion-card grid grid-cols-4 gap-1.5 rounded border border-[#9aa8b8] p-2">
                  <Field label={`Acompanhante ${index + 1}`} value={guest.nome || "Não informado"} className="col-span-2" />
                  <Field label="Tipo / parentesco" value={[guest.tipo, guest.parentesco].filter(Boolean).join(" · ") || "Não informado"} />
                  <Field label="Documento" value={guest.cpf || "Não informado"} />
                  <Field label="Nascimento" value={formatDate(guest.data_nascimento)} />
                  <Field label="Telefone" value={guest.telefone || "Não informado"} />
                  <Field label="E-mail" value={guest.email || "Não informado"} />
                  <Field label="Sexo" value={guest.sexo || "Não informado"} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <section className="signature-block mt-4 grid grid-cols-[1fr_82mm] items-end gap-5">
          <div className="text-[8px] leading-4 text-neutral-600">
            <p><strong>Consentimento e finalidade:</strong> dados utilizados para hospedagem, identificação, segurança, FNRH e cumprimento de obrigações legais, com acesso restrito conforme a LGPD.</p>
            <p className="mt-1">Status da ficha: <strong>{data.status}</strong></p>
          </div>
          <div>
            <div className="flex h-[34mm] items-center justify-center border-b border-[#243b5a]">
              {data.signature_data_url ? (
                <img src={data.signature_data_url} alt="Assinatura do hóspede" className="max-h-[28mm] max-w-[76mm] object-contain" />
              ) : (
                <span className="text-[9px] text-neutral-500">Assinatura não encontrada</span>
              )}
            </div>
            <p className="pt-1 text-center text-[9px] font-semibold">Assinatura do hóspede titular</p>
          </div>
        </section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="print-section mt-3"><h2 className="mb-1.5 border-b border-[#cbd4df] pb-1 text-[11px] font-black uppercase tracking-wide">{title}</h2>{children}</section>;
}

function Field({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className={`print-row ${className}`}><p className="mb-0.5 text-[7px] font-bold uppercase tracking-wide text-[#52657b]">{label}</p><div className="min-h-[22px] rounded border border-[#9aa8b8] px-1.5 py-1 text-[9px] leading-3.5">{value || "Não informado"}</div></div>;
}

function parseCompanions(value?: string): Companion[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function displayValue(key: string, value?: string) {
  if (!value?.trim()) return "Não informado";
  if (key === "nascimento") return formatDate(value);
  if (key === "deficiencia") return value === "nao" ? "Não" : value;
  return value;
}

function wideField(key: string) {
  if (["nome_completo", "endereco"].includes(key)) return "col-span-2";
  if (["email", "complemento"].includes(key)) return "col-span-2";
  return "";
}

function formatDate(value?: string | null) {
  if (!value) return "Não informado";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
