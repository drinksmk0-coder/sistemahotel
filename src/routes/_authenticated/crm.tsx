import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, MessageCircle, Plus, RefreshCw, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { useCurrentCompany } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/crm")({component: CrmHotelReal});
type Stage = "novo" | "orcamento" | "aguardando" | "negociando" | "ganho" | "perdido";
type Opportunity = {
  id:string;company_id:string;contact_name:string;phone:string;stage:Stage;source:string;
  expected_value:number;realized_value:number;checkin:string|null;checkout:string|null;
  next_followup_at:string|null;last_contact_at:string|null;consent_status:"desconhecido"|"autorizado"|"recusado";
  notes:string;lost_reason:string|null;reservation_id:string|null;created_at:string;updated_at:string;
};
const STAGES: {id:Stage;label:string}[] = [
  {id:"novo",label:"Novo interesse"},{id:"orcamento",label:"Orçamento enviado"},
  {id:"aguardando",label:"Aguardando retorno"},{id:"negociando",label:"Negociação"},
  {id:"ganho",label:"Reserva fechada"},{id:"perdido",label:"Perdida"}
];
const fmtMoney=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const shortDate=(value:string|null)=>value?new Date(value).toLocaleDateString("pt-BR"):"Sem data";
const phoneDigits=(s:string)=>s.replace(/\D/g,"");
const whatsAppLink=(phone:string)=>{
  const digits=phoneDigits(phone);
  const international=digits.length===10||digits.length===11?"55"+digits:digits;
  return /^55\d{10,11}$/.test(international)?"https://wa.me/"+international:null;
};
const isActive=(r:Opportunity)=>r.stage!=="ganho"&&r.stage!=="perdido";
const isDue=(r:Opportunity)=>isActive(r)&&!!r.next_followup_at&&new Date(r.next_followup_at).getTime()<=Date.now();
const FORM_EMPTY={name:"",phone:"",value:"",checkin:"",checkout:"",notes:"",consent:"desconhecido"};
function CrmHotelReal(){
  const company=useCurrentCompany();
  const companyId=company.data?.id;
  const qc=useQueryClient();
  const [form,setForm]=useState(FORM_EMPTY);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [stageFilter,setStageFilter]=useState("abertas");
  const [query,setQuery]=useState("");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [followup,setFollowup]=useState("");
  const [notes,setNotes]=useState("");
  const [stage,setStage]=useState<Stage>("novo");
  const [realized,setRealized]=useState("");
  const [consent,setConsent]=useState<Opportunity["consent_status"]>("desconhecido");
  const list=useQuery({
    queryKey:["crm-opportunities",companyId],
    enabled:!!companyId,
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("crm_opportunities").select("*")
        .eq("company_id",companyId).order("created_at",{ascending:false}).limit(1000);
      if(error)throw error;
      return (data??[]) as Opportunity[];
    }
  });
  const items=list.data??[];
  const active=items.filter(isActive);
  const overdue=active.filter(isDue);
  const won=items.filter(r=>r.stage==="ganho");
  const recovered=won.reduce((n,r)=>n+Number(r.realized_value||0),0);
  const potential=active.reduce((n,r)=>n+Number(r.expected_value||0),0);
  const filtered=useMemo(()=>items.filter(r=>{
    const matches=stageFilter==="todas"||stageFilter==="abertas"&&isActive(r)||r.stage===stageFilter;
    const search=query.trim().toLowerCase();
    return matches&&(!search||[r.contact_name,r.phone,r.notes].some(v=>String(v??"").toLowerCase().includes(search)));
  }),[items,stageFilter,query]);
  const selected=items.find(r=>r.id===editingId)??null;
  useEffect(()=>{
    if(!selected)return;
    setStage(selected.stage);
    setFollowup(selected.next_followup_at?selected.next_followup_at.slice(0,16):"");
    setNotes(selected.notes??"");
    setRealized(String(selected.realized_value||""));
    setConsent(selected.consent_status);
  },[editingId,selected?.updated_at]);

  async function add(){
    if(!companyId||saving)return;
    const digits=phoneDigits(form.phone);
    if(form.name.trim().length<2||digits.length<10)return toast.error("Informe nome e telefone válido.");
    if(form.checkin&&form.checkout&&form.checkout<=form.checkin)return toast.error("Check-out deve ser posterior ao check-in.");
    const amount=Number(form.value.replace(",","."));
    if(!Number.isFinite(amount)||amount<0)return toast.error("Valor inválido.");
    const duplicate=items.find(r=>phoneDigits(r.phone)===digits&&isActive(r)&&(!form.checkin||r.checkin===form.checkin));
    if(duplicate)return toast.error("Já existe oportunidade aberta com esse telefone. Atualize o registro existente.");
    setSaving(true);
    try{
      const {error}=await (supabase as any).from("crm_opportunities").insert({
        company_id:companyId,contact_name:form.name.trim(),phone:digits,expected_value:amount,
        checkin:form.checkin||null,checkout:form.checkout||null,notes:form.notes.trim(),
        consent_status:form.consent,source:"whatsapp",stage:"novo"
      });
      if(error)throw error;
      await qc.invalidateQueries({queryKey:["crm-opportunities",companyId]});
      setForm(FORM_EMPTY);setShowForm(false);toast.success("Oportunidade criada.");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao salvar");}
    finally{setSaving(false);}
  }
  async function save(){
    if(!companyId||!selected||saving)return;
    const amount=Number(realized.replace(",",".")||0);
    if(!Number.isFinite(amount)||amount<0)return toast.error("Receita inválida.");
    if(stage==="ganho"&&amount<=0)return toast.error("Informe o valor real da reserva para contabilizar receita.");
    setSaving(true);
    try{
      const {error}=await (supabase as any).from("crm_opportunities").update({
        stage,notes,realized_value:stage==="ganho"?amount:0,
        next_followup_at:isActive({...selected,stage})&&followup?new Date(followup).toISOString():null,
        consent_status:consent
      }).eq("company_id",companyId).eq("id",selected.id);
      if(error)throw error;
      await qc.invalidateQueries({queryKey:["crm-opportunities",companyId]});
      setEditingId(null);toast.success("Oportunidade atualizada.");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao atualizar");}
    finally{setSaving(false);}
  }
  return <main className="mx-auto max-w-7xl space-y-5 p-3 pb-16 md:p-6">
    <PageHeader title="CRM · Receita e relacionamento" subtitle="Recupere orçamentos, acompanhe negociações e registre vendas atribuídas ao relacionamento." action={
      <button type="button" className="btn-primary flex items-center gap-2" onClick={()=>setShowForm(v=>!v)}><Plus className="h-4 w-4"/>Nova oportunidade</button>
    }/>
    <section className="grid gap-3 md:grid-cols-4">
      {[
        {label:"Oportunidades abertas",value:String(active.length),icon:Target},
        {label:"Contatos vencidos",value:String(overdue.length),icon:MessageCircle},
        {label:"Potencial aberto",value:fmtMoney(potential),icon:ArrowUpRight},
        {label:"Receita fechada registrada",value:fmtMoney(recovered),icon:TrendingUp}
      ].map(x=><div key={x.label} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-2 text-xs text-muted-foreground"><x.icon className="h-4 w-4"/>{x.label}</div><strong className="mt-3 block text-2xl">{x.value}</strong></div>)}
    </section>
    <p className="text-xs text-muted-foreground">Indicador de receita: soma de oportunidades marcadas como fechadas. Não é faturamento fiscal nem prova de receita incremental. Dados cadastrados pela equipe até conectar o WhatsApp oficial.</p>
    {list.error&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      O banco ainda não disponibilizou a tabela do CRM. Aplicar a migração <code>supabase/migrations/20261112010000_crm_comercial.sql</code> no Supabase do Hotel Real. Nenhuma informação será guardada somente no navegador.
      <p className="mt-1 text-xs">{String((list.error as Error).message)}</p>
    </div>}
    {showForm&&<section className="rounded-2xl border bg-card p-4"><h2 className="mb-3 font-bold">Registrar oportunidade comercial</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Nome<input className="field mt-1 w-full" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nome do interessado"/></label>
        <label className="text-sm">WhatsApp<input className="field mt-1 w-full" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="DDD + telefone"/></label>
        <label className="text-sm">Valor estimado (R$)<input className="field mt-1 w-full" inputMode="decimal" value={form.value} onChange={e=>setForm({...form,value:e.target.value})} placeholder="0,00"/></label>
        <label className="text-sm">Check-in desejado<input className="field mt-1 w-full" type="date" value={form.checkin} onChange={e=>setForm({...form,checkin:e.target.value})}/></label>
        <label className="text-sm">Check-out desejado<input className="field mt-1 w-full" type="date" value={form.checkout} onChange={e=>setForm({...form,checkout:e.target.value})}/></label>
        <label className="text-sm">Permissão de acompanhamento<select className="field mt-1 w-full" value={form.consent} onChange={e=>setForm({...form,consent:e.target.value})}><option value="desconhecido">Não verificada</option><option value="autorizado">Autorizado</option><option value="recusado">Não deseja mensagens</option></select></label>
        <label className="text-sm md:col-span-3">Observações<textarea className="field mt-1 w-full" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="O que a pessoa pediu? Por que não fechou?"/></label>
      </div><button type="button" className="btn-primary mt-3" disabled={saving||!!list.error} onClick={()=>void add()}>{saving?"Salvando...":"Salvar oportunidade"}</button>
    </section>}
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Funil de vendas</h2><button type="button" className="btn-ghost flex items-center gap-2 text-sm" onClick={()=>void list.refetch()}><RefreshCw className="h-4 w-4"/>Atualizar</button></div>
      <div className="mb-3 flex flex-wrap gap-2">{STAGES.map(s=><span key={s.id} className="rounded-full border px-3 py-1 text-xs">{s.label} · {items.filter(x=>x.stage===s.id).length}</span>)}</div>
      <div className="flex flex-wrap gap-2"><input className="field min-w-44 flex-1" placeholder="Buscar nome ou telefone" value={query} onChange={e=>setQuery(e.target.value)}/><select className="field" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="abertas">Em andamento</option><option value="todas">Todas</option>{STAGES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
      <div className="mt-3 space-y-2">
        {list.isLoading?<p className="p-3 text-sm">Carregando...</p>:filtered.length===0?<p className="p-3 text-sm text-muted-foreground">Nenhuma oportunidade neste filtro.</p>:filtered.map(item=>{
          const link=whatsAppLink(item.phone);
          return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
            <div className="min-w-40 flex-1"><strong>{item.contact_name}</strong><p className="text-xs text-muted-foreground">{item.phone} · {STAGES.find(s=>s.id===item.stage)?.label} · {fmtMoney(item.expected_value)}</p>
              <p className="text-xs">{item.next_followup_at?"Próximo contato: "+shortDate(item.next_followup_at):"Sem contato agendado"}{isDue(item)?" · ATRASADO":""}</p></div>
            {link&&item.consent_status!=="recusado"&&<a href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost flex items-center gap-1 text-xs"><MessageCircle className="h-4 w-4"/>Abrir conversa</a>}
            <button type="button" className="btn-primary" onClick={()=>setEditingId(item.id)}>Acompanhar</button>
          </div>;
        })}
      </div>
    </section>
    {selected&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Atualizar oportunidade" onClick={()=>setEditingId(null)}>
      <div className="w-full max-w-lg space-y-3 rounded-2xl bg-card p-5 shadow-xl" onClick={e=>e.stopPropagation()}>
        <h2 className="text-lg font-bold">{selected.contact_name}</h2>
        <p className="text-xs text-muted-foreground">{selected.phone} · expectativa {fmtMoney(selected.expected_value)}</p>
        <label className="block text-sm">Etapa<select className="field mt-1 w-full" value={stage} onChange={e=>setStage(e.target.value as Stage)}>{STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        {stage==="ganho"&&<label className="block text-sm">Valor real fechado (R$)<input className="field mt-1 w-full" value={realized} onChange={e=>setRealized(e.target.value)}/></label>}
        <label className="block text-sm">Próximo contato<input className="field mt-1 w-full" type="datetime-local" value={followup} onChange={e=>setFollowup(e.target.value)}/></label>
        <label className="block text-sm">Consentimento<select className="field mt-1 w-full" value={consent} onChange={e=>setConsent(e.target.value as Opportunity["consent_status"])}><option value="desconhecido">Não verificado</option><option value="autorizado">Autorizado</option><option value="recusado">Não deseja mensagens</option></select></label>
        <label className="block text-sm">Histórico e observações<textarea className="field mt-1 w-full" rows={4} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={()=>setEditingId(null)}>Cancelar</button><button type="button" className="btn-primary" disabled={saving} onClick={()=>void save()}>{saving?"Salvando...":"Salvar"}</button></div>
      </div>
    </div>}
    <p className="text-xs text-muted-foreground">WhatsApp: abertura manual de conversa, sem disparos automáticos nesta versão. Para captar mensagens e fazer follow-up automático, ainda é necessária integração oficial com webhooks, templates e controles de consentimento.</p>
  </main>;
}
