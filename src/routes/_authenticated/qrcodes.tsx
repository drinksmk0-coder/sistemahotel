import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { useCurrentCompany, useRooms } from "@/lib/data";
import { fmtBRL } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";

export const Route = createFileRoute("/_authenticated/qrcodes")({
  component: QrCodes,
});

function QrCodes() {
  const { data: rooms = [] } = useRooms();
  const current = useCurrentCompany();
  const [codes, setCodes] = useState<Record<number, string>>({});
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const urls = useMemo(
    () =>
      rooms.reduce<Record<number, string>>((acc, r) => {
        const empresa = current.data?.id ? `&empresa=${current.data.id}` : "";
        acc[r.numero] = `${origin}/avaliar?quarto=${r.numero}${empresa}`;
        return acc;
      }, {}),
    [rooms, origin, current.data?.id],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      rooms.map(async (r) => [r.numero, await QRCode.toDataURL(urls[r.numero], { width: 320, margin: 1 })] as const),
    ).then((entries) => {
      if (!cancelled) setCodes(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [rooms, urls]);

  return (
    <div>
      <PageHeader
        title="QR codes dos quartos"
        subtitle="Imprima e cole um QR em cada quarto. O hóspede lê e avalia a estadia — o número do quarto já vem preenchido."
        action={
          <div className="flex gap-2 no-print">
            <a href="/imprimir" target="_blank" rel="noreferrer" className="btn-ghost flex items-center gap-1.5">
              Formulário em papel
            </a>
            <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5">
              <Printer className="h-4 w-4" /> Imprimir folha
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {rooms.map((r) => (
          <div key={r.numero} className="card-surface flex flex-col items-center p-4 text-center">
            <div className="mb-2 text-center">
              <div className="font-serif text-xl font-bold text-pine-dark">Quarto {r.numero}</div>
              <div className="text-[11px] text-muted-foreground">
                {r.andar}º andar · {fmtBRL(r.preco)}
              </div>
            </div>
            {codes[r.numero] ? (
              <img src={codes[r.numero]} alt={`QR do quarto ${r.numero}`} className="h-40 w-40" />
            ) : (
              <div className="h-40 w-40 animate-pulse rounded bg-muted" />
            )}
            <p className="mt-2 text-xs font-semibold text-pine">Avalie sua estadia</p>
            <p className="text-[10px] text-muted-foreground">Aponte a câmera do celular</p>
          </div>
        ))}
      </div>
    </div>
  );
}
