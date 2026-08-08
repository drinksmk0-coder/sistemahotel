// Mantido como hook de compatibilidade para não alterar a estrutura do app.
//
// Não bloqueamos atalhos, seleção de texto nem o menu de contexto do navegador.
// Segurança e permissões devem ser aplicadas no backend/RLS, e não por bloqueios
// de teclado ou mouse no cliente.
export function useInspectorGuard() {
  // Intencionalmente sem interceptadores globais.
}
