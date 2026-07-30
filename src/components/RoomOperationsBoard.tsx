import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Coffee, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { complaintLabel } from "@/lib/constants";

type BoardRow = {
  numero: number;
  andar: number;
  configuracao: string;
  situacao: string | null;
  frigobar: boolean;
  tv_smart: boolean;
  vista: string | null;
  nivel_ruido: string | null;
  ventilacao: string | null;
  tamanho_banheiro: string | null;
  prioridade_venda: number | null;
  ocupacao_status: "livre" | "reservado" | "ocupado" | "limpeza" | "manutencao";
  pessoas: number;
  checkin: string | null;
  checkout: string | null;
  ocorrencias_ativas: number;
  principal_ocorrencia: string | null;
};

const STATUS: Record<BoardRow["ocupacao_status"], { label: string; className: string }> = {
  livre: {
    label: "Livre",
    className: "border-sage/50 bg-sage-bg text-pine-dark",
  },
  reservado: {
    label: "Chegada / reservado",
    className: "border-brass/60 bg-brass-bg text-[oklch(0.4_0.06_74)]",
  },
  ocupado: {
    label: "Ocupado",
    className: "border-pine/45 bg-pine/10 text-pine-dark",
  },
  limpeza: {
    label: "Limpeza",
    className: "border-slate/50 bg-slate-bg text-slate",
  },
  manutencao: {
    label: "Manutenção",
    className: "border-zinc-400 bg-zinc-200 text-zinc-800",
  },
};

