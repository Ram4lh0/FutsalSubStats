-- 0024_assistencias_id_estavel.sql
--
-- Eventos antigos podiam ter dois ids: `id` local e `client_event_id`.
-- A assistencia apontava para o `id` local do golo, mas noutro dispositivo o
-- golo e reconstruido com `client_event_id`. Reenviar a fila corrigida precisa
-- de atualizar o metadata do evento que ja existe no servidor.

create or replace function append_match_event(payload jsonb)
returns match_events as $$
declare
  v_match uuid := (payload->>'match_id')::uuid;
  v_client uuid := (payload->>'client_event_id')::uuid;
  v_tipo match_event_type := (payload->>'event_type')::match_event_type;
  v_seq integer;
  v_row match_events;
begin
  select * into v_row from match_events
   where client_event_id = v_client;
  if found then
    update match_events
       set metadata = coalesce(metadata, '{}'::jsonb) || coalesce(payload->'metadata', '{}'::jsonb)
     where id = v_row.id
       and match_id = v_match
       and event_type = v_tipo
     returning * into v_row;
    return v_row;
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq from match_events where match_id = v_match;

  insert into match_events (
    match_id, seq, event_type, period, match_elapsed_ms, period_elapsed_ms,
    player_id, player_in_id, player_out_id, position,
    team_score_snapshot, opponent_score_snapshot, metadata, client_event_id, created_by
  ) values (
    v_match, v_seq,
    v_tipo,
    coalesce((payload->>'period')::int, 0),
    coalesce((payload->>'match_elapsed_ms')::bigint, 0),
    coalesce((payload->>'period_elapsed_ms')::bigint, 0),
    nullif(payload->>'player_id', '')::uuid,
    nullif(payload->>'player_in_id', '')::uuid,
    nullif(payload->>'player_out_id', '')::uuid,
    nullif(payload->>'position', '')::player_position,
    (payload->>'team_score_snapshot')::int,
    (payload->>'opponent_score_snapshot')::int,
    coalesce(payload->'metadata', '{}'::jsonb),
    v_client,
    auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$$ language plpgsql security invoker;
