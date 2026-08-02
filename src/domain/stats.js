// domain/stats.js
// Cálculos da secção 8. Tudo derivado dos períodos em campo produzidos pelo reducer.

import { PLAYER_MATCH_STATUS, MATCH_STATUS } from './constants.js';
import { readClock } from './clock.js';

/** Duração de cada entrada; a entrada aberta usa o relógio actual. */
export function stintsWithDuration(player, clockMs) {
  return player.stints.map((s) => ({
    ...s,
    open: s.endMatchMs == null,
    durationMs: Math.max(0, (s.endMatchMs ?? clockMs) - s.startMatchMs),
  }));
}

/**
 * Disciplina de um jogador num jogo.
 *
 * Dois amarelos no mesmo jogo NÃO são guardados como dois amarelos: são uma
 * expulsão, e contam como um vermelho. É o que aparece na ficha do jogo e é o
 * que faz sentido somar ao longo da época — senão o mesmo incidente entrava
 * duas vezes nas estatísticas, uma como avisos e outra como expulsão.
 */
export function playerCards(playerId, cards = []) {
  const mine = cards.filter((c) => c.playerId === playerId);
  const rawYellows = mine.filter((c) => c.type === 'YELLOW').length;
  const secondYellow = mine.some((c) => c.secondYellow);
  return {
    yellows: secondYellow ? Math.max(0, rawYellows - 2) : rawYellows,
    reds: mine.filter((c) => c.type === 'RED').length + (secondYellow ? 1 : 0),
    bySecondYellow: secondYellow,
  };
}

/**
 * Estava este jogador em campo neste instante do jogo?
 *
 * Fim exclusivo: quem saiu exactamente no minuto do golo já não estava lá —
 * senão uma substituição feita no golo dava participação a seis jogadores.
 */
function emCampoAos(stints, ms) {
  return stints.some((s) => s.startMatchMs <= ms && (s.endMatchMs == null || s.endMatchMs > ms));
}

export function playerMatchStats(player, clockMs, { goals = [], cards = [], fouls = [] } = {}) {
  const stints = stintsWithDuration(player, clockMs);
  const courtMs = stints.reduce((a, s) => a + s.durationMs, 0);
  const entries = stints.length;
  const durations = stints.map((s) => s.durationMs);

  // Tempo válido de jogo para este jogador: pára na expulsão (regra 3.10).
  const validUntil = player.expelledAtMatchMs ?? clockMs;
  const benchMs = Math.max(0, validUntil - (player.availableFromMs || 0) - courtMs);

  const current = stints.find((s) => s.open) || null;
  const closed = stints.filter((s) => !s.open);
  const last = closed.length ? closed[closed.length - 1] : null;
  const onCourt = player.status === PLAYER_MATCH_STATUS.ON_COURT;

  return {
    playerId: player.playerId,
    name: player.name,
    number: player.number,
    status: player.status,
    position: player.position,
    stints,
    courtMs,
    benchMs,
    entries,
    avgStintMs: entries ? Math.round(courtMs / entries) : 0,
    longestStintMs: durations.length ? Math.max(...durations) : 0,
    shortestStintMs: durations.length ? Math.min(...durations) : 0,
    currentStintMs: current ? current.durationMs : null,
    sinceLeftMs: !onCourt && last ? Math.max(0, clockMs - last.endMatchMs) : null,
    expelled: player.status === PLAYER_MATCH_STATUS.EXPELLED,
    expulsions: player.status === PLAYER_MATCH_STATUS.EXPELLED ? 1 : 0,
    goals: goals.filter((g) => g.scorerId === player.playerId).length,
    assists: goals.filter((g) => g.assistId === player.playerId).length,
    // Participações em golos: quem estava em campo quando o golo aconteceu.
    // Não é mérito individual — é a leitura de que a equipa marca (ou sofre)
    // com este jogador dentro das quatro linhas.
    goalShare: goals.filter((g) => g.team === 'US' && emCampoAos(stints, g.matchElapsedMs)).length,
    concededShare: goals.filter(
      (g) => g.team === 'THEM' && emCampoAos(stints, g.matchElapsedMs)
    ).length,
    // Golos sofridos enquanto este jogador estava à baliza.
    conceded: goals.filter((g) => g.team === 'THEM' && g.goalkeeperId === player.playerId).length,
    // O jogador anotado numa falta é sempre nosso; o papel é que muda:
    // nas nossas faltas é quem a cometeu, nas deles é quem a sofreu.
    fouls: fouls.filter((f) => f.team === 'US' && f.playerId === player.playerId).length,
    foulsSuffered: fouls.filter((f) => f.team === 'THEM' && f.playerId === player.playerId).length,
    ...playerCards(player.playerId, cards),
  };
}