export function RoomOperationsBoard() {
  const company = useCurrentCompany();
  const { user } = useSession();
  const { data: role } = useRole(user);
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState("todos");
  const isHousekeeping = role === "limpeza";
  const isBreakfast = role === "cafe";

  const board = useQuery({
    queryKey: ["operational-room-board", company.data?.id, date],
    enabled: Boolean(company.data?.id),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_operational_room_board",
        {
          p_company_id: company.data!.id,
          p_date: date,
        },
      );
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as BoardRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ room, status }: { room: number; status: string | null }) => {
      const { error } = await (supabase as any).rpc(
        "set_operational_room_status",
        {
          p_company_id: company.data!.id,
          p_room_number: room,
          p_status: status,
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação do quarto atualizada");
      void queryClient.invalidateQueries({
        queryKey: ["operational-room-board", company.data?.id],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const source = board.data ?? [];
    return source
      .filter((row) => {
        if (isBreakfast && row.ocupacao_status !== "ocupado") return false;
        if (statusFilter !== "todos" && row.ocupacao_status !== statusFilter) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          operationalPriority(a) - operationalPriority(b) ||
          a.andar - b.andar ||
          a.numero - b.numero,
      );
  }, [board.data, isBreakfast, statusFilter]);

  const summary = useMemo(() => {
    const source = board.data ?? [];
    return {
      occupied: source.filter((row) => row.ocupacao_status === "ocupado").length,
      guests: source
        .filter((row) => row.ocupacao_status === "ocupado")
        .reduce((sum, row) => sum + Number(row.pessoas || 0), 0),
      cleaning: source.filter((row) => row.ocupacao_status === "limpeza").length,
      maintenance: source.filter((row) => row.ocupacao_status === "manutencao")
        .length,
      arrivals: source.filter((row) => row.ocupacao_status === "reservado").length,
      issues: source.reduce(
        (sum, row) => sum + Number(row.ocorrencias_ativas || 0),
        0,
      ),
    };
  }, [board.data]);

  if (company.isLoading || board.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Carregando o quadro operacional dos quartos…
      </div>
    );
  }

  if (company.error || board.error || !company.data) {
    return (
      <div className="rounded-xl border border-brick/40 bg-brick-bg p-6 text-sm text-brick">
        Não foi possível carregar o quadro operacional.
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="text-base font-bold text-pine-dark">
              {isBreakfast
                ? "Quadro do café da manhã"
                : "Quadro de Governança"}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Somente informações operacionais. Nomes, pagamentos e valores não são carregados.
            </p>
          </div>
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
            <input
              type="date"
              className="field h-9 pl-8 text-xs"
              value={date}
              onChange={(event) => setDate(event.target.value || todayISO())}
            />
          </label>
          {!isBreakfast && (
            <select
              className="field h-9 min-w-44 text-xs"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="todos">Todas as situações</option>
              <option value="limpeza">Aguardando limpeza</option>
              <option value="ocupado">Ocupados</option>
              <option value="reservado">Chegadas / reservados</option>
              <option value="livre">Livres</option>
              <option value="manutencao">Manutenção</option>
            </select>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Summary label="Ocupados" value={summary.occupied} />
          <Summary label="Hóspedes" value={summary.guests} />
          <Summary label="Chegadas" value={summary.arrivals} />
          <Summary label="Limpeza" value={summary.cleaning} />
          <Summary label="Manutenção" value={summary.maintenance} />
          <Summary label="Ocorrências" value={summary.issues} danger={summary.issues > 0} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {rows.map((room) => {
          const style = STATUS[room.ocupacao_status];
          return (
            <article
              key={room.numero}
              className={`relative min-h-[166px] rounded-xl border p-3 shadow-sm ${style.className}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-[0.16em] opacity-60">
                    Quarto
                  </span>
                  <strong className="font-serif text-2xl leading-none">
                    {room.numero}
                  </strong>
                  <p className="mt-1 text-[9px] opacity-75">
                    {room.andar}º andar · {room.configuracao}
                  </p>
                </div>
                <span className="rounded-full bg-white/70 px-2 py-1 text-[9px] font-black text-pine-dark">
                  {style.label}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1 text-[9px]">
                {room.tv_smart && <Tag>Smart TV</Tag>}
                {room.frigobar && <Tag>Frigobar</Tag>}
                {room.nivel_ruido === "silencioso" && <Tag>Silencioso</Tag>}
                {room.tamanho_banheiro === "pequeno" && <Tag>Banheiro pequeno</Tag>}
                {room.ventilacao === "abafado" && <Tag>Mais abafado</Tag>}
                {room.prioridade_venda === 3 && <Tag>Uso por último</Tag>}
              </div>

              {room.ocupacao_status === "ocupado" && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/60 px-2 py-1.5 text-xs font-bold text-pine-dark">
                  {isBreakfast ? <Coffee className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  {room.pessoas || 0} hóspede(s)
                </div>
              )}

              {room.ocorrencias_ativas > 0 && (
                <div className="mt-2 rounded-lg border border-brick/30 bg-brick-bg/70 px-2 py-1.5 text-[10px] text-brick">
                  <strong>{room.ocorrencias_ativas} ocorrência(s) ativa(s)</strong>
                  {room.principal_ocorrencia && (
                    <span className="block">
                      {complaintLabel(room.principal_ocorrencia)}
                    </span>
                  )}
                </div>
              )}

              {isHousekeeping && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="rounded-md border border-slate/40 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      updateStatus.mutate({
                        room: room.numero,
                        status: room.situacao === "limpeza" ? null : "limpeza",
                      })
                    }
                  >
                    {room.situacao === "limpeza" ? "Marcar liberado" : "Em limpeza"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-400 bg-white/70 px-2 py-1 text-[10px] font-bold text-zinc-700"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      updateStatus.mutate({
                        room: room.numero,
                        status:
                          room.situacao === "manutencao" ? null : "manutencao",
                      })
                    }
                  >
                    <Wrench className="h-3 w-3" />
                    {room.situacao === "manutencao" ? "Liberar" : "Manutenção"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {!rows.length && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum quarto corresponde a esta data e filtro.
        </div>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`text-xl font-black tabular-nums ${danger ? "text-brick" : "text-pine-dark"}`}>
        {value}
      </p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/70 px-1.5 py-0.5 font-semibold">{children}</span>;
}

function operationalPriority(room: BoardRow) {
  if (room.ocupacao_status === "limpeza") return 0;
  if (room.ocupacao_status === "manutencao") return 1;
  if (room.ocorrencias_ativas > 0) return 2;
  if (room.ocupacao_status === "reservado") return 3;
  if (room.ocupacao_status === "ocupado") return 4;
  return 5;
}
