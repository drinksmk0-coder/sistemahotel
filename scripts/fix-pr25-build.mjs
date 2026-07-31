import fs from "node:fs";

const path = "src/components/MapaQuartos.tsx";
const source = fs.readFileSync(path, "utf8");

if (source.includes("account?.salesTotal")) {
  fs.writeFileSync(path, source.replaceAll("account?.salesTotal", "account?.extrasTotal"));
  console.log("MapaQuartos: salesTotal substituído por extrasTotal.");
} else if (source.includes("account?.extrasTotal")) {
  console.log("MapaQuartos: correção já aplicada.");
} else {
  throw new Error("MapaQuartos: campo de consumo não encontrado.");
}
