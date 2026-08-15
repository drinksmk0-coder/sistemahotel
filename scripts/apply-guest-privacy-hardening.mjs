import fs from "node:fs";

function patch(path, changes) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after, label] of changes) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) throw new Error(`Falha em ${path} (${label}): padrão não encontrado.`);
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patch("src/routes/_authenticated/clientes.tsx", [
  [
    'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";',
    'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";\nimport { guestPrivacyId, maskCpf } from "@/lib/privacy";',
    "import de privacidade",
  ],
  [
    '    const matchesSearch =\n      c.nome.toLowerCase().includes(q.toLowerCase()) ||\n      (c.telefone ?? "").includes(q) ||\n      (c.documento ?? "").includes(q) ||\n      (c.cpf ?? "").includes(q);',
    '    const matchesSearch =\n      c.nome.toLowerCase().includes(q.toLowerCase()) ||\n      (c.telefone ?? "").includes(q);',
    "remove busca operacional por documento",
  ],
  [
    '        "Email",\n        "CPF",\n        "Sexo",',
    '        "Email",\n        "ID do hóspede",\n        "Sexo",',
    "remove CPF do cabecalho de exportacao",
  ],
  [
    '        (c as Client & { email?: string | null }).email ?? "",\n        c.cpf,\n        c.sexo,',
    '        (c as Client & { email?: string | null }).email ?? "",\n        guestPrivacyId(c.id),\n        c.sexo,',
    "substitui CPF por id interno na exportacao",
  ],
  [
    '                        {c.cpf || c.documento || "Documento não informado"}',
    '                        ID do hóspede: {guestPrivacyId(c.id)}',
    "remove documento do cartao",
  ],
  [
    '    cpf: client.cpf ?? "",',
    '    cpf: maskCpf(client.cpf),',
    "protege CPF na impressao iniciada por Clientes",
  ],
  [
    '  const [cpf, setCpf] = useState(editing?.cpf ?? "");',
    '  const [cpf, setCpf] = useState("");',
    "nao carrega CPF salvo no campo de edicao",
  ],
  [
    '          if (requiredGuestFields.cpf && cpfDigits.length !== 11) {\n            toast.error("CPF obrigatório. Informe os 11 dígitos.");\n            return;\n          }',
    '          if (cpfDigits.length > 0 && cpfDigits.length !== 11) {\n            toast.error("CPF inválido. Informe os 11 dígitos ou deixe vazio para manter o CPF protegido.");\n            return;\n          }\n          if (requiredGuestFields.cpf && !editing?.cpf && cpfDigits.length !== 11) {\n            toast.error("CPF obrigatório. Informe os 11 dígitos.");\n            return;\n          }',
    "validacao de CPF protegido na edicao",
  ],
  [
    '            cpf: formatCpfBR(cpf) || null,',
    '            cpf: editing && !cpfDigits ? editing.cpf : formatCpfBR(cpf) || null,',
    "preserva CPF sem reexibir",
  ],
  [
    '          <Field label="CPF">\n            <input\n              className="field"\n              value={cpf}\n              onChange={(e) => setCpf(formatCpfBR(e.target.value))}\n              maxLength={14}\n              required={requiredGuestFields.cpf}\n              aria-invalid={cpfJaCadastrado}\n            />',
    '          <Field label="CPF protegido">\n            <input\n              className="field"\n              type="password"\n              inputMode="numeric"\n              autoComplete="off"\n              value={cpf}\n              placeholder={editing?.cpf ? "CPF protegido — deixe vazio para manter" : "Digite o CPF"}\n              onChange={(e) => setCpf(formatCpfBR(e.target.value))}\n              maxLength={14}\n              required={requiredGuestFields.cpf && !editing?.cpf}\n              aria-invalid={cpfJaCadastrado}\n            />',
    "campo de CPF oculto",
  ],
  [
    '            {cpfJaCadastrado && (\n              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>\n            )}',
    '            {editing?.cpf && !cpf && (\n              <p className="mt-1 text-xs text-muted-foreground">O CPF salvo permanece protegido e não é reexibido.</p>\n            )}\n            {cpfJaCadastrado && (\n              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>\n            )}',
    "aviso de protecao do CPF",
  ],
]);

patch("src/routes/_authenticated/fichas-checkin.tsx", [
  [
    'import { fmtDate } from "@/lib/format";',
    'import { fmtDate } from "@/lib/format";\nimport { maskCpf } from "@/lib/privacy";',
    "import de mascara de CPF",
  ],
  [
    '<span>Documento: {guest.cpf || "não informado"}</span>',
    '<span>CPF: {maskCpf(guest.cpf)}</span>',
    "mascara CPF de hospede sincronizado",
  ],
  [
    '<span>Documento: {form.numero_documento || "não informado"}</span>',
    '<span>Documento: {protectDocument(form.numero_documento)}</span>',
    "protege documento do titular quando for CPF",
  ],
  [
    '<span>Documento: {guest.cpf || "não informado"}</span>',
    '<span>CPF: {maskCpf(guest.cpf)}</span>',
    "mascara CPF de acompanhante",
  ],
  [
    'function displayFormValue(key: string, value?: string | null) {\n  if (!value?.trim()) return "Não informado";',
    'function protectDocument(value?: string | null) {\n  if (!value?.trim()) return "não informado";\n  return value.replace(/\\D/g, "").length === 11 ? maskCpf(value) : value;\n}\n\nfunction displayFormValue(key: string, value?: string | null) {\n  if (!value?.trim()) return "Não informado";\n  if (key === "numero_documento" && value.replace(/\\D/g, "").length === 11) return maskCpf(value);',
    "protege CPF em dados complementares",
  ],
]);

patch("src/routes/checkin-print.tsx", [
  [
    'import { clearFnrhPrintSession, loadFnrhPrintSession, type FnrhPrintData } from "@/lib/fnrh-print-session";',
    'import { clearFnrhPrintSession, loadFnrhPrintSession, type FnrhPrintData } from "@/lib/fnrh-print-session";\nimport { maskCpf } from "@/lib/privacy";',
    "import de mascara na FNRH",
  ],
  [
    '  const cpf = form.cpf || (normalizedDocumentType === "cpf" ? form.numero_documento : "");',
    '  const cpf = maskCpf(form.cpf || (normalizedDocumentType === "cpf" ? form.numero_documento : ""));',
    "CPF mascarado na impressao",
  ],
]);

for (const path of [
  "src/routes/_authenticated/clientes.tsx",
  "src/routes/_authenticated/fichas-checkin.tsx",
  "src/routes/checkin-print.tsx",
]) {
  const source = fs.readFileSync(path, "utf8");
  if (/Documento:\s*\{(?:guest\.cpf|form\.numero_documento)/.test(source)) {
    throw new Error(`CPF ainda exposto em ${path}`);
  }
}

console.log("Privacidade de CPF aplicada: UI mascarada, exportação sem CPF e ID interno do hóspede.");
