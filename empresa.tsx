import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cadastro-empresa")({
  ssr: false,
  component: CadastroEmpresa,
});

function CadastroEmpresa() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [quartos, setQuartos] = useState("101,102,103");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          emailRedirectTo: `${window.location.origin}/painel`,
          data: { nome, empresa },
        },
      });
      if (error) throw error;

      if (!data.session || !data.user) {
        toast.success("Conta criada. Confirme o email e entre para finalizar a empresa.");
        navigate({ to: "/auth" });
        return;
      }

      const slug = empresa
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const { data: company, error: companyError } = await supabase
        .from("companies" as never)
        .insert({ nome: empresa, slug, created_by: data.user.id } as never)
        .select("id")
        .single();
      if (companyError) throw companyError;

      const companyId = (company as unknown as { id: string }).id;
      const { error: memberError } = await supabase
        .from("company_members" as never)
        .insert({ company_id: companyId, user_id: data.user.id, role: "dono" } as never);
      if (memberError) throw memberError;

      const parsedRooms = quartos
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0);
      if (parsedRooms.length) {
        const { error: roomError } = await supabase.from("rooms" as never).insert(
          parsedRooms.map((numero) => ({
            company_id: companyId,
            numero,
            andar: Math.floor(numero / 100) || 1,
            configuracao: "Casal",
            preco: 0,
            banheiro: true,
          })) as never,
        );
        if (roomError) throw roomError;
      }

      toast.success("Empresa criada");
      navigate({ to: "/painel" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar empresa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pine to-pine-dark px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brass font-serif text-2xl font-bold text-pine-dark">
            HR
          </div>
          <h1 className="font-serif text-3xl font-bold">Criar empresa</h1>
          <p className="text-sm text-[#CFE0D5]">Comece uma conta isolada para seu hotel, pousada ou hospedagem.</p>
        </div>

        <form onSubmit={submit} className="card-surface space-y-3 p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome da empresa">
              <input className="field" value={empresa} onChange={(e) => setEmpresa(e.target.value)} required />
            </Field>
            <Field label="Seu nome">
              <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="E-mail de login">
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Senha">
              <input className="field" type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </Field>
          </div>
          <Field label="Numeros dos quartos iniciais">
            <input className="field" value={quartos} onChange={(e) => setQuartos(e.target.value)} placeholder="Ex.: 101,102,103,201" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Link to="/auth" className="text-sm font-semibold text-pine hover:underline">
              Ja tenho login
            </Link>
            <button disabled={busy} className="btn-primary" type="submit">
              {busy ? "Criando..." : "Criar empresa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
