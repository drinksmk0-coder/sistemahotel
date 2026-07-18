import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Printer } from "lucide-react";

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
