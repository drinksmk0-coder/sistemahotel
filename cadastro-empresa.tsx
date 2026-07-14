import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { todayISO } from "@/lib/format";

type TenantRow = { company_id: string };
export type Room = Tables<"rooms"> & TenantRow;
export type Client = Tables<"clients"> & TenantRow;
export type Reservation = Tables<"reservations"> & TenantRow;
export type Sale = Tables<"sales"> & TenantRow;
export type Product = Tables<"products"> & TenantRow;
export type Complaint = Tables<"complaints"> & Partial<TenantRow>;
export type Feedback = Tables<"feedbacks"> & Partial<TenantRow>;
export type IntegrationEvent = Tables<"integration_events"> & Partial<TenantRow>;
export type WhatsappReservationSession = Tables<"whatsapp_reservation_sessions"> & Partial<TenantRow>;

export type Company = {
  id: string;
  nome: string;
  slug: string;
  documento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyMember = {
  id: string;
  company_id: string;
  user_id: string;
  role: "dono" | "recepcao" | "limpeza" | "cafe";
  ativo: boolean;
  created_at: string;
};

export type CompanyInvite = {
  id: string;
  company_id: string;
  email: string;
  nome: string | null;
  role: "dono" | "recepcao" | "limpeza" | "cafe";
  status: string;
  invited_by: string | null;
  created_at: string;
};

export type CompanyIntegration = {
  id: string;
  company_id: string;
  tipo: string;
  nome: string;
  identificador: string | null;
  webhook_url: string | null;
  ativo: boolean;
  configuracao: Record<string, unknown>;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  company_id: string;
  data: string;
  categoria: string;
  descricao: string;
  valor: number;
  pagamento: string | null;
  fornecedor: string | null;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
};

const TENANT_TABLES = new Set([
  "rooms",
  "clients",
  "reservations",
  "sales",
  "complaints",
  "feedbacks",
  "products",
  "integration_events",
  "whatsapp_reservation_sessions",
  "company_integrations",
  "company_invites",
  "company_members",
  "expenses",
]);

function selectedCompanyStorageKey(userId?: string) {
  return `hotelreal.currentCompany.${userId ?? "anon"}`;
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies" as never)
        .select("*")
        .order("nome");
      if (error) throw error;
      return data as unknown as Company[];
    },
  });
}

export function useCurrentCompany() {
  const companies = useCompanies();
  const auth = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 60_000,
  });

  const company = (() => {
    const list = companies.data ?? [];
    if (!list.length) return null;
    const stored = typeof window !== "undefined" ? localStorage.getItem(selectedCompanyStorageKey(auth.data ?? undefined)) : null;
    return list.find((c) => c.id === stored) ?? list[0];
  })();

  return { ...companies, data: company, companies: companies.data ?? [] };
}

export function setCurrentCompanyId(userId: string | undefined, companyId: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(selectedCompanyStorageKey(userId), companyId);
    window.location.assign("/painel");
  }
}

function useTenantQuery<T>(table: string, order: string, options?: { ascending?: boolean; limit?: number }) {
  const company = useCurrentCompany();
  return useQuery({
    queryKey: [table, company.data?.id],
    enabled: !!company.data,
    queryFn: async () => {
      let query = supabase.from(table as never).select("*") as any;
      if (TENANT_TABLES.has(table) && table !== "company_members") query = query.eq("company_id", company.data!.id);
      if (table === "company_members") query = query.eq("company_id", company.data!.id);
      query = query.order(order, { ascending: options?.ascending ?? true });
      if (options?.limit) query = query.limit(options.limit);
      const { data, error } = await query;
      if (error) throw error;
      return data as T[];
    },
  });
}

export function useRooms() {
  return useTenantQuery<Room>("rooms", "numero");
}

export function useClients() {
  return useTenantQuery<Client>("clients", "nome");
}

export function useReservations() {
  return useTenantQuery<Reservation>("reservations", "created_at", { ascending: false });
}

export function useSales() {
  return useTenantQuery<Sale>("sales", "data", { ascending: false });
}

export function useProducts() {
  return useTenantQuery<Product>("products", "nome");
}

export function useComplaints() {
  return useTenantQuery<Complaint>("complaints", "created_at", { ascending: false });
}

export function useFeedbacks() {
  return useTenantQuery<Feedback>("feedbacks", "created_at", { ascending: false });
}

export function useIntegrationEvents() {
  return useTenantQuery<IntegrationEvent>("integration_events", "created_at", { ascending: false, limit: 50 });
}

export function useWhatsappReservationSessions() {
  return useTenantQuery<WhatsappReservationSession>("whatsapp_reservation_sessions", "updated_at", { ascending: false });
}

export function useCompanyMembers() {
  return useTenantQuery<CompanyMember>("company_members", "created_at", { ascending: false });
}

export function useCompanyInvites() {
  return useTenantQuery<CompanyInvite>("company_invites", "created_at", { ascending: false });
}

export function useCompanyIntegrations() {
  return useTenantQuery<CompanyIntegration>("company_integrations", "created_at", { ascending: false });
}

export function useExpenses() {
  return useTenantQuery<Expense>("expenses", "data", { ascending: false });
}

