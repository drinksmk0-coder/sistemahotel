import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = Record<string, any>;
type Tree = { leaf?: number; feature?: number; threshold?: number; left?: Tree; right?: Tree };

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

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: auth } = await admin.auth.getUser(jwt);
    if (!auth.user) return json({ error: "Sessão inválida." }, 401);
    const { data: member } = await admin.from("company_members").select("role").eq("company_id", companyId).eq("user_id", auth.user.id).eq("ativo", true).maybeSingle();
    if (!member) return json({ error: "Acesso negado." }, 403);

    const [{ data: reservations, error: rErr }, { data: daily, error: dErr }, { data: rooms }] = await Promise.all([
      admin.from("reservations").select("id,quarto,checkin,checkout,diarias,valor_diaria,valor_total,status,pessoas,canal,data_reserva,created_at,presence_status").eq("company_id", companyId).limit(3000),
      admin.from("analytics_daily_history").select("stay_date,occupancy_rate,occupied_rooms").eq("company_id", companyId).order("stay_date").limit(2000),
      admin.from("rooms").select("numero,preco,banheiro,configuracao").eq("company_id", companyId),
    ]);
    if (rErr) return json({ error: rErr.message }, 500);
    if (dErr) return json({ error: dErr.message }, 500);

    const roomMap = new Map((rooms || []).map((r: Row) => [Number(r.numero), r]));
    const resolved = (reservations || []).filter((r: Row) => ["finalizado", "cancelado"].includes(String(r.status)));
    const Xc = resolved.map((r: Row) => cancellationFeatures(r, roomMap));
    const yc = resolved.map((r: Row) => String(r.status) === "cancelado" ? 1 : 0);
    const cancelPositives = yc.reduce((a: number, b: number) => a + b, 0);

    let cancellation: any = { available: false, reason: "Amostra insuficiente." };
    if (resolved.length >= 30 && cancelPositives >= 5 && cancelPositives <= resolved.length - 5) {
      const split = stratifiedSplit(Xc, yc, 0.25, 7411);
      const forest = trainForest(split.trainX, split.trainY, "classification", 60, 5, 3, 92317);
      const probs = split.testX.map(x => predictForest(forest, x));
      const metrics = classificationMetrics(split.testY, probs);
      const open = (reservations || []).filter((r: Row) => String(r.status) === "reservado");
      const risks = open.map((r: Row) => ({
        reservation_id: r.id, quarto: r.quarto, checkin: r.checkin,
        canal: r.canal || "Não informado", valor_diaria: Number(r.valor_diaria || 0), pessoas: Number(r.pessoas || 1),
        probability: round4(predictForest(forest, cancellationFeatures(r, roomMap))),
      })).sort((a: any, b: any) => b.probability - a.probability).slice(0, 20);
      cancellation = {
        available: true,
        algorithm: "Random Forest Classifier (CART, bootstrap, seleção aleatória de variáveis)",
        trees: forest.length, training_rows: split.trainY.length, test_rows: split.testY.length, positives: cancelPositives,
        base_rate: round4(cancelPositives / resolved.length), metrics, risks,
        confidence: resolved.length >= 150 && cancelPositives >= 25 ? "moderada" : "baixa",
      };
    }

    const dailyRows = (daily || []).filter((r: Row) => Number.isFinite(Number(r.occupancy_rate)) && r.stay_date);
    let occupancy: any = { available: false, reason: "Histórico diário insuficiente." };
    if (dailyRows.length >= 60) {
      const X = dailyRows.map((r: Row, i: number) => occupancyFeatures(String(r.stay_date), i / Math.max(1, dailyRows.length - 1)));
      const y = dailyRows.map((r: Row) => Number(r.occupancy_rate));
      const cut = Math.max(40, Math.floor(y.length * 0.8));
      const trainX = X.slice(0, cut), trainY = y.slice(0, cut), testX = X.slice(cut), testY = y.slice(cut);
      const forest = trainForest(trainX, trainY, "regression", 70, 6, 5, 53131);
      const pred = testX.map(x => predictForest(forest, x));
      const metrics = regressionMetrics(testY, pred);
      const lastDate = new Date(`${dailyRows[dailyRows.length - 1].stay_date}T12:00:00Z`);
      const forecast = [];
      for (let d = 1; d <= 30; d++) {
        const date = new Date(lastDate); date.setUTCDate(date.getUTCDate() + d);
        const iso = date.toISOString().slice(0, 10);
        const vals = forest.map(t => clamp(predictTree(t, occupancyFeatures(iso, 1 + d / Math.max(90, dailyRows.length))), 0, 100)).sort((a,b)=>a-b);
        forecast.push({ date: iso, expected_occupancy: round1(avg(vals)), lower: round1(quantile(vals,.1)), upper: round1(quantile(vals,.9)) });
      }
      occupancy = {
        available: true,
        algorithm: "Random Forest Regressor (CART, bootstrap, seleção aleatória de variáveis)",
        trees: forest.length, training_days: trainY.length, test_days: testY.length, metrics,
        confidence: dailyRows.length >= 365 && metrics.mae <= 12 ? "moderada" : "baixa", forecast,
      };
    }

    const noShowCount = (reservations || []).filter((r: Row) => /no.?show/i.test(`${r.status || ""} ${r.presence_status || ""}`)).length;
    const no_show = noShowCount >= 5
      ? { available: false, reason: "Há registros de no-show, mas o modelo dedicado será ativado quando houver classe positiva e negativa resolvida suficiente.", examples: noShowCount }
      : { available: false, reason: "Ainda não existem exemplos suficientes de no-show para treinar sem fabricar probabilidade.", examples: noShowCount };

    return json({ generated_at: new Date().toISOString(), model_version: "rf-v1", cancellation, occupancy, no_show,
      data_quality: { reservations_total: (reservations || []).length, resolved_reservations: resolved.length, cancellation_examples: cancelPositives, daily_history_days: dailyRows.length },
      note: "Probabilidades são apoio à decisão, não garantias. Reavaliar métricas conforme novos dados entram." });
  } catch (e) {
    console.error(e); return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function cancellationFeatures(r: Row, rooms: Map<number, Row>) {
  const checkin = dateOrNull(r.checkin), booked = dateOrNull(r.data_reserva || r.created_at);
  const lead = checkin && booked ? Math.max(0, Math.round((checkin.getTime() - booked.getTime()) / 86400000)) : 0;
  const room = rooms.get(Number(r.quarto)) || {}, canal = normalize(String(r.canal || ""));
  const dow = checkin ? checkin.getUTCDay() : 0, month = checkin ? checkin.getUTCMonth() + 1 : 1;
  return [clamp(Number(r.valor_diaria || 0),0,2000),clamp(Number(r.diarias || 1),1,60),clamp(Number(r.pessoas || 1),1,20),clamp(lead,0,365),month,dow,
    canal.includes("booking")?1:0,canal.includes("whatsapp")?1:0,(canal.includes("diret")||canal.includes("hotel"))?1:0,
    Number(room.preco || r.valor_diaria || 0),Number(room.banheiro === true || Number(room.preco) === 80 ? 1 : 0)];
}
function occupancyFeatures(iso:string,trend:number){const d=new Date(`${iso}T12:00:00Z`),dow=d.getUTCDay(),month=d.getUTCMonth()+1,doy=Math.floor((d.getTime()-Date.UTC(d.getUTCFullYear(),0,0))/86400000);return[Math.sin(2*Math.PI*dow/7),Math.cos(2*Math.PI*dow/7),Math.sin(2*Math.PI*month/12),Math.cos(2*Math.PI*month/12),Math.sin(2*Math.PI*doy/365.25),Math.cos(2*Math.PI*doy/365.25),trend];}
function trainForest(X:number[][],y:number[],task:"classification"|"regression",trees:number,maxDepth:number,minLeaf:number,seed:number){const rng=mulberry32(seed),forest:Tree[]=[];for(let t=0;t<trees;t++){const idx=Array.from({length:X.length},()=>Math.floor(rng()*X.length));forest.push(buildTree(idx.map(i=>X[i]),idx.map(i=>y[i]),task,maxDepth,minLeaf,rng,0));}return forest;}
function buildTree(X:number[][],y:number[],task:"classification"|"regression",maxDepth:number,minLeaf:number,rng:()=>number,depth:number):Tree{const leaf=avg(y);if(depth>=maxDepth||X.length<minLeaf*2||variance(y)<1e-9)return{leaf};const p=X[0].length,m=Math.max(2,Math.floor(Math.sqrt(p))),feats=shuffle([...Array(p).keys()],rng).slice(0,m);let best:any=null;for(const f of feats){const values=X.map(r=>r[f]).filter(Number.isFinite).sort((a,b)=>a-b);if(values.length<minLeaf*2)continue;const candidates=[];for(let k=1;k<=8;k++){const q=quantile(values,k/9);if(Number.isFinite(q))candidates.push(q);}for(const th of [...new Set(candidates)]){const li:number[]=[],ri:number[]=[];for(let i=0;i<X.length;i++)(X[i][f]<=th?li:ri).push(i);if(li.length<minLeaf||ri.length<minLeaf)continue;const impurity=(li.length*imp(li.map(i=>y[i]),task)+ri.length*imp(ri.map(i=>y[i]),task))/X.length;if(!best||impurity<best.impurity)best={f,th,li,ri,impurity};}}if(!best)return{leaf};return{feature:best.f,threshold:best.th,left:buildTree(best.li.map((i:number)=>X[i]),best.li.map((i:number)=>y[i]),task,maxDepth,minLeaf,rng,depth+1),right:buildTree(best.ri.map((i:number)=>X[i]),best.ri.map((i:number)=>y[i]),task,maxDepth,minLeaf,rng,depth+1)};}
function predictForest(forest:Tree[],x:number[]){return avg(forest.map(t=>predictTree(t,x)));}function predictTree(t:Tree,x:number[]):number{if(t.leaf!==undefined)return t.leaf;return x[t.feature!]<=t.threshold!?predictTree(t.left!,x):predictTree(t.right!,x);}function imp(y:number[],task:string){if(task==="classification"){const p=avg(y);return 2*p*(1-p);}return variance(y);}
function classificationMetrics(y:number[],p:number[]){if(!y.length)return{};let tp=0,tn=0,fp=0,fn=0;for(let i=0;i<y.length;i++){const h=p[i]>=.5?1:0;if(h&&y[i])tp++;else if(!h&&!y[i])tn++;else if(h&&!y[i])fp++;else fn++;}return{accuracy:round4((tp+tn)/y.length),precision:round4(tp/Math.max(1,tp+fp)),recall:round4(tp/Math.max(1,tp+fn)),brier:round4(avg(p.map((v,i)=>(v-y[i])**2)))};}
function regressionMetrics(y:number[],p:number[]){if(!y.length)return{};const mae=avg(y.map((v,i)=>Math.abs(v-p[i]))),rmse=Math.sqrt(avg(y.map((v,i)=>(v-p[i])**2))),mean=avg(y),ssr=y.reduce((s,v,i)=>s+(v-p[i])**2,0),sst=y.reduce((s,v)=>s+(v-mean)**2,0);return{mae:round1(mae),rmse:round1(rmse),r2:round4(sst?1-ssr/sst:0)};}
function stratifiedSplit(X:number[][],y:number[],ratio:number,seed:number){const rng=mulberry32(seed),pos=shuffle(y.map((v,i)=>v===1?i:-1).filter(i=>i>=0),rng),neg=shuffle(y.map((v,i)=>v===0?i:-1).filter(i=>i>=0),rng),test=[...pos.slice(0,Math.max(1,Math.round(pos.length*ratio))),...neg.slice(0,Math.max(1,Math.round(neg.length*ratio)))],set=new Set(test);return{trainX:X.filter((_,i)=>!set.has(i)),trainY:y.filter((_,i)=>!set.has(i)),testX:test.map(i=>X[i]),testY:test.map(i=>y[i])};}
function mulberry32(a:number){return()=>{let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}function shuffle<T>(a:T[],rng:()=>number){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}function dateOrNull(v:any){if(!v)return null;const d=new Date(String(v));return Number.isNaN(d.getTime())?null:d;}function variance(a:number[]){if(!a.length)return 0;const m=avg(a);return avg(a.map(v=>(v-m)**2));}function avg(a:number[]){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}function quantile(a:number[],q:number){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),p=(s.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return s[l]+(s[h]-s[l])*(p-l);}function clamp(v:number,a:number,b:number){return Math.max(a,Math.min(b,v));}function normalize(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}function round1(v:number){return Math.round(v*10)/10;}function round4(v:number){return Math.round(v*10000)/10000;}function json(payload:any,status=200){return new Response(JSON.stringify(payload),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
