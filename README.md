import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [trocaSenha, setTrocaSenha] = useState(false);
  const [busy, setBusy] = useState(false);

  async function goToPanel() {
    const { data } = await supabase.auth.getSession();
    const isPasswordFlow =
      typeof window !== "undefined" &&
      (window.location.search.includes("convite=1") || window.location.search.includes("redefinir=1"));
    if (data.session && isPasswordFlow) {
      setTrocaSenha(true);
      return;
    }
    if (data.session) {
      navigate({ to: "/painel", replace: true });
    }
  }

  useEffect(() => {
    void goToPanel();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await goToPanel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setBusy(false);
    }
  }

  async function finishInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      toast.success("Senha criada. Acesso liberado.");
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar convite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pine to-pine-dark px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brass font-serif text-2xl font-bold text-pine-dark">
            PR
          </div>
          <h1 className="font-serif text-2xl font-bold">Pousada Real Cruzília</h1>
          <p className="text-sm text-[#CFE0D5]">Painel de operação da equipe</p>
        </div>
        <div className="card-surface p-6">
          {trocaSenha ? (
            <form onSubmit={finishInvite} className="space-y-3">
              <Field label="Crie uma nova senha">
                <input
                  type="password"
                  className="field"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  minLength={6}
                />
              </Field>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-pine py-2.5 font-semibold text-primary-foreground transition hover:bg-pine-dark disabled:opacity-60"
              >
                {busy ? "Confirmando..." : "Salvar senha"}
              </button>
            </form>
          ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label="E-mail">
              <input
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                className="field"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                minLength={6}
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-pine py-2.5 font-semibold text-primary-foreground transition hover:bg-pine-dark disabled:opacity-60"
            >
              {busy ? "Aguarde…" : "Entrar"}
            </button>
          </form>
          )}
          {!trocaSenha && (
          <>
          <div className="mt-4 text-center">
            <a href="/cadastro-empresa" className="text-sm font-semibold text-pine hover:underline">
              Criar conta para minha empresa
            </a>
          </div>
          </>
          )}
        </div>
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
