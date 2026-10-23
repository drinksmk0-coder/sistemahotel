import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CloudSun, RefreshCw, MapPin, Hotel, CalendarDays, ExternalLink, Droplets, Wind, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/radar-regional")({ component: RadarRegional });

type City = { name: string; state: string; lat: number; lon: number; km: number };
type Weather = { temperature_2m?: number; apparent_temperature?: number; precipitation?: number; relative_humidity_2m?: number; wind_speed_10m?: number; precipitation_probability?: number };
type HotelPlace = { id: number; name: string; type: string; lat: number; lon: number; distanceKm: number; website?: string };
const ORIGIN = { name: "Cruzília", state: "MG", lat: -21.8389, lon: -44.8089 };
const CITIES: City[] = [
 {name:"Caxambu",state:"MG",lat:-21.977,lon:-44.932,km:18},{name:"Baependi",state:"MG",lat:-21.958,lon:-44.890,km:15},
 {name:"São Lourenço",state:"MG",lat:-22.116,lon:-45.054,km:35},{name:"Itamonte",state:"MG",lat:-22.286,lon:-44.869,km:52},
 {name:"Varginha",state:"MG",lat:-21.556,lon:-45.436,km:83},{name:"Lavras",state:"MG",lat:-21.245,lon:-44.999,km:90},
 {name:"Pouso Alegre",state:"MG",lat:-22.228,lon:-45.938,km:115},{name:"Juiz de Fora",state:"MG",lat:-21.764,lon:-43.350,km:170},
 {name:"Belo Horizonte",state:"MG",lat:-19.9167,lon:-43.9345,km:260},{name:"Campinas",state:"SP",lat:-22.9056,lon:-47.0608,km:270},
 {name:"Ribeirão Preto",state:"SP",lat:-21.1775,lon:-47.8103,km:310},{name:"São Paulo",state:"SP",lat:-23.5505,lon:-46.6333,km:285},
 {name:"Rio de Janeiro",state:"RJ",lat:-22.9068,lon:-43.1729,km:255},{name:"Paraty",state:"RJ",lat:-23.2196,lon:-44.7178,km:205},
 {name:"Ubatuba",state:"SP",lat:-23.4339,lon:-45.0711,km:220},{name:"Ouro Preto",state:"MG",lat:-20.3856,lon:-43.5035,km:220},
 {name:"Tiradentes",state:"MG",lat:-21.1102,lon:-44.1744,km:105},{name:"Poços de Caldas",state:"MG",lat:-21.7878,lon:-46.5614,km:180},
 {name:"Vitória",state:"ES",lat:-20.3155,lon:-40.3128,km:490},{name:"Curitiba",state:"PR",lat:-25.4284,lon:-49.2733,km:620}
];

