import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileCheck2,
  Hotel,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkin-online")({
  ssr: false,
  component: GuestCheckinPage,
});

type Guest = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  birth_date?: string | null;
  profession?: string | null;
  gender?: string | null;
  civil_status?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  district?: string | null;
};

type GuestCheckinPayload = {
  id: string;
  status: "enviado" | "preenchido" | "conferido" | "enviado_mtur" | "erro_mtur";
  submitted_at: string | null;
  form_data?: Partial<FnrhForm> | null;
  signature_data_url?: string | null;
  company_name: string;
  reservation_code: string;
  room: number | string;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  guest?: Guest | null;
};

type Dependent = {
  nome: string;
  nascimento: string;
  tipo_documento: string;
  numero_documento: string;
  parentesco: string;
};

type FnrhForm = {
  nome_completo: string;
  nome_social: string;
  nascimento: string;
  nacionalidade: string;
  genero: string;
  estado_civil: string;
  profissao: string;
  tipo_documento: string;
  numero_documento: string;
  telefone: string;
  email: string;
  pais: string;
  estado: string;
  cidade: string;
  cep: string;
  logradouro: string;
  numero_endereco: string;
  complemento: string;
  bairro: string;
  motivo_viagem: string;
  origem_imediata: string;
  proximo_destino: string;
  meio_transporte: string;
  placa_veiculo: string;
  preferencia_ruido: string;
  preferencia_ventilacao: string;
  preferencia_espaco: string;
  preferencia_escadas: string;
  preferencia_garagem: string;
  preferencia_janela: string;
  preferencia_tamanho_janela: string;
  necessidade_acessibilidade: string;
  outras_preferencias: string;
  observacoes: string;
  dependentes: Dependent[];
};

const EMPTY_FORM: FnrhForm = {
  nome_completo: "",
  nome_social: "",
  nascimento: "",
  nacionalidade: "Brasileira",
  genero: "",
  estado_civil: "",
  profissao: "",
  tipo_documento: "CPF",
  numero_documento: "",
  telefone: "",
  email: "",
  pais: "Brasil",
  estado: "",
  cidade: "",
  cep: "",
  logradouro: "",
  numero_endereco: "",
  complemento: "",
  bairro: "",
  motivo_viagem: "",
  origem_imediata: "",
  proximo_destino: "",
  meio_transporte: "",
  placa_veiculo: "",
  preferencia_ruido: "",
  preferencia_ventilacao: "",
  preferencia_espaco: "",
  preferencia_escadas: "",
  preferencia_garagem: "",
  preferencia_janela: "",
  preferencia_tamanho_janela: "",
  necessidade_acessibilidade: "",
  outras_preferencias: "",
  observacoes: "",
  dependentes: [],
};

const STEPS = [
  "Identificação",
  "Endereço e viagem",
  "Preferências do quarto",
  "Acompanhantes",
  "Consentimento e assinatura",
];

