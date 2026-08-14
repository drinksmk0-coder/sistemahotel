import fs from "node:fs";

const file = "src/routes/_authenticated/reservas.tsx";
let src = fs.readFileSync(file, "utf8");

const replaceOnce = (from, to, label) => {
  if (src.includes(to)) return;
  if (!src.includes(from)) throw new Error(`add-reservation-risk: trecho não encontrado (${label})`);
  src = src.replace(from, to);
};

replaceOnce(
  '  const [search, setSearch] = useState("");\n',
  '  const [search, setSearch] = useState("");\n  const [aiRisks, setAiRisks] = useState<Record<string, number>>({});\n  const [aiRiskLoading, setAiRiskLoading] = useState(false);\n',
  "estado",
);

const dateFilterMarker = src.includes('  const [dateFilter, setDateFilter] = useState(() => todayISO());')
  ? '  const [dateFilter, setDateFilter] = useState(() => todayISO());\n\n\n  const overdueDepartures'
  : '  const [dateFilter, setDateFilter] = useState("");\n\n\n  const overdueDepartures';
const dateFilterState = src.includes('  const [dateFilter, setDateFilter] = useState(() => todayISO());')
  ? '  const [dateFilter, setDateFilter] = useState(() => todayISO());'
  : '  const [dateFilter, setDateFilter] = useState("");';

replaceOnce(
  dateFilterMarker,
  `${dateFilterState}\n\n  const reservationRiskKey = reservations\n    .filter((reservation) => reservation.status === "reservado")\n    .map((reservation) => reservation.id)\n    .sort()\n    .join("|");\n\n  useEffect(() => {\n    const companyId = currentCompany.data?.id;\n    if (!companyId) return;\n    let cancelled = false;\n    setAiRiskLoading(true);\n    (supabase as any).functions\n      .invoke("hotel-random-forest", { body: { company_id: companyId } })\n      .then(({ data, error }: any) => {\n        if (cancelled) return;\n        if (error) throw error;\n        const next: Record<string, number> = {};\n        for (const item of data?.cancellation?.risks ?? []) {\n          if (item?.reservation_id) next[String(item.reservation_id)] = Number(item.probability ?? 0);\n        }\n        setAiRisks(next);\n      })\n      .catch(() => {\n        if (!cancelled) setAiRisks({});\n      })\n      .finally(() => {\n        if (!cancelled) setAiRiskLoading(false);\n      });\n    return () => { cancelled = true; };\n  }, [currentCompany.data?.id, reservationRiskKey]);\n\n  const overdueDepartures`,
  "efeito",
);

replaceOnce(
  '                <th className="p-2.5">Canal</th>\n                <th className="p-2.5">Valor</th>',
  '                <th className="p-2.5">Canal</th>\n                <th className="p-2.5">Risco IA</th>\n                <th className="p-2.5">Valor</th>',
  "cabecalho",
);

replaceOnce(
  '                const room = rooms.find((item) => item.numero === r.quarto);\n                return (',
  `                const room = rooms.find((item) => item.numero === r.quarto);\n                const risk = aiRisks[r.id];\n                const riskPct = Number.isFinite(risk) ? Math.round(risk * 100) : null;\n                const riskLevel = riskPct == null ? null : riskPct >= 65 ? "Alto" : riskPct >= 35 ? "Médio" : "Baixo";\n                const riskAction = riskLevel === "Alto"\n                  ? "Confirmar hóspede"\n                  : riskLevel === "Médio"\n                    ? "Acompanhar"\n                    : riskLevel === "Baixo"\n                      ? "Rotina normal"\n                      : "";\n                return (`,
  "calculo-linha",
);

replaceOnce(
  '                    <td className="p-2.5 text-xs font-semibold">{r.canal || "Direto"}</td>\n                    <td className="p-2.5">',
  `                    <td className="p-2.5 text-xs font-semibold">{r.canal || "Direto"}</td>\n                    <td className="p-2.5">\n                      {r.status !== "reservado" ? (\n                        <span className="text-[10px] text-muted-foreground">—</span>\n                      ) : riskPct == null ? (\n                        <span className="text-[10px] text-muted-foreground">{aiRiskLoading ? "Calculando…" : "Sem estimativa"}</span>\n                      ) : (\n                        <div className="min-w-[116px]">\n                          <span\n                            className={\`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold \${\n                              riskLevel === "Alto"\n                                ? "bg-red-100 text-red-700"\n                                : riskLevel === "Médio"\n                                  ? "bg-amber-100 text-amber-800"\n                                  : "bg-emerald-100 text-emerald-700"\n                            }\`}\n                          >\n                            {riskPct}% · {riskLevel}\n                          </span>\n                          <span className="mt-1 block text-[9px] font-semibold text-muted-foreground">{riskAction}</span>\n                        </div>\n                      )}\n                    </td>\n                    <td className="p-2.5">`,
  "celula-risco",
);

replaceOnce(
  '                      toast.success("Reserva criada");',
  '                      toast.success("Reserva criada. A IA está calculando o risco de cancelamento.");',
  "toast",
);

fs.writeFileSync(file, src);
console.log("add-reservation-risk: aplicado");
