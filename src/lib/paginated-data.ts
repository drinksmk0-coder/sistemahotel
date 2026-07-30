import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export type PageRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export type PageResult<T> = {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type PaginatedTable = "clients" | "reservations" | "sales" | "expenses";

const TABLE_CONFIG: Record<
  PaginatedTable,
  { order: string; searchColumns: string[]; dateColumn?: string }
> = {
  clients: { order: "nome", searchColumns: ["nome", "telefone", "email", "cpf"] },
  reservations: {
    order: "created_at",
    searchColumns: ["hospede", "codigo_externo", "status"],
    dateColumn: "checkin",
  },
  sales: {
    order: "data",
    searchColumns: ["item", "pagamento"],
    dateColumn: "data",
  },
  expenses: {
    order: "data",
    searchColumns: ["categoria", "descricao", "fornecedor"],
    dateColumn: "data",
  },
};

export function useTenantPage<T>(table: PaginatedTable, request: PageRequest = {}) {
  const company = useCurrentCompany();
  const page = Math.max(1, request.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, request.pageSize ?? 25));
  const search = request.search?.trim() ?? "";
  const config = TABLE_CONFIG[table];

  return useQuery({
    queryKey: ["tenant-page", table, company.data?.id, page, pageSize, search, request.startDate, request.endDate],
    enabled: Boolean(company.data?.id),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<PageResult<T>> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase.from(table as never) as any)
        .select("*", { count: "exact" })
        .eq("company_id", company.data!.id)
        .order(config.order, { ascending: table === "clients" })
        .range(from, to);

      if (search) {
        const escaped = search.replace(/[,%()]/g, " ").trim();
        if (escaped) {
          query = query.or(config.searchColumns.map((column) => `${column}.ilike.%${escaped}%`).join(","));
        }
      }
      if (config.dateColumn && request.startDate) query = query.gte(config.dateColumn, request.startDate);
      if (config.dateColumn && request.endDate) query = query.lte(config.dateColumn, request.endDate);

      const { data, count, error } = await query;
      if (error) throw error;
      const total = count ?? 0;
      return {
        rows: (data ?? []) as T[],
        count: total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  });
}

export const useClientsPage = <T,>(request?: PageRequest) => useTenantPage<T>("clients", request);
export const useReservationsPage = <T,>(request?: PageRequest) => useTenantPage<T>("reservations", request);
export const useSalesPage = <T,>(request?: PageRequest) => useTenantPage<T>("sales", request);
export const useExpensesPage = <T,>(request?: PageRequest) => useTenantPage<T>("expenses", request);
