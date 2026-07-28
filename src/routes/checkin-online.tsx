import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle2, Eraser, Loader2, Printer, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkin-online")({
  ssr: false,
  component: CheckinOnline,
});

type InviteData = {
  status: string;
  submitted_at: string | null;
  form_data: Record<string, string>;
  signature_data_url: string | null;
  company_name: string;
  reservation_code: string;
  room: number;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  guest: {
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
};

const EMPTY_FORM = {
  nome_completo: "",
  email: "",
  telefone: "",
  profissao: "",
  nacionalidade: "Brasileira",
  genero: "",
  nascimento: "",
  raca_cor: "",
  deficiencia: "nao",
  tipo_deficiencia: "",
  tipo_documento: "CPF",
  numero_documento: "",
  endereco: "",
  numero: "",
  complemento: "",
  cep: "",
  cidade: "",
  estado: "",
  pais: "Brasil",
  ultimo_destino: "",
  proximo_destino: "",
  motivo_viagem: "Lazer",
  transporte: "Automóvel",
  acompanhantes: "",
};

function CheckinOnline() {
  const token =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [signature, setSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Este link de check-in está incompleto.");
      setLoading(false);
      return;
    }
    (supabase as any)
      .rpc("get_guest_checkin", { p_token: token })
      .then(({ data, error: requestError }: { data: InviteData | null; error: Error | null }) => {
        if (requestError || !data) {
          setError("Este link é inválido ou não está mais disponível.");
          return;
        }
        setInvite(data);
        const guest = data.guest ?? {};
        setForm({
          ...EMPTY_FORM,
          nome_completo: guest.name ?? "",
          email: guest.email ?? "",
          telefone: guest.phone ?? "",
          profissao: guest.profession ?? "",
          genero: guest.gender ?? "",
          nascimento: guest.birth_date ?? "",
          numero_documento: guest.document ?? "",
          cep: guest.postal_code ?? "",
          cidade: guest.city ?? "",
          estado: guest.state ?? "",
          pais: guest.country ?? "Brasil",
          acompanhantes: String(Math.max(0, Number(data.adults ?? 1) + Number(data.children ?? 0) - 1)),
          ...(data.form_data ?? {}),
        });
        setSignature(data.signature_data_url ?? "");
        setConsent(data.status !== "enviado");
        setSent(data.status !== "enviado");
      })
      .finally(() => setLoading(false));
  }, [token]);

  function set(name: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !signature) {
      setError("Assine no campo indicado antes de enviar.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: submitError } = await (supabase as any).rpc("submit_guest_checkin", {
      p_token: token,
      p_form_data: form,
      p_signature_data_url: signature,
      p_guest_consent: consent,
    });
    setSaving(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setSent(true);
    setInvite((current) =>
      current
        ? {
            ...current,
            status: "preenchido",
            submitted_at: new Date().toISOString(),
            form_data: form,
            signature_data_url: signature,
          }
        : current,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (error && !invite) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted p-5">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow">
          <h1 className="text-xl font-extrabold">Check-in online</h1>
          <p className="mt-2 text-sm text-destructive">{error}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Peça à recepção um novo link pelo WhatsApp.
          </p>
        </div>
      </main>
    );
  }

  if (!invite) return null;

  return (
    <main className="min-h-screen bg-muted px-3 py-5 print:bg-white print:p-0">
      <form
        onSubmit={submit}
        className="mx-auto max-w-4xl rounded-2xl border bg-card p-4 shadow-xl sm:p-7 print:max-w-none print:border-0 print:p-0 print:shadow-none"
      >
        <header className="mb-5 border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                FNRH Digital · Pré-check-in
              </p>
              <h1 className="mt-1 text-xl font-extrabold text-pine-dark sm:text-2xl">
                Ficha Nacional de Registro de Hóspedes
              </h1>
              <p className="text-sm text-muted-foreground">{invite.company_name}</p>
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs">
              <strong>Reserva {invite.reservation_code}</strong>
              <p>UH {invite.room}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Info label="Entrada" value={formatDate(invite.checkin)} />
            <Info label="Saída" value={formatDate(invite.checkout)} />
            <Info label="Acompanhantes" value={form.acompanhantes || "0"} />
            <Info label="Situação" value={sent ? "Preenchida" : "Aguardando"} />
          </div>
        </header>

        {sent && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Dados recebidos. A recepção fará a conferência no check-in e acompanhará o envio à
              FNRH Digital do Ministério do Turismo.
            </span>
          </div>
        )}

        <fieldset disabled={sent} className="space-y-5 disabled:opacity-90">
          <FormSection title="Informações do hóspede">
            <FormField className="sm:col-span-2" label="Nome completo">
              <input
                className="field"
                value={form.nome_completo}
                onChange={(event) => set("nome_completo", event.target.value)}
                required
              />
            </FormField>
            <FormField label="E-mail">
              <input
                className="field"
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </FormField>
            <FormField label="Telefone / WhatsApp">
              <input
                className="field"
                inputMode="tel"
                value={form.telefone}
                onChange={(event) => set("telefone", event.target.value)}
                required
              />
            </FormField>
            <FormField label="Profissão">
              <input
                className="field"
                value={form.profissao}
                onChange={(event) => set("profissao", event.target.value)}
              />
            </FormField>
            <FormField label="Nacionalidade">
              <input
                className="field"
                value={form.nacionalidade}
                onChange={(event) => set("nacionalidade", event.target.value)}
              />
            </FormField>
            <FormField label="Gênero">
              <select
                className="field"
                value={form.genero}
                onChange={(event) => set("genero", event.target.value)}
              >
                <option value="">Selecione</option>
                <option>Feminino</option>
                <option>Masculino</option>
                <option>Outro</option>
                <option>Prefiro não informar</option>
              </select>
            </FormField>
            <FormField label="Data de nascimento">
              <input
                className="field"
                type="date"
                value={form.nascimento}
                onChange={(event) => set("nascimento", event.target.value)}
                required
              />
            </FormField>
            <FormField label="Raça / cor">
              <input
                className="field"
                value={form.raca_cor}
                onChange={(event) => set("raca_cor", event.target.value)}
              />
            </FormField>
            <FormField label="Deficiência">
              <select
                className="field"
                value={form.deficiencia}
                onChange={(event) => set("deficiencia", event.target.value)}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
                <option value="nao_informar">Não informar</option>
              </select>
            </FormField>
            <FormField className="sm:col-span-2" label="Tipo de deficiência">
              <input
                className="field"
                value={form.tipo_deficiencia}
                onChange={(event) => set("tipo_deficiencia", event.target.value)}
                disabled={form.deficiencia !== "sim"}
              />
            </FormField>
          </FormSection>

          <FormSection title="Documento e endereço">
            <FormField label="Tipo de documento">
              <select
                className="field"
                value={form.tipo_documento}
                onChange={(event) => set("tipo_documento", event.target.value)}
              >
                <option>CPF</option>
                <option>Passaporte</option>
                <option>Documento estrangeiro</option>
              </select>
            </FormField>
            <FormField label="Número do documento">
              <input
                className="field"
                value={form.numero_documento}
                onChange={(event) => set("numero_documento", event.target.value)}
                required
              />
            </FormField>
            <FormField label="Endereço">
              <input
                className="field"
                value={form.endereco}
                onChange={(event) => set("endereco", event.target.value)}
              />
            </FormField>
            <FormField label="Número">
              <input
                className="field"
                value={form.numero}
                onChange={(event) => set("numero", event.target.value)}
              />
            </FormField>
            <FormField label="Complemento">
              <input
                className="field"
                value={form.complemento}
                onChange={(event) => set("complemento", event.target.value)}
              />
            </FormField>
            <FormField label="CEP">
              <input
                className="field"
                inputMode="numeric"
                value={form.cep}
                onChange={(event) => set("cep", event.target.value)}
              />
            </FormField>
            <FormField label="Cidade">
              <input
                className="field"
                value={form.cidade}
                onChange={(event) => set("cidade", event.target.value)}
                required
              />
            </FormField>
            <FormField label="Estado">
              <input
                className="field"
                value={form.estado}
                onChange={(event) => set("estado", event.target.value)}
              />
            </FormField>
            <FormField className="sm:col-span-2" label="País">
              <input
                className="field"
                value={form.pais}
                onChange={(event) => set("pais", event.target.value)}
                required
              />
            </FormField>
          </FormSection>

          <FormSection title="Informações da viagem">
            <FormField label="Último destino (cidade, país)">
              <input
                className="field"
                value={form.ultimo_destino}
                onChange={(event) => set("ultimo_destino", event.target.value)}
              />
            </FormField>
            <FormField label="Próximo destino (cidade, país)">
              <input
                className="field"
                value={form.proximo_destino}
                onChange={(event) => set("proximo_destino", event.target.value)}
              />
            </FormField>
            <FormField label="Motivo da viagem">
              <select
                className="field"
                value={form.motivo_viagem}
                onChange={(event) => set("motivo_viagem", event.target.value)}
              >
                {["Compras", "Evento", "Estudo", "Lazer", "Negócios", "Religião", "Saúde", "Parentes/Amigos"].map(
                  (item) => <option key={item}>{item}</option>,
                )}
              </select>
            </FormField>
            <FormField label="Meio de transporte">
              <select
                className="field"
                value={form.transporte}
                onChange={(event) => set("transporte", event.target.value)}
              >
                {["Ônibus", "Automóvel", "Avião", "Moto", "A pé", "Trem", "Bicicleta", "Navio/Barco"].map(
                  (item) => <option key={item}>{item}</option>,
                )}
              </select>
            </FormField>
          </FormSection>

          <section>
            <h2 className="mb-2 text-sm font-extrabold text-pine-dark">Assinatura do hóspede</h2>
            {sent && signature ? (
              <img
                src={signature}
                alt="Assinatura do hóspede"
                className="h-40 w-full rounded-lg border bg-white object-contain"
              />
            ) : (
              <SignaturePad onChange={setSignature} />
            )}
            <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              Autorizo o tratamento destes dados para hospedagem, FNRH Digital e obrigações legais,
              conforme a LGPD.
            </label>
          </section>
        </fieldset>

        {error && invite && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <footer className="mt-5 flex flex-wrap justify-end gap-2 no-print">
          {sent && (
            <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir cópia
            </button>
          )}
          {!sent && (
            <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Assinar e enviar
            </button>
          )}
        </footer>
      </form>
    </main>
  );
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
    context.strokeStyle = "#132a3a";
  }, []);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    const position = point(event);
    context?.beginPath();
    context?.moveTo(position.x, position.y);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    const position = point(event);
    context?.lineTo(position.x, position.y);
    context?.stroke();
  }

  function finish() {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-white">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Campo para assinatura"
      />
      <button
        type="button"
        className="absolute right-2 top-2 flex items-center gap-1 rounded bg-white px-2 py-1 text-[10px] font-bold shadow"
        onClick={clear}
      >
        <Eraser className="h-3 w-3" /> Limpar
      </button>
      <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-neutral-400">
        Assine com o dedo ou mouse
      </p>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 border-b pb-1 text-sm font-extrabold text-pine-dark">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FormField({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <span className="block text-[9px] uppercase text-muted-foreground">{label}</span>
      <strong className="text-xs text-pine-dark">{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
