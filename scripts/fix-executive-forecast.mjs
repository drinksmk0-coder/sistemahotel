import fs from "node:fs";

const path = "src/components/executive/FilteredHotelExecutiveDashboard.tsx";
let src = fs.readFileSync(path, "utf8");

const from = 'forecast=d.forecast.filter((f:any)=>f.date>t&&f.date<=end).map((f:any)=>({date:f.date,label:br(f.date),previsto:n(f.expected_occupancy)*baseShare}))';
const to = 'forecast=d.forecast.filter((f:any)=>f.date>t&&f.date<=(end>t?end:add(t,7))).map((f:any)=>({date:f.date,label:br(f.date),previsto:n(f.expected_occupancy)*baseShare}))';

if (!src.includes(to)) {
  if (!src.includes(from)) throw new Error("fix-executive-forecast: trecho de forecast não encontrado");
  src = src.replace(from, to);
}

fs.writeFileSync(path, src);
console.log("fix-executive-forecast: previsão futura garantida");
