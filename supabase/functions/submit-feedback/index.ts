import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const NOTE_KEYS = [
  "nota_geral","nota_limpeza","nota_conforto","nota_cama","nota_banheiro","nota_chuveiro","nota_silencio",
  "nota_ventilacao","nota_espaco","nota_tv","nota_frigobar","nota_wifi","nota_iluminacao","nota_custo_beneficio","nota_atendimento",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply({ ok: true });
  if (req.method !== "POST") return reply({ ok: false, error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return reply({ ok: false, error: "Ambiente indisponível." }, 500);

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(payload.company_id ?? "").trim();
    const room = Number(payload.quarto);
    const general = Number(payload.nota_geral);
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) return reply({ ok: false, error: "Empresa inválida." }, 400);
    if (!Number.isInteger(room) || room <= 0) return reply({ ok: false, error: "Quarto inválido." }, 400);
    if (!Number.isInteger(general) || general < 1 || general > 5) return reply({ ok: false, error: "Nota geral inválida." }, 400);

    for (const key of NOTE_KEYS) {
      if (payload[key] == null || payload[key] === "") continue;
      const noteValue = Number(payload[key]);
      if (!Number.isInteger(noteValue) || noteValue < 1 || noteValue > 5) return reply({ ok: false, error: `Nota inválida em ${key}.` }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: companyRow, error: companyError } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
    if (companyError || !companyRow) return reply({ ok: false, error: "Hotel não identificado." }, 400);

    const { data: roomRow, error: roomError } = await admin.from("rooms").select("id").eq("company_id", companyId).eq("numero", room).maybeSingle();
    if (roomError) return reply({ ok: false, error: "Não foi possível validar o quarto." }, 500);
    if (!roomRow) return reply({ ok: false, error: "Este quarto não pertence ao hotel informado." }, 400);

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const sourceHash = await sha256(`${serviceKey.slice(0, 24)}|${forwarded}`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [{ count: sourceCount }, { count: roomCount }] = await Promise.all([
      admin.from("public_feedback_submissions").select("id", { count: "exact", head: true }).eq("source_hash", sourceHash).gte("created_at", oneHourAgo),
      admin.from("public_feedback_submissions").select("id", { count: "exact", head: true }).eq("source_hash", sourceHash).eq("company_id", companyId).eq("room_number", room).gte("created_at", oneHourAgo),
    ]);
    if ((sourceCount ?? 0) >= 20 || (roomCount ?? 0) >= 5) {
      return reply({ ok: false, error: "Muitas avaliações foram enviadas em pouco tempo. Tente novamente mais tarde." }, 429);
    }

    const clean = {
      company_id: companyId,
      hospede_nome: text(payload.hospede_nome, 80),
      quarto: room,
      nota_geral: general,
      nota_limpeza: note(payload.nota_limpeza),
      nota_conforto: note(payload.nota_conforto),
      nota_cama: note(payload.nota_cama),
      nota_banheiro: note(payload.nota_banheiro),
      nota_chuveiro: note(payload.nota_chuveiro),
      nota_silencio: note(payload.nota_silencio),
      nota_ventilacao: note(payload.nota_ventilacao),
      nota_espaco: note(payload.nota_espaco),
      nota_tv: note(payload.nota_tv),
      nota_frigobar: note(payload.nota_frigobar),
      nota_wifi: note(payload.nota_wifi),
      nota_iluminacao: note(payload.nota_iluminacao),
      nota_custo_beneficio: note(payload.nota_custo_beneficio),
      nota_atendimento: note(payload.nota_atendimento),
      recomendaria: bool(payload.recomendaria),
      voltaria_quarto: bool(payload.voltaria_quarto),
      preferencia_principal: text(payload.preferencia_principal, 80),
      problema_principal: text(payload.problema_principal, 120),
      wifi_problema: payload.wifi_problema === true,
      wifi_dispositivo: payload.wifi_problema === true ? text(payload.wifi_dispositivo, 80) : null,
      comentario: text(payload.comentario, 500),
      sugestao: text(payload.sugestao, 500),
    };

    const { data: feedback, error: insertError } = await admin.from("feedbacks").insert(clean).select("id").single();
    if (insertError) {
      console.error("feedback insert failed", insertError);
      return reply({ ok: false, error: "Não foi possível registrar a avaliação." }, 500);
    }

    const { error: auditError } = await admin.from("public_feedback_submissions").insert({ company_id: companyId, room_number: room, source_hash: sourceHash });
    if (auditError) console.warn("feedback audit insert failed", auditError);

    return reply({ ok: true, id: feedback.id }, 201);
  } catch (error) {
    console.error("submit-feedback", error);
    return reply({ ok: false, error: "Não foi possível enviar a avaliação." }, 500);
  }
});

function note(value: unknown) { if (value == null || value === "") return null; const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; }
function text(value: unknown, max: number) { const v = String(value ?? "").trim().slice(0, max); return v || null; }
function bool(value: unknown) { return typeof value === "boolean" ? value : null; }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function reply(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } }); }
