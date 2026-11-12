import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentCompany, setCurrentCompanyId } from "@/lib/data";
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

type RemoteRoom = { id: string; attributes?: Record<string,unknown> };
const ROOM_KEYS = ["number","numero","room_number","room_no","room_code","identification","identifier","code","name","title","label","description"] as const;
function roomNumberFromValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const label = String(value).trim();
  const match = label.match(/^(?:(?:quarto|apartamento|apto\.?|apt\.?|uh|unidade)\s*[-#:]?\s*)?(\d{1,4})$/i);
  return match ? Number(match[1]) : null;
}
function mapRemoteRooms(remoteRooms: RemoteRoom[], localRoomIds: Set<number>) {
  const proposed = new Map<number, number>();
  const claims = new Map<number, number[]>();

  for (const remote of remoteRooms) {
    const remoteId = Number(remote.id);
    if (!Number.isSafeInteger(remoteId)) continue;
    const attributes = remote.attributes ?? {};
    const candidates = [...new Set(ROOM_KEYS.map(key => roomNumberFromValue(attributes[key])).filter((value):value is number => value !== null && localRoomIds.has(value)))];
    if (candidates.length !== 1) continue;
    proposed.set(remoteId, candidates[0]);
    claims.set(candidates[0], [...(claims.get(candidates[0])??[]), remoteId]);

  }
  for (const [remote,local] of proposed) if ((claims.get(local)?.length??0)!==1) proposed.delete(remote);
  return { proposed };
}

export function HospedinSyncPanel({onImported}:{onImported?:()=>void}) {
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const [companyChoice,setCompanyChoice] = useState("");
  const qc = useQueryClient();
  const [busy,setBusy] = useState(false);
  const [rows,setRows] = useState<Row[]>([]);
  const [issues,setIssues] = useState<string[]>([]);
  const [unmapped,setUnmapped] = useState<number[]>([]);
  const [roomInfo,setRoomInfo] = useState("");
  const [diagnostics,setDiagnostics] = useState<Array<{id:number;fields:string;values:string}>>([]);
  const [issueCounts,setIssueCounts] = useState<Record<string,number>>({});
  const [availableRooms,setAvailableRooms] = useState<number[]>([]);
  const [roomMap,setRoomMap] = useState<Record<string,number>>({});
  const [message,setMessage] = useState("Conferir antes de importar. As alterações são feitas apenas no PMS.");
  async function review() {
    if (!companyId || busy) return;
    setBusy(true); setRows([]);setIssues([]);setUnmapped([]);setDiagnostics([]);setIssueCounts({});setMessage("Conferindo reservas e quartos...");
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
        if(!cursor){if(body.hasNextPage)throw new Error("Paginação incompleta: reserva sem cursor.");break;}
        if(seen.has(cursor) || page===99)throw new Error("Paginação incompleta. Nenhuma reserva será importada.");
        seen.add(cursor);
      }
      const remoteRooms: RemoteRoom[] = [];
      let roomCursor: string|null = null;
      const seenRoomCursors = new Set<string>();
      for(let page=0;page<100;page++){
        const params=new URLSearchParams({resource:"rooms"});
        if(roomCursor)params.set("cursor",roomCursor);
        const response=await fetch("/api/hospedin?"+params.toString(),{headers:{Authorization:"Bearer "+jwt,"x-company-id":companyId},cache:"no-store"});
        const body=await response.json();
        if(!response.ok)throw new Error("Não foi possível consultar os quartos do Hospedin: "+(body.error||response.status));
        remoteRooms.push(...(Array.isArray(body.data)?body.data:[]));
        roomCursor=body.nextCursor??null;
        if(!roomCursor){if(body.hasNextPage)throw new Error("Paginação incompleta: quarto sem cursor.");break;}
        if(seenRoomCursors.has(roomCursor)||page===99)throw new Error("Lista de quartos incompleta. Nenhuma reserva importada.");
        seenRoomCursors.add(roomCursor);
      }
      const [roomResult,localResult]=await Promise.all([
        supabase.from("rooms").select("numero").eq("company_id",companyId).lt("numero",900),
        supabase.from("reservations").select("codigo_externo,quarto,checkin,checkout,status").eq("company_id",companyId)
      ]);
      if(roomResult.error)throw roomResult.error;
      if(localResult.error)throw localResult.error;
      const localRoomNumbers=(roomResult.data??[]).map(x=>Number(x.numero));
      setAvailableRooms(localRoomNumbers);
      const roomIds=new Set(localRoomNumbers);
      const {proposed:automaticMapping}=mapRemoteRooms(remoteRooms,roomIds);
      setDiagnostics(remoteRooms.slice(0,30).map(room=>{
        const attrs=room.attributes??{};
        return {id:Number(room.id),fields:Object.keys(attrs).join(", "),values:ROOM_KEYS.map(k=>attrs[k]).filter(v=>v!=null).map(String).join(" | ")||"(sem identificação)"};
      }));
      const key="hotelreal.hospedin.roomMap."+companyId;
      const stored:Record<string,number>=JSON.parse(window.localStorage.getItem(key)??"{}");
      setRoomMap(stored);
      const missingIds=new Set<number>();
      setRoomInfo("Acomodações Hospedin: "+remoteRooms.length+"; quartos cadastrados no PMS: "+localRoomNumbers.length+"; correspondências automáticas confirmadas: "+automaticMapping.size+".");
      const local=(localResult.data??[]) as Array<{codigo_externo:string|null;quarto:number;checkin:string;checkout:string;status:string}>;
      const codes=new Set(local.map(x=>x.codigo_externo).filter(Boolean));
      const occupied=[...local];
      const ready:Row[]=[];const rejected:string[]=[];
      const reasons:Record<string,number>={};
      const reject=(code:string,reason:string,category:string)=>{rejected.push(code+" - "+reason);reasons[category]=(reasons[category]??0)+1;};
      for(const book of bookings)for(const unit of book.attributes?.units??[]) {
        const code="hospedin:"+book.id+":"+String(unit.unit_id??"");
        const quarto=automaticMapping.get(Number(unit.place_id)) ?? stored[String(unit.place_id)] ?? NaN;
        const start=day(unit.check_in??book.attributes?.check_in), end=day(unit.check_out??book.attributes?.check_out);
        const duration=Math.round((Date.parse(end+"T12:00:00Z")-Date.parse(start+"T12:00:00Z"))/86400000);
        const status=toStatus(unit.status);
        const guest=unit.guests?.find(g=>g.role==="responsible"&&g.name)?.name??unit.guests?.find(g=>g.name)?.name;
        if(unit.unit_id==null || !book.id){reject(code,"ID externo incompleto","Sem ID");continue;}
        if(codes.has(code)){reject(code,"já existe no PMS","Já importadas");continue;}
        if(!roomIds.has(quarto)){if(Number.isInteger(Number(unit.place_id)))missingIds.add(Number(unit.place_id));reject(code,"quarto Hospedin ID "+String(unit.place_id)+" não associado","Quartos não associados");continue;}
        if(!start||!end||!(duration>0)||!status||!guest?.trim()){reject(code,"dados incompletos: "+[!(duration>0)?"datas":null,!status?"status":null,!guest?.trim()?"hóspede":null].filter(Boolean).join(", "),"Dados incompletos");continue;}
        const row:Row={company_id:companyId,codigo_externo:code,quarto,cliente_nome:guest.trim(),cliente_id:null,checkin:start,checkout:end,diarias:duration,pessoas:Math.max(1,(unit.adults??0)+(unit.children??0)),valor_diaria:Math.max(0,(unit.daily_cents??0)/100),valor_total:Math.max(0,(unit.total_daily_cents??0)/100),valor_pago:0,desconto:0,pago:false,pagamento:"não informado",status,canal:"Hospedin",motivo_estadia:"Hospedin "+book.id+" — pagamentos não sincronizados"};
        if(occupied.some(x=>overlap(x,row))){reject(code,"quarto ocupado no período","Conflitos");continue;}
        ready.push(row);occupied.push(row);codes.add(code);
      }
      setRows(ready);setIssues(rejected);setUnmapped([...missingIds]);setIssueCounts(reasons);
      setMessage("Hospedin: "+bookings.length+" reservas consultadas. "+ready.length+" unidades prontas para importar; "+rejected.length+" pendentes/ignoradas. Nada foi gravado.");
    } catch(e) {setMessage(e instanceof Error?e.message:"Erro na conferência.");}
    finally {setBusy(false);}
  }
  function mapRoom(externalId:number, localRoom:number) {
    if(!companyId) return;
    const next={...roomMap,[String(externalId)]:localRoom};
    setRoomMap(next);
    window.localStorage.setItem("hotelreal.hospedin.roomMap."+companyId,JSON.stringify(next));
    setRows([]);setMessage("Mapeamento salvo neste navegador. Clique em Conferir novamente antes de importar.");
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
    if(done>0)onImported?.();
    setMessage(done+" unidades importadas; "+failed+" falhas. "+samples.slice(0,3).join("; "));
  }
  return <section className="rounded-2xl border bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold">Sincronizar Hospedin → Reservas do Hotel Real</h3><p className="mt-1 text-xs text-muted-foreground">Importação assistida para reservas e mapa. Somente leitura no Hospedin; registros locais não são sobrescritos.</p></div>
      <div className="flex gap-2"><button type="button" className="btn-ghost" disabled={busy} onClick={()=>void review()}>1. Conferir</button><button type="button" className="btn-primary" disabled={busy||rows.length===0} onClick={()=>void importRows()}>2. Importar ({rows.length})</button></div>
    </div>
    <p role="status" className="mt-2 text-sm">{busy?"Processando...":message}</p>
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
      <p><strong>Empresa selecionada:</strong> {company.data?.nome ?? "Nenhuma"} <span className="font-mono">({companyId ?? "-"})</span></p>
      {company.companies.length > 1 && <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor="hospedin-company-choice">Alterar empresa:</label>
        <select id="hospedin-company-choice" className="field" value={companyChoice || companyId || ""} onChange={e=>setCompanyChoice(e.target.value)}>
          {company.companies.map(item=><option value={item.id} key={item.id}>{item.nome} - {item.id}</option>)}
        </select>
        <button type="button" className="btn-ghost" disabled={!companyChoice || companyChoice===companyId} onClick={()=>void (async()=>{const user=await supabase.auth.getUser();setCurrentCompanyId(user.data.user?.id,companyChoice);})()}>Selecionar</button>
      </div>}
      <p className="mt-1 text-muted-foreground">Se aparecer Hospedin não habilitado, confira se esta empresa corresponde à autorizada para integração.</p>
    </div>
    {roomInfo && <p className="mt-2 text-xs text-muted-foreground">{roomInfo}</p>}
    {Object.keys(issueCounts).length>0 && <div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.entries(issueCounts).map(([reason,count])=><span className="rounded border px-2 py-1" key={reason}>{reason}: {count}</span>)}</div>}
    {diagnostics.length>0 && <details className="mt-2 rounded border p-3 text-xs"><summary className="cursor-pointer font-bold">Diagnóstico de quartos Hospedin (sem dados pessoais)</summary><div className="mt-2 max-h-40 overflow-auto">{diagnostics.map(item=><p key={item.id} className="border-b py-1">ID {item.id}: {item.values} · Campos: {item.fields}</p>)}</div></details>
    {unmapped.length>0 && <div className="mt-3 rounded-lg border p-3">
      <h4 className="font-bold text-sm">Quartos que não puderam ser identificados automaticamente</h4>
      <p className="text-xs text-muted-foreground">A associação automática usa os identificadores disponíveis no Hospedin, aceita variações como "UH 101" e exige correspondência única. Sem identificação confiável, nenhuma reserva desse quarto será importada. Mapeamento opcional abaixo apenas para exceções.</p>
      <div className="mt-2 flex flex-wrap gap-2">{unmapped.map(id=><label className="text-xs" key={id}>Hospedin ID {id} <select className="field ml-1" value={roomMap[String(id)]??""} onChange={e=>mapRoom(id,Number(e.target.value))}><option value="">Selecione o quarto</option>{availableRooms.map(room=><option key={room} value={room}>UH {room}</option>)}</select></label>)}</div>
    </div>}
    {(rows.length>0||issues.length>0)&&<div className="mt-3 grid gap-2 md:grid-cols-2">
      <div className="max-h-48 overflow-auto rounded border p-2 text-xs"><strong>Prontas para importar</strong>{rows.slice(0,100).map(r=><p className="border-b py-1" key={r.codigo_externo}>{r.cliente_nome} · UH {r.quarto} · {r.checkin} a {r.checkout} · {r.status} · {r.pessoas} hóspede(s) · {r.valor_total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} · {r.codigo_externo}</p>)}</div>
      <div className="max-h-48 overflow-auto rounded border p-2 text-xs"><strong>Pendências</strong>{issues.slice(0,100).map((s,i)=><p className="border-b py-1" key={i}>{s}</p>)}</div>
    </div>}
  </section>;
}
