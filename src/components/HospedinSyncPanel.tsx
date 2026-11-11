import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentCompany } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

type Unit = { unit_id?: number; place_id?: number; status?: string; check_in?: string; check_out?: string; adults?: number; children?: number; daily_cents?: number; total_daily_cents?: number; guests?: Array<{name?: string; role?: string}> };
type Booking = { id: string; attributes?: { check_in?: string; check_out?: string; units?: Unit[] } };
type Row = { company_id: string; codigo_externo: string; quarto: number; cliente_nome: string; checkin: string; checkout: string; diarias: number; pessoas: number; valor_diaria: number; valor_total: number; status: string; canal: string; pagamento: string; valor_pago: number; desconto: number; pago: boolean; cliente_id: null; motivo_estadia: string };
const day = (s?: string) => s?.slice(0,10) ?? "";
const active = (s: string) => s !== "cancelado" && s !== "finalizado";
const overlap = (a: {quarto:number;checkin:string;checkout:string;status:string}, b:{quarto:number;checkin:string;checkout:string;status:string}) => a.quarto===b.quarto && active(a.status) && active(b.status) && a.checkin<b.checkout && a.checkout>b.checkin;
function toStatus(value?: string) {
  const s = (value ?? "").toLowerCase();
  if (s.includes("cancel")) return "cancelado";
  if (/checkout|check_out|finished|completed/.test(s)) return "finalizado";
  if (/checkin|check_in|occupied|hosted/.test(s)) return "ocupado";
  if (/reservation|reserved|confirmed/.test(s)) return "reservado";
  return null;
}
export function HospedinSyncPanel() {
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const qc = useQueryClient();
  const [busy,setBusy] = useState(false);
  const [rows,setRows] = useState<Row[]>([]);
  const [issues,setIssues] = useState<string[]>([]);
  const [message,setMessage] = useState("Conferir antes de importar. As alterações são feitas apenas no PMS.");
  async function review() {
    if (!companyId || busy) return;
    setBusy(true); setRows([]);setIssues([]);setMessage("Conferindo reservas e quartos...");
    try {
      const session = await supabase.auth.getSession();
      const jwt = session.data.session?.access_token;
      if (!jwt) throw new Error("Sessão expirada.");
      const bookings: Booking[] = [];
      let cursor: string|null = null;
      const seen = new Set<string>();
      for (let page=0;page<100;page++) {
        const query = new URLSearchParams({resource:"bookings"});
        if(cursor)query.set("cursor",cursor);
        const response = await fetch("/api/hospedin?"+query.toString(),{headers:{Authorization:"Bearer "+jwt,"x-company-id":companyId},cache:"no-store"});
        const body = await response.json();
        if(!response.ok)throw new Error(body.error || "Falha no Hospedin");
        bookings.push(...(Array.isArray(body.data)?body.data:[]));
        cursor = body.nextCursor ?? null;
        if(!cursor)break;
        if(seen.has(cursor) || page===99)throw new Error("Paginação incompleta. Nenhuma reserva será importada.");
        seen.add(cursor);
      }
      const [roomResult,localResult]=await Promise.all([
        supabase.from("rooms").select("numero").eq("company_id",companyId).lt("numero",900),
        supabase.from("reservations").select("codigo_externo,quarto,checkin,checkout,status").eq("company_id",companyId)
      ]);
      if(roomResult.error)throw roomResult.error;
      if(localResult.error)throw localResult.error;
      const roomIds=new Set((roomResult.data??[]).map(x=>Number(x.numero)));
      const local=(localResult.data??[]) as Array<{codigo_externo:string|null;quarto:number;checkin:string;checkout:string;status:string}>;
      const codes=new Set(local.map(x=>x.codigo_externo).filter(Boolean));
      const occupied=[...local];
      const ready:Row[]=[];const rejected:string[]=[];
      for(const book of bookings)for(const unit of book.attributes?.units??[]) {
        const code="hospedin:"+book.id+":"+String(unit.unit_id??"");
        const quarto=Number(unit.place_id);
        const start=day(unit.check_in??book.attributes?.check_in), end=day(unit.check_out??book.attributes?.check_out);
        const duration=Math.round((Date.parse(end+"T12:00:00Z")-Date.parse(start+"T12:00:00Z"))/86400000);
        const status=toStatus(unit.status);
        const guest=unit.guests?.find(g=>g.role==="responsible"&&g.name)?.name??unit.guests?.find(g=>g.name)?.name;
        if(unit.unit_id==null || !book.id){rejected.push(code+" — ID externo incompleto");continue;}
        if(codes.has(code)){rejected.push(code+" — já existe no PMS");continue;}
        if(!roomIds.has(quarto)){rejected.push(code+" — mapear ID do quarto Hospedin "+String(unit.place_id));continue;}
        if(!start||!end||!(duration>0)||!status||!guest?.trim()){rejected.push(code+" — faltam dados obrigatórios");continue;}
        const row:Row={company_id:companyId,codigo_externo:code,quarto,cliente_nome:guest.trim(),cliente_id:null,checkin:start,checkout:end,diarias:duration,pessoas:Math.max(1,(unit.adults??0)+(unit.children??0)),valor_diaria:Math.max(0,(unit.daily_cents??0)/100),valor_total:Math.max(0,(unit.total_daily_cents??0)/100),valor_pago:0,desconto:0,pago:false,pagamento:"não informado",status,canal:"Hospedin",motivo_estadia:"Hospedin "+book.id+" — pagamentos não sincronizados"};
        if(occupied.some(x=>overlap(x,row))){rejected.push(code+" — quarto já reservado no período");continue;}
        ready.push(row);occupied.push(row);codes.add(code);
      }
      setRows(ready);setIssues(rejected);
      setMessage("Hospedin: "+bookings.length+" reservas consultadas. "+ready.length+" unidades prontas para importar; "+rejected.length+" pendentes/ignoradas. Nada foi gravado.");
    } catch(e) {setMessage(e instanceof Error?e.message:"Erro na conferência.");}
    finally {setBusy(false);}
  }
  async function importRows() {
    if(!companyId||busy||!rows.length)return;
    if(!window.confirm("Importar "+rows.length+" reservas/UHs para o Hotel Real? Não altera o Hospedin e não importa pagamentos."))return;
    setBusy(true);let done=0;let failed=0;let samples:string[]=[];
    for(const row of rows){
      const existing=await supabase.from("reservations").select("id").eq("company_id",companyId).eq("codigo_externo",row.codigo_externo).limit(1);
      if(existing.error||existing.data?.length){if(existing.error)failed++;continue;}
      const check=await supabase.from("reservations").select("id").eq("company_id",companyId).eq("quarto",row.quarto).lt("checkin",row.checkout).gt("checkout",row.checkin).not("status","in",'("finalizado","cancelado")').limit(1);
      if(check.error||check.data?.length){failed++;samples.push(row.codigo_externo+" conflito");continue;}
      const result=await supabase.from("reservations").insert(row as never);
      if(result.error){failed++;samples.push(result.error.message);}else done++;
    }
    setRows([]);setBusy(false);
    await qc.invalidateQueries({queryKey:["reservations"]});
    setMessage(done+" unidades importadas; "+failed+" falhas. "+samples.slice(0,3).join("; "));
  }
  return <section className="rounded-2xl border bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold">Sincronizar Hospedin → Reservas do Hotel Real</h3><p className="mt-1 text-xs text-muted-foreground">Importação assistida para reservas e mapa. Somente leitura no Hospedin; registros locais não são sobrescritos.</p></div>
      <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={busy} onClick={()=>void review()}>1. Conferir</button><button type="button" className="btn-primary" disabled={busy||rows.length===0} onClick={()=>void importRows()}>2. Importar ({rows.length})</button></div>
    </div>
    <p role="status" className="mt-2 text-sm">{busy?"Processando...":message}</p>
    {(rows.length>0||issues.length>0)&&<div className="mt-3 grid gap-2 md:grid-cols-2">
      <div className="max-h-48 overflow-auto rounded border p-2 text-xs"><strong>Prontas para importar</strong>{rows.slice(0,100).map(r=><p className="border-b py-1" key={r.codigo_externo}>{r.cliente_nome} · UH {r.quarto} · {r.checkin} a {r.checkout} · {r.status}</p>)}</div>
      <div className="max-h-48 overflow-auto rounded border p-2 text-xs"><strong>Pendências</strong>{issues.slice(0,100).map((s,i)=><p className="border-b py-1" key={i}>{s}</p>)}</div>
    </div>}
  </section>;
}