export function matchStatsTable(state, now = Date.now()) {
  const clockMs = readClock(state, now).matchMs;
  const opts = { goals: state.goals || [], cards: state.cards || [], fouls: state.fouls || [] };
  return Object.values(state.players)
    .map((p) => playerMatchStats(p, clockMs, opts))
    .sort((a, b) => b.courtMs - a.courtMs || a.number - b.number);
}

/**
 * Períodos de 5v4 com a duração fechada. O período aberto conta até agora — no
 * jogo a decorrer o número tem de subir enquanto a situação dura.
 */
export function powerPlayPeriods(state, clockMs) {
  return (state.powerPlays || []).map((x, i) => ({
    ...x,
    numero: i + 1,
    open: x.endMatchMs == null,
    durationMs: Math.max(0, (x.endMatchMs ?? clockMs) - x.startMatchMs),
  }));
}

/** Quanto tempo a equipa jogou com guarda-redes avançado, e em quantas vezes. */
export function powerPlayTotals(state, clockMs) {
  const periodos = powerPlayPeriods(state, clockMs);
  return {
    periodos,
    count: periodos.length,
    totalMs: periodos.reduce((a, x) => a + x.durationMs, 0),
  };
}

export function matchResult(state) {
  if (state.status !== MATCH_STATUS.FINISHED) return null;
  if (state.teamScore > state.opponentScore) return 'W';
  if (state.teamScore < state.opponentScore) return 'L';
  return 'D';
}

/**
 * Agregado do clube. Recebe pares {match, state} já reconstruídos.
 */
function emptyPlayerAggregate(player, { fromRoster = false } = {}) {
  return {
    playerId: player.playerId || player.id,
    name: player.name,
    number: player.number ?? player.shirtNumber,
    fromRoster,
    matches: 0,
    courtMs: 0,
    benchMs: 0,
    entries: 0,
    matchesPlayed: 0,
    goals: 0,
    assists: 0,
    goalShare: 0,
    concededShare: 0,
    conceded: 0,
    fouls: 0,
    foulsSuffered: 0,
    yellows: 0,
    reds: 0,
    expulsions: 0,
  };
}

export function clubAggregate(entries, roster = []) {
  const agg = {
    matches: 0,
    finished: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    get goalDiff() {
      return this.goalsFor - this.goalsAgainst;
    },
    perPlayer: {},
  };

  for (const p of roster) {
    const id = p.playerId || p.id;
    if (!id) continue;
    agg.perPlayer[id] = emptyPlayerAggregate(p, { fromRoster: true });
  }

  for (const { state } of entries) {
    agg.matches += 1;
    const finished = state.status === MATCH_STATUS.FINISHED;
    if (finished) {
      agg.finished += 1;
      agg.goalsFor += state.teamScore;
      agg.goalsAgainst += state.opponentScore;
      const r = matchResult(state);
      if (r === 'W') agg.wins += 1;
      else if (r === 'D') agg.draws += 1;
      else agg.losses += 1;
    }
    const clockMs = state.elapsedMatchMs;
    for (const p of Object.values(state.players)) {
      const s = playerMatchStats(p, clockMs, {
        goals: state.goals || [],
        cards: state.cards || [],
        fouls: state.fouls || [],
      });
      const acc = (agg.perPlayer[p.playerId] ||= emptyPlayerAggregate(p));
      acc.matches += 1;
      if (!acc.fromRoster) {
        acc.name = p.name;
        acc.number = p.number;
      }
      acc.courtMs += s.courtMs;
      acc.benchMs += s.benchMs;
      acc.entries += s.entries;
      acc.goals += s.goals;
      acc.assists += s.assists;
      acc.goalShare += s.goalShare;
      acc.concededShare += s.concededShare;
      acc.conceded += s.conceded;
      acc.fouls += s.fouls;
      acc.foulsSuffered += s.foulsSuffered;
      acc.yellows += s.yellows;
      acc.reds += s.reds;
      acc.expulsions += s.expulsions;
      // Jogos em que chegou a entrar — a base das médias por jogo jogado.
      if (s.entries > 0) acc.matchesPlayed += 1;
    }
  }

  for (const acc of Object.values(agg.perPlayer)) {
    acc.avgCourtPerMatchMs = acc.matches ? Math.round(acc.courtMs / acc.matches) : 0;
    acc.avgEntriesPerMatch = acc.matches ? acc.entries / acc.matches : 0;
  }

  return agg;
}
