import { ArrowLeft, ArrowRight } from "lucide-react";

export function GlobalHistoryNavigation() {
  return (
    <nav
      className="mb-2 flex items-center gap-1.5"
      aria-label="Navegação entre páginas visitadas"
    >
      <button
        type="button"
        onClick={() => window.history.back()}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-extrabold text-pine-dark shadow-sm transition hover:border-primary/35 hover:bg-muted"
        title="Voltar para a página anterior"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Voltar</span>
      </button>
      <button
        type="button"
        onClick={() => window.history.forward()}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-extrabold text-pine-dark shadow-sm transition hover:border-primary/35 hover:bg-muted"
        title="Avançar para a próxima página visitada"
      >
        <span className="hidden sm:inline">Avançar</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}
