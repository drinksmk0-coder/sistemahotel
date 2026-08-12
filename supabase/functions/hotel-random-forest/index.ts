import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = Record<string, any>;
type Tree = { leaf?: number; feature?: number; threshold?: number; left?: Tree; right?: Tree };

const CAT = ["canal", "motivo_viagem", "booker_country", "tipo_unidade", "faixa_diaria", "perfil_hospede_provavel"];
const NUM = ["quartos", "pessoas", "diarias", "total", "lead_days", "stay_days", "check_in_dayofweek", "check_in_month", "valor_diaria", "valor_pago", "percentual_pago", "sem_banheiro_regra_80"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "Login obrigatório." }, 401);

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || "");
    if (!companyId) return json({ error: "Empresa não informada." }, 400);

    const db = createClient(url, service, { auth: { persistSession: false } });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth.user) return json({ error: "Sessão inválida." }, 401);

    const { data: member } = await db.from("company_members").select("role")
      .eq("company_id", companyId).eq("user_id", auth.user.id).eq("ativo", true).maybeSingle();
    if (!member) return json({ error: "Acesso negado." }, 403);

    const [trainingRes, openRes, dailyRes, noShowRes] = await Promise.all([
      db.from("bi_ml_features_cancelamento").select("*").eq("company_id", companyId).limit(5000),
      db.from("bi_fato_reservas").select("reserva_id,quarto_numero,checkin,canal,valor_diaria,hospedes,noites,valor_total,valor_pago,percentual_pago,antecedencia_dias,motivo_estadia,pais_hospede,tipo_quarto,faixa_diaria,perfil_hospede_provavel,sem_banheiro_regra_80,status,no_show_flag").eq("company_id", companyId).eq("status", "reservado").limit(2000),
      db.from("analytics_daily_history").select("stay_date,occupancy_rate,occupied_rooms").eq("company_id", companyId).order("stay_date").limit(2500),
      db.from("bi_fato_reservas").select("status,no_show_flag").eq("company_id", companyId).in("status", ["finalizado", "cancelado"]).limit(5000),
    ]);

    const queryError = trainingRes.error || openRes.error || dailyRes.error || noShowRes.error;
    if (queryError) return json({ error: queryError.message }, 500);

    const training = (trainingRes.data || []) as Row[];
    const y = training.map((r) => Number(r.target_cancelamento || 0));
    const positives = y.reduce((a, b) => a + b, 0);
    const encoder = buildEncoder(training);

    let cancellation: any = { available: false, reason: "Amostra insuficiente." };
    if (training.length >= 30 && positives >= 5 && positives <= training.length - 5) {
      const X = training.map((r) => encodeRow(r, encoder));
      const split = stratifiedSplit(X, y, 0.25, 7411);
      const forest = trainBalancedForest(split.trainX, split.trainY, 120, 7, 2, 92317);
      const probs = split.testX.map((x) => predictForest(forest, x));
      const metrics = classificationMetrics(split.testY, probs);

      const risks = (openRes.data || []).map((r: Row) => {
        const checkin = dateOrNull(r.checkin);
        const shaped = {
          quartos: 1,
          pessoas: Number(r.hospedes || 1),
          diarias: Number(r.noites || 1),
          total: Number(r.valor_total || 0),
          lead_days: Number(r.antecedencia_dias || 0),
          stay_days: Number(r.noites || 1),
          check_in_dayofweek: checkin ? isoDow(checkin) : 1,
          check_in_month: checkin ? checkin.getUTCMonth() + 1 : 1,
          valor_diaria: Number(r.valor_diaria || 0),
          valor_pago: Number(r.valor_pago || 0),
          percentual_pago: Number(r.percentual_pago || 0),
          sem_banheiro_regra_80: r.sem_banheiro_regra_80 ? 1 : 0,
          canal: r.canal,
          motivo_viagem: r.motivo_estadia,
          booker_country: r.pais_hospede,
          tipo_unidade: r.tipo_quarto,
          faixa_diaria: r.faixa_diaria,
          perfil_hospede_provavel: r.perfil_hospede_provavel,
        };
        return {
          reservation_id: r.reserva_id,
          quarto: r.quarto_numero,
          checkin: r.checkin,
          canal: r.canal || "Não informado",
          valor_diaria: Number(r.valor_diaria || 0),
          pessoas: Number(r.hospedes || 1),
          probability: round4(predictForest(forest, encodeRow(shaped, encoder))),
        };
      }).sort((a: any, b: any) => b.probability - a.probability).slice(0, 25);

      cancellation = {
        available: true,
        algorithm: "Random Forest Classifier · camada estrela BI · one-hot categórico · bootstrap balanceado",
        trees: forest.length,
        training_rows: split.trainY.length,
        test_rows: split.testY.length,
        positives,
        base_rate: round4(positives / training.length),
        metrics,
        risks,
        confidence: training.length >= 150 && positives >= 25 && metrics.recall >= 0.5 ? "moderada" : "baixa",
        feature_count: encoder.featureCount,
        features: { numeric: NUM, categorical: CAT },
        source: "bi_ml_features_cancelamento",
      };
    }

    const dailyRows = (dailyRes.data || []).filter((r: Row) => Number.isFinite(Number(r.occupancy_rate)) && r.stay_date);
    let occupancy: any = { available: false, reason: "Histórico diário insuficiente." };
    if (dailyRows.length >= 60) {
      const X = dailyRows.map((r: Row, i: number) => occupancyFeatures(String(r.stay_date), i / Math.max(1, dailyRows.length - 1)));
      const target = dailyRows.map((r: Row) => Number(r.occupancy_rate));
      const cut = Math.max(40, Math.floor(target.length * 0.8));
      const trainX = X.slice(0, cut), trainY = target.slice(0, cut), testX = X.slice(cut), testY = target.slice(cut);
      const forest = trainForest(trainX, trainY, "regression", 100, 7, 5, 53131);
      const pred = testX.map((x) => predictForest(forest, x));
      const metrics = regressionMetrics(testY, pred);
      const last = new Date(`${dailyRows[dailyRows.length - 1].stay_date}T12:00:00Z`);
      const forecast = [];
      for (let n = 1; n <= 30; n++) {
        const dt = new Date(last); dt.setUTCDate(dt.getUTCDate() + n);
        const iso = dt.toISOString().slice(0, 10);
        const vals = forest.map((t) => clamp(predictTree(t, occupancyFeatures(iso, 1 + n / Math.max(90, dailyRows.length))), 0, 100)).sort((a, b) => a - b);
        forecast.push({ date: iso, expected_occupancy: round1(avg(vals)), lower: round1(quantile(vals, 0.1)), upper: round1(quantile(vals, 0.9)) });
      }
      occupancy = {
        available: true,
        algorithm: "Random Forest Regressor",
        trees: forest.length,
        training_days: trainY.length,
        test_days: testY.length,
        metrics,
        confidence: dailyRows.length >= 365 && metrics.mae <= 12 ? "moderada" : "baixa",
        forecast,
      };
    }

    const noShowCount = (noShowRes.data || []).filter((r: Row) => Number(r.no_show_flag) === 1).length;
    const no_show = noShowCount >= 8
      ? { available: false, reason: "Há exemplos, mas o modelo dedicado será ativado quando houver amostra positiva e negativa suficiente para validação separada.", examples: noShowCount }
      : { available: false, reason: "Ainda não há no-shows suficientes para treinar um modelo confiável.", examples: noShowCount };

    return json({
      generated_at: new Date().toISOString(),
      model_version: "rf-star-v2",
      cancellation,
      occupancy,
      no_show,
      data_quality: { resolved_reservations: training.length, cancellation_examples: positives, daily_history_days: dailyRows.length, no_show_examples: noShowCount },
      architecture: "operacional -> modelo estrela BI -> ML -> prescrição/dashboard",
      note: "Probabilidades são apoio à decisão, não garantias.",
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function buildEncoder(rows: Row[]) {
  const cats: Record<string, string[]> = {};
  for (const c of CAT) cats[c] = [...new Set(rows.map((r) => normCat(r[c])).filter(Boolean))].sort();
  let featureCount = NUM.length;
  for (const c of CAT) featureCount += cats[c].length;
  return { cats, featureCount };
}

function encodeRow(r: Row, encoder: { cats: Record<string, string[]> }) {
  const out = NUM.map((key) => {
    const value = key === "sem_banheiro_regra_80" ? (r[key] ? 1 : 0) : Number(r[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
  });
  for (const c of CAT) {
    const value = normCat(r[c]);
    for (const category of encoder.cats[c]) out.push(value === category ? 1 : 0);
  }
  return out;
}

function normCat(v: any) { return normalize(String(v ?? "nao_informado")).trim() || "nao_informado"; }

function trainBalancedForest(X: number[][], y: number[], trees: number, maxDepth: number, minLeaf: number, seed: number) {
  const rng = mulberry32(seed);
  const positives = y.map((v, i) => v === 1 ? i : -1).filter((i) => i >= 0);
  const negatives = y.map((v, i) => v === 0 ? i : -1).filter((i) => i >= 0);
  const forest: Tree[] = [];
  const sampleSize = Math.max(8, Math.min(positives.length, negatives.length));
  for (let t = 0; t < trees; t++) {
    const idx: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      idx.push(positives[Math.floor(rng() * positives.length)]);
      idx.push(negatives[Math.floor(rng() * negatives.length)]);
    }
    forest.push(buildTree(idx.map((i) => X[i]), idx.map((i) => y[i]), "classification", maxDepth, minLeaf, rng, 0));
  }
  return forest;
}

function occupancyFeatures(iso: string, trend: number) {
  const d = new Date(`${iso}T12:00:00Z`), dow = d.getUTCDay(), month = d.getUTCMonth() + 1;
  const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  return [Math.sin(2 * Math.PI * dow / 7), Math.cos(2 * Math.PI * dow / 7), Math.sin(2 * Math.PI * month / 12), Math.cos(2 * Math.PI * month / 12), Math.sin(2 * Math.PI * doy / 365.25), Math.cos(2 * Math.PI * doy / 365.25), trend];
}

function trainForest(X: number[][], y: number[], task: "classification" | "regression", trees: number, maxDepth: number, minLeaf: number, seed: number) {
  const rng = mulberry32(seed), forest: Tree[] = [];
  for (let t = 0; t < trees; t++) {
    const idx = Array.from({ length: X.length }, () => Math.floor(rng() * X.length));
    forest.push(buildTree(idx.map((i) => X[i]), idx.map((i) => y[i]), task, maxDepth, minLeaf, rng, 0));
  }
  return forest;
}

function buildTree(X: number[][], y: number[], task: "classification" | "regression", maxDepth: number, minLeaf: number, rng: () => number, depth: number): Tree {
  const leaf = avg(y);
  if (depth >= maxDepth || X.length < minLeaf * 2 || variance(y) < 1e-9) return { leaf };
  const p = X[0].length, m = Math.max(2, Math.floor(Math.sqrt(p))), feats = shuffle([...Array(p).keys()], rng).slice(0, m);
  let best: any = null;
  for (const feature of feats) {
    const values = X.map((r) => r[feature]).filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length < minLeaf * 2) continue;
    for (let k = 1; k <= 8; k++) {
      const threshold = quantile(values, k / 9), left: number[] = [], right: number[] = [];
      for (let i = 0; i < X.length; i++) (X[i][feature] <= threshold ? left : right).push(i);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const impurity = (left.length * imp(left.map((i) => y[i]), task) + right.length * imp(right.map((i) => y[i]), task)) / X.length;
      if (!best || impurity < best.impurity) best = { feature, threshold, left, right, impurity };
    }
  }
  if (!best) return { leaf };
  return { feature: best.feature, threshold: best.threshold, left: buildTree(best.left.map((i: number) => X[i]), best.left.map((i: number) => y[i]), task, maxDepth, minLeaf, rng, depth + 1), right: buildTree(best.right.map((i: number) => X[i]), best.right.map((i: number) => y[i]), task, maxDepth, minLeaf, rng, depth + 1) };
}

function predictForest(forest: Tree[], x: number[]) { return avg(forest.map((t) => predictTree(t, x))); }
function predictTree(tree: Tree, x: number[]): number { if (tree.leaf !== undefined) return tree.leaf; return x[tree.feature!] <= tree.threshold! ? predictTree(tree.left!, x) : predictTree(tree.right!, x); }
function imp(y: number[], task: string) { if (task === "classification") { const p = avg(y); return 2 * p * (1 - p); } return variance(y); }
function classificationMetrics(y: number[], p: number[]) { if (!y.length) return {}; let tp = 0, tn = 0, fp = 0, fn = 0; for (let i = 0; i < y.length; i++) { const h = p[i] >= 0.5 ? 1 : 0; if (h && y[i]) tp++; else if (!h && !y[i]) tn++; else if (h && !y[i]) fp++; else fn++; } return { accuracy: round4((tp + tn) / y.length), precision: round4(tp / Math.max(1, tp + fp)), recall: round4(tp / Math.max(1, tp + fn)), brier: round4(avg(p.map((v, i) => (v - y[i]) ** 2))), tp, tn, fp, fn }; }
function regressionMetrics(y: number[], p: number[]) { if (!y.length) return {}; const mae = avg(y.map((v, i) => Math.abs(v - p[i]))), rmse = Math.sqrt(avg(y.map((v, i) => (v - p[i]) ** 2))), mean = avg(y), ssr = y.reduce((s, v, i) => s + (v - p[i]) ** 2, 0), sst = y.reduce((s, v) => s + (v - mean) ** 2, 0); return { mae: round1(mae), rmse: round1(rmse), r2: round4(sst ? 1 - ssr / sst : 0) }; }
function stratifiedSplit(X: number[][], y: number[], ratio: number, seed: number) { const rng = mulberry32(seed), positives = shuffle(y.map((v, i) => v === 1 ? i : -1).filter((i) => i >= 0), rng), negatives = shuffle(y.map((v, i) => v === 0 ? i : -1).filter((i) => i >= 0), rng), test = [...positives.slice(0, Math.max(1, Math.round(positives.length * ratio))), ...negatives.slice(0, Math.max(1, Math.round(negatives.length * ratio)))], set = new Set(test); return { trainX: X.filter((_, i) => !set.has(i)), trainY: y.filter((_, i) => !set.has(i)), testX: test.map((i) => X[i]), testY: test.map((i) => y[i]) }; }
function mulberry32(a: number) { return () => { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle<T>(a: T[], rng: () => number) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function dateOrNull(v: any) { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d; }
function isoDow(d: Date) { const n = d.getUTCDay(); return n === 0 ? 7 : n; }
function variance(a: number[]) { if (!a.length) return 0; const m = avg(a); return avg(a.map((v) => (v - m) ** 2)); }
function avg(a: number[]) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function quantile(a: number[], q: number) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, l = Math.floor(p), h = Math.ceil(p); return s[l] + (s[h] - s[l]) * (p - l); }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function normalize(v: string) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function round1(v: number) { return Math.round(v * 10) / 10; }
function round4(v: number) { return Math.round(v * 10000) / 10000; }
function json(payload: any, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
