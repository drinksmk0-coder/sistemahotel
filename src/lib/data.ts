import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { todayISO } from "@/lib/format";

type TenantRow = { company_id: string };
export type Room = Tables<"rooms"> & TenantRow;
export type Client = Tables<"clients"> & TenantRow;
export type Reservation = Tables<"reservations"> &
  TenantRow & {
    group_id?: string | null;
    origem_importacao?: string | null;
    observacoes_importacao?: string | null;
    billing_responsibility?: "guest" | "company";
    billing_company_name?: string | null;
    billing_company_document?: string | null;
    billing_company_email?: string | null;
    billing_due_date?: string | null;
    billing_status?: "not_applicable" | "pending" | "paid" | "overdue";
    checkout_at?: string | null;
  };
export type Sale = Tables<"sales"> &
  TenantRow & {
    cliente_id?: string | null;
  };
export type Product = Tables<"products"> & TenantRow;
export type KitchenItem = Tables<"kitchen_items"> & TenantRow;
export type KitchenProduction = Tables<"kitchen_productions"> & TenantRow;
export type Complaint = Tables<"complaints"> & Partial<TenantRow>;
export type Feedback = Tables<"feedbacks"> & Partial<TenantRow>;
export type IntegrationEvent = Tables<"integration_events"> & Partial<TenantRow>;
export type WhatsappReservationSession = Tables<"whatsapp_reservation_sessions"> &
  Partial<TenantRow>;

export type RateRule = {
  id: string;
  company_id: string;
  nome: string;
  inicio: string;
  fim: string;
  configuracao_quarto: string | null;
  valor_base: number;
  hospedes_inclusos: number;
  adicional_hospede: number;
  minimo_diarias: number;
  prioridade: number;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReservationGroup = {
  id: string;
  company_id: string;
  nome: string;
  responsavel_nome: string;
  responsavel_telefone: string | null;
  checkin: string;
  checkout: string;
  canal: string | null;
  observacoes: string | null;
  status: "ativo" | "finalizado" | "cancelado";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

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

export type GuestPayment = {
  id: string;
  company_id: string;
  reservation_id: string;
  cliente_id: string | null;
  amount: number;
  method: string;
  source: "hospedagem" | "consumo" | "conta";
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type SystemIssue = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  severity: "baixa" | "media" | "alta" | "critica";
  status: "aberto" | "investigando" | "resolvido";
  source: "manual" | "frontend" | "integracao" | "chatbot";
  page_url: string | null;
  error_code: string | null;
  context: Record<string, unknown>;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_by: string | null;
};

const TENANT_TABLES = new Set([
  "rooms",
  "clients",
  "reservations",
  "sales",
  "complaints",
  "feedbacks",
  "products",
  "kitchen_items",
  "kitchen_productions",
  "integration_events",
  "whatsapp_reservation_sessions",
  "company_integrations",
  "company_invites",
  "company_members",
  "expenses",
  "rate_rules",
  "reservation_groups",
  "guest_payments",
  "system_issues",
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
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(selectedCompanyStorageKey(auth.data ?? undefined))
        : null;
    return list.find((c) => c.id === stored) ?? list[0];
  })();

  return { ...companies, data: company, companies: companies.data ?? [] };
}

export function setCurrentCompanyId(userId: string | undefined, companyId: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(selectedCompanyStorageKey(userId), companyId);
    window.location.assign("/mapa");
  }
}

