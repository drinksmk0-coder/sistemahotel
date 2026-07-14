import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";

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
