import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getValidAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [trocaSenha, setTrocaSenha] = useState(false);
  const [recuperarSenha, setRecuperarSenha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setTrocaSenha(true);
        setRecuperarSenha(false);
        setCheckingSession(false);
      }
    });

    void getValidAuth().then(async (auth) => {
      if (!mounted) return;
      const isPasswordFlow =
        window.location.search.includes("convite=1") ||
        window.location.search.includes("redefinir=1");
      if (auth && isPasswordFlow) {
        setTrocaSenha(true);
        setCheckingSession(false);
        return;
      }
      if (auth) {
        await navigate({ to: "/painel", replace: true });
        return;
      }
      setCheckingSession(false);
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });
      if (error) throw error;
      if (!data.session || !data.user) throw new Error("Não foi possível iniciar sua sessão.");
      await navigate({ to: "/painel", replace: true });
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth?redefinir=1`,
      });
      if (error) throw error;
      toast.success(
        "Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha.",
      );
      setRecuperarSenha(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível enviar o link de recuperação.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pine to-pine-dark px-4">
        <p className="text-sm font-semibold text-white">Verificando sua sessão…</p>
      </div>
    );
  }

  async function finishInvite(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha !== confirmarSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      toast.success("Nova senha salva. Acesso liberado.");
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
              <div>
                <h2 className="font-serif text-xl font-bold text-pine-dark">Criar nova senha</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use pelo menos 8 caracteres e não reutilize a senha do e-mail.
                </p>
              </div>
              <Field label="Nova senha">
                <input
                  type="password"
                  className="field"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </Field>
              <Field label="Confirmar nova senha">
                <input
                  type="password"
                  className="field"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
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
          ) : recuperarSenha ? (
            <form onSubmit={requestPasswordReset} className="space-y-3">
              <div>
                <h2 className="font-serif text-xl font-bold text-pine-dark">Recuperar senha</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Informe o e-mail usado no cadastro. Você receberá um link seguro para criar outra
                  senha.
                </p>
              </div>
              <Field label="E-mail">
                <input
                  type="email"
                  className="field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  maxLength={255}
                />
              </Field>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-pine py-2.5 font-semibold text-primary-foreground transition hover:bg-pine-dark disabled:opacity-60"
              >
                {busy ? "Enviando…" : "Enviar link de recuperação"}
              </button>
              <button
                type="button"
                onClick={() => setRecuperarSenha(false)}
                className="w-full text-sm font-semibold text-pine hover:underline"
              >
                Voltar para o login
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
                  autoComplete="email"
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
                  autoComplete="current-password"
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
              <button
                type="button"
                onClick={() => setRecuperarSenha(true)}
                className="w-full text-sm font-semibold text-pine hover:underline"
              >
                Esqueci minha senha
              </button>
            </form>
          )}
          {!trocaSenha && (
            <>
              <div className="mt-4 text-center">
                <a
                  href="/cadastro-empresa"
                  className="text-sm font-semibold text-pine hover:underline"
                >
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

function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "invalid_credentials") {
    return "E-mail ou senha incorretos. Confira o e-mail ou use “Esqueci minha senha”.";
  }
  return error instanceof Error ? error.message : "Erro ao autenticar";
}
