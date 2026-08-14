import { createFileRoute } from "@tanstack/react-router";
import { MapaQuartosComHistorico } from "@/components/MapaQuartosComHistorico";
import { RoomOperationsBoard } from "@/components/RoomOperationsBoard";
import { useRole, useSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/mapa")({
  component: MapaPorFuncao,
});

function MapaPorFuncao() {
  const { user } = useSession();
  const { data: role } = useRole(user);

  if (!role) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Carregando o quadro de quartos…
      </div>
    );
  }

  if (role === "limpeza" || role === "cafe") {
    return <RoomOperationsBoard />;
  }

  return <MapaQuartosComHistorico />;
}
