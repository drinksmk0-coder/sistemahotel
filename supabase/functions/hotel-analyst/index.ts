import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return Response.json({ error: "Ambiente Supabase incompleto." }, { status: 500 });
  }

  const bodyText = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const mode =
    body.mode === "design"
      ? "design"
      : body.mode === "reception"
        ? "reception"
        : "analysis";
  const target = mode === "design" ? "hotel-designer" : "hotel-assistant";

  if (target === "hotel-assistant" && body.reception_context) {
    const context =
      typeof body.reception_context === "object" && body.reception_context
        ? (body.reception_context as Record<string, unknown>)
        : {};
    const extra = [
      context.checkin ? `check-in: ${String(context.checkin)}` : "",
      context.checkout ? `check-out: ${String(context.checkout)}` : "",
      context.pessoas ? `${String(context.pessoas)} hóspedes` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (extra) {
      body.question = `${String(body.question ?? "")}\n${extra}`.trim();
    }
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${target}`, {
    method: "POST",
    headers: {
      apikey: request.headers.get("apikey") ?? "",
      authorization: request.headers.get("authorization") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
});
