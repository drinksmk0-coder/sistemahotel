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
  let mode = "analysis";
  try {
    const body = JSON.parse(bodyText) as { mode?: string };
    mode =
      body.mode === "design"
        ? "design"
        : body.mode === "reception"
          ? "reception"
          : "analysis";
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const target = mode === "design" ? "hotel-designer" : "hotel-assistant";
  const response = await fetch(`${supabaseUrl}/functions/v1/${target}`, {
    method: "POST",
    headers: {
      apikey: request.headers.get("apikey") ?? "",
      authorization: request.headers.get("authorization") ?? "",
      "Content-Type": "application/json",
    },
    body: bodyText,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
});
