-- Quem tem acesso "ver" a um escalão passa a poder enviar como quem tem "editar".
--
-- Um aparelho com dados por enviar de um escalão só de ver ficava com a fila
-- inteira parada: o upsert dos escalões era recusado (42501, "new row violates
-- row-level security policy for table teams") e nada mais subia. Caso real:
-- Beatriz (Nogueiró e Tenões), editar no Sub-11 e ver no Sub-13, 975 por enviar.
--
-- Todas as políticas de escrita (teams, players, matches, match_events, treino,
-- vídeo...) passam por esta função, por isso basta mudá-la aqui.
-- Aplicada em produção a 2026-11-19.

create or replace function public.pode_editar_escalao(t uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- Desde 2026-11-19 qualquer acesso ao escalão (ver ou editar) deixa enviar.
  -- Um "ver" que só ficava à espera travava a fila inteira do aparelho
  -- (42501 em teams) e os dados nunca chegavam ao servidor.
  select exists (
      select 1 from teams te join clubs c on c.id = te.club_id
       where te.id = t and c.owner_id = auth.uid())
      or exists (
      select 1 from team_access a
       where a.team_id = t and a.user_id = auth.uid());
$function$;
