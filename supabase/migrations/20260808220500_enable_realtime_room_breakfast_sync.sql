-- Sincronização operacional entre aparelhos.
-- O polling do frontend permanece como fallback; Realtime passa a propagar mudanças imediatamente.

alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.breakfast_attendance;
