import { useState } from "react";
import { Download } from "lucide-react";
import { Field, Modal } from "@/components/ui-kit";
import { todayISO } from "@/lib/format";

export type ExportScope =
  | { mode: "history"; date: null }
  | { mode: "date"; date: string };

export function ExportPeriodButton({
  onExport,
  label = "Excel",
}: {
  onExport: (scope: ExportScope) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ExportScope["mode"]>("date");
  const [date, setDate] = useState(todayISO());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost flex items-center gap-1.5"
      >
        <Download className="h-4 w-4" /> {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Exportar para Excel">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escolha entre uma data específica ou todo o histórico disponível.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={mode === "date" ? "btn-primary" : "btn-ghost"}
              onClick={() => setMode("date")}
            >
              Data específica
            </button>
            <button
              type="button"
              className={mode === "history" ? "btn-primary" : "btn-ghost"}
              onClick={() => setMode("history")}
            >
              Todo o histórico
            </button>
          </div>
          {mode === "date" && (
            <Field label="Data">
              <input
                className="field"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={mode === "date" && !date}
              onClick={() => {
                onExport(mode === "date" ? { mode, date } : { mode, date: null });
                setOpen(false);
              }}
            >
              Baixar Excel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
