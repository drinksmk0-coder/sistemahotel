import fs from "node:fs";

function patchFile(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after);
}

patchFile("src/routes/_authenticated/vendas.tsx", (source) => {
  source = source.replace(
    'import { useMemo, useState } from "react";',
    'import { useEffect, useMemo, useState } from "react";',
  );

  source = source.replace(
    '  const initialRoom = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("quarto")) || null : null;\n  const [purchaseOpen, setPurchaseOpen] = useState(initialRoom != null);',
    '  const [initialRoom, setInitialRoom] = useState<number | null>(null);\n  const [purchaseOpen, setPurchaseOpen] = useState(false);\n\n  useEffect(() => {\n    const rawRoom = new URLSearchParams(window.location.search).get("quarto");\n    const parsedRoom = rawRoom ? Number(rawRoom) : null;\n    if (parsedRoom && Number.isFinite(parsedRoom)) {\n      setInitialRoom(parsedRoom);\n      setPurchaseOpen(true);\n    }\n  }, []);',
  );

  source = source.replace(
    '  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);',
    '  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);\n\n  useEffect(() => {\n    if (initialRoom != null) setRoom(initialRoom);\n  }, [initialRoom]);',
  );

  return source;
});

patchFile("src/routes/_authenticated/fichas-checkin.tsx", (source) => {
  source = source.replace(
    /    const guestsDelete = await \(supabase as any\)[\s\S]*?    if \(guestsDelete\.error\) \{[\s\S]*?      return;\n    \}\n/,
    '',
  );

  source = source.replace(
    '    const result = await (supabase as any)\n      .from("guest_checkins")',
    '    const result = await (supabase as any)\n      .from("guest_checkins")',
  );

  return source;
});

patchFile("src/routes/_authenticated/ajuda-sistema.tsx", (source) =>
  source.replace(
    'function normalize(value: string) {\n  return value',
    'function normalize(value: unknown) {\n  return String(value ?? "")',
  ),
);

console.log("Regressões do preview corrigidas.");
