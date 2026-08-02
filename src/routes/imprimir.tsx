import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/imprimir")({
  ssr: false,
  component: Imprimir,
});

const CRITERIA = [
  "Limpeza do quarto",
  "Conforto e cama",
  "Atendimento da equipe",
  "Wi-Fi / internet",
  "Chuveiro / água quente",
  "Café da manhã",
  "Nota geral da estadia",
];

function Line({ label }: { label: string }) {
  return (
    <div className="mb-3">
      <span className="text-sm font-semibold">{label}:</span>
      <div className="mt-1 h-6 border-b border-dashed border-neutral-400" />
    </div>
  );
}

function Imprimir() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  if (params.get("tipo") === "recibo") return <Recibo params={params} />;
  if (params.get("tipo") === "fnrh") return <FnrhPrint token={params.get("token") ?? ""} />;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl justify-end px-4 no-print">
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5">
          <Printer className="h-4 w-4" /> Imprimir formulário
        </button>
      </div>

      <div className="mx-auto max-w-2xl bg-white p-10 shadow print:max-w-none print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center gap-3 border-b-2 border-pine pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pine font-serif text-xl font-bold text-white">
            PR
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold">Pousada Real Cruzília</h1>
            <p className="text-sm text-neutral-500">Formulário de avaliação da estadia</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Line label="Nome do hóspede" />
          <Line label="Número do quarto" />
          <Line label="Data do check-out" />
          <Line label="Cidade de origem" />
        </div>

        <h2 className="mb-3 mt-4 font-serif text-lg font-bold">
          Avalie de 1 a 5 (circule as estrelas)
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {CRITERIA.map((c) => (
              <tr key={c} className="border-b border-neutral-300">
                <td className="py-2 font-medium">{c}</td>
                <td className="py-2 text-right text-xl tracking-widest">☆ ☆ ☆ ☆ ☆</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4">
          <span className="text-sm font-semibold">Teve problema com o Wi-Fi?</span>
          <span className="ml-3 text-sm">◻ Não ◻ Sim — Aparelho usado: ______________________</span>
        </div>

        <div className="mt-4">
          <span className="text-sm font-semibold">Recomendaria a pousada?</span>
          <span className="ml-3 text-sm">◻ Sim ◻ Não</span>
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold">O que mais gostou / comentário:</p>
          <div className="mt-1 h-6 border-b border-dashed border-neutral-400" />
          <div className="mt-3 h-6 border-b border-dashed border-neutral-400" />
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold">Sugestão de melhoria:</p>
          <div className="mt-1 h-6 border-b border-dashed border-neutral-400" />
          <div className="mt-3 h-6 border-b border-dashed border-neutral-400" />
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Obrigado por ajudar a Pousada Real Cruzília a melhorar! Entregue este formulário na recepção.
        </p>
      </div>
    </div>
  );
}

type FnrhPayload = {
  status: string;
  submitted_at: string | null;
  form_data: Record<string, unknown> | null;
  signature_data_url: string | null;
  company_name: string;
  reservation_code: string;
  room: number | string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  guest?: Record<string, unknown> | null;
};

function FnrhPrint({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["print-fnrh", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const result = await (supabase as any).rpc("get_guest_checkin", { p_token: token });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("FNRH não encontrada.");
      return result.data as FnrhPayload;
    },
  });

  if (!token) return <PrintState text="Token da FNRH não informado." />;
  if (query.isLoading) return <PrintState text="Carregando FNRH…" />;
  if (query.error || !query.data) return <PrintState text={query.error instanceof Error ? query.error.message : "Não foi possível carregar a FNRH."} danger />;

  const record = query.data;
  const form = asRecord(record.form_data);
  const guest = asRecord(record.guest);
  const dependents = arrayRecords(form.dependentes);
  const submittedAt = record.submitted_at ? formatDateTime(record.submitted_at) : "Não informado";

  return (
    <div className="min-h-screen bg-slate-100 py-5 print:bg-white print:py-0">
      <style>{`
        @page { size: A3 portrait; margin: 9mm; }
        @media print {
          html, body { width: 297mm; min-height: 420mm; background: white !important; }
          .fnrh-a3 { width: 279mm !important; min-height: 400mm !important; box-shadow: none !important; margin: 0 !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[1120px] items-center justify-between gap-3 px-4">
        <div>
          <strong className="block text-sm text-slate-900">Espelho da FNRH</strong>
          <span className="text-xs text-slate-500">A impressora deve estar configurada para papel A3, orientação retrato e escala 100%.</span>
        </div>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5">
          <Printer className="h-4 w-4" /> Imprimir A3
        </button>
      </div>

      <article className="fnrh-a3 mx-auto min-h-[1500px] max-w-[1120px] overflow-hidden bg-white shadow-2xl shadow-slate-900/10">
        <header className="flex items-center justify-between gap-6 bg-[#172554] px-10 py-7 text-white">
          <div className="flex items-center gap-4">
            <img src="/hotel-real-logo.png" alt="Hotel Real" className="h-16 w-16 rounded-xl bg-white object-contain p-1.5" />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.2em] text-blue-200">Ficha Nacional de Registro de Hóspedes</p>
              <h1 className="text-3xl font-black">{record.company_name}</h1>
              <p className="mt-1 text-sm text-blue-100">Espelho interno da FNRH Digital e pré-check-in</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-right text-xs">
            <PrintHeader label="Reserva" value={record.reservation_code} />
            <PrintHeader label="Quarto" value={String(record.room)} />
            <PrintHeader label="Entrada" value={formatDate(record.checkin)} />
            <PrintHeader label="Saída" value={formatDate(record.checkout)} />
          </div>
        </header>

        <div className="space-y-5 px-10 py-7 text-[12px] text-slate-800">
          <section className="grid grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <PrintInfo label="Situação" value={statusLabel(record.status)} />
            <PrintInfo label="Enviado pelo hóspede" value={submittedAt} />
            <PrintInfo label="Adultos" value={String(record.adults ?? 1)} />
            <PrintInfo label="Acompanhantes cadastrados" value={String(dependents.length)} />
          </section>

          <PrintSection title="1. Identificação do hóspede">
            <div className="grid grid-cols-4 gap-x-4 gap-y-3">
              <PrintField label="Nome completo" value={value(form, "nome_completo", guest.name)} span={2} />
              <PrintField label="Nome social" value={value(form, "nome_social")} />
              <PrintField label="Nascimento" value={formatOptionalDate(value(form, "nascimento", guest.birth_date))} />
              <PrintField label="Nacionalidade" value={value(form, "nacionalidade")} />
              <PrintField label="Gênero" value={value(form, "genero", guest.gender)} />
              <PrintField label="Estado civil" value={value(form, "estado_civil", guest.civil_status)} />
              <PrintField label="Profissão" value={value(form, "profissao", guest.profession)} />
              <PrintField label="Documento" value={`${value(form, "tipo_documento") || "Documento"}: ${value(form, "numero_documento", guest.document) || "—"}`} span={2} />
              <PrintField label="Telefone" value={value(form, "telefone", guest.phone)} />
              <PrintField label="E-mail" value={value(form, "email", guest.email)} />
            </div>
          </PrintSection>

          <PrintSection title="2. Residência, procedência e viagem">
            <div className="grid grid-cols-4 gap-x-4 gap-y-3">
              <PrintField label="País" value={value(form, "pais", guest.country)} />
              <PrintField label="Estado/UF" value={value(form, "estado", guest.state)} />
              <PrintField label="Cidade" value={value(form, "cidade", guest.city)} />
              <PrintField label="CEP" value={value(form, "cep", guest.postal_code)} />
              <PrintField label="Logradouro" value={value(form, "logradouro")} span={2} />
              <PrintField label="Número" value={value(form, "numero_endereco")} />
              <PrintField label="Complemento" value={value(form, "complemento")} />
              <PrintField label="Bairro" value={value(form, "bairro", guest.district)} />
              <PrintField label="Motivo da viagem" value={value(form, "motivo_viagem")} />
              <PrintField label="Procedência imediata" value={value(form, "origem_imediata")} />
              <PrintField label="Próximo destino" value={value(form, "proximo_destino")} />
              <PrintField label="Meio de transporte" value={value(form, "meio_transporte")} />
              <PrintField label="Placa do veículo" value={value(form, "placa_veiculo")} />
            </div>
          </PrintSection>

          <PrintSection title="3. Preferências de hospedagem — uso operacional do hotel" accent>
            <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-900">
              Estas respostas não fazem parte dos campos oficiais da FNRH. Servem para comparar a necessidade do hóspede com as características reais dos quartos disponíveis.
            </p>
            <div className="grid grid-cols-4 gap-3">
              <Preference label="Barulho" value={preference("preferencia_ruido", value(form, "preferencia_ruido"))} />
              <Preference label="Ventilação" value={preference("preferencia_ventilacao", value(form, "preferencia_ventilacao"))} />
              <Preference label="Espaço" value={preference("preferencia_espaco", value(form, "preferencia_espaco"))} />
              <Preference label="Escadas" value={preference("preferencia_escadas", value(form, "preferencia_escadas"))} />
              <Preference label="Garagem" value={preference("preferencia_garagem", value(form, "preferencia_garagem"))} />
              <Preference label="Tipo de janela" value={preference("preferencia_janela", value(form, "preferencia_janela"))} />
              <Preference label="Tamanho da janela" value={preference("preferencia_tamanho_janela", value(form, "preferencia_tamanho_janela"))} />
              <Preference label="Acessibilidade" value={value(form, "necessidade_acessibilidade")} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <PrintField label="Outras preferências ou necessidades" value={value(form, "outras_preferencias")} />
              <PrintField label="Observações adicionais" value={value(form, "observacoes")} />
            </div>
          </PrintSection>

          <PrintSection title="4. Acompanhantes e dependentes">
            {dependents.length ? (
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-left text-[9px] font-extrabold uppercase tracking-wide text-slate-600">
                    <th className="border border-slate-200 px-2 py-2">Nome</th>
                    <th className="border border-slate-200 px-2 py-2">Nascimento</th>
                    <th className="border border-slate-200 px-2 py-2">Relação</th>
                    <th className="border border-slate-200 px-2 py-2">Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {dependents.map((dependent, index) => (
                    <tr key={index}>
                      <td className="border border-slate-200 px-2 py-2 font-semibold">{stringValue(dependent.nome) || "—"}</td>
                      <td className="border border-slate-200 px-2 py-2">{formatOptionalDate(stringValue(dependent.nascimento))}</td>
                      <td className="border border-slate-200 px-2 py-2">{stringValue(dependent.parentesco) || "—"}</td>
                      <td className="border border-slate-200 px-2 py-2">{stringValue(dependent.tipo_documento) || "Documento"}: {stringValue(dependent.numero_documento) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center font-semibold text-slate-500">Nenhum acompanhante cadastrado nesta ficha.</p>
            )}
          </PrintSection>

          <PrintSection title="5. Declaração, consentimento e assinatura">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 leading-relaxed">
              O hóspede declarou que os dados informados são verdadeiros e autorizou seu tratamento para cadastro de hospedagem, atendimento, segurança, obrigações legais e preparação do quarto.
            </p>
            <div className="mt-4 grid grid-cols-[1fr_260px] items-end gap-8">
              <div>
                <span className="block text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Assinatura digital</span>
                <div className="mt-2 h-28 border-b border-slate-500">
                  {record.signature_data_url ? <img src={record.signature_data_url} alt="Assinatura digital do hóspede" className="h-24 max-w-full object-contain object-left-bottom" /> : null}
                </div>
                <span className="mt-1 block text-[10px] text-slate-500">Assinatura vinculada ao envio eletrônico da ficha.</span>
              </div>
              <div className="text-right">
                <div className="border-b border-slate-500 pb-2 font-semibold">Recepção / conferência</div>
                <span className="mt-1 block text-[10px] text-slate-500">Nome, assinatura e data</span>
              </div>
            </div>
          </PrintSection>

          <footer className="flex items-end justify-between gap-6 border-t border-slate-300 pt-4 text-[9px] text-slate-500">
            <div className="max-w-3xl">
              <strong className="text-slate-700">Documento de apoio operacional.</strong> A transmissão oficial ao Ministério do Turismo depende da integração e validação aplicáveis. Este espelho não substitui protocolo oficial quando exigido.
            </div>
            <div className="whitespace-nowrap text-right">Impresso em {formatDateTime(new Date().toISOString())}<br />Papel A3 · orientação retrato</div>
          </footer>
        </div>
      </article>
    </div>
  );
}

function PrintSection({ title, children, accent = false }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section className={`break-inside-avoid rounded-xl border p-4 ${accent ? "border-blue-200 bg-blue-50/30" : "border-slate-200"}`}>
      <h2 className={`mb-3 text-sm font-black uppercase tracking-wide ${accent ? "text-blue-800" : "text-slate-950"}`}>{title}</h2>
      {children}
    </section>
  );
}

function PrintHeader({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-[9px] font-extrabold uppercase tracking-wide text-blue-200">{label}</span><strong>{value}</strong></div>;
}

function PrintInfo({ label, value }: { label: string; value: string }) {
  return <div><span className="block text-[9px] font-extrabold uppercase tracking-wide text-slate-500">{label}</span><strong className="mt-0.5 block text-slate-950">{value || "—"}</strong></div>;
}

function PrintField({ label, value, span = 1 }: { label: string; value: string; span?: number }) {
  const spanClass = span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : span === 4 ? "col-span-4" : "";
  return (
    <div className={`min-w-0 border-b border-slate-300 pb-1 ${spanClass}`}>
      <span className="block text-[8px] font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="block min-h-4 break-words font-semibold text-slate-900">{value || "—"}</strong>
    </div>
  );
}

function Preference({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-white px-3 py-2">
      <span className="block text-[8px] font-extrabold uppercase tracking-wide text-blue-600">{label}</span>
      <strong className="mt-0.5 block text-[11px] text-slate-950">{value || "Não informado"}</strong>
    </div>
  );
}

function PrintState({ text, danger = false }: { text: string; danger?: boolean }) {
  return <div className={`m-8 rounded-xl border p-6 text-sm font-semibold ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700"}`}>{text}</div>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function value(record: Record<string, unknown>, key: string, fallback?: unknown) {
  return stringValue(record[key]) || stringValue(fallback);
}

function formatOptionalDate(value_: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value_) ? formatDate(value_) : value_ || "—";
}

function statusLabel(value_: string) {
  const labels: Record<string, string> = {
    enviado: "Aguardando preenchimento",
    preenchido: "Recebida — aguardando conferência",
    conferido: "Conferida pela recepção",
    enviado_mtur: "Enviada ao MTur",
    erro_mtur: "Exige revisão",
  };
  return labels[value_] ?? value_;
}

function preference(key: string, value_: string) {
  const labels: Record<string, Record<string, string>> = {
    preferencia_ruido: { silencioso: "Prefere quarto silencioso", indiferente: "Indiferente", movimento: "Não se incomoda com movimento" },
    preferencia_ventilacao: { arejado: "Quarto bem arejado", normal: "Ventilação normal", indiferente: "Indiferente" },
    preferencia_espaco: { espacoso: "Prefere mais espaço", normal: "Tamanho normal", compacto: "Compacto está bom" },
    preferencia_escadas: { sem_escadas: "Precisa evitar escadas", poucas: "Prefere poucas escadas", indiferente: "Indiferente" },
    preferencia_garagem: { proximo: "Perto da garagem", longe: "Longe da garagem", indiferente: "Indiferente" },
    preferencia_janela: { vidro: "Vidro", madeira: "Madeira", mista: "Mista", indiferente: "Indiferente" },
    preferencia_tamanho_janela: { grande: "Grande", media: "Média", pequena: "Pequena", indiferente: "Indiferente" },
  };
  return labels[key]?.[value_] ?? value_.replaceAll("_", " ");
}

function formatDate(value_: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value_}T00:00:00Z`));
}

function formatDateTime(value_: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value_));
}

function Recibo({ params }: { params: URLSearchParams }) {
  const nome = params.get("cliente") || "Cliente";
  const quarto = params.get("quarto") || "-";
  const periodo = params.get("periodo") || "-";
  const diarias = params.get("diarias") || "-";
  const total = params.get("total") || "R$ 0,00";
  const pago = params.get("pago") || "R$ 0,00";
  const status = params.get("status") || "Pendente";
  const telefone = (params.get("telefone") || "").replace(/\D/g, "");
  const hoje = new Date().toLocaleDateString("pt-BR");
  const whatsappText = encodeURIComponent(
    `Recibo Hotel Real Cruzília\nCliente: ${nome}\nQuarto: ${quarto}\nPeríodo: ${periodo}\nDiárias: ${diarias}\nTotal: ${total}\nPago: ${pago}\nStatus: ${status}`,
  );

  return (
    <div className="min-h-screen bg-[#f3efe5] py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap justify-end gap-2 px-4 no-print">
        {telefone && (
          <a
            href={`https://wa.me/${telefone}?text=${whatsappText}`}
            target="_blank"
            rel="noopener"
            className="btn-ghost flex items-center gap-1.5"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5">
          <Printer className="h-4 w-4" /> Imprimir recibo
        </button>
      </div>

      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        <div className="bg-pine px-10 py-7 text-white">
          <div className="flex items-center gap-4">
            <img src="/hotel-real-logo.png" alt="Hotel Real" className="h-16 w-16 rounded bg-white object-contain p-1" />
            <div>
              <h1 className="font-serif text-3xl font-bold">Hotel Real Cruzília</h1>
              <p className="text-sm text-white/80">Rua Capitão Pinto, 70 - Centro, Cruzília - MG</p>
              <p className="text-sm text-white/80">WhatsApp: (35) 8800-1372</p>
            </div>
          </div>
        </div>

        <div className="p-10">
          <div className="mb-8 flex items-start justify-between gap-6 border-b border-neutral-200 pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-pine">Recibo de hospedagem</p>
              <h2 className="mt-2 font-serif text-2xl font-bold">{nome}</h2>
            </div>
            <div className="text-right text-sm text-neutral-500">
              <p>Emitido em</p>
              <strong className="text-neutral-900">{hoje}</strong>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Quarto" value={quarto} />
            <Info label="Período" value={periodo} />
            <Info label="Diárias" value={diarias} />
            <Info label="Status" value={status} />
          </div>

          <div className="mt-8 rounded-lg border border-pine/20 bg-sage-bg/40 p-5">
            <div className="flex justify-between border-b border-pine/15 pb-3 text-sm">
              <span>Total da hospedagem</span>
              <strong>{total}</strong>
            </div>
            <div className="flex justify-between border-b border-pine/15 py-3 text-sm">
              <span>Valor pago</span>
              <strong>{pago}</strong>
            </div>
            <div className="flex justify-between pt-3 font-serif text-xl font-bold text-pine-dark">
              <span>Comprovante</span>
              <span>{status}</span>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-neutral-500">
            Este documento é um recibo operacional de hospedagem. Para nota fiscal, consulte a recepção.
          </p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 font-semibold text-neutral-950">{value}</p>
    </div>
  );
}
