import fs from "node:fs";

function patch(path, changes) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after, label] of changes) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      if (
        path === "src/routes/_authenticated/clientes.tsx" &&
        label === "mensagem de CPF inválido em Clientes" &&
        source.includes('Field label="CPF protegido"')
      ) {
        continue;
      }
      throw new Error(`Falha em ${path} (${label}): padrão não encontrado.`);
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patch("src/components/ReservaForm.tsx", [
  [
    'import { quoteStay } from "@/lib/rates";',
    'import { quoteStay } from "@/lib/rates";\nimport { GuestFormScanner, type GuestScanResult } from "@/components/GuestFormScanner";\nimport { isValidCPF } from "@/lib/cpf";',
    "imports de scanner e CPF",
  ],
  [
    '  const selectedClient = clients.find((c) => c.id === clienteId);',
    '  const selectedClient = clients.find((c) => c.id === clienteId);\n  const cpfInvalid = onlyDigits(cpf).length > 0 && !isValidCPF(cpf);',
    "estado de CPF inválido",
  ],
  [
    '  function handlePhoneChange(value: string) {\n    setTelefone(formatPhoneBR(value));\n    const uf = stateFromPhone(value);\n    if (uf) setEstado(uf);\n  }',
    '  function handlePhoneChange(value: string) {\n    setTelefone(formatPhoneBR(value));\n    const uf = stateFromPhone(value);\n    if (uf) setEstado(uf);\n  }\n\n  function applyGuestScan(guest: GuestScanResult) {\n    setClienteId("");\n    if (guest.nome) setNome(guest.nome.replace(/[0-9]/g, ""));\n    if (guest.telefone) handlePhoneChange(guest.telefone);\n    if (guest.email) setEmail(guest.email);\n    if (guest.cpf) setCpf(formatCpfBR(guest.cpf));\n    if (guest.data_nascimento) setNascimento(guest.data_nascimento);\n    if (guest.profissao) setProfissao(guest.profissao);\n    if (guest.cidade) setCidade(guest.cidade);\n    if (guest.estado) setEstado(guest.estado);\n    if (guest.cep) setCep(guest.cep);\n    if (guest.bairro) setBairro(guest.bairro);\n    if (guest.estado_civil) setEstadoCivil(guest.estado_civil);\n    if (guest.sexo) setSexo(guest.sexo);\n    if (guest.cpf && !isValidCPF(guest.cpf)) {\n      toast.warning("A ficha foi lida, mas o CPF extraído é inválido. Confira os números antes de salvar.");\n    }\n  }',
    "preenchimento por câmera",
  ],
  [
    '    if (requiredFields.cpf && onlyDigits(cleanCpf).length !== 11)\n      return toast.error("CPF obrigatório. Informe os 11 dígitos.");',
    '    if (requiredFields.cpf && onlyDigits(cleanCpf).length !== 11)\n      return toast.error("CPF obrigatório. Informe os 11 dígitos.");\n    if (cleanCpf && !isValidCPF(cleanCpf))\n      return toast.error("CPF inválido. Confira os números digitados.");',
    "bloqueio de CPF inválido",
  ],
  [
    '        <Field label="Cliente">',
    '        {!editing && <GuestFormScanner onResult={applyGuestScan} />}\n\n        <Field label="Cliente">',
    "scanner no formulário de reserva",
  ],
  [
    '                required={requiredFields.cpf}\n              />\n            </Field>',
    '                required={requiredFields.cpf}\n                aria-invalid={cpfInvalid}\n              />\n              {cpfInvalid && (\n                <p className="mt-1 text-xs font-semibold text-brick">CPF inválido. Confira os 11 dígitos.</p>\n              )}\n            </Field>',
    "aviso visual de CPF",
  ],
]);

