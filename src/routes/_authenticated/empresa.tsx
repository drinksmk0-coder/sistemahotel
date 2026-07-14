import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field, Modal } from "@/components/ui-kit";
import { useCurrentCompany, useInsert, useRooms, useUpdate, type Company, type Room } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/empresa")({
  component: Empresa,
});

function Empresa() {
  const current = useCurrentCompany();
  const { data: rooms = [] } = useRooms();
  const updateCompany = useUpdate("companies", ["companies"]);
  const insertRoom = useInsert("rooms", ["rooms"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const [roomOpen, setRoomOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  if (!current.data) {
    return (
      <div>
        <PageHeader title="Empresa" subtitle="Nenhuma empresa encontrada para este usuario." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Empresa"
        subtitle="Cadastro da empresa, quartos, capacidade e observacoes operacionais."
        action={
          <button onClick={() => setRoomOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Quarto
          </button>
        }
      />

      <CompanyForm
        company={current.data}
        onSave={(patch) =>
          updateCompany.mutate(
            { id: current.data!.id, patch },
            {
              onSuccess: () => toast.success("Empresa atualizada"),
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />

      <section className="mt-5 card-surface overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="font-serif text-lg font-bold">Quartos cadastrados</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="p-3">Numero</th>
              <th className="p-3">Andar</th>
              <th className="p-3">Configuracao</th>
              <th className="p-3">Diaria</th>
              <th className="p-3">Banheiro</th>
              <th className="p-3">Observacao</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={`${room.company_id}-${room.numero}`} className="border-b border-border/50">
                <td className="p-3 font-serif text-lg font-bold">{room.numero}</td>
                <td className="p-3">{room.andar}</td>
                <td className="p-3">{room.configuracao}</td>
                <td className="p-3">{fmtBRL(room.preco)}</td>
                <td className="p-3">{room.banheiro ? "Sim" : "Nao"}</td>
                <td className="p-3 text-muted-foreground">{room.situacao ?? "-"}</td>
                <td className="p-3 text-right">
                  <button
                    className="btn-ghost py-1 text-xs"
                    onClick={() => {
                      setEditingRoom(room);
                      setRoomOpen(true);
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {roomOpen && (
        <RoomForm
          editing={editingRoom}
          onClose={() => {
            setRoomOpen(false);
            setEditingRoom(null);
          }}
          onSave={(row) => {
            if (editingRoom) {
              updateRoom.mutate(
                { id: editingRoom.numero, patch: row },
                {
                  onSuccess: () => {
                    toast.success("Quarto atualizado");
                    setRoomOpen(false);
                    setEditingRoom(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            } else {
              insertRoom.mutate(row, {
                onSuccess: () => {
                  toast.success("Quarto cadastrado");
                  setRoomOpen(false);
                },
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      )}
    </div>
  );
}

function CompanyForm({ company, onSave }: { company: Company; onSave: (patch: Partial<Company>) => void }) {
  const [form, setForm] = useState(company);
  useEffect(() => setForm(company), [company.id]);
  const set = (key: keyof Company, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="card-surface grid gap-3 p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          nome: form.nome,
          documento: form.documento,
          telefone: form.telefone,
          whatsapp: form.whatsapp,
          email: form.email,
          endereco: form.endereco,
          cidade: form.cidade,
          estado: form.estado,
          observacoes: form.observacoes,
        });
      }}
    >
      <Field label="Nome da empresa">
        <input className="field" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
      </Field>
      <Field label="Documento">
        <input className="field" value={form.documento ?? ""} onChange={(e) => set("documento", e.target.value)} />
      </Field>
      <Field label="Telefone">
        <input className="field" value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
      </Field>
      <Field label="WhatsApp">
        <input className="field" value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} />
      </Field>
      <Field label="E-mail">
        <input className="field" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Cidade / UF">
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <input className="field" value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} />
          <input className="field" value={form.estado ?? ""} onChange={(e) => set("estado", e.target.value)} maxLength={2} />
        </div>
      </Field>
      <Field label="Endereco">
        <input className="field" value={form.endereco ?? ""} onChange={(e) => set("endereco", e.target.value)} />
      </Field>
      <Field label="Observacoes">
        <input className="field" value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <button className="btn-primary" type="submit">
          Salvar empresa
        </button>
      </div>
    </form>
  );
}

function RoomForm({
  editing,
  onClose,
  onSave,
}: {
  editing: Room | null;
  onClose: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [numero, setNumero] = useState(editing?.numero ?? 0);
  const [andar, setAndar] = useState(editing?.andar ?? 1);
  const [configuracao, setConfiguracao] = useState(editing?.configuracao ?? "Casal");
  const [preco, setPreco] = useState(editing?.preco ?? 0);
  const [banheiro, setBanheiro] = useState(editing?.banheiro ?? true);
  const [observacao, setObservacao] = useState(editing?.situacao ?? "");

  return (
    <Modal open onClose={onClose} title={editing ? "Editar quarto" : "Novo quarto"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ numero, andar, configuracao, preco, banheiro, situacao: observacao || null });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Numero">
            <input className="field" type="number" value={numero} disabled={!!editing} onChange={(e) => setNumero(Number(e.target.value))} />
          </Field>
          <Field label="Andar">
            <input className="field" type="number" value={andar} onChange={(e) => setAndar(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Configuracao / capacidade">
          <input className="field" value={configuracao} onChange={(e) => setConfiguracao(e.target.value)} placeholder="Ex.: casal, duplo, ate 5 pessoas" />
        </Field>
        <Field label="Valor da diaria">
          <input className="field" type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} />
        </Field>
        <Field label="Observacoes do quarto">
          <input className="field" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={banheiro} onChange={(e) => setBanheiro(e.target.checked)} />
          Possui banheiro
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