function RadarRegional() {
 const [selected,setSelected]=useState("Caxambu");
 const [weather,setWeather]=useState<Record<string,Weather>>({});
 const [hotels,setHotels]=useState<HotelPlace[]>([]);
 const [busyWeather,setBusyWeather]=useState(false);
 const [busyHotels,setBusyHotels]=useState(false);
 const [error,setError]=useState("");
 const [hotelError,setHotelError]=useState("");
 const [updated,setUpdated]=useState("");
 const city=CITIES.find(x=>x.name===selected) ?? CITIES[0];

 const loadWeather=useCallback(async()=>{
  setBusyWeather(true);setError("");
  try{
   const results=await Promise.all([ORIGIN,...CITIES].map(async point=>{
    const params=new URLSearchParams({latitude:String(point.lat),longitude:String(point.lon),current:"temperature_2m,apparent_temperature,precipitation,relative_humidity_2m,wind_speed_10m",hourly:"precipitation_probability",forecast_days:"1",timezone:"America/Sao_Paulo"});
    const response=await fetch("https://api.open-meteo.com/v1/forecast?"+params.toString());
    if(!response.ok)throw new Error("A API de clima está indisponível no momento.");
    const data=await response.json();
    return [point.name,{...data.current,precipitation_probability:data.hourly?.precipitation_probability?.[0]}] as const;
   }));
   setWeather(Object.fromEntries(results));setUpdated(new Date().toLocaleString("pt-BR"));
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível carregar o clima.");}finally{setBusyWeather(false);}
 },[]);
 const loadHotels=useCallback(async()=>{
  setBusyHotels(true);setHotelError("");
  try{
   const q='[out:json][timeout:25];(node["tourism"~"hotel|motel|guest_house|hostel|resort|apartment"](around:25000,'+city.lat+','+city.lon+');way["tourism"~"hotel|motel|guest_house|hostel|resort|apartment"](around:25000,'+city.lat+','+city.lon+');relation["tourism"~"hotel|motel|guest_house|hostel|resort|apartment"](around:25000,'+city.lat+','+city.lon+'););out center tags;';
   const response=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:new URLSearchParams({data:q})});
   if(!response.ok)throw new Error("O mapa público está ocupado. Tente novamente em alguns minutos.");
   const data=await response.json();
   const items=(data.elements??[]).map((x:any)=>{
    const lat=x.lat??x.center?.lat,lon=x.lon??x.center?.lon;if(typeof lat!=="number"||typeof lon!=="number")return null;
    const tags=x.tags??{};return {id:x.id,name:tags.name??tags["name:pt"]??"Hospedagem sem nome no mapa",type:tags.tourism??"hospedagem",lat,lon,distanceKm:distance(city.lat,city.lon,lat,lon),website:tags.website??tags["contact:website"]} as HotelPlace;
   }).filter((x:HotelPlace|null):x is HotelPlace=>Boolean(x)).sort((a:HotelPlace,b:HotelPlace)=>a.distanceKm-b.distanceKm);
   setHotels(items);
  }catch(e){setHotelError(e instanceof Error?e.message:"Não foi possível buscar hospedagens.");setHotels([]);}finally{setBusyHotels(false);}
 },[city]);
 useEffect(()=>{void loadWeather();},[loadWeather]);
 useEffect(()=>{void loadHotels();},[loadHotels]);
 const w=weather[city.name],originWeather=weather[ORIGIN.name];
 const eventUrl="https://www.google.com/search?q="+encodeURIComponent("eventos festas shows agenda turística "+city.name+" "+city.state+" próximos 30 dias");
 const tourismUrl="https://www.google.com/search?q="+encodeURIComponent("calendário turístico oficial eventos "+city.name+" "+city.state);
 return <main className="mx-auto max-w-7xl space-y-5 pb-10">
  <header className="rounded-2xl border border-border bg-card p-5">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-primary"><CloudSun className="h-6 w-6"/><span className="text-xs font-bold uppercase tracking-widest">Inteligência de mercado</span></div><h1 className="mt-2 text-2xl font-extrabold text-pine-dark">Radar regional de ocupação</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Cruze clima, eventos e oferta de hospedagem em cidades até aproximadamente 1.000 km de Cruzília (MG), para investigar por que a procura sobe ou cai.</p></div><button onClick={()=>{void loadWeather();void loadHotels();}} disabled={busyWeather||busyHotels} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold"><RefreshCw className="h-4 w-4"/>Atualizar</button></div>
   <p className="mt-3 text-xs text-muted-foreground">Clima: Open-Meteo · hospedagens: OpenStreetMap/Overpass · eventos: pesquisa pública. {updated?"Última consulta: "+updated:""}</p>
  </header>
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <Kpi label="Origem" value="Cruzília · MG" detail="Base regional" icon={<MapPin className="h-4 w-4"/>}/>
   <Kpi label="Temperatura em Cruzília" value={originWeather?.temperature_2m==null?"—":Math.round(originWeather.temperature_2m)+"°C"} detail={originWeather?"Chuva: "+(originWeather.precipitation??0)+" mm · vento "+Math.round(originWeather.wind_speed_10m??0)+" km/h":"Consultando clima"} icon={<CloudSun className="h-4 w-4"/>}/>
   <Kpi label={"Temperatura · "+city.name} value={w?.temperature_2m==null?"—":Math.round(w.temperature_2m)+"°C"} detail={w?"Sensação "+Math.round(w.apparent_temperature??w.temperature_2m)+"°C":"Consultando clima"} icon={<CloudSun className="h-4 w-4"/>}/>
   <Kpi label="Probabilidade de chuva" value={w?.precipitation_probability==null?"—":w.precipitation_probability+"%"} detail={w?"Umidade "+Math.round(w.relative_humidity_2m??0)+"%":"Previsão horária"} icon={<Droplets className="h-4 w-4"/>}/>
  </section>
  {error&&<p className="rounded-xl border border-destructive/30 p-3 text-sm">{error}</p>}
  <section className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Comparar clima por cidade</h2><p className="text-sm text-muted-foreground">Selecione um município para investigar hospedagens e eventos locais.</p></div><span className="text-xs text-muted-foreground">{busyWeather?"Atualizando…":Object.keys(weather).length+" pontos"}</span></div>
   <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{CITIES.map(item=>{const cw=weather[item.name];return <button key={item.name} onClick={()=>setSelected(item.name)} className={"rounded-xl border p-3 text-left transition "+(selected===item.name?"border-primary bg-primary/5 ring-1 ring-primary/30":"border-border hover:border-primary/40")}><div className="flex items-start justify-between gap-2"><div><strong className="block text-sm">{item.name}</strong><span className="text-xs text-muted-foreground">{item.state} · aprox. {item.km} km</span></div><span className="text-xl font-extrabold">{cw?.temperature_2m==null?"—":Math.round(cw.temperature_2m)+"°"}</span></div><div className="mt-2 flex gap-3 text-xs text-muted-foreground"><span><Droplets className="mr-1 inline h-3 w-3"/>{cw?.precipitation??"—"} mm</span><span><Wind className="mr-1 inline h-3 w-3"/>{Math.round(cw?.wind_speed_10m??0)} km/h</span></div></button>})}</div>
  </section>
  <section className="grid gap-4 xl:grid-cols-2">
   <article className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><Hotel className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Hotéis e pousadas concorrentes</h2><p className="text-xs text-muted-foreground">Registros públicos num raio de 25 km de {city.name}.</p></div></div><button onClick={()=>void loadHotels()} disabled={busyHotels} className="mt-3 rounded-xl border border-border px-3 py-2 text-sm font-bold">{busyHotels?"Buscando…":"Atualizar lista"} · {hotels.length}</button>{hotelError&&<p className="mt-3 text-sm text-destructive">{hotelError}</p>}<div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">{busyHotels?<p className="p-4 text-sm text-muted-foreground">Consultando mapa público…</p>:hotels.length?hotels.map(item=><div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"><div><strong className="block text-sm">{item.name}</strong><span className="text-xs capitalize text-muted-foreground">{item.type.replaceAll("_"," ")} · {item.distanceKm.toFixed(1)} km</span></div><a className="shrink-0 text-xs font-bold text-primary underline" href={item.website||"https://www.openstreetmap.org/?mlat="+item.lat+"&mlon="+item.lon+"#map=16/"+item.lat+"/"+item.lon} target="_blank" rel="noreferrer">{item.website?"Site":"Ver mapa"} <ExternalLink className="inline h-3 w-3"/></a></div>):<p className="p-4 text-sm text-muted-foreground">Nenhuma hospedagem mapeada encontrada. Isso não significa que não existam hotéis.</p>}</div><p className="mt-3 text-xs text-muted-foreground">A cobertura depende de dados comunitários e pode estar incompleta.</p></article>
   <article className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Eventos e motivos de viagem</h2><p className="text-xs text-muted-foreground">Festas, shows, feriados, congressos e calendário turístico.</p></div></div><div className="mt-4 rounded-xl border border-border bg-muted/40 p-3"><strong className="text-lg">{city.name} · {city.state}</strong><p className="mt-1 text-sm text-muted-foreground">Pesquise eventos para as datas em que a ocupação subiu ou caiu.</p><div className="mt-3 flex flex-col gap-2"><a className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground" href={eventUrl} target="_blank" rel="noreferrer">Pesquisar eventos próximos <ExternalLink className="h-4 w-4"/></a><a className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-bold" href={tourismUrl} target="_blank" rel="noreferrer">Calendário turístico <ExternalLink className="h-4 w-4"/></a></div></div><div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-sm"><Info className="mr-2 inline h-4 w-4"/>A pesquisa não confirma automaticamente evento, público ou impacto na ocupação.</div><strong className="mt-4 block text-sm">Atalhos para cidades próximas</strong><div className="mt-2 flex flex-wrap gap-2">{CITIES.filter(x=>x.km<=200).map(x=><button key={x.name} onClick={()=>setSelected(x.name)} className="rounded-full border border-border px-2.5 py-1 text-xs">{x.name}</button>)}</div></article>
  </section>
  <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5"><h2 className="font-bold">Como investigar a baixa ou alta ocupação</h2><div className="mt-3 grid gap-3 md:grid-cols-3"><Step n="1" title="Marque a data" text="Registre ocupação diária, diárias vendidas, tarifa média e cancelamentos do próprio hotel."/><Step n="2" title="Cruze os fatores" text="Compare chuva, temperatura, feriados e eventos confirmados nas cidades próximas."/><Step n="3" title="Compare concorrentes" text="Registre tarifas e disponibilidade pública observada nos mesmos dias, como indicadores indiretos." /></div><p className="mt-3 text-xs text-muted-foreground">A ocupação real de concorrentes geralmente não é pública. Este radar não inventa esses números. Para encontrar correlação, é necessário cruzar o histórico do hotel com clima, feriados e eventos; correlação não prova causalidade.</p></section>
  <footer className="text-xs text-muted-foreground">Clima: <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (atribuição CC BY 4.0) · hospedagens: <a className="underline" href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">OpenStreetMap</a> · consulta: <a className="underline" href="https://overpass-api.de/" target="_blank" rel="noreferrer">Overpass API</a>.</footer>
 </main>;
}
function Kpi({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <article className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">{icon}{label}</div><div className="mt-2 text-2xl font-extrabold text-pine-dark">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></article>}
function Step({n,title,text}:{n:string;title:string;text:string}){return <article className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">{n}</span><strong className="text-sm">{title}</strong></div><p className="mt-2 text-sm text-muted-foreground">{text}</p></article>}
function distance(a:number,b:number,c:number,d:number){const rad=(x:number)=>x*Math.PI/180;const dl=rad(c-a),dn=rad(d-b);const x=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