patch("src/routes/_authenticated/clientes.tsx", [
  [
    'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";',
    'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";\nimport { GuestFormScanner, type GuestScanResult } from "@/components/GuestFormScanner";\nimport { isValidCPF } from "@/lib/cpf";',
    "imports de qualidade do cliente",
  ],
  [
    '  const telefoneDigits = onlyDigits(telefone);',
    '  const telefoneDigits = onlyDigits(telefone);\n  const cpfInvalido = cpfDigits.length > 0 && !isValidCPF(cpf);',
    "estado de CPF inválido do cliente",
  ],
  [
    '  return (\n    <Modal open onClose={onClose} title={editing ? "Editar cliente" : "Novo cliente"}>',
    '  function applyGuestScan(guest: GuestScanResult) {\n    if (guest.nome) setNome(guest.nome.replace(/[0-9]/g, ""));\n    if (guest.telefone) {\n      setTelefone(formatPhoneBR(guest.telefone));\n      const uf = stateFromPhone(guest.telefone);\n      if (uf) setEstado(uf);\n    }\n    if (guest.email) setEmail(guest.email);\n    if (guest.cpf) setCpf(formatCpfBR(guest.cpf));\n    if (guest.data_nascimento) setNascimento(guest.data_nascimento);\n    if (guest.profissao) setProfissao(guest.profissao);\n    if (guest.sexo) setSexo(guest.sexo);\n    if (guest.bairro) setBairro(guest.bairro);\n    if (guest.estado_civil) setEstadoCivil(guest.estado_civil);\n    if (guest.cidade) setCidade(guest.cidade);\n    if (guest.estado) setEstado(guest.estado);\n    if (guest.pais) setPais(guest.pais);\n    if (guest.cep) setCep(guest.cep);\n    if (guest.cpf && !isValidCPF(guest.cpf)) {\n      toast.warning("O CPF lido na ficha é inválido. Confira antes de salvar.");\n    }\n  }\n\n  return (\n    <Modal open onClose={onClose} title={editing ? "Editar cliente" : "Novo cliente"}>',
    "preenchimento da ficha em Clientes",
  ],
  [
    '          if (cpfJaCadastrado || telefoneJaCadastrado) {',
    '          if (cpfInvalido) {\n            toast.error("CPF inválido. Confira os números digitados.");\n            return;\n          }\n          if (cpfJaCadastrado || telefoneJaCadastrado) {',
    "bloqueio de CPF inválido em Clientes",
  ],
  [
    '        <Field label="Nome">',
    '        <GuestFormScanner onResult={applyGuestScan} />\n\n        <Field label="Nome">',
    "scanner em Clientes",
  ],
  [
    '              aria-invalid={cpfJaCadastrado}\n            />\n            {cpfJaCadastrado && (\n              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>\n            )}',
    '              aria-invalid={cpfJaCadastrado || cpfInvalido}\n            />\n            {cpfInvalido ? (\n              <p className="mt-1 text-xs font-semibold text-brick">CPF inválido. Confira os números.</p>\n            ) : cpfJaCadastrado ? (\n              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>\n            ) : null}',
    "mensagem de CPF inválido em Clientes",
  ],
]);

patch("src/routes/checkin-online.tsx", [
  [
    'import { supabase } from "@/integrations/supabase/client";',
    'import { supabase } from "@/integrations/supabase/client";\nimport { formatCpfBR, isValidCPF } from "@/lib/cpf";',
    "CPF no check-in online",
  ],
  [
    '    if (!form.nome_completo.trim() || !form.telefone.trim() || !form.numero_documento.trim() || !form.nascimento || !form.cidade.trim() || !form.pais.trim()) {\n      return setError("Preencha todos os campos obrigatórios do titular.");\n    }',
    '    if (!form.nome_completo.trim() || !form.telefone.trim() || !form.numero_documento.trim() || !form.nascimento || !form.cidade.trim() || !form.pais.trim()) {\n      return setError("Preencha todos os campos obrigatórios do titular.");\n    }\n    if (form.tipo_documento === "CPF" && !isValidCPF(form.numero_documento)) {\n      return setError("CPF inválido. Confira os 11 dígitos antes de enviar.");\n    }\n    const invalidCompanionCpf = companions.findIndex((item) => {\n      const digits = item.cpf.replace(/\\D/g, "");\n      return digits.length === 11 && !isValidCPF(item.cpf);\n    });\n    if (invalidCompanionCpf >= 0) return setError(`CPF inválido no acompanhante ${invalidCompanionCpf + 1}.`);',
    "validação do CPF do hóspede online",
  ],
  [
    '<Input label="Número do documento *" value={form.numero_documento} onChange={(v) => set("numero_documento", v)} />',
    '<Input label="Número do documento *" value={form.numero_documento} onChange={(v) => set("numero_documento", form.tipo_documento === "CPF" ? formatCpfBR(v) : v)} />',
    "máscara do CPF online",
  ],
]);

console.log("Qualidade de dados do hóspede: scanner por câmera e validação de CPF aplicados.");
