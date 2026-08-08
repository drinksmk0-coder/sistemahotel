import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type Filters = {
  payment: string;
  state: string;
  room: string;
  weekday: string;
  channel: string;
  category: string;
};
type ReservationRow = {
  id: string;
  codigo_externo: string | null;
  status: string | null;
  presence_status: string | null;
  checkin: string;
  quarto: number | null;
  valor_total: number | string | null;
  pagamento: string | null;
  canal: string | null;
  cliente_id: string | null;
};
type RoomRow = { numero: number; configuracao: string | null };
type ClientRow = { id: string; estado: string | null };
type BookingImpactRow = {
  booking_code: string;
  reservation_id: string | null;
  checkin_text: string | null;
  total_text: string | null;
  event_type: "cancellation_details" | "no_show";
};

const ALL_FILTERS: Filters = {
  payment: "all",
  state: "all",
  room: "all",
  weekday: "all",
  channel: "all",
  category: "all",
};

export function ExecutiveCancellationImpact() {
  const company = useCurrentCompany();
  const [cancelHost, setCancelHost] = useState<HTMLElement | null>(null);
  const [noShowHost, setNoShowHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    const syncRange = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
      setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
    };

    const syncFilters = () => {
      const filterTitle = Array.from(root.querySelectorAll<HTMLElement>("section h2"))
        .find((heading) => heading.textContent?.trim() === "Filtros cruzados");
      const panel = filterTitle?.closest("section");
      if (!panel) return;

      const next = { ...ALL_FILTERS };
      panel.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
        const select = label.querySelector<HTMLSelectElement>("select");
        if (!select) return;
        const text = label.textContent?.trim().toLowerCase() ?? "";
        if (text.startsWith("forma de pagamento")) next.payment = select.value;
        else if (text.startsWith("estado")) next.state = select.value;
        else if (text.startsWith("quarto")) next.room = select.value;
        else if (text.startsWith("dia da semana")) next.weekday = select.value;
        else if (text.startsWith("canal")) next.channel = select.value;
        else if (text.startsWith("categoria do quarto")) next.category = select.value;
      });
      setFilters((current) => sameFilters(current, next) ? current : next);
    };

    const findKpiContent = (label: string) => {
      const heading = Array.from(root.querySelectorAll<HTMLElement>("article p"))
        .find((element) => element.textContent?.trim() === label);
      return heading?.parentElement ?? null;
    };

    const install = () => {
      const cancelContent = findKpiContent("Cancelamentos");
      const noShowContent = findKpiContent("No-show");

      if (cancelContent) {
        let host = cancelContent.querySelector<HTMLElement>("[data-cancellation-value-host]");
        if (!host) {
          host = document.createElement("div");
          host.dataset.cancellationValueHost = "true";
          cancelContent.appendChild(host);
        }
        setCancelHost((current) => current === host ? current : host);
      }

      if (noShowContent) {
        let host = noShowContent.querySelector<HTMLElement>("[data-noshow-value-host]");
        if (!host) {
          host = document.createElement("div");
          host.dataset.noshowValueHost = "true";
          noShowContent.appendChild(host);
        }
        setNoShowHost((current) => current === host ? current : host);
      }

      const expenseInsights = root.querySelector<HTMLElement>("[data-expense-insights-host]");
      const financialTitle = Array.from(root.querySelectorAll<HTMLElement>("article h2"))
        .find((heading) => heading.textContent?.startsWith("2. Hospedagem, produtos, despesas e GOP"));
      const financialSection = financialTitle?.closest("section");
      if (expenseInsights && financialSection && expenseInsights.previousElementSibling !== financialSection) {
        financialSection.insertAdjacentElement("afterend", expenseInsights);
      }

      syncRange();
      syncFilters();
    };

    install();
    const timer = window.setInterval(install, 500);
    const syncAfterInteraction = () => window.setTimeout(() => {
      syncRange();
      syncFilters();
    }, 0);
    root.addEventListener("input", syncAfterInteraction, true);
    root.addEventListener("change", syncAfterInteraction, true);
    root.addEventListener("click", syncAfterInteraction, true);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("input", syncAfterInteraction, true);
      root.removeEventListener("change", syncAfterInteraction, true);
      root.removeEventListener("click", syncAfterInteraction, true);
      root.querySelector("[data-cancellation-value-host]")?.remove();
      root.querySelector("[data-noshow-value-host]")?.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ["executive-cancellation-financial-impact", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    queryFn: async () => {
      const [reservationsResult, roomsResult, clientsResult, bookingResult] = await Promise.all([
        (supabase as any)
          .from("reservations")
          .select("id,codigo_externo,status,presence_status,checkin,quarto,valor_total,pagamento,canal,cliente_id")
          .eq("company_id", company.data!.id)
          .gte("checkin", range!.start)
          .lte("checkin", range!.end),
        (supabase as any)
          .from("rooms")
          .select("numero,configuracao")
          .eq("company_id", company.data!.id),
        (supabase as any)
          .from("clients")
          .select("id,estado")
          .eq("company_id", company.data!.id),
        (supabase as any)
          .from("booking_browser_events")
          .select("booking_code,reservation_id,checkin_text,total_text,event_type")
          .eq("company_id", company.data!.id)
          .in("event_type", ["cancellation_details", "no_show"]),
      ]);
      if (reservationsResult.error) throw reservationsResult.error;
      if (roomsResult.error) throw roomsResult.error;
      if (clientsResult.error) throw clientsResult.error;
      if (bookingResult.error) throw bookingResult.error;
      return {
        reservations: (reservationsResult.data ?? []) as ReservationRow[],
        rooms: (roomsResult.data ?? []) as RoomRow[],
        clients: (clientsResult.data ?? []) as ClientRow[],
        bookingImpacts: (bookingResult.data ?? []) as BookingImpactRow[],
      };
    },
  });

  const impact = useMemo(() => {
    if (!query.data) return { cancelled: 0, noShow: 0 };
    const roomMap = new Map(query.data.rooms.map((room) => [room.numero, room]));
    const clientMap = new Map(query.data.clients.map((client) => [client.id, client]));
    const rows = query.data.reservations.filter((row) => matchesFilters(row, filters, roomMap, clientMap));
    const cancelledRows = rows.filter((row) => isCancelled(row.status));
    const noShowRows = rows.filter((row) => isNoShow(row.status, row.presence_status));
    const allowExternalBooking = (filters.channel === "all" || filters.channel === "Booking.com")
      && filters.payment === "all" && filters.state === "all" && filters.room === "all" && filters.category === "all";

    const externalBookingLoss = (
      eventType: BookingImpactRow["event_type"],
      internalRows: ReservationRow[],
    ) => {
      const countedReservationIds = new Set(internalRows.map((row) => row.id));
      const countedBookingCodes = new Set(
        internalRows
          .map((row) => String(row.codigo_externo ?? "").replace(/\D/g, ""))
          .filter(Boolean),
      );
      return (allowExternalBooking ? query.data.bookingImpacts : [])
        .filter((event) => event.event_type === eventType)
        .map((event) => ({ ...event, checkin: parseBookingDate(event.checkin_text) }))
        .filter((event) => event.checkin
          && range
          && event.checkin >= range.start
          && event.checkin <= range.end
          && (filters.weekday === "all" || String(parseDate(event.checkin).getUTCDay()) === filters.weekday)
          && (!event.reservation_id || !countedReservationIds.has(event.reservation_id))
          && !countedBookingCodes.has(String(event.booking_code).replace(/\D/g, "")))
        .reduce((sum, event) => sum + parseMoney(event.total_text), 0);
    };

    return {
      cancelled: cancelledRows.reduce((sum, row) => sum + number(row.valor_total), 0)
        + externalBookingLoss("cancellation_details", cancelledRows),
      noShow: noShowRows.reduce((sum, row) => sum + number(row.valor_total), 0)
        + externalBookingLoss("no_show", noShowRows),
    };
  }, [filters, query.data, range]);

  return (
    <>
      {cancelHost && createPortal(
        <ImpactValue
          value={impact.cancelled}
          label="receita potencial perdida"
          tone="red"
          title="Valor bruto das reservas canceladas. Não é prejuízo líquido definitivo: multas de cancelamento e revenda do quarto podem reduzir a perda real."
        />,
        cancelHost,
      )}
      {noShowHost && createPortal(
        <ImpactValue
          value={impact.noShow}
          label="receita potencial perdida"
          tone="purple"
          title="Valor bruto das reservas classificadas como no-show, incluindo eventos confirmados do Booking mesmo quando não existe UH interna vinculada. Valores cobrados antecipadamente podem reduzir a perda real."
        />,
        noShowHost,
      )}
    </>
  );
}

