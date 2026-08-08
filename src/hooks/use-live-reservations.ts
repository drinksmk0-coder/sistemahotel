import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

const OPERATION_REFRESH_INTERVAL_MS = 15_000;

export function useLiveReservations() {
  const queryClient = useQueryClient();
  const company = useCurrentCompany();
  const companyId = company.data?.id;

  useEffect(() => {
    if (!companyId) return;

    const refreshOperationalData = () => {
      [
        "reservations",
        "rooms",
        "sales",
        "operational-room-board",
        "company_members",
        "company_invites",
        "complaints",
        "kitchen_items",
        "kitchen_productions",
        "guest_checkins",
        "breakfast_attendance",
      ].forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: [key] });
      });
      void queryClient.invalidateQueries({ queryKey: ["role"] });
    };

    const refreshBoard = () => {
      void queryClient.invalidateQueries({ queryKey: ["operational-room-board", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["reservations", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["rooms", companyId] });
    };

    refreshOperationalData();

    const intervalId = window.setInterval(
      refreshOperationalData,
      OPERATION_REFRESH_INTERVAL_MS,
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshOperationalData();
    };

    window.addEventListener("online", refreshOperationalData);
    window.addEventListener("focus", refreshOperationalData);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabase
      .channel(`hotel-live-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations", filter: `company_id=eq.${companyId}` },
        refreshBoard,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `company_id=eq.${companyId}` },
        refreshBoard,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "breakfast_attendance", filter: `company_id=eq.${companyId}` },
        refreshBoard,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales", filter: `company_id=eq.${companyId}` },
        refreshOperationalData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_members", filter: `company_id=eq.${companyId}` },
        refreshOperationalData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `company_id=eq.${companyId}` },
        refreshOperationalData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_items", filter: `company_id=eq.${companyId}` },
        refreshOperationalData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_productions", filter: `company_id=eq.${companyId}` },
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
