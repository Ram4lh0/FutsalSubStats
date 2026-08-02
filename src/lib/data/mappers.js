// lib/data/mappers.js
// Tradução entre o formato do dispositivo (camelCase, tempos em milissegundos) e
// o do PostgreSQL (snake_case, tempos em ISO). Fica tudo isolado aqui: nenhuma
// vista nem o domínio sabem que existe um servidor do outro lado.

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const ms = (txt) => (txt == null ? null : new Date(txt).getTime());

/* ---------------------------------------------------------------- clubes */

export const clubMapper = {
  table: 'clubs',
  toRow: (c, ownerId) => ({
    id: c.id,
    owner_id: ownerId,
    name: c.name,
    short_name: c.shortName || null,
    logo_url: c.logoUrl || null,
    primary_color: c.primaryColor || null,
    secondary_color: c.secondaryColor || null,
    current_season: c.currentSeason || null,
    archived_at: iso(c.archivedAt),
  }),
  fromRow: (r) => ({
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    shortName: r.short_name,
    logoUrl: r.logo_url,
    primaryColor: r.primary_color,
    secondaryColor: r.secondary_color,
    currentSeason: r.current_season,
    archivedAt: ms(r.archived_at),
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    dirty: false,
  }),
};

/* --------------------------------------------------------------- escalões */

export const teamMapper = {
  table: 'teams',
  toRow: (t) => ({
    id: t.id,
    club_id: t.clubId,
    name: t.name,
    short_name: t.shortName || null,
    timing: t.timing === 'TIMED' ? 'TIMED' : 'UNTIMED',
    archived_at: iso(t.archivedAt),
  }),
  fromRow: (r) => ({
    id: r.id,
    clubId: r.club_id,
    name: r.name,
    shortName: r.short_name,
    timing: r.timing,
    archivedAt: ms(r.archived_at),
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    dirty: false,
  }),
};

/* ------------------------------------------------------------ competições */

export const competitionMapper = {
  table: 'competitions',
  toRow: (c) => ({
    id: c.id,
    team_id: c.teamId,
    name: c.name,
    short_name: c.shortName || null,
    archived_at: iso(c.archivedAt),
  }),
  fromRow: (r) => ({
    id: r.id,
    teamId: r.team_id,
    name: r.name,
    shortName: r.short_name,
    archivedAt: ms(r.archived_at),
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    dirty: false,
  }),
};

/* -------------------------------------------------------------- jogadores */

export const playerMapper = {
  table: 'players',
  toRow: (p) => ({
    id: p.id,
    club_id: p.clubId,
    team_id: p.teamId,
    name: p.name,
    shirt_number: p.shirtNumber,
    preferred_position: p.preferredPosition || 'UNIVERSAL',
    strong_foot: p.strongFoot || 'UNKNOWN',
    photo_url: p.photoUrl || null,
    is_active: p.isActive !== false,
  }),
  fromRow: (r) => ({
    id: r.id,
    clubId: r.club_id,
    teamId: r.team_id,
    name: r.name,
    shirtNumber: r.shirt_number,
    preferredPosition: r.preferred_position,
    strongFoot: r.strong_foot,
    photoUrl: r.photo_url,
    isActive: r.is_active,
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    dirty: false,
  }),
};

/* ------------------------------------------------------------------ jogos */

export const matchMapper = {
  table: 'matches',
  toRow: (m) => ({
    id: m.id,
    club_id: m.clubId,
    team_id: m.teamId,
    competition_id: m.competitionId || null,
    opponent_name: m.opponentName,
    opponent_short_name: m.opponentShortName || null,
    competition: m.competition || null,
    season: m.season || null,
    home_or_away: m.homeOrAway || 'HOME',
    scheduled_at: iso(m.scheduledAt),
    timing: m.timing === 'TIMED' ? 'TIMED' : 'UNTIMED',
    period_duration_ms: m.periodDurationMs || 1800000,
    team_fouls: m.teamFouls ?? null,
    notes: m.notes || null,
  }),
  fromRow: (r) => ({
    id: r.id,
    clubId: r.club_id,
    teamId: r.team_id,
    competitionId: r.competition_id,
    opponentName: r.opponent_name,
    opponentShortName: r.opponent_short_name,
    competition: r.competition,
    season: r.season,
    homeOrAway: r.home_or_away,
    scheduledAt: ms(r.scheduled_at),
    timing: r.timing,
    periodDurationMs: r.period_duration_ms,
    teamFouls: r.team_fouls,
    notes: r.notes,
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    dirty: false,
  }),
};

/* ------------------------------------------------------------ convocados */

export const squadMapper = {
  table: 'match_squad',
  toRow: (s) => ({
    id: s.id,
    match_id: s.matchId,
    player_id: s.playerId,
    player_name_snapshot: s.playerNameSnapshot,
    shirt_number_snapshot: s.shirtNumberSnapshot,
    preferred_position: s.preferredPosition || null,
    initial_position: s.initialPosition || null,
    initial_location: s.initialLocation || 'BENCH',
  }),
  fromRow: (r) => ({
    id: r.id,
    matchId: r.match_id,
    playerId: r.player_id,
    playerNameSnapshot: r.player_name_snapshot,
    shirtNumberSnapshot: r.shirt_number_snapshot,
    preferredPosition: r.preferred_position,
    initialPosition: r.initial_position,
    initialLocation: r.initial_location,
    createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at),
    dirty: false,
  }),
};

/* ---------------------------------------------------------------- eventos */

/**
 * O evento é o registo sagrado: nunca se altera, só se acrescenta. Por isso vai
 * para o servidor pela função `append_match_event`, que ignora um envio repetido
 * do mesmo `client_event_id` — é o que torna a fila offline segura de reenviar.
 */
export const eventMapper = {
  table: 'match_events',
  toPayload: (e) => ({
    match_id: e.matchId,
    event_type: e.eventType,
    period: e.period ?? 0,
    match_elapsed_ms: e.matchElapsedMs ?? 0,
    period_elapsed_ms: e.periodElapsedMs ?? 0,
    player_id: e.playerId || null,
    player_in_id: e.playerInId || null,
    player_out_id: e.playerOutId || null,
    position: e.position || null,
    team_score_snapshot: e.teamScoreSnapshot ?? null,
    opponent_score_snapshot: e.opponentScoreSnapshot ?? null,
    metadata: e.metadata || {},
    client_event_id: e.clientEventId || e.id,
  }),
  fromRow: (r) => ({
    id: r.client_event_id || r.id,
    remoteId: r.id,
    matchId: r.match_id,
    seq: r.seq,
    eventType: r.event_type,
    period: r.period,
    matchElapsedMs: Number(r.match_elapsed_ms) || 0,
    periodElapsedMs: Number(r.period_elapsed_ms) || 0,
    playerId: r.player_id,
    playerInId: r.player_in_id,
    playerOutId: r.player_out_id,
    position: r.position,
    teamScoreSnapshot: r.team_score_snapshot,
    opponentScoreSnapshot: r.opponent_score_snapshot,
    metadata: r.metadata || {},
    clientEventId: r.client_event_id,
    createdAt: ms(r.created_at),
    undoneAt: ms(r.undone_at),
    syncedAt: ms(r.created_at),
  }),
};
