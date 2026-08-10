import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearFnrhPrintSession, loadFnrhPrintSession, type FnrhPrintData } from "@/lib/fnrh-print-session";

export const Route = createFileRoute("/checkin-print")({ ssr: false, component: CheckinPrint });

type InviteData = FnrhPrintData;

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

const TRAVEL_REASON_MAP: Record<string, string> = {
  lazer: "ferias",
  férias: "ferias",
  ferias: "ferias",
  negócios: "negocios",
  negocios: "negocios",
  evento: "congresso",
  congresso: "congresso",
  estudo: "estudos",
  estudos: "estudos",
  saúde: "saude",
  saude: "saude",
};

const TRANSPORT_MAP: Record<string, string> = {
  automóvel: "automovel",
  automovel: "automovel",
  avião: "aviao",
  aviao: "aviao",
  "navio/barco": "navio",
  navio: "navio",
  ônibus: "onibus",
  onibus: "onibus",
  trem: "trem",
};

function CheckinPrint() {
  const [source] = useState(() => {
    if (typeof window === "undefined") return { local: false, token: null as string | null };
    const params = new URLSearchParams(window.location.search);
    return {
      local: params.get("local") === "1",
      token: params.get("token"),
    };
  });
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (source.local) {
      const localData = loadFnrhPrintSession();
      if (!localData) {
        setError("A cópia temporária desta FNRH não está mais disponível. A recepção pode imprimir a ficha pelo acesso autenticado.");
        setLoading(false);
        return;
      }

      setData(localData);
      setLoading(false);
      window.history.replaceState(window.history.state, "", "/checkin-print");

      const clearOnLeave = () => clearFnrhPrintSession();
      window.addEventListener("pagehide", clearOnLeave, { once: true });
      return () => window.removeEventListener("pagehide", clearOnLeave);
    }

    if (!source.token) {
      setError("Link de impressão incompleto.");
      setLoading(false);
      return;
    }

    (supabase as any)
      .rpc("get_guest_checkin", { p_token: source.token })
      .then(({ data: payload, error: requestError }: { data: InviteData | null; error: Error | null }) => {
        if (requestError || !payload) {
          setError("Não foi possível carregar a ficha assinada. Use o acesso autenticado da recepção.");
          return;
        }
        setData(payload);
      })
      .finally(() => setLoading(false));
  }, [source]);

  const companions = useMemo(() => parseCompanions(data?.form_data?.acompanhantes_detalhes), [data]);

  function printDocument() {
    window.print();
    if (source.local) {
      clearFnrhPrintSession();
      setData(null);
      setError("A cópia temporária foi encerrada após a tentativa de impressão. A recepção pode reimprimir pela área autenticada.");
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-100">
        <Loader2 className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-100 p-6">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center text-sm text-red-700">{error}</div>
      </main>
    );
  }

  const form = data.form_data ?? {};
  const expectedCompanions = Math.max(0, Number(data.adults ?? 1) + Number(data.children ?? 0) - 1);
  const companionCount = Math.max(companions.length, expectedCompanions, Number(form.acompanhantes || 0));
  const normalizedDocumentType = normalize(form.tipo_documento);
  const cpf = form.cpf || (normalizedDocumentType === "cpf" ? form.numero_documento : "");
  const identityNumber = normalizedDocumentType !== "cpf" ? form.numero_documento || "" : form.numero_identidade || "";
  const identityType = normalizedDocumentType !== "cpf" ? form.tipo_documento || "" : form.tipo_identidade || "";
  const issuer = form.orgao_expedidor || form.orgao_emissor || "";
  const travelReason = TRAVEL_REASON_MAP[normalize(form.motivo_viagem)] || "outro";
  const transport = TRANSPORT_MAP[normalize(form.transporte)] || "outro";
  const address = [form.endereco, form.numero, form.complemento, form.bairro].filter((item) => item?.trim()).join(", ");
  const companyAddress = [data.company_address, data.company_city, data.company_state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#eef1f5] py-5 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { width: 210mm; height: 297mm; margin: 0 !important; background: #fff !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .fnrh-sheet {
            box-shadow: none !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
          }
        }
        .fnrh-sheet {
          box-sizing: border-box;
          width: 210mm;
          min-height: 297mm;
          padding: 8mm 10mm 9mm;
          background: #fff;
          color: #243b5a;
          font-family: Arial, Helvetica, sans-serif;
        }
        .fnrh-title {
          margin: 0 0 5mm;
          text-align: center;
          color: #243b5a;
          font-size: 6.5mm;
          line-height: 1.08;
          font-weight: 800;
          letter-spacing: -0.15mm;
        }
        .fnrh-hotel-card {
          display: grid;
          grid-template-columns: 25mm 1fr;
          gap: 4mm;
          align-items: center;
          min-height: 29mm;
          padding: 3.2mm;
          border-radius: 4mm;
          background: #e9eff7;
        }
        .fnrh-logo-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 23mm;
          height: 23mm;
          border-radius: 3mm;
          background: #fff;
        }
        .fnrh-logo-box img { width: 20mm; height: 18mm; object-fit: contain; }
        .fnrh-company-name { margin: 0 0 1.4mm; font-size: 4.6mm; line-height: 1; font-weight: 800; }
        .fnrh-company-line { margin: 0.7mm 0 0; font-size: 3.25mm; line-height: 1.25; }
        .fnrh-company-document { margin-top: 1.7mm; font-weight: 700; }
        .fnrh-section { margin-top: 5.5mm; }
        .fnrh-section-heading {
          display: flex;
          align-items: center;
          gap: 4mm;
          margin-bottom: 3.2mm;
        }
        .fnrh-section-heading h2 {
          flex: 0 0 auto;
          margin: 0;
          color: #243b5a;
          font-size: 4.8mm;
          line-height: 1;
          font-weight: 800;
        }
        .fnrh-section-heading::after {
          content: "";
          height: 0.35mm;
          flex: 1;
          background: #e2e8f0;
        }
        .fnrh-stay-grid {
          display: grid;
          grid-template-columns: 2.05fr 1fr 1fr 0.48fr 1fr 0.48fr;
          gap: 1.4mm;
        }
        .fnrh-guest-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 2.4mm 1.4mm;
        }
        .fnrh-field { min-width: 0; }
        .fnrh-label {
          display: block;
          margin-bottom: 1.05mm;
          color: #243b5a;
          font-size: 2.8mm;
          line-height: 1.05;
          font-weight: 700;
        }
        .fnrh-box {
          display: flex;
          align-items: center;
          min-height: 8.6mm;
          box-sizing: border-box;
          padding: 1.25mm 2mm;
          overflow: hidden;
          border: 0.35mm solid #8091a8;
          border-radius: 1.7mm;
          color: #243b5a;
          background: #fff;
          font-size: 3.15mm;
          line-height: 1.15;
          font-weight: 500;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .fnrh-subheading {
          margin: 0.5mm 0 1.2mm;
          font-size: 3.3mm;
          line-height: 1;
          font-weight: 800;
        }
        .fnrh-options-title {
          margin: 3.6mm 0 2.5mm;
          font-size: 3.25mm;
          line-height: 1;
          font-weight: 800;
        }
        .fnrh-options {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 2mm;
          align-items: center;
        }
        .fnrh-option {
          display: flex;
          align-items: center;
          gap: 2.2mm;
          min-width: 0;
          color: #5b6f89;
          font-size: 3.15mm;
          line-height: 1.05;
          white-space: nowrap;
        }
        .fnrh-checkbox {
          position: relative;
          flex: 0 0 auto;
          width: 5.2mm;
          height: 5.2mm;
          box-sizing: border-box;
          border: 0.35mm solid #8091a8;
          border-radius: 0.8mm;
          background: #fff;
        }
        .fnrh-checkbox.checked::after {
          content: "✓";
          position: absolute;
          left: 50%;
          top: 48%;
          transform: translate(-50%, -50%);
          color: #243b5a;
          font-size: 4.2mm;
          font-weight: 900;
        }
        .fnrh-signature {
          display: flex;
          justify-content: flex-end;
          margin-top: 14mm;
        }
        .fnrh-signature-box { width: 98mm; text-align: center; }
        .fnrh-signature-line {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          height: 20mm;
          border-bottom: 0.35mm solid #8091a8;
        }
        .fnrh-signature-line img {
          max-width: 88mm;
          max-height: 18mm;
          object-fit: contain;
        }
        .fnrh-signature-label {
          margin-top: 2.2mm;
          color: #5b6f89;
          font-size: 4.1mm;
          line-height: 1;
          font-weight: 400;
        }
      `}</style>

      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-end px-3">
        <button type="button" onClick={printDocument} className="btn-primary flex items-center gap-2">
          <Printer className="h-4 w-4" /> Imprimir ou salvar em PDF
        </button>
      </div>

      <article className="fnrh-sheet mx-auto shadow-xl">
        <h1 className="fnrh-title">FICHA NACIONAL DE REGISTRO DE HÓSPEDES</h1>

        <header className="fnrh-hotel-card">
          <div className="fnrh-logo-box">
            <img src="/hotel-real-logo.png" alt={data.company_name} />
          </div>
          <div>
            <p className="fnrh-company-name">{data.company_name}</p>
            <p className="fnrh-company-line">{[data.company_email, data.company_phone].filter(Boolean).join(" / ")}</p>
            <p className="fnrh-company-line">{companyAddress}</p>
            <p className="fnrh-company-line fnrh-company-document">{data.company_document ? `CNPJ:${data.company_document}` : ""}</p>
          </div>
        </header>

        <section className="fnrh-section">
          <div className="fnrh-section-heading"><h2>Informações da hospedagem</h2></div>
          <div className="fnrh-stay-grid">
            <Field label="UH Nº (Local)" value={String(data.room ?? "")} />
            <Field label="NºAcompanhantes" value={String(companionCount)} />
            <Field label="Data de entrada" value={formatDate(data.checkin)} />
            <Field label="Hora" value={form.hora_entrada || formatHour(data.checkin)} />
            <Field label="Data de saída" value={formatDate(data.checkout)} />
            <Field label="Hora" value={form.hora_saida || formatHour(data.checkout)} />
          </div>
        </section>

        <section className="fnrh-section">
          <div className="fnrh-section-heading"><h2>Informações do hóspede</h2></div>
          <div className="fnrh-guest-grid">
            <Field label="Nome Completo" value={form.nome_completo} span={12} />
            <Field label="E-mail" value={form.email} span={9} />
            <Field label="Nascimento" value={formatDate(form.nascimento)} span={3} />
            <Field label="Profissão" value={form.profissao} span={4} />
            <Field label="Nacionalidade" value={form.nacionalidade} span={4} />
            <Field label="Sexo" value={form.genero} span={1} />
            <Field label="CPF" value={cpf} span={3} />

            <div style={{ gridColumn: "span 12" }}>
              <p className="fnrh-subheading">Documento de Identidade</p>
              <div className="fnrh-guest-grid">
                <Field label="Número" value={identityNumber} span={4} />
                <Field label="Tipo" value={identityType} span={4} />
                <Field label="Órgão Expedidor" value={issuer} span={4} />
              </div>
            </div>

            <Field label="Endereço" value={address} span={9} />
            <Field label="Fone" value={form.telefone} span={3} />
            <Field label="CEP" value={form.cep} span={2} />
            <Field label="Cidade" value={form.cidade} span={4} />
            <Field label="Estado" value={form.estado} span={3} />
            <Field label="País" value={form.pais} span={3} />
            <Field label="Último destino (Cidade, País)" value={form.ultimo_destino} span={6} />
            <Field label="Próximo destino (Cidade, País)" value={form.proximo_destino} span={6} />
          </div>

          <p className="fnrh-options-title">Motivo da Viagem</p>
          <div className="fnrh-options">
            <Option label="Férias" checked={travelReason === "ferias"} />
            <Option label="Negócios" checked={travelReason === "negocios"} />
            <Option label="Congresso" checked={travelReason === "congresso"} />
            <Option label="Estudos" checked={travelReason === "estudos"} />
            <Option label="Saúde" checked={travelReason === "saude"} />
            <Option label="Outro" checked={travelReason === "outro"} />
          </div>

          <p className="fnrh-options-title">Meio de Transporte</p>
          <div className="fnrh-options">
            <Option label="Automóvel" checked={transport === "automovel"} />
            <Option label="Avião" checked={transport === "aviao"} />
            <Option label="Navio" checked={transport === "navio"} />
            <Option label="Ônibus" checked={transport === "onibus"} />
            <Option label="Trem" checked={transport === "trem"} />
            <Option label="Outro" checked={transport === "outro"} />
          </div>
        </section>

        <section className="fnrh-signature">
          <div className="fnrh-signature-box">
            <div className="fnrh-signature-line">
              {data.signature_data_url ? <img src={data.signature_data_url} alt="Assinatura do hóspede" /> : null}
            </div>
            <p className="fnrh-signature-label">assinatura do hóspede</p>
          </div>
        </section>
      </article>
    </main>
  );
}

function Field({ label, value, span }: { label: string; value?: string | number | null; span?: number }) {
  return (
    <div className="fnrh-field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <span className="fnrh-label">{label}</span>
      <div className="fnrh-box">{value == null ? "" : String(value)}</div>
    </div>
  );
}

function Option({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="fnrh-option">
      <span className={`fnrh-checkbox${checked ? " checked" : ""}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
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

function normalize(value?: string | null) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatHour(value?: string | null) {
  if (!value) return "";
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}