function useTenantQuery<T>(
  table: string,
  order: string,
  options?: { ascending?: boolean; limit?: number },
) {
  const company = useCurrentCompany();
  return useQuery({
    queryKey: [table, company.data?.id],
    enabled: !!company.data,
    queryFn: async () => {
      let query = supabase.from(table as never).select("*") as any;
      if (TENANT_TABLES.has(table) && table !== "company_members")
        query = query.eq("company_id", company.data!.id);
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
  const company = useCurrentCompany();
  return useQuery({
    queryKey: ["rooms", company.data?.id],
    enabled: !!company.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms" as never)
        .select("*")
        .eq("company_id", company.data!.id)
        .lt("numero", 900)
        .order("numero");
      if (error) throw error;
      return data as Room[];
    },
  });
}

export function useClients() {
  return useTenantQuery<Client>("clients", "nome");
}

export function useReservations() {
  const company = useCurrentCompany();
  return useQuery({
    queryKey: ["reservations", company.data?.id],
    enabled: !!company.data,
    queryFn: async () => {
      const companyId = company.data!.id;
      const [reservationResult, clientResult] = await Promise.all([
        (supabase.from("reservations" as never) as any)
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase.from("clients" as never) as any)
          .select("id,nome")
          .eq("company_id", companyId),
      ]);
      if (reservationResult.error) throw reservationResult.error;
      if (clientResult.error) throw clientResult.error;

      const clientNames = new Map<string, string>(
        (clientResult.data ?? []).map((client: { id: string; nome: string | null }) => [
          client.id,
          String(client.nome ?? "").trim(),
        ]),
      );

      return ((reservationResult.data ?? []) as Reservation[]).map((reservation) => {
        const linkedName = reservation.cliente_id
          ? clientNames.get(reservation.cliente_id)
          : undefined;
        const storedName = String(reservation.cliente_nome ?? "").trim();
        return {
          ...reservation,
          cliente_nome: linkedName || storedName || "Hóspede não identificado",
        };
      });
    },
  });
}

export function useSales() {
  return useTenantQuery<Sale>("sales", "data", { ascending: false });
}

export function useProducts() {
  return useTenantQuery<Product>("products", "nome");
}

export function useKitchenItems() {
  return useTenantQuery<KitchenItem>("kitchen_items", "nome");
}

export function useKitchenProductions() {
  return useTenantQuery<KitchenProduction>("kitchen_productions", "data", {
    ascending: false,
    limit: 120,
  });
}

export function useComplaints() {
  return useTenantQuery<Complaint>("complaints", "created_at", { ascending: false });
}

export function useFeedbacks() {
  return useTenantQuery<Feedback>("feedbacks", "created_at", { ascending: false });
}

export function useIntegrationEvents() {
  return useTenantQuery<IntegrationEvent>("integration_events", "created_at", {
    ascending: false,
    limit: 50,
  });
}

export function useWhatsappReservationSessions() {
  return useTenantQuery<WhatsappReservationSession>("whatsapp_reservation_sessions", "updated_at", {
    ascending: false,
  });
}

export function useCompanyMembers() {
  return useTenantQuery<CompanyMember>("company_members", "created_at", { ascending: false });
}

export function useCompanyInvites() {
  return useTenantQuery<CompanyInvite>("company_invites", "created_at", { ascending: false });
}

export function useCompanyIntegrations() {
  return useTenantQuery<CompanyIntegration>("company_integrations", "created_at", {
    ascending: false,
  });
}

export function useExpenses() {
  return useTenantQuery<Expense>("expenses", "data", { ascending: false });
}

export function useRateRules() {
  return useTenantQuery<RateRule>("rate_rules", "prioridade", { ascending: false });
}

export function useReservationGroups() {
  return useTenantQuery<ReservationGroup>("reservation_groups", "created_at", { ascending: false });
}

export function useGuestPayments() {
  return useTenantQuery<GuestPayment>("guest_payments", "created_at", { ascending: false });
}

export function useSystemIssues() {
  return useTenantQuery<SystemIssue>("system_issues", "last_seen_at", {
    ascending: false,
    limit: 200,
  });
}

// Generic table mutations
type TableName =
  | "companies"
  | "company_members"
  | "company_invites"
  | "company_integrations"
  | "expenses"
  | "rate_rules"
  | "reservation_groups"
  | "guest_payments"
  | "system_issues"
  | "clients"
  | "reservations"
  | "sales"
  | "complaints"
  | "rooms"
  | "feedbacks"
  | "products"
  | "kitchen_items"
  | "kitchen_productions"
  | "integration_events"
  | "whatsapp_reservation_sessions";

export function useRegisterGuestPayment() {
  const qc = useQueryClient();
  const company = useCurrentCompany();
  return useMutation({
    mutationFn: async ({
      reservationId,
      amount,
      method,
      notes,
    }: {
      reservationId: string;
      amount: number;
      method: string;
      notes?: string;
    }) => {
      if (!company.data?.id) throw new Error("Empresa não encontrada.");
      const { data, error } = await (supabase as any).rpc("register_guest_payment", {
        p_reservation_id: reservationId,
        p_amount: amount,
        p_method: method,
        p_notes: notes?.trim() || null,
      });
      if (error) throw error;
      return data as {
        reservation_id: string;
        amount_received: number;
        previous_balance: number;
        remaining_balance: number;
      };
    },
    onSuccess: () => {
      ["reservations", "sales", "guest_payments"].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      );
    },
  });
}

