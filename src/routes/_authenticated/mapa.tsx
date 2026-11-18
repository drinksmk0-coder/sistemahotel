import { createFileRoute } from "@tanstack/react-router";
import { MapaQuartos } from "@/components/MapaQuartos";
import { RoomOperationsBoard } from "@/components/RoomOperationsBoard";
import { useRole, useSession } from "@/hooks/use-auth";

function validateRoomMapSearch(search: Record<string, unknown>): { date?: string; room?: number } {
  const { date, room } = search;
  const parsedDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00Z`)
    : null;

  return {
    date: parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date
      ? date as string
      : undefined,
    room: typeof room === "number" && Number.isInteger(room) && room > 0 && room < 900
      ? room
      : undefined,
  };
}

export const Route = createFileRoute("/_authenticated/mapa")({
  validateSearch: validateRoomMapSearch,
  component: MapaPorFuncao,
});

function MapaPorFuncao() {
  const { date, room } = Route.useSearch();
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

  return <MapaQuartos key={`${date ?? ""}:${room ?? ""}`} initialDate={date} initialRoom={room} />;
}
