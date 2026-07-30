import { createFileRoute } from "@tanstack/react-router";
import { MapaQuartos } from "@/components/MapaQuartos";

export const Route = createFileRoute("/_authenticated/mapa")({
  component: MapaQuartos,
});