export function useInsert<T extends TableName>(table: T, invalidate: string[]) {
  const qc = useQueryClient();
  const company = useCurrentCompany();
  return useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const withCompany =
        TENANT_TABLES.has(table) && table !== "companies" && company.data?.id && !row.company_id
          ? { ...row, company_id: company.data.id }
          : row;
      const { data, error } = await supabase
        .from(table as never)
        .insert(withCompany as never)
        .select();
      if (error) {
        if (table === "clients" && error.code === "23505") {
          const detail = `${error.message} ${error.details ?? ""}`.toLowerCase();
          if (detail.includes("telefone")) {
            throw new Error(
              "Este telefone já pertence a outro cliente. Pesquise o telefone e selecione ou reative o cadastro existente.",
            );
          }
          if (detail.includes("cpf")) {
            throw new Error(
              "Este CPF já pertence a outro cliente. Pesquise o CPF e selecione ou reative o cadastro existente.",
            );
          }
          throw new Error("Já existe um cliente com estes dados.");
        }
        throw error;
      }
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
      let query = (supabase.from(table as never) as any).update(patch).eq(key, id);
      if (
        TENANT_TABLES.has(table) &&
        table !== "companies" &&
        table !== "rooms" &&
        company.data?.id
      ) {
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

export function useDeleteClientsWithHistory() {
  const qc = useQueryClient();
  const company = useCurrentCompany();
  return useMutation({
    mutationFn: async (clientIds: string[]) => {
      if (!company.data?.id) throw new Error("Empresa não encontrada.");
      if (clientIds.length === 0) return { clients_deleted: 0, reservations_deleted: 0 };

      const { data, error } = await (supabase as any).rpc("delete_clients_with_history", {
        p_company_id: company.data.id,
        p_client_ids: clientIds,
      });
      if (error) throw error;
      return data as { clients_deleted: number; reservations_deleted: number };
    },
    onSuccess: () => {
      ["clients", "reservations", "sales", "guest_payments", "integration_events"].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      );
    },
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
  if (roomSituacao === "limpo") return "livre";
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
  const occupado = active.find((r) => r.checkin <= today && (r.pago || r.status === "ocupado"));
  if (occupado) return "ocupado";
  // A stay covering today that is not fully paid = reservado.
  const occ = active.find((r) => r.checkin <= today && r.checkout >= today);
  if (occ) return "reservado";
  // An upcoming booking (starts in the future) keeps the room reserved.
  if (active.some((r) => r.checkin > today)) return "reservado";
  return "livre";
}

export function activeReservationForRoom(
  reservations: Reservation[],
  numero: number,
): Reservation | null {
  const today = todayISO();
  const active = reservations
    .filter(
      (r) =>
        r.quarto === numero &&
        r.status !== "cancelado" &&
        r.status !== "finalizado" &&
        r.status !== "manutencao" &&
        r.status !== "saida_pendente" &&
        r.checkin <= today &&
        (r.checkout >= today || r.status === "ocupado"),
    )
    .sort((a, b) => b.checkin.localeCompare(a.checkin));
  return active[0] ?? null;
}

export type ReservationFinancialState =
  | "quitada"
  | "reserva_futura"
  | "pagamento_parcial"
  | "reserva_vencida"
  | "estadia_vencida"
  | "checkout_com_saldo";

export type ReservationFinancialSummary = {
  total: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  state: ReservationFinancialState;
};

export function reservationFinancialSummary(
  reservation: Reservation,
  today = todayISO(),
): ReservationFinancialSummary {
  const total = Math.max(0, Number(reservation.valor_total) || 0);
  const paid = Math.max(0, Number(reservation.valor_pago) || 0);
  const balance = Math.max(0, total - paid);
  const daysOverdue =
    reservation.checkout < today ? differenceInCalendarDays(today, reservation.checkout) : 0;

  let state: ReservationFinancialState;
  if (balance <= 0) state = "quitada";
  else if (reservation.status === "finalizado") state = "checkout_com_saldo";
  else if (
    (reservation.status === "ocupado" || reservation.status === "saida_pendente") &&
    reservation.checkout < today
  )
    state = "estadia_vencida";
  else if (reservation.status === "reservado" && reservation.checkout < today)
    state = "reserva_vencida";
  else if (paid > 0) state = "pagamento_parcial";
  else state = "reserva_futura";

  return { total, paid, balance, daysOverdue, state };
}

export function reservationNeedsFinancialAttention(
  reservation: Reservation,
  today = todayISO(),
): boolean {
  if (reservation.status === "cancelado" || reservation.status === "manutencao") return false;
  const summary = reservationFinancialSummary(reservation, today);
  return summary.balance > 0 && reservation.checkout < today;
}

function differenceInCalendarDays(laterISO: string, earlierISO: string): number {
  const later = new Date(`${laterISO}T12:00:00`);
  const earlier = new Date(`${earlierISO}T12:00:00`);
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 86_400_000));
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

// Pagamento e presença são estados diferentes. Uma reserva só vira ocupada no check-in manual.
export function statusFromPayment(_valorTotal: number, _valorPago: number): "ocupado" | "reservado" {
  return "reservado";
}

// An open, serious complaint blocks new guests from being placed in a room.
export function roomBlock(complaints: Complaint[], numero: number): Complaint | null {
  return (
    complaints.find(
      (c) => c.quarto === numero && c.gravidade === "alta" && c.status !== "resolvido",
    ) ?? null
  );
}

export function hasActiveOverlap(
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