function GuestCheckinPage() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token")?.trim() ?? "",
    [],
  );
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FnrhForm>(EMPTY_FORM);
  const [consent, setConsent] = useState(false);
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const query = useQuery({
    queryKey: ["public-guest-checkin", token],
    enabled: Boolean(token),
    staleTime: 30_000,
    queryFn: async () => {
      const result = await (supabase as any).rpc("get_guest_checkin", { p_token: token });
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Link inválido, expirado ou não encontrado.");
      return result.data as GuestCheckinPayload;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const guest = query.data.guest ?? {};
    const saved = query.data.form_data ?? {};
    setForm({
      ...EMPTY_FORM,
      nome_completo: guest.name ?? "",
      nascimento: guest.birth_date ?? "",
      profissao: guest.profession ?? "",
      genero: guest.gender ?? "",
      estado_civil: guest.civil_status ?? "",
      numero_documento: guest.document ?? "",
      telefone: guest.phone ?? "",
      email: guest.email ?? "",
      pais: guest.country ?? "Brasil",
      estado: guest.state ?? "",
      cidade: guest.city ?? "",
      cep: guest.postal_code ?? "",
      bairro: guest.district ?? "",
      ...saved,
      dependentes: Array.isArray(saved.dependentes) ? saved.dependentes : [],
    });
    setSubmitted(["preenchido", "conferido", "enviado_mtur"].includes(query.data.status));
  }, [query.data]);

  function setField<K extends keyof FnrhForm>(key: K, value: FnrhForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateStep(currentStep: number) {
    if (currentStep === 0) {
      if (form.nome_completo.trim().length < 3) return "Informe o nome completo.";
      if (!form.nascimento) return "Informe a data de nascimento.";
      if (!form.numero_documento.trim()) return "Informe o número do documento.";
      if (!form.telefone.trim()) return "Informe um telefone para contato.";
    }
    if (currentStep === 1) {
      if (!form.pais.trim() || !form.cidade.trim()) return "Informe país e cidade de residência.";
      if (!form.motivo_viagem) return "Informe o motivo da viagem.";
    }
    if (currentStep === 4) {
      if (!consent) return "Aceite o tratamento dos dados para concluir.";
      if (!signed) return "Assine no campo indicado.";
    }
    return "";
  }

  function next() {
    const error = validateStep(step);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setMessage("");
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addDependent() {
    setField("dependentes", [
      ...form.dependentes,
      { nome: "", nascimento: "", tipo_documento: "CPF", numero_documento: "", parentesco: "" },
    ]);
  }

  function updateDependent(index: number, key: keyof Dependent, value: string) {
    setField(
      "dependentes",
      form.dependentes.map((dependent, currentIndex) =>
        currentIndex === index ? { ...dependent, [key]: value } : dependent,
      ),
    );
  }

  function removeDependent(index: number) {
    setField(
      "dependentes",
      form.dependentes.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const position = pointerPosition(event);
    if (!canvas || !position) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#172554";
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const position = pointerPosition(event);
    if (!canvas || !position) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineTo(position.x, position.y);
    context.stroke();
    setSigned(true);
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
  }

  async function submit() {
    const error = validateStep(4);
    if (error) {
      setMessage(error);
      return;
    }
    const signature = canvasRef.current?.toDataURL("image/png");
    if (!signature) {
      setMessage("Não foi possível capturar a assinatura.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const result = await (supabase as any).rpc("submit_guest_checkin", {
        p_token: token,
        p_form_data: form,
        p_signature_data_url: signature,
        p_guest_consent: consent,
      });
      if (result.error) throw result.error;
      setSubmitted(true);
      await query.refetch();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error_) {
      setMessage(error_ instanceof Error ? error_.message : "Não foi possível enviar a FNRH.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) return <PublicState title="Link incompleto" text="Solicite um novo link da FNRH à recepção." danger />;
  if (query.isLoading) return <PublicState title="Carregando sua reserva" text="Estamos preparando o formulário seguro." />;
  if (query.error || !query.data) {
    return <PublicState title="Não foi possível abrir a FNRH" text={query.error instanceof Error ? query.error.message : "Solicite um novo link à recepção."} danger />;
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff_0,#f8fafc_42%,#eef2ff_100%)] px-4 py-10">
        <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-xl shadow-slate-900/5">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <FileCheck2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-950">FNRH enviada com sucesso</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Seus dados, preferências de hospedagem e assinatura foram vinculados diretamente à reserva. A recepção fará a conferência.
          </p>
          <div className="mt-6 grid gap-2 rounded-2xl bg-slate-50 p-4 text-left text-sm sm:grid-cols-2">
            <Summary label="Hotel" value={query.data.company_name} />
            <Summary label="Reserva" value={query.data.reservation_code} />
            <Summary label="Quarto" value={String(query.data.room)} />
            <Summary label="Período" value={`${formatDate(query.data.checkin)} a ${formatDate(query.data.checkout)}`} />
          </div>
          <p className="mt-5 text-xs font-semibold text-slate-500">Você já pode fechar esta página.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff_0,#f8fafc_42%,#eef2ff_100%)] px-3 py-4 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-xl shadow-slate-900/5">
          <div className="flex flex-col gap-4 bg-[linear-gradient(135deg,#172554,#1d4ed8)] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                <Hotel className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-100">FNRH Digital</p>
                <h1 className="text-xl font-black">{query.data.company_name}</h1>
                <p className="text-xs text-blue-100">Pré-check-in seguro e vinculado à reserva</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/10 p-2 text-center text-xs backdrop-blur">
              <Summary label="Reserva" value={query.data.reservation_code} light />
              <Summary label="Quarto" value={String(query.data.room)} light />
              <Summary label="Entrada" value={formatDate(query.data.checkin)} light />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1 px-3 py-3 sm:px-6">
            {STEPS.map((label, index) => (
              <div key={label} className="min-w-0 text-center">
                <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-black ${index < step ? "bg-emerald-500 text-white" : index === step ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span className={`mt-1 hidden truncate text-[9px] font-bold sm:block ${index === step ? "text-blue-700" : "text-slate-500"}`}>{label}</span>
              </div>
            ))}
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5 sm:p-7">
          <div className="mb-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-600">Etapa {step + 1} de {STEPS.length}</p>
            <h2 className="text-xl font-black text-slate-950">{STEPS[step]}</h2>
            {step === 2 && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Esta seção não substitui a FNRH oficial. Ela ajuda a recepção a escolher o quarto mais adequado às suas necessidades.
              </p>
            )}
          </div>

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nome completo *" value={form.nome_completo} onChange={(value) => setField("nome_completo", value)} className="sm:col-span-2" autoComplete="name" />
              <Input label="Nome social" value={form.nome_social} onChange={(value) => setField("nome_social", value)} />
              <Input label="Data de nascimento *" type="date" value={form.nascimento} onChange={(value) => setField("nascimento", value)} />
              <Input label="Nacionalidade" value={form.nacionalidade} onChange={(value) => setField("nacionalidade", value)} />
              <Select label="Gênero" value={form.genero} onChange={(value) => setField("genero", value)} options={["Feminino", "Masculino", "Não binário", "Prefiro não informar"]} />
              <Select label="Estado civil" value={form.estado_civil} onChange={(value) => setField("estado_civil", value)} options={["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)", "Prefiro não informar"]} />
              <Input label="Profissão" value={form.profissao} onChange={(value) => setField("profissao", value)} />
              <Select label="Tipo de documento *" value={form.tipo_documento} onChange={(value) => setField("tipo_documento", value)} options={["CPF", "RG", "Passaporte", "RNE/CRNM", "Outro"]} />
              <Input label="Número do documento *" value={form.numero_documento} onChange={(value) => setField("numero_documento", value)} />
              <Input label="Telefone/WhatsApp *" value={form.telefone} onChange={(value) => setField("telefone", value)} autoComplete="tel" />
              <Input label="E-mail" type="email" value={form.email} onChange={(value) => setField("email", value)} autoComplete="email" />
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="País de residência *" value={form.pais} onChange={(value) => setField("pais", value)} />
              <Input label="Estado/UF" value={form.estado} onChange={(value) => setField("estado", value.toUpperCase())} maxLength={2} />
              <Input label="Cidade *" value={form.cidade} onChange={(value) => setField("cidade", value)} />
              <Input label="CEP" value={form.cep} onChange={(value) => setField("cep", value)} />
              <Input label="Logradouro" value={form.logradouro} onChange={(value) => setField("logradouro", value)} className="sm:col-span-2" />
              <Input label="Número" value={form.numero_endereco} onChange={(value) => setField("numero_endereco", value)} />
              <Input label="Complemento" value={form.complemento} onChange={(value) => setField("complemento", value)} />
              <Input label="Bairro" value={form.bairro} onChange={(value) => setField("bairro", value)} />
              <Select label="Motivo da viagem *" value={form.motivo_viagem} onChange={(value) => setField("motivo_viagem", value)} options={["Lazer", "Negócios", "Evento", "Saúde", "Visita a familiares/amigos", "Religião", "Estudos", "Outro"]} />
              <Input label="Procedência imediata" value={form.origem_imediata} onChange={(value) => setField("origem_imediata", value)} />
              <Input label="Próximo destino" value={form.proximo_destino} onChange={(value) => setField("proximo_destino", value)} />
              <Select label="Meio de transporte" value={form.meio_transporte} onChange={(value) => setField("meio_transporte", value)} options={["Automóvel", "Motocicleta", "Ônibus", "Avião", "Van", "Bicicleta", "A pé", "Outro"]} />
              <Input label="Placa do veículo" value={form.placa_veiculo} onChange={(value) => setField("placa_veiculo", value.toUpperCase())} />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Choice label="Nível de silêncio" value={form.preferencia_ruido} onChange={(value) => setField("preferencia_ruido", value)} options={[{ value: "silencioso", label: "Prefiro quarto silencioso" }, { value: "indiferente", label: "Indiferente" }, { value: "movimento", label: "Não me incomodo com movimento" }]} />
              <Choice label="Ventilação" value={form.preferencia_ventilacao} onChange={(value) => setField("preferencia_ventilacao", value)} options={[{ value: "arejado", label: "Quarto bem arejado" }, { value: "normal", label: "Ventilação normal" }, { value: "indiferente", label: "Indiferente" }]} />
              <Choice label="Espaço do quarto" value={form.preferencia_espaco} onChange={(value) => setField("preferencia_espaco", value)} options={[{ value: "espacoso", label: "Prefiro mais espaço" }, { value: "normal", label: "Tamanho normal" }, { value: "compacto", label: "Compacto está bom" }]} />
              <Choice label="Escadas" value={form.preferencia_escadas} onChange={(value) => setField("preferencia_escadas", value)} options={[{ value: "sem_escadas", label: "Preciso evitar escadas" }, { value: "poucas", label: "Prefiro poucas escadas" }, { value: "indiferente", label: "Indiferente" }]} />
              <Choice label="Proximidade da garagem" value={form.preferencia_garagem} onChange={(value) => setField("preferencia_garagem", value)} options={[{ value: "proximo", label: "Prefiro perto da garagem" }, { value: "longe", label: "Prefiro longe da garagem" }, { value: "indiferente", label: "Indiferente" }]} />
              <Choice label="Tipo de janela" value={form.preferencia_janela} onChange={(value) => setField("preferencia_janela", value)} options={[{ value: "vidro", label: "Vidro" }, { value: "madeira", label: "Madeira" }, { value: "mista", label: "Mista" }, { value: "indiferente", label: "Indiferente" }]} />
              <Choice label="Tamanho da janela" value={form.preferencia_tamanho_janela} onChange={(value) => setField("preferencia_tamanho_janela", value)} options={[{ value: "grande", label: "Prefiro janela grande" }, { value: "media", label: "Média" }, { value: "pequena", label: "Pequena" }, { value: "indiferente", label: "Indiferente" }]} />
              <Select label="Necessidade de acessibilidade" value={form.necessidade_acessibilidade} onChange={(value) => setField("necessidade_acessibilidade", value)} options={["Nenhuma", "Mobilidade reduzida", "Cadeirante", "Deficiência visual", "Deficiência auditiva", "Gestante", "Idoso(a)", "Outra"]} />
              <TextArea label="Outras preferências ou necessidades" value={form.outras_preferencias} onChange={(value) => setField("outras_preferencias", value)} className="sm:col-span-2" placeholder="Ex.: alergia, necessidade de cama específica, sensibilidade a barulho, preferência por andar..." />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-black text-slate-950">Acompanhantes e dependentes</h3>
                  <p className="text-xs text-slate-600">Inclua somente quem também ficará hospedado nesta reserva.</p>
                </div>
                <button type="button" onClick={addDependent} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-700">
                  <Plus className="h-4 w-4" /> Adicionar pessoa
                </button>
              </div>

              {form.dependentes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">Nenhum acompanhante informado.</div>
              ) : (
                <div className="space-y-3">
                  {form.dependentes.map((dependent, index) => (
                    <article key={index} className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <strong className="text-sm text-slate-950">Pessoa {index + 1}</strong>
                        <button type="button" onClick={() => removeDependent(index)} className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600" title="Remover pessoa">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input label="Nome completo" value={dependent.nome} onChange={(value) => updateDependent(index, "nome", value)} className="sm:col-span-2" />
                        <Input label="Nascimento" type="date" value={dependent.nascimento} onChange={(value) => updateDependent(index, "nascimento", value)} />
                        <Input label="Parentesco/relação" value={dependent.parentesco} onChange={(value) => updateDependent(index, "parentesco", value)} />
                        <Select label="Tipo de documento" value={dependent.tipo_documento} onChange={(value) => updateDependent(index, "tipo_documento", value)} options={["CPF", "RG", "Passaporte", "Certidão de nascimento", "Outro"]} />
                        <Input label="Número do documento" value={dependent.numero_documento} onChange={(value) => updateDependent(index, "numero_documento", value)} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <TextArea label="Observações adicionais" value={form.observacoes} onChange={(value) => setField("observacoes", value)} placeholder="Informações adicionais importantes para sua hospedagem." />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                <div className="mb-2 flex items-center gap-2 font-black text-slate-950">
                  <ShieldCheck className="h-4 w-4 text-blue-600" /> Privacidade e finalidade
                </div>
                Os dados serão usados para cadastro de hospedagem, atendimento, segurança, obrigações legais e preparação do quarto. As preferências são internas e servem para melhorar a acomodação, sem garantia de disponibilidade de uma característica específica.
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" />
                <span className="text-sm font-semibold leading-relaxed text-slate-800">Declaro que os dados informados são verdadeiros e autorizo seu tratamento para as finalidades descritas acima.</span>
              </label>

              <div>
                <div className="mb-2 flex items-end justify-between gap-2">
                  <div>
                    <span className="block text-sm font-black text-slate-950">Assinatura do hóspede *</span>
                    <span className="text-xs text-slate-500">Assine com o dedo ou mouse dentro da área.</span>
                  </div>
                  <button type="button" onClick={clearSignature} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                    <Eraser className="h-3.5 w-3.5" /> Limpar
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={900}
                  height={240}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                  onPointerLeave={(event) => drawing.current && stopDrawing(event)}
                  className="h-40 w-full touch-none rounded-2xl border-2 border-dashed border-blue-200 bg-white"
                  aria-label="Campo de assinatura digital"
                />
              </div>
            </div>
          )}

          {message && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{message}</div>}

          <div className="mt-7 flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
            <button type="button" onClick={back} disabled={step === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 disabled:invisible">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => void submit()} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-60">
                <Send className="h-4 w-4" /> {submitting ? "Enviando…" : "Enviar FNRH ao hotel"}
              </button>
            )}
          </div>
        </section>

        <footer className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Link individual e protegido, vinculado somente à sua reserva.
        </footer>
      </div>
    </main>
  );
}

function Input({ label, value, onChange, type = "text", className = "", autoComplete, maxLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string; autoComplete?: string; maxLength?: number }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-[11px] font-extrabold text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} maxLength={maxLength} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-extrabold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
        <option value="">Selecione</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 p-3">
      <legend className="px-1 text-[11px] font-extrabold text-slate-700">{label}</legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label key={option.value} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${value === option.value ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200" : "text-slate-600 hover:bg-slate-50"}`}>
            <input type="radio" name={label} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="accent-blue-600" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TextArea({ label, value, onChange, className = "", placeholder }: { label: string; value: string; onChange: (value: string) => void; className?: string; placeholder?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-[11px] font-extrabold text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
    </label>
  );
}

function Summary({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <div className="min-w-0">
      <span className={`block text-[9px] font-extrabold uppercase tracking-wide ${light ? "text-blue-100" : "text-slate-500"}`}>{label}</span>
      <strong className={`block truncate text-xs ${light ? "text-white" : "text-slate-950"}`} title={value}>{value}</strong>
    </div>
  );
}

function PublicState({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className={`w-full max-w-md rounded-3xl border bg-white p-7 text-center shadow-xl shadow-slate-900/5 ${danger ? "border-red-200" : "border-blue-100"}`}>
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
          {danger ? <Hotel className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
        </div>
        <h1 className="mt-4 text-xl font-black text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

void (null as unknown as ReactNode);
