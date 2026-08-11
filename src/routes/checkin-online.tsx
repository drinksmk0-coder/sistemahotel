import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle2, Eraser, Loader2, Plus, Printer, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveFnrhPrintSession, type FnrhPrintData } from "@/lib/fnrh-print-session";

export const Route = createFileRoute("/checkin-online")({ ssr: false, component: CheckinOnline });

type InviteData = FnrhPrintData & {
  guest: Record<string, string | null>;
};

type Companion = {
  nome: string;
  tipo: "adulto" | "crianca";
  parentesco: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  sexo: string;
};

const EMPTY_COMPANION: Companion = {
  nome: "", tipo: "adulto", parentesco: "acompanhante", cpf: "",
  data_nascimento: "", telefone: "", email: "", sexo: "",
};

const EMPTY_FORM = {
  nome_completo: "", email: "", telefone: "", profissao: "",
  nacionalidade: "Brasileira", genero: "", estado_civil: "", nascimento: "",
  raca_cor: "", deficiencia: "nao", tipo_deficiencia: "",
  tipo_documento: "CPF", numero_documento: "", endereco: "", numero: "",
  complemento: "", bairro: "", cep: "", cidade: "", estado: "", pais: "Brasil",
  ultimo_destino: "", proximo_destino: "", motivo_viagem: "Lazer",
  transporte: "Automóvel", placa_veiculo: "", acompanhantes: "0",
  acompanhantes_detalhes: "[]",
};

type FormKey = keyof typeof EMPTY_FORM;

