import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

const RESERVATION_REFRESH_INTERVAL_MS = 30_000;

export function useLiveReservations() {
  const queryClient = useQueryClient();
  const company = useCurrentCompany();
  const companyId = company.data?.id;

  useEffect(() => {
    if (!companyId) return;

    const refreshOperationalData = () => {
      queryClient.invalidateQueries({ queryKey: ["reservations", companyId] });
      queryClient.invalidateQueries({ queryKey: ["rooms", companyId] });
      queryClient.invalidateQueries({ queryKey: ["sales", companyId] });
    };

    refreshOperationalData();

    const intervalId = window.setInterval(
      refreshOperationalData,
      RESERVATION_REFRESH_INTERVAL_MS,
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshOperationalData();
    };

    window.addEventListener("online", refreshOperationalData);
    window.addEventListener("focus", refreshOperationalData);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabase
      .channel(`hotel-reservations-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `company_id=eq.${companyId}`,
        },
        refreshOperationalData,
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", refreshOperationalData);
      window.removeEventListener("focus", refreshOperationalData);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);
}
