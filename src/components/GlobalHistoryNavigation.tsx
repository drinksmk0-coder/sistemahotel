import { ArrowLeft } from "lucide-react";

export function GlobalHistoryNavigation() {
  return (
    <nav
      className="pointer-events-none relative z-30 h-0"
      aria-label="Navegação para a página anterior"
    >
      <button
        type="button"
        onClick={() => window.history.back()}
        className="pointer-events-auto fixed left-16 top-4 grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-card/90 text-primary shadow-sm backdrop-blur transition hover:-translate-x-0.5 hover:border-primary/35 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 xl:absolute xl:-left-7 xl:top-0 xl:h-7 xl:w-7"
        title="Voltar para a página anterior"
        aria-label="Voltar para a página anterior"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
    </nav>
  );
}