function CheckinOnline() {
  const publicToken = useRef<string | null>(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null,
  );
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [printReady, setPrintReady] = useState(false);

  useEffect(() => {
    const token = publicToken.current;
    if (!token) { setError("Este link de check-in está incompleto."); setLoading(false); return; }
    (supabase as any).rpc("get_guest_checkin", { p_token: token })
      .then(({ data, error: requestError }: { data: InviteData | null; error: Error | null }) => {
        if (requestError || !data) { setError("Este link é inválido ou não está mais disponível."); return; }
        window.history.replaceState(window.history.state, "", "/checkin-online");
        const guest = data.guest ?? {};
        const saved = data.form_data ?? {};
        const expected = Math.max(0, Number(data.adults ?? 1) + Number(data.children ?? 0) - 1);
        const parsed = parseCompanions(saved.acompanhantes_detalhes);
        const initial = parsed.length ? parsed : Array.from({ length: expected }, (_, index) => ({
          ...EMPTY_COMPANION,
          tipo: index < Math.max(0, Number(data.adults ?? 1) - 1) ? "adulto" as const : "crianca" as const,
        }));
        setInvite({ ...data, guest });
        setCompanions(initial);
        setForm({
          ...EMPTY_FORM,
          nome_completo: guest.name ?? "", email: guest.email ?? "", telefone: guest.phone ?? "",
          profissao: guest.profession ?? "", genero: guest.gender ?? "",
          estado_civil: guest.civil_status ?? "", nascimento: guest.birth_date ?? "",
          numero_documento: guest.document ?? "", bairro: guest.district ?? "",
          cep: guest.postal_code ?? "", cidade: guest.city ?? "", estado: guest.state ?? "",
          pais: guest.country ?? "Brasil", ...saved,
          acompanhantes: String(initial.length), acompanhantes_detalhes: JSON.stringify(initial),
        });
        setSignature(data.signature_data_url ?? "");
        setConsent(data.status !== "enviado");
        setSent(data.status !== "enviado");
      }).finally(() => setLoading(false));
  }, []);

  const set = (name: FormKey, value: string) => setForm((current) => ({ ...current, [name]: value }));
  const updateCompanion = (index: number, patch: Partial<Companion>) => setCompanions((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = publicToken.current;
    if (!token || !signature) return setError("Assine no campo indicado antes de enviar.");
    if (!consent) return setError("Leia e aceite a declaração de tratamento dos dados.");
    if (!form.nome_completo.trim() || !form.telefone.trim() || !form.numero_documento.trim() || !form.nascimento || !form.cidade.trim() || !form.pais.trim()) {
      return setError("Preencha todos os campos obrigatórios do titular.");
    }
    const invalid = companions.findIndex((item) => !item.nome.trim());
    if (invalid >= 0) return setError(`Informe o nome do acompanhante ${invalid + 1}.`);
    if (!invite) return setError("Não foi possível validar os dados da hospedagem.");

    const payload = { ...form, acompanhantes: String(companions.length), acompanhantes_detalhes: JSON.stringify(companions) };
    setSaving(true); setError("");
    const { error: submitError } = await (supabase as any).rpc("submit_guest_checkin", {
      p_token: token, p_form_data: payload, p_signature_data_url: signature, p_guest_consent: true,
    });
    setSaving(false);
    if (submitError) return setError(submitError.message);

    const submittedAt = new Date().toISOString();
    const localPrintReady = saveFnrhPrintSession({
      ...invite,
      status: "preenchido",
      submitted_at: submittedAt,
      form_data: payload,
      signature_data_url: signature,
    });

    publicToken.current = null;
    window.history.replaceState(window.history.state, "", "/checkin-online?concluido=1");
    setPrintReady(localPrintReady);
    setSent(true);
    setForm(EMPTY_FORM);
    setCompanions([]);
    setSignature("");
    setConsent(false);
    setInvite((current) => current ? {
      ...current,
      status: "preenchido",
      submitted_at: submittedAt,
      form_data: {},
      signature_data_url: null,
      guest: { name: current.guest?.name ?? null },
    } : current);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-muted"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  if (error && !invite) return <main className="grid min-h-screen place-items-center bg-muted p-5"><div className="max-w-md rounded-xl border bg-card p-6 text-center shadow"><h1 className="text-xl font-extrabold">Check-in online</h1><p className="mt-2 text-sm text-destructive">{error}</p></div></main>;
  if (!invite) return null;

  return <main className="min-h-screen bg-muted px-3 py-5">
    <form onSubmit={submit} autoComplete="off" className="mx-auto max-w-[210mm] rounded-2xl border bg-white p-4 shadow-xl sm:p-7">
      <header className="mb-5">
        <h1 className="text-center text-xl font-black uppercase tracking-tight text-[#243b5a] sm:text-2xl">Ficha Nacional de Registro de Hóspedes</h1>
        <div className="mt-4 grid gap-3 rounded-xl bg-[#e9eff7] p-3 text-[#243b5a] sm:grid-cols-[92px_1fr_1.15fr]">
          <img src="/hotel-real-logo.png" alt={invite.company_name} className="h-[78px] w-[92px] rounded-md bg-white object-contain p-1" />
          <div className="text-xs leading-5"><p><strong className="text-base">{invite.company_name}</strong>{invite.company_document ? ` · CNPJ: ${invite.company_document}` : ""}</p><p>{invite.company_email}</p><p>{invite.company_phone}</p></div>
          <p className="text-xs sm:pt-6">{[invite.company_address, invite.company_city, invite.company_state].filter(Boolean).join(", ")}</p>
        </div>
      </header>

      {sent && <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>Ficha enviada com segurança.</strong> O link público foi encerrado imediatamente. {printReady ? "A cópia A4 fica disponível por até 15 minutos somente neste navegador." : "A recepção poderá imprimir a ficha pelo acesso autenticado."}</span></div>}

      {!sent && <fieldset className="space-y-5">
        <FormSection title="Informações da hospedagem">
          <ReadField label="UH Nº" value={String(invite.room)} /><ReadField label="Total de hóspedes" value={String(1 + companions.length)} />
          <ReadField label="Data de entrada" value={formatDate(invite.checkin)} /><ReadField label="Data de saída" value={formatDate(invite.checkout)} />
        </FormSection>

        <FormSection title="Hóspede titular">
          <Input label="Nome completo *" value={form.nome_completo} onChange={(v) => set("nome_completo", v)} wide />
          <Input label="E-mail" value={form.email} onChange={(v) => set("email", v)} type="email" />
          <Input label="Telefone / WhatsApp *" value={form.telefone} onChange={(v) => set("telefone", v)} />
          <Input label="Profissão" value={form.profissao} onChange={(v) => set("profissao", v)} />
          <Input label="Nacionalidade" value={form.nacionalidade} onChange={(v) => set("nacionalidade", v)} />
          <Select label="Gênero" value={form.genero} onChange={(v) => set("genero", v)} options={["", "Feminino", "Masculino", "Outro", "Prefiro não informar"]} />
          <Select label="Estado civil" value={form.estado_civil} onChange={(v) => set("estado_civil", v)} options={["", "Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)", "Prefiro não informar"]} />
          <Input label="Nascimento *" value={form.nascimento} onChange={(v) => set("nascimento", v)} type="date" />
          <Select label="Tipo de documento" value={form.tipo_documento} onChange={(v) => set("tipo_documento", v)} options={["CPF", "Passaporte", "Documento estrangeiro"]} />
          <Input label="Número do documento *" value={form.numero_documento} onChange={(v) => set("numero_documento", v)} />
          <Select label="Raça/Cor (opcional)" value={form.raca_cor} onChange={(v) => set("raca_cor", v)} options={["", "Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefiro não informar"]} />
          <Select label="Pessoa com deficiência" value={form.deficiencia} onChange={(v) => set("deficiencia", v)} options={["nao", "sim", "prefiro_nao_informar"]} />
          {form.deficiencia === "sim" && <Input label="Tipo de deficiência" value={form.tipo_deficiencia} onChange={(v) => set("tipo_deficiencia", v)} wide />}
        </FormSection>

        <FormSection title="Endereço do titular">
          <Input label="Endereço" value={form.endereco} onChange={(v) => set("endereco", v)} wide />
          <Input label="Número" value={form.numero} onChange={(v) => set("numero", v)} />
          <Input label="Complemento" value={form.complemento} onChange={(v) => set("complemento", v)} />
          <Input label="Bairro" value={form.bairro} onChange={(v) => set("bairro", v)} />
          <Input label="CEP" value={form.cep} onChange={(v) => set("cep", v)} />
          <Input label="Cidade *" value={form.cidade} onChange={(v) => set("cidade", v)} />
          <Input label="Estado" value={form.estado} onChange={(v) => set("estado", v)} />
          <Input label="País *" value={form.pais} onChange={(v) => set("pais", v)} />
        </FormSection>

        <section className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 text-sm font-extrabold text-pine-dark"><UsersRound className="h-4 w-4" /> Acompanhantes</h2><p className="text-xs text-muted-foreground">Informe cada pessoa da reserva. Crianças ficam vinculadas ao responsável.</p></div><button type="button" className="btn-ghost flex items-center gap-1.5 text-xs" onClick={() => setCompanions((c) => [...c, { ...EMPTY_COMPANION }])}><Plus className="h-4 w-4" /> Adicionar</button></div>
          {companions.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Reserva somente para o titular.</p> : <div className="space-y-3">{companions.map((guest, index) => <div key={index} className="rounded-lg border bg-white p-3"><div className="mb-2 flex justify-between"><strong className="text-sm">Acompanhante {index + 1}</strong><button type="button" className="rounded bg-destructive/10 p-1.5 text-destructive" onClick={() => setCompanions((c) => c.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nome completo *" value={guest.nome} onChange={(v) => updateCompanion(index, { nome: v })} wide />
            <Select label="Tipo" value={guest.tipo} onChange={(v) => updateCompanion(index, { tipo: v as Companion["tipo"] })} options={["adulto", "crianca"]} />
            <Input label="Parentesco" value={guest.parentesco} onChange={(v) => updateCompanion(index, { parentesco: v })} />
            <Input label="CPF / documento" value={guest.cpf} onChange={(v) => updateCompanion(index, { cpf: v })} />
            <Input label="Nascimento" value={guest.data_nascimento} onChange={(v) => updateCompanion(index, { data_nascimento: v })} type="date" />
            <Input label="Telefone" value={guest.telefone} onChange={(v) => updateCompanion(index, { telefone: v })} />
            <Input label="E-mail" value={guest.email} onChange={(v) => updateCompanion(index, { email: v })} type="email" />
            <Select label="Gênero" value={guest.sexo} onChange={(v) => updateCompanion(index, { sexo: v })} options={["", "Feminino", "Masculino", "Outro", "Prefiro não informar"]} />
          </div></div>)}</div>}
        </section>

        <FormSection title="Informações da viagem">
          <Input label="Último destino" value={form.ultimo_destino} onChange={(v) => set("ultimo_destino", v)} />
          <Input label="Próximo destino" value={form.proximo_destino} onChange={(v) => set("proximo_destino", v)} />
          <Select label="Motivo da viagem" value={form.motivo_viagem} onChange={(v) => set("motivo_viagem", v)} options={["Compras", "Evento", "Estudo", "Lazer", "Negócios", "Religião", "Saúde", "Parentes/Amigos"]} />
          <Select label="Meio de transporte" value={form.transporte} onChange={(v) => set("transporte", v)} options={["Ônibus", "Automóvel", "Avião", "Moto", "A pé", "Trem", "Bicicleta", "Navio/Barco"]} />
          {(form.transporte === "Automóvel" || form.transporte === "Moto") && <Input label="Placa do veículo (opcional)" value={form.placa_veiculo} onChange={(v) => set("placa_veiculo", v.toUpperCase())} />}
        </FormSection>

        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <h2 className="font-extrabold">Por que é necessário preencher e assinar?</h2>
          <p className="mt-1 text-xs leading-5">A ficha formaliza as informações da hospedagem e atende às obrigações aplicáveis aos meios de hospedagem. A assinatura confirma que os dados informados são verdadeiros e autoriza seu uso para reserva, check-in, segurança, atendimento e cumprimento de obrigações legais.</p>
          <p className="mt-1 text-xs leading-5"><strong>Proteção dos dados:</strong> as informações ficam salvas no sistema com acesso restrito aos funcionários autorizados. Elas não devem ser usadas para finalidade diferente da hospedagem sem base legal ou autorização adequada, conforme a LGPD.</p>
        </section>

        <section><h2 className="mb-2 text-sm font-extrabold text-pine-dark">Assinatura do hóspede titular</h2><SignaturePad onChange={setSignature} /><label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />Li as informações acima, confirmo que os dados são verdadeiros e autorizo seu tratamento para hospedagem, FNRH e obrigações legais.</label></section>
      </fieldset>}

      {error && invite && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <footer className="mt-5 flex flex-wrap justify-end gap-2">{sent && printReady && <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => window.location.assign("/checkin-print?local=1")}><Printer className="h-4 w-4" /> Gerar FNRH para impressão (PDF/A4)</button>}{!sent && <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Assinar e enviar</button>}</footer>
    </form>
  </main>;
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const drawing = useRef(false);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const ratio = window.devicePixelRatio || 1; const width = canvas.clientWidth; const height = canvas.clientHeight; canvas.width = width * ratio; canvas.height = height * ratio; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(ratio, ratio); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.2; ctx.strokeStyle = "#132a3a"; }, []);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const ctx = event.currentTarget.getContext("2d"); ctx?.beginPath(); ctx?.moveTo(p.x, p.y); };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const p = point(event); const ctx = event.currentTarget.getContext("2d"); ctx?.lineTo(p.x, p.y); ctx?.stroke(); };
  const finish = () => { drawing.current = false; const canvas = canvasRef.current; if (canvas) onChange(canvas.toDataURL("image/png")); };
  const clear = () => { const canvas = canvasRef.current; if (!canvas) return; canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); onChange(""); };
  return <div className="relative overflow-hidden rounded-lg border bg-white"><canvas ref={canvasRef} className="h-40 w-full touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} /><button type="button" className="absolute right-2 top-2 flex items-center gap-1 rounded bg-white px-2 py-1 text-[10px] font-bold shadow" onClick={clear}><Eraser className="h-3 w-3" /> Limpar</button><p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-neutral-400">Assine com o dedo ou mouse</p></div>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="mb-2 border-b pb-1 text-sm font-extrabold text-pine-dark">{title}</h2><div className="grid gap-3 sm:grid-cols-2">{children}</div></section>; }
function Input({ label, value, onChange, type = "text", wide = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">{label}</span><input className="field" autoComplete="off" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label><span className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">{label}</span><select className="field" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option} value={option}>{option || "Selecione"}</option>)}</select></label>; }
function ReadField({ label, value }: { label: string; value: string }) { return <label><span className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">{label}</span><input className="field" value={value} readOnly /></label>; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function parseCompanions(value?: string | null): Companion[] { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.map((item) => ({ ...EMPTY_COMPANION, ...item })) : []; } catch { return []; } }
