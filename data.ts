import { useEffect } from "react";
import { toast } from "sonner";

export function useInspectorGuard() {
  useEffect(() => {
    if (import.meta.env.DEV) return;

    const blockContext = (event: MouseEvent) => {
      event.preventDefault();
      toast.warning("Acao bloqueada por seguranca.");
    };

    const blockKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked =
        key === "f12" ||
        (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
        (event.ctrlKey && key === "u") ||
        (event.ctrlKey && key === "s");
      if (!blocked) return;
      event.preventDefault();
      event.stopPropagation();
      toast.warning("Atalho bloqueado por seguranca.");
    };

    window.addEventListener("contextmenu", blockContext);
    window.addEventListener("keydown", blockKeys, true);
    return () => {
      window.removeEventListener("contextmenu", blockContext);
      window.removeEventListener("keydown", blockKeys, true);
    };
  }, []);
}