function ImpactValue({ value, label, tone, title }: { value: number; label: string; tone: "red" | "purple"; title: string }) {
  return (
    <span
      className={`mt-0.5 block truncate text-[9px] font-extrabold tabular-nums ${tone === "red" ? "text-red-600" : "text-violet-600"}`}
      title={title}
    >
      {fmtBRL(value)} · {label}
    </span>
  );
}

function matchesFilters(row: ReservationRow, filters: Filters, roomMap: Map<number, RoomRow>, clientMap: Map<string, ClientRow>) {
  if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;
  if (filters.state !== "all" && stateCode(clientMap.get(row.cliente_id ?? "")?.estado ?? "") !== filters.state) return false;
  if (filters.room !== "all" && String(row.quarto ?? "") !== filters.room) return false;
  if (filters.weekday !== "all" && String(parseDate(row.checkin).getUTCDay()) !== filters.weekday) return false;
  if (filters.channel !== "all" && normalizeChannel(row.canal) !== filters.channel) return false;
  if (filters.category !== "all" && (roomMap.get(row.quarto ?? -1)?.configuracao || "Não informado") !== filters.category) return false;
  return true;
}

function sameFilters(a: Filters, b: Filters) {
  return a.payment === b.payment
    && a.state === b.state
    && a.room === b.room
    && a.weekday === b.weekday
    && a.channel === b.channel
    && a.category === b.category;
}