// Generic table mutations
type TableName =
  | "companies"
  | "company_members"
  | "company_invites"
  | "company_integrations"
  | "expenses"
  | "clients"
  | "reservations"
  | "sales"
  | "complaints"
  | "rooms"
  | "feedbacks"
  | "products"
  | "integration_events"
  | "whatsapp_reservation_sessions";

export function useInsert<T extends TableName>(table: T, invalidate: string[]) {
  const qc = useQueryClient();
  const company = useCurrentCompany();
  return useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const withCompany =
        TENANT_TABLES.has(table) && table !== "companies" && company.data?.id && !row.company_id
          ? { ...row, company_id: company.data.id }
          : row;
      const { data, error } = await supabase.from(table as never).insert(withCompany as never).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

export function useUpdate<T extends TableName>(table: T, invalidate: string[]) {
  const qc = useQueryClient();
  const company = useCurrentCompany();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string | number; patch: Record<string, unknown> }) => {
      const key = table === "rooms" ? "numero" : "id";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from(table as never) as any).update(patch).eq(key, id);
      if (TENANT_TABLES.has(table) && table !== "companies" && table !== "rooms" && company.data?.id) {
        query = query.eq("company_id", company.data.id);
      }
      if (table === "rooms" && company.data?.id) query = query.eq("company_id", company.data.id);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useDelete(table: TableName, invalidate: string[]) {
  const qc = useQueryClient();
  const company = useCurrentCompany();
  return useMutation({
    mutationFn: async (id: string | number) => {
      const key = table === "rooms" ? "numero" : "id";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from(table as never) as any).delete().eq(key, id);
      if (TENANT_TABLES.has(table) && table !== "companies" && company.data?.id) {
        query = query.eq("company_id", company.data.id);
      }
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

// --- Derived helpers ---
// `roomSituacao` is the manual override set from the map (limpeza/manutencao).
export function roomStatusToday(
  reservations: Reservation[],
  numero: number,
  today: string,
  roomSituacao?: string | null,
): string {
  if (roomSituacao === "limpeza" || roomSituacao === "manutencao") return roomSituacao;
  const maint = reservations.find((r) => r.quarto === numero && r.status === "manutencao");
  if (maint) return "manutencao";
  const active = reservations.filter(
    (r) => r.quarto === numero && r.status !== "cancelado" && r.status !== "finalizado",
  );
  // A guest who has already checked in (checkin <= hoje) and is fully paid
  // OR whose reservation is marked "ocupado" keeps the room OCUPADO until the
  // stay is finalized (checkout) on the reservations page. This is why a paid
  // room stays red even on/after the checkout date.
  const occupado = active.find(
    (r) => r.checkin <= today && (r.pago || r.status === "ocupado"),
  );
  if (occupado) return "ocupado";
  // A stay covering today that is not fully paid = reservado.
  const occ = active.find((r) => r.checkin <= today && r.checkout >= today);
  if (occ) return "reservado";
  // An upcoming booking (starts in the future) keeps the room reserved.
  if (active.some((r) => r.checkin > today)) return "reservado";
  return "livre";
}

export function activeReservationForRoom(reservations: Reservation[], numero: number): Reservation | null {
  const today = todayISO();
  const active = reservations
    .filter(
      (r) =>
        r.quarto === numero &&
        r.status !== "cancelado" &&
        r.status !== "finalizado" &&
        r.status !== "manutencao" &&
        r.checkin <= today &&
        r.checkout >= today,
    )
    .sort((a, b) => b.checkin.localeCompare(a.checkin));
  return active[0] ?? null;
}

// Future / upcoming reservations for a room (checkout still ahead), so the desk
// can see a room is already booked before creating a new one.
export function futureReservationsForRoom(
  reservations: Reservation[],
  numero: number,
  today: string,
): Reservation[] {
  return reservations
    .filter(
      (r) =>
        r.quarto === numero &&
        r.status !== "cancelado" &&
        r.status !== "finalizado" &&
        r.checkout >= today,
    )
    .sort((a, b) => a.checkin.localeCompare(b.checkin));
}

// Derive the reservation status from how much was paid:
// full payment -> ocupado, partial/none -> reservado.
export function statusFromPayment(valorTotal: number, valorPago: number): "ocupado" | "reservado" {
  return valorTotal > 0 && valorPago >= valorTotal ? "ocupado" : "reservado";
}

// An open, serious complaint blocks new guests from being placed in a room.
export function roomBlock(complaints: Complaint[], numero: number): Complaint | null {
  return (
    complaints.find(
      (c) => c.quarto === numero && c.gravidade === "alta" && c.status !== "resolvido",
    ) ?? null
  );
}


export function hasPaidOverlap(
  reservations: Reservation[],
  numero: number,
  checkin: string,
  checkout: string,
  excludeId?: string,
): boolean {
  return reservations.some(
    (r) =>
      r.quarto === numero &&
      r.id !== excludeId &&
      r.status !== "cancelado" &&
      r.status !== "finalizado" &&
      r.status !== "manutencao" &&
      checkin < r.checkout &&
      checkout > r.checkin,
  );
}
