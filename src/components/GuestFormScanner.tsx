import { useRef, useState } from "react";
import { Camera, Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export type GuestScanResult = {
  nome?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  profissao?: string | null;
  cidade?: string | null;
  estado?: string | null;
  pais?: string | null;
  cep?: string | null;
  bairro?: string | null;
  estado_civil?: string | null;
  sexo?: string | null;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024;

export function GuestFormScanner({
  onResult,
  compact = false,
}: {
  onResult: (guest: GuestScanResult) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const company = useCurrentCompany();
  const [busy, setBusy] = useState(false);

  async function readFile(file: File) {
    if (!company.data?.id) return toast.error("Empresa não encontrada.");
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      return toast.error("Use uma foto JPG, PNG ou WebP.");
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      return toast.error("A foto original ficou grande demais. Tire outra foto mais próxima da ficha.");
    }

    setBusy(true);
    try {
      const imageDataUrl = await compressImage(file);
      const { data, error } = await supabase.functions.invoke("scan-guest-form", {
        body: {
          company_id: company.data.id,
          image_data_url: imageDataUrl,
        },
      });
      if (error) throw error;
      if (!data?.guest || typeof data.guest !== "object") {
        throw new Error(data?.error || "Não foi possível ler a ficha.");
      }
      onResult(data.guest as GuestScanResult);
      toast.success("Ficha lida. Confira os dados antes de salvar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao ler a ficha.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-primary/20 bg-primary/5 p-3"}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-2 text-xs"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="A foto é processada temporariamente pelo provedor de IA e não é salva como imagem no banco do HospedaMais."
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {busy ? "Lendo ficha…" : "Ler ficha pela câmera"}
        </button>
        {!compact && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <ScanLine className="h-3.5 w-3.5" /> Foto nítida, ficha inteira e sem reflexo.
          </span>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-primary/15 bg-background/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Privacidade:</strong> a foto é enviada temporariamente ao provedor de IA configurado (Google Gemini) somente para extrair os campos. O HospedaMais não grava a imagem no banco. Use o scanner apenas para hóspedes cuja ficha precise ser digitalizada e confira nome, documento e datas antes de salvar.
          </p>
        </div>
      )}
    </div>
  );
}

async function compressImage(file: File) {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O navegador não conseguiu preparar a foto.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível abrir a foto."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A foto não pôde ser processada."));
    image.src = src;
  });
}
