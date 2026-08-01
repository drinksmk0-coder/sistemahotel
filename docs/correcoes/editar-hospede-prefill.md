# Correção: edição de hóspede deve preservar os dados atuais

## Problema

Ao clicar em editar um hóspede, o formulário pode reaproveitar o estado interno de uma abertura anterior e não preencher o nome já cadastrado. Isso obriga a recepção a digitar novamente uma informação que já existe.

## Regra esperada

- ao clicar em **Editar cliente**, abrir o formulário com todos os campos do registro selecionado;
- preservar nome, tipo, telefone, e-mail, CPF, nascimento, profissão, sexo, endereço, estado civil e filhos;
- ao trocar de hóspede, reinicializar o formulário com o novo registro;
- o usuário deve alterar somente o campo necessário.

## Ajuste de implementação

No ponto que renderiza `ClientForm`, usar uma chave vinculada ao cliente:

```tsx
<ClientForm
  key={editing?.id ?? "new-client"}
  clients={clients}
  editing={editing}
  ...
/>
```

E, ao abrir a edição, garantir que o modo de novo cadastro esteja fechado:

```tsx
onClick={() => {
  setOpen(false);
  setEditing(c);
}}
```

Isso força o React a criar um estado de formulário novo para o hóspede selecionado, usando os dados já cadastrados como valores iniciais.
