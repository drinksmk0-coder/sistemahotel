import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border/80 bg-card shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-4xl" : "sm:max-w-lg"
        } rounded-t-2xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-card/95 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <span className="mb-1 block h-1 w-10 rounded-full bg-border sm:hidden" />
            <h3 className="truncate text-base font-extrabold text-pine-dark sm:text-lg">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar janela"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Stars({ value }: { value: number | null | undefined }) {
  const n = Math.round(value ?? 0);
  return (
    <span className="text-brass" title={`${value ?? 0}/5`}>
      {"★".repeat(n)}
      <span className="text-border">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    pine: "bg-sage-bg text-pine-dark",
    brass: "bg-brass-bg text-[oklch(0.4_0.06_74)]",
    brick: "bg-brick-bg text-brick",
    sage: "bg-sage-bg text-sage",
    slate: "bg-slate-bg text-slate",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}
