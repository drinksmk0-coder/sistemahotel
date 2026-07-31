import fs from "node:fs";

function replaceIdempotent(path, before, after, label) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(after)) {
    console.log(`${label}: correção já aplicada.`);
    return;
  }
  if (!source.includes(before)) {
    throw new Error(`${label}: trecho esperado não encontrado.`);
  }
  fs.writeFileSync(path, source.replace(before, after));
  console.log(`${label}: correção aplicada.`);
}

replaceIdempotent(
  "src/components/MapaQuartos.tsx",
  "account?.salesTotal",
  "account?.extrasTotal",
  "MapaQuartos",
);

replaceIdempotent(
  "src/routes/_authenticated/assistente.tsx",
  'if (role !== "dono" && role !== "recepcao") {',
  'if (role !== "dono") {',
  "Acesso visual ao HotelAI",
);

replaceIdempotent(
  "supabase/functions/hotel-assistant-v2/index.ts",
  `    if (!["dono", "recepcao"].includes(memberRole)) {
      return json({ error: "O HotelAI está disponível para dono e recepção." }, 403);
    }`,
  `    if (memberRole !== "dono") {
      return json(
        { error: "O HotelAI analítico está disponível somente para o proprietário." },
        403,
      );
    }`,
  "Validação de proprietário no servidor",
);
