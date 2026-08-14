import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BedDouble,
  Bot,
  Building2,
  CalendarRange,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  DollarSign,
  Droplets,
  FileCheck2,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useProfile,
  useRole,
  useSession,
  type AppRole,
} from "@/hooks/use-auth";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { setCurrentCompanyId, useCurrentCompany } from "@/lib/data";
import {
  applySystemSettings,
  getSystemSettings,
} from "@/lib/system-settings";
import { BRAND } from "@/lib/brand";
import { SystemMonitor } from "@/components/SystemMonitor";

type NavigationGroup = "Operação" | "Gestão" | "Relacionamento" | "Inteligência" | "Configurações";
type NavigationItem = { to: string; label: string; icon: LucideIcon; roles: AppRole[]; group: NavigationGroup };
const GROUPS: NavigationGroup[] = ["Operação", "Gestão", "Relacionamento", "Inteligência", "Configurações"];
const NAV_ITEMS: NavigationItem[] = [
  { to: "/central-estrategica", label: "Pulso do Hotel", icon: ChartNoAxesCombined, roles: ["dono"], group: "Operação" },
  { to: "/painel", label: "Visão geral", icon: LayoutDashboard, roles: ["recepcao", "limpeza", "cafe"], group: "Operação" },
  { to: "/mapa", label: "Mapa de quartos", icon: BedDouble, roles: ["dono", "recepcao", "limpeza", "cafe"], group: "Operação" },
  { to: "/reservas", label: "Reservas", icon: CreditCard, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/fichas-checkin", label: "FNRH e check-in", icon: FileCheck2, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/clientes", label: "Hóspedes", icon: Users, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/tarifario", label: "Tarifário", icon: CalendarRange, roles: ["dono"], group: "Gestão" },
  { to: "/vendas", label: "Vendas", icon: DollarSign, roles: ["dono", "recepcao"], group: "Gestão" },
  { to: "/empresas-hospedes", label: "Empresas hóspedes", icon: Building2, roles: ["dono", "recepcao"], group: "Gestão" },
  { to: "/despesas", label: "Despesas", icon: FileWarning, roles: ["dono"], group: "Gestão" },
  { to: "/reclamacoes", label: "Reclamações", icon: MessageSquare, roles: ["dono", "recepcao"], group: "Relacionamento" },
  { to: "/avaliacoes", label: "Avaliações", icon: Star, roles: ["dono", "recepcao"], group: "Relacionamento" },
  { to: "/mensagens", label: "Mensagens", icon: MessagesSquare, roles: ["dono", "recepcao"], group: "Relacionamento" },
  { to: "/relatorio-consumo-agua", label: "Relatório de água", icon: Droplets, roles: ["dono"], group: "Inteligência" },
  { to: "/automacoes-ia", label: "Automações com IA", icon: Bot, roles: ["dono"], group: "Inteligência" },
  { to: "/integracoes", label: "Integrações", icon: Settings, roles: ["dono"], group: "Configurações" },
  { to: "/empresa", label: "Aparência do hotel", icon: Settings, roles: ["dono"], group: "Configurações" },
  { to: "/equipe", label: "Equipe", icon: Users, roles: ["dono"], group: "Configurações" },
  { to: "/ajuda-sistema", label: "Ajuda do sistema", icon: CircleHelp, roles: ["recepcao", "limpeza", "cafe"], group: "Configurações" },
];
const PLATFORM_ADMIN_TAB: NavigationItem = { to: "/admin-plataforma", label: "Administração HospedaMais", icon: ShieldCheck, roles: ["dono"], group: "Configurações" };
const MOBILE_PRIMARY_TABS = new Set(["/central-estrategica", "/painel", "/mapa", "/reservas", "/fichas-checkin"]);
const ROLE_LABELS: Record<AppRole, string> = { dono: "Proprietário / Gestor", recepcao: "Recepcionista", limpeza: "Camareira / Governança", cafe: "Atendente de A&B — Café" };
const ROLE_SUBTITLES: Record<AppRole, string> = { dono: "Gestão do hotel", recepcao: "Recepção e reservas", limpeza: "Governança hoteleira", cafe: "Alimentos e bebidas" };
const STAFF_ALLOWED_PATHS: Record<Exclude<AppRole, "dono">, string[]> = {
  recepcao: ["/painel", "/mapa", "/reservas", "/clientes", "/vendas", "/empresas-hospedes", "/reclamacoes", "/mensagens", "/avaliacoes", "/fichas-checkin", "/caixa-entrada-hotel", "/ajuda-sistema"],
  limpeza: ["/painel", "/mapa", "/ajuda-sistema"],
  cafe: ["/painel", "/mapa", "/ajuda-sistema"],
};
const SIDEBAR_COLLAPSED_KEY = "hospedamais.sidebar.collapsed";
function Clock(){const[now,setNow]=useState(()=>new Date());useEffect(()=>{const id=window.setInterval(()=>setNow(new Date()),1000);return()=>window.clearInterval(id)},[]);return <div className="font-mono text-[10px] leading-relaxed text-white/60"><div className="capitalize">{now.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</div><div>{now.toLocaleTimeString("pt-BR")}</div></div>}
export function AppLayout({children}:{children:ReactNode}){
 const{user}=useSession();const{data:role}=useRole(user);const{data:profile}=useProfile(user);const platformAdmin=usePlatformAdmin();const currentCompany=useCurrentCompany();const navigate=useNavigate();const queryClient=useQueryClient();const path=useRouterState({select:(state)=>state.location.pathname});const[menuOpen,setMenuOpen]=useState(false);const[assistantOpen,setAssistantOpen]=useState(false);const[sidebarCollapsed,setSidebarCollapsed]=useState(()=>typeof window!=="undefined"?window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)==="true":false);const[systemSettings,setSystemSettings]=useState(()=>getSystemSettings(currentCompany.data?.id));
 const visibleItems=role?NAV_ITEMS.filter((item)=>item.roles.includes(role)):[];if(role==="dono"&&platformAdmin.data)visibleItems.push(PLATFORM_ADMIN_TAB);const mobileTabs=visibleItems.filter((item)=>MOBILE_PRIMARY_TABS.has(item.to)).slice(0,4);const showCompanySelector=role==="dono"&&currentCompany.companies.length>1;const companyName=currentCompany.data?.nome??"Empresa não selecionada";const hotelLogo=systemSettings.logo&&systemSettings.logo!=="/hotel-real-logo.png"?systemSettings.logo:BRAND.icon;
 useEffect(()=>{window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY,String(sidebarCollapsed))},[sidebarCollapsed]);
 useEffect(()=>{const settings=getSystemSettings(currentCompany.data?.id);setSystemSettings(settings);applySystemSettings(settings);const handleSettings=(event:Event)=>{const next=(event as CustomEvent).detail??getSystemSettings(currentCompany.data?.id);setSystemSettings(next);applySystemSettings(next)};window.addEventListener("hotelreal:settings",handleSettings);window.addEventListener("hospedamais:settings",handleSettings);return()=>{window.removeEventListener("hotelreal:settings",handleSettings);window.removeEventListener("hospedamais:settings",handleSettings)}},[currentCompany.data?.id]);
 useEffect(()=>{if(!role||platformAdmin.isLoading)return;if(isAllowedPath(role,path,platformAdmin.data===true))return;void navigate({to:defaultPath(role),replace:true})},[navigate,path,platformAdmin.data,platformAdmin.isLoading,role]);
 async function signOut(){await queryClient.cancelQueries();queryClient.clear();await supabase.auth.signOut();navigate({to:"/auth",replace:true})}
 function renderSidebar(collapsed:boolean,desktop:boolean){return <aside className={`app-sidebar relative flex h-full flex-col border-r border-white/8 text-primary-foreground shadow-2xl transition-[width] duration-200 ${desktop?(collapsed?"w-[4.5rem]":"w-[15rem]"):"w-[min(15rem,88vw)]"}`} style={{"--sidebar-primary":systemSettings.primaryColor} as CSSProperties}>
 {desktop&&<button type="button" className="absolute -right-3 top-4 z-50 grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-pine text-white shadow-lg transition hover:scale-105" onClick={()=>setSidebarCollapsed((value)=>!value)} aria-label={collapsed?"Expandir menu lateral":"Recolher menu lateral"} title={collapsed?"Expandir menu lateral":"Recolher menu lateral"}>{collapsed?<ChevronRight className="h-4 w-4"/>:<ChevronLeft className="h-4 w-4"/>}</button>}
 <div className={`border-b border-white/10 ${collapsed?"px-2 py-3":"px-3 py-3"}`}>{!collapsed?(showCompanySelector?<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] p-2.5"><img src={hotelLogo} alt="Logo do hotel" className="h-9 w-9 shrink-0 rounded-lg bg-white/90 object-contain p-0.5"/><label className="min-w-0 flex-1"><span className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-white/50">Hotel em atendimento</span><select className="h-8 w-full rounded-lg border border-white/20 bg-white/95 px-2 text-xs font-bold text-foreground outline-none" value={currentCompany.data?.id??""} onChange={(event)=>setCurrentCompanyId(user?.id,event.target.value)}>{currentCompany.companies.map((company)=><option key={company.id} value={company.id}>{company.nome}</option>)}</select></label></div>:<button type="button" className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] p-2.5 text-left transition hover:bg-white/[0.1]" onClick={()=>desktop&&setSidebarCollapsed(true)} title={desktop?"Recolher menu lateral":companyName}><img src={hotelLogo} alt="Logo do hotel" className="h-10 w-10 shrink-0 rounded-xl bg-white/90 object-contain p-0.5"/><strong className="min-w-0 flex-1 truncate text-sm font-extrabold text-white">{companyName}</strong></button>):<button type="button" className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white/[0.07]" onClick={()=>desktop&&setSidebarCollapsed(false)} title={companyName} aria-label={`Abrir menu de ${companyName}`}><img src={hotelLogo} alt={companyName} className="h-8 w-8 rounded-lg bg-white/90 object-contain p-0.5"/></button>}</div>
 <nav className={`app-sidebar-nav flex-1 px-2 py-2 ${collapsed?"overflow-visible":"overflow-y-auto"}`}>{GROUPS.map((group,groupIndex)=>{const items=visibleItems.filter((item)=>item.group===group);if(!items.length)return null;return <section key={group} className={`${groupIndex>0?"mt-2 border-t border-white/10 pt-2":""}`}>{!collapsed&&<h2 className="mb-1 px-2 text-[8px] font-black uppercase tracking-[0.18em] text-white/35">{group}</h2>}<div className="space-y-0.5">{items.map((item)=><NavigationLink key={item.to} item={item} active={path===item.to||path.startsWith(`${item.to}/`)} collapsed={collapsed} onNavigate={()=>setMenuOpen(false)}/>)}</div></section>})}</nav>
 <div className={`border-t border-white/10 ${collapsed?"p-2":"p-3"}`}>{!collapsed?<><Clock/><div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] p-2.5"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/12 text-xs font-black text-white">{(profile?.nome??user?.email??"U").slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-extrabold text-white">{profile?.nome??user?.email}</div><div className="truncate text-[9px] text-white/55">{platformAdmin.data?"Administrador HospedaMais":role?ROLE_LABELS[role]:"Aguardando liberação"}</div>{role&&<div className="text-[8px] text-white/35">{ROLE_SUBTITLES[role]}</div>}</div><button type="button" onClick={signOut} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white" title="Sair" aria-label="Sair"><LogOut className="h-4 w-4"/></button></div></>:<button type="button" onClick={signOut} className="group relative grid w-full place-items-center rounded-md border border-white/20 py-2 text-white hover:bg-white/10" title="Sair"><LogOut className="h-4 w-4"/><SidebarTooltip label="Sair"/></button>}</div></aside>}
 return <div className="min-h-screen"><SystemMonitor/><button type="button" className="fixed left-4 top-4 z-50 rounded-md bg-pine p-2 text-white shadow-lg xl:hidden" onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Menu className="h-5 w-5"/></button><div className="fixed inset-y-0 left-0 z-40 hidden xl:block">{renderSidebar(sidebarCollapsed,true)}</div>{menuOpen&&<div className="fixed inset-0 z-50 bg-black/40 xl:hidden" onClick={()=>setMenuOpen(false)}><div className="h-full" onClick={(event)=>event.stopPropagation()}><button type="button" className="absolute left-[min(15rem,88vw)] top-4 rounded-r-md bg-card p-2 shadow" onClick={()=>setMenuOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5"/></button>{renderSidebar(false,false)}</div></div>}<main className={`app-main min-w-0 px-3 pb-24 pt-16 transition-[margin] duration-200 sm:px-5 md:px-7 xl:px-4 xl:pb-8 xl:pt-2 ${sidebarCollapsed?"xl:ml-[4.5rem]":"xl:ml-[15rem]"}`}><div className="mx-auto w-full max-w-[1920px]">{children}</div></main>
 {role==="dono"&&!path.startsWith("/assistente")&&<div className="fixed bottom-40 right-3 z-40 flex flex-col items-end gap-2 sm:bottom-auto sm:right-4 sm:top-1/2 sm:-translate-y-1/2">{assistantOpen&&<div className="w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-primary/20 bg-card/95 shadow-2xl backdrop-blur"><div className="bg-[linear-gradient(135deg,var(--primary),var(--accent))] p-3 text-primary-foreground"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Bot className="h-5 w-5"/></span><div><strong className="block text-sm">HotelAI</strong><span className="text-[10px] opacity-80">Análises exclusivas do proprietário</span></div></div><button type="button" className="rounded-full p-1 hover:bg-white/15" onClick={()=>setAssistantOpen(false)} aria-label="Fechar assistente"><X className="h-4 w-4"/></button></div></div><div className="space-y-3 p-3"><div className="rounded-xl rounded-tl-sm bg-muted p-3 text-xs leading-relaxed text-foreground">Analiso ocupação, receita, despesas, reservas, Booking, FNRH, clima e oportunidades estratégicas do hotel.</div><Link to="/assistente" onClick={()=>setAssistantOpen(false)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-sm"><Sparkles className="h-4 w-4"/> Abrir HotelAI</Link></div></div>}<button type="button" onClick={()=>setAssistantOpen((open)=>!open)} className="group relative grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-primary-foreground opacity-80 shadow-[0_8px_24px_color-mix(in_srgb,var(--primary)_30%,transparent)] transition hover:-translate-y-0.5 hover:scale-105 hover:opacity-100" aria-label={assistantOpen?"Fechar HotelAI":"Abrir HotelAI"} aria-expanded={assistantOpen}><span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-sage"/>{assistantOpen?<X className="h-5 w-5"/>:<Bot className="h-5 w-5"/>}</button></div>}
 {mobileTabs.length>0&&<nav className="fixed inset-x-0 bottom-0 z-40 border-t border-pine-dark/15 bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(42,33,24,0.12)] backdrop-blur xl:hidden"><div className="grid grid-cols-4 gap-1">{mobileTabs.map((tab)=>{const Icon=tab.icon;const active=path===tab.to||path.startsWith(`${tab.to}/`);return <Link key={tab.to} to={tab.to} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-semibold transition ${active?"bg-pine text-white":"text-pine-dark hover:bg-sage-bg"}`}><Icon className="h-4 w-4"/><span className="max-w-full truncate">{tab.label}</span></Link>})}</div></nav>}</div>
}
function SidebarTooltip({label}:{label:string}){return <span className="pointer-events-none absolute left-[calc(100%+0.65rem)] top-1/2 z-[70] hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground opacity-0 shadow-xl transition group-hover:opacity-100 xl:block">{label}</span>}
function isAllowedPath(role:AppRole,path:string,platformAdmin:boolean){if(path.startsWith("/admin-plataforma"))return platformAdmin;if(role==="dono")return true;return STAFF_ALLOWED_PATHS[role].some((allowed)=>path===allowed||path.startsWith(`${allowed}/`))}
function defaultPath(role:AppRole){return role==="dono"?"/central-estrategica":"/mapa"}
function NavigationLink({item,active,collapsed,onNavigate}:{item:NavigationItem;active:boolean;collapsed:boolean;onNavigate:()=>void}){const Icon=item.icon;return <Link to={item.to} onClick={onNavigate} title={collapsed?item.label:undefined} className={`group relative flex items-center rounded-md py-1.5 text-xs font-semibold transition ${collapsed?"justify-center px-2":"gap-2.5 px-2.5"} ${active?"bg-white/12 text-white shadow-sm":"text-white/65 hover:bg-white/[0.07] hover:text-white"}`}><Icon className={`h-4 w-4 shrink-0 ${active?"text-white":"text-white/55"}`}/>{!collapsed&&<span className="truncate">{item.label}</span>}{collapsed&&<SidebarTooltip label={item.label}/>}</Link>}
export function PageHeader({title,subtitle,action}:{title:string;subtitle?:string;action?:ReactNode}){return <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h2 className="section-title text-base font-extrabold tracking-tight text-pine-dark sm:text-lg">{title}</h2>{subtitle&&<p className="max-w-3xl truncate text-[10px] text-muted-foreground" title={subtitle}>{subtitle}</p>}</div>{action}</div>}
