import { createFileRoute } from "@tanstack/react-router";

const RESOURCES = {
  bookings: "/api/v3/bookings",
  rooms: "/api/v3/rooms",
  room_types: "/api/v3/room_types",
  channels: "/api/v3/channels",
} as const;

export const Route = createFileRoute("/api/hospedin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const resource = url.searchParams.get("resource") ?? "bookings";
        if (!(resource in RESOURCES)) return Response.json({ error: "Recurso indisponível." }, { status: 400 });
        const companyId = request.headers.get("x-company-id");
        const authorization = request.headers.get("authorization");
        const companyAllowed = process.env.HOSPEDIN_COMPANY_ID;
        const clientId = process.env.HOSPEDIN_CLIENT_ID;
        const clientSecret = process.env.HOSPEDIN_CLIENT_SECRET;
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!authorization?.startsWith("Bearer ") || !companyId || !supabaseUrl || !anonKey) {
          return Response.json({ error: "Sessão inválida ou empresa ausente." }, { status: 401 });
        }
        // Nunca permitir que uma credencial global da Hospedin consulte outra empresa.
        if (!companyAllowed || companyId !== companyAllowed) {
          return Response.json({ error: "Hospedin não habilitado para este hotel." }, { status: 403 });
        }
        const headers = { apikey: anonKey, Authorization: authorization };
        try {
          // Validação online de JWT, nunca apenas decodificação local.
          const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers, cache: "no-store" });
          if (!authRes.ok) return Response.json({ error: "Sessão expirada." }, { status: 401 });
          const authUser = await authRes.json() as { id?: string };
          if (!authUser.id) return Response.json({ error: "Usuário inválido." }, { status: 401 });
          const memberUrl = new URL(`${supabaseUrl}/rest/v1/company_members`);
          memberUrl.searchParams.set("select", "role");
          memberUrl.searchParams.set("company_id", `eq.${companyId}`);
          memberUrl.searchParams.set("user_id", `eq.${authUser.id}`);
          memberUrl.searchParams.set("ativo", "eq.true");
          const memberRes = await fetch(memberUrl, { headers, cache: "no-store" });
          if (!memberRes.ok) return Response.json({ error: "Permissão não verificada." }, { status: 403 });
          const members = await memberRes.json() as { role?: string }[];
          if (!members.some(m => m.role === "dono" || m.role === "recepcao")) {
            return Response.json({ error: "Acesso permitido somente a gestor ou recepção deste hotel." }, { status: 403 });
          }
          if (!clientId || !clientSecret) {
            return Response.json({ configured: false, error: "Credenciais Hospedin não configuradas no servidor." }, { status: 503 });
          }
          const tokenResponse = await fetch("https://pms-api.hospedin.com/api/v3/authentication/access_tokens", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          });
          if (!tokenResponse.ok) {
            return Response.json({ error: "Falha na autenticação com Hospedin.", upstreamStatus: tokenResponse.status }, { status: 502 });
          }
          const tokenJson = await tokenResponse.json() as { meta?: { access_token?: string } };
          const token = tokenJson.meta?.access_token;
          if (!token) return Response.json({ error: "Token Hospedin ausente." }, { status: 502 });
          const base = RESOURCES[resource as keyof typeof RESOURCES];
          const upstreamUrl = new URL(`https://pms-api.hospedin.com${base}`);
          upstreamUrl.searchParams.set("page[size]", "100");
          const cursor = url.searchParams.get("cursor");
          if (cursor) {
            if (cursor.length > 1024 || !/^[A-Za-z0-9_=-]+$/.test(cursor)) return Response.json({error:"Cursor inválido."}, {status:400});
            upstreamUrl.searchParams.set("page[after]", cursor);
          }
          // A consulta só usa endpoints GET e nunca repassa URL arbitrária.
          const upstream = await fetch(upstreamUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
          const payload = await upstream.json().catch(() => null);
          if (!upstream.ok) {
            return Response.json({ error: "Consulta ao Hospedin indisponível.", upstreamStatus: upstream.status }, { status: 502 });
          }
          // Hospedin pode devolver links.next absoluto ou relativo. Preservar
          // somente o cursor da mesma rota, sem aceitar redirecionamentos.
          const nextLink = payload?.links?.next;
          let nextCursor: string | null = null;
          if (typeof nextLink === "string" && nextLink.trim()) {
            try {
              const next = new URL(nextLink, upstreamUrl);
              if (next.origin === upstreamUrl.origin && next.pathname === upstreamUrl.pathname) {
                nextCursor = next.searchParams.get("page[after]") ?? next.searchParams.get("page%5Bafter%5D");
              }
            } catch {
              // URL não reconhecida; não prosseguir com paginação insegura.
            }
          }
          const hasNextPage = Boolean(nextLink);
          return Response.json({
            resource, source: "hospedin", readOnly: true,
            data: payload?.data ?? [], hasNextPage, nextCursor,
            paginationError: hasNextPage && !nextCursor ? "Hospedin enviou uma próxima página sem cursor utilizável." : null,
          }, {headers: {"Cache-Control": "private, no-store"}});

        } catch {
          return Response.json({ error: "Não foi possível conectar ao Hospedin." }, { status: 502 });
        }
      },
    },
  },
});
