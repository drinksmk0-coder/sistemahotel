import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

declare const __APP_VERSION__: string;

const CHECK_INTERVAL_MS = 2 * 60 * 1000;

function canReloadWithoutLosingInput() {
  const active = document.activeElement;
  return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement);
}

export function AppUpdateWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch(`/app-version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { version?: string };
      if (payload.version && payload.version !== __APP_VERSION__) setUpdateAvailable(true);
    } catch {
      // Sem conexão: mantém a versão atual e tenta novamente no próximo ciclo.
    }
  }, []);

  useEffect(() => {
    void checkVersion();
    const interval = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    const onFocus = () => void checkVersion();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [checkVersion]);

  useEffect(() => {
    if (!updateAvailable) return;
    const timeout = window.setTimeout(() => {
      if (canReloadWithoutLosingInput()) window.location.reload();
    }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-20 right-3 z-[100] max-w-sm rounded-xl border border-brass bg-card p-3 shadow-2xl xl:bottom-4 xl:right-4">
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-pine" />
        <div>
          <strong className="text-sm text-pine-dark">Nova versão disponível</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            As melhorias já chegaram. Atualize para usar a versão mais recente do SistemaHotel.
          </p>
          <button type="button" className="btn-primary mt-3 text-xs" onClick={() => window.location.reload()}>
            Atualizar agora
          </button>
        </div>
      </div>
    </div>
  );
}
