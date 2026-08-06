import fs from 'node:fs';

const path = 'src/routes/_authenticated/integracoes.tsx';
let source = fs.readFileSync(path, 'utf8');

if (source.includes('Instalar conector Booking')) {
  console.log('Booking connector UI already integrated.');
  process.exit(0);
}

source = source.replace(
  'import { Building2, CalendarClock, FileText, Instagram, MapPinned, Megaphone, MessageCircle, Plus, ShieldCheck, Webhook } from "lucide-react";',
  'import { Building2, CalendarClock, Download, FileText, Instagram, MapPinned, Megaphone, MessageCircle, Plus, ShieldCheck, TestTube2, Webhook } from "lucide-react";',
);

const anchor = `      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">\n        <div className="flex items-start gap-3">\n          <CalendarClock className="mt-0.5 h-5 w-5 text-primary" />`;

const card = `      <section className="mb-5 rounded-xl border border-pine/30 bg-sage-bg/50 p-4">\n        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">\n          <div className="flex items-start gap-3">\n            <ShieldCheck className="mt-0.5 h-5 w-5 text-pine" />\n            <div>\n              <h3 className="font-serif text-lg font-bold text-pine-dark">Conector Booking pelo Chrome</h3>\n              <p className="mt-1 text-sm text-muted-foreground">\n                Usa a sessão já autenticada da Extranet, mostra os dados antes do envio e nunca armazena a senha da Booking.\n              </p>\n              <div className="mt-2 space-y-1 text-xs text-muted-foreground">\n                <p><strong>Endpoint:</strong> https://xjdqjjfnpcnywrkxentv.supabase.co/functions/v1/booking-browser-ingest</p>\n                <p><strong>Empresa:</strong> {current.data?.id ?? "Carregando…"}</p>\n              </div>\n            </div>\n          </div>\n          <div className="flex flex-wrap gap-2">\n            <a href="/booking-extension-install.html" target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-1.5">\n              <Download className="h-4 w-4" /> Instalar conector Booking\n            </a>\n            <a href="/booking-eventos" className="btn-ghost inline-flex items-center gap-1.5">\n              <TestTube2 className="h-4 w-4" /> Testar e conferir eventos\n            </a>\n          </div>\n        </div>\n      </section>\n\n`;

if (!source.includes(anchor)) {
  throw new Error('Integration page anchor not found.');
}

source = source.replace(anchor, card + anchor);
fs.writeFileSync(path, source);
console.log('Booking connector UI integrated.');