function normalizePayment(value: string | null) {
  const text = normalize(value);
  if (text.includes("pix")) return "Pix";
  if (text.includes("dinheiro")) return "Dinheiro";
  if (text.includes("debito")) return "Cartão de Débito";
  if (text.includes("credito")) return "Cartão de Crédito";
  if (text.includes("transfer")) return "Transferência";
  if (text.includes("pendente") || text.includes("fiado")) return "Pendente/Fiado";
  return value?.trim() || "Outros";
}

function normalizeChannel(value: string | null) {
  const text = normalize(value);
  if (text.includes("booking")) return "Booking.com";
  if (text.includes("google")) return "Google";
  if (text.includes("instagram")) return "Instagram";
  if (text.includes("formulario")) return "Formulário";
  if (text.includes("whats") || text.includes("direto") || text.includes("balcao")) return "Direto (Site/WhatsApp)";
  return value?.trim() || "Outros";
}

function isCancelled(value: string | null) { return normalize(value).includes("cancel"); }
function isNoShow(status: string | null, presenceStatus: string | null) {
  const text = `${normalize(status)} ${normalize(presenceStatus)}`.replace(/[\s_-]+/g, "");
  return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento");
}
function normalize(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function parseMoney(value: unknown) {
  const text = String(value ?? "").replace(/[^0-9,.-]/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized = text;
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  else if (comma >= 0) normalized = text.length - comma - 1 === 3 ? text.replace(/,/g, "") : text.replace(",", ".");
  else if (dot >= 0) normalized = text.length - dot - 1 === 3 ? text.replace(/\./g, "") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function parseBookingDate(value: unknown) {
  const text = String(value ?? "").toLocaleLowerCase("pt-BR");
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const months: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    apr: "04", may: "05", aug: "08", sep: "09", oct: "10", dec: "12",
  };
  const portuguese = text.match(/(\d{1,2})\s+de\s+([a-zç.]+)\s+de\s+(\d{4})/i);
  if (portuguese) {
    const month = months[portuguese[2].replace(/\./g, "").slice(0, 3)];
    return month ? `${portuguese[3]}-${month}-${portuguese[1].padStart(2, "0")}` : null;
  }
  const english = text.match(/\b([a-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i);
  if (!english) return null;
  const month = months[english[1].slice(0, 3)];
  return month ? `${english[3]}-${month}-${english[2].padStart(2, "0")}` : null;
}
function stateCode(value: string) {
  const clean = normalize(value).toUpperCase();
  const aliases: Record<string, string> = {
    ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE",
    "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA",
    "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA",
    PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ",
    "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR",
    "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO",
  };
  return aliases[clean] ?? (clean.length === 2 ? clean : clean.toLowerCase().replace("br-", "").toUpperCase());
}