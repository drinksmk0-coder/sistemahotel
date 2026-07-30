import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CircleHelp,
  KeyRound,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { useRooms } from "@/lib/data";
import type { RoomWithFeatures } from "@/components/RoomFeatures";

export const Route = createFileRoute("/_authenticated/ajuda-sistema")({
  component: AjudaSistema,
});

const SUGGESTIONS = [
  "Onde faço uma reserva?",
  "Onde vejo a ficha preenchida pelo hóspede?",
  "Como faço check-in e check-out?",
  "Qual quarto tem frigobar?",
  "Quais quartos possuem Smart TV?",
  "Onde lanço uma venda ou consumo?",
  "Como encontro um quarto disponível?",
];

function AjudaSistema() {
  const { data: rooms = [] } = useRooms();
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState("");

  const answer = useMemo(
    () =>
      submitted
        ? answerSystemQuestion(submitted, rooms as RoomWithFeatures[])
        : "",
    [rooms, submitted],
  );

  function submit(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setQuestion(clean);
    setSubmitted(clean);
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Ajuda do sistema"
        subtitle="Orientações operacionais sem acesso a relatórios financeiros, configurações da IA ou dados estratégicos."
      />

      <section className="grid gap-3 md:grid-cols-3">
        <InfoCard
          icon={<CircleHelp />}
          title="Ajuda local"
          text="As respostas abaixo não dependem do Gemini e continuam disponíveis mesmo quando um provedor externo estiver fora do ar."
        />
        <InfoCard
          icon={<ShieldCheck />}
          title="Acesso protegido"
          text="Recepção, Governança e Café veem somente orientações operacionais compatíveis com sua função."
        />
        <InfoCard
          icon={<KeyRound />}
          title="Análises restritas"
          text="Relatórios, indicadores financeiros e treinamento do HotelAI permanecem exclusivos do dono."
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <input
              className="field h-11 w-full pl-9"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ex.: onde faço uma reserva?"
              maxLength={500}
            />
          </label>
          <button type="submit" className="btn-primary min-h-11">
            Buscar orientação
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => submit(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      {submitted && (
        <section className="rounded-xl border border-primary/25 bg-card p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
            Pergunta
          </p>
          <h2 className="mt-1 text-sm font-bold text-foreground">
            {submitted}
          </h2>
          <div className="mt-3 whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
            {answer}
          </div>
        </section>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-primary">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function answerSystemQuestion(
  question: string,
  rooms: RoomWithFeatures[],
) {
  const value = normalize(question);

  const roomAnswer = answerRoomFeatures(value, rooms);
  if (roomAnswer) return roomAnswer;

  if (/\b(reserva|reservar|nova reserva)\b/.test(value)) {
    return [
      "Abra Reservas no menu lateral e clique em Nova reserva.",
      "Informe hóspede, check-in, check-out, quantidade de pessoas, quarto, tarifa, canal e pagamento.",
      "Para consultar disponibilidade antes, abra Quadro de quartos e selecione a data.",
    ].join("\n\n");
  }

  if (/\b(ficha|fnrh|formulario|assinatura|check in online)\b/.test(value)) {
    return [
      "As fichas preenchidas aparecem no alerta verde no alto da tela.",
      "Clique no alerta para abrir Fichas de check-in, conferir os dados e visualizar a assinatura.",
      "A ficha também permanece vinculada à reserva do hóspede.",
    ].join("\n\n");
  }

  if (/\b(check in|entrada do hospede)\b/.test(value)) {
    return "Abra Reservas, localize a reserva e use a ação Check-in. Confira antes a ficha do hóspede, o quarto e o pagamento.";
  }

  if (/\b(check out|saida do hospede)\b/.test(value)) {
    return "Abra Reservas, localize a hospedagem ativa e use Check-out. Confira diárias, consumos, pagamentos e saldo pendente antes de finalizar.";
  }

  if (/\b(disponibilidade|quarto livre|mapa|quadro de quartos)\b/.test(value)) {
    return "Abra Quadro de quartos, escolha a data e use os filtros de situação, características e número da UH.";
  }

  if (/\b(venda|produto|consumo|servico|lavanderia)\b/.test(value)) {
    return "Abra Vendas para lançar produtos, serviços e consumos. Quando estiver ligado a uma hospedagem, selecione a reserva ou o quarto correto.";
  }

  if (/\b(cliente|hospede|cadastro)\b/.test(value)) {
    return "Abra Clientes para localizar ou cadastrar o hóspede. Dados obrigatórios e permissões são controlados pelo dono.";
  }

  if (/\b(limpeza|governanca|camareira)\b/.test(value)) {
    return "Abra Quadro de quartos. Os quartos em limpeza ou manutenção aparecem destacados; abra a UH para consultar características e ocorrências ativas.";
  }

  if (/\b(cafe|alimentacao|hospedes por quarto)\b/.test(value)) {
    return "Abra o Painel e o Quadro de quartos para consultar quartos ocupados e a operação do café da manhã. Valores financeiros e dados estratégicos ficam restritos ao dono.";
  }

  return [
    "Não encontrei uma orientação específica para essa frase.",
    "Tente perguntar usando o nome da tela ou da tarefa, por exemplo: reserva, check-in, ficha, quarto, venda, cliente, limpeza ou café.",
  ].join("\n\n");
}

function answerRoomFeatures(value: string, rooms: RoomWithFeatures[]) {
  const predicates: Array<{
    matches: RegExp;
    label: string;
    test: (room: RoomWithFeatures) => boolean;
  }> = [
    {
      matches: /\b(frigobar|minibar)\b/,
      label: "com frigobar",
      test: (room) => Boolean(room.frigobar),
    },
    {
      matches: /\b(smart tv|tv smart|televisao smart)\b/,
      label: "com Smart TV",
      test: (room) => Boolean(room.tv_smart),
    },
    {
      matches: /\b(silencioso|silenciosos|menos barulho|quieto)\b/,
      label: "mais silenciosos",
      test: (room) => room.nivel_ruido === "silencioso",
    },
    {
      matches: /\b(frente para rua|vista para rua|de frente pra rua|rua)\b/,
      label: "de frente para a rua",
      test: (room) => room.vista === "rua",
    },
    {
      matches: /\b(fundos|fundo do hotel)\b/,
      label: "nos fundos",
      test: (room) => room.vista === "fundos",
    },
    {
      matches: /\b(banheiro pequeno|banheiro apertado)\b/,
      label: "com banheiro pequeno",
      test: (room) => room.tamanho_banheiro === "pequeno",
    },
    {
      matches: /\b(prioridade|priorizar|vender primeiro)\b/,
      label: "marcados para priorizar",
      test: (room) => room.prioridade_venda === 1,
    },
    {
      matches: /\b(vender por ultimo|alugar por ultimo)\b/,
      label: "marcados para vender por último",
      test: (room) => room.prioridade_venda === 3,
    },
  ];

  const rule = predicates.find((item) => item.matches.test(value));
  if (!rule) return "";

  const matches = rooms
    .filter(rule.test)
    .sort(
      (a, b) =>
        Number(b.preco) - Number(a.preco) || a.numero - b.numero,
    );

  if (!matches.length) {
    return `Nenhum quarto está confirmado no cadastro como ${rule.label}. Abra Quadro de quartos e preencha as características reais de cada UH antes de prometer essa condição ao hóspede.`;
  }

  return `Quartos ${rule.label}: ${matches
    .map(
      (room) =>
        `${room.numero} (${formatCurrency(Number(room.preco))})`,
    )
    .join(", ")}.`;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[?!.;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}
