// domain/reducer.js
//
// Fonte única de verdade: o estado do jogo é SEMPRE reconstruído a partir de match_events.
// Os períodos em campo (player_stints) são derivados, não guardados — o que torna o
// DESFAZER trivial (marca-se o evento como anulado e reconstrói-se tudo) e garante que
// recarregar a página ou fechar o browser nunca perde nem duplica informação.
//
// Esta função é pura e não toca em browser APIs: no futuro pode correr tal e qual dentro
// de uma Server Action do Next.js ou de uma função SQL/Edge do Supabase.

import {
  EVENT,
  MATCH_STATUS,
  TIMER_STATUS,
  PLAYER_MATCH_STATUS,
  POSITIONS,
  LOCATION,
  STINT_END_REASON,
  MAX_ON_COURT,
  UNDOABLE_EVENTS,
  PENALTY_DURATION_MS,
  CARD,
  normalizePosition,
} from './constants.js';

function findLastIndex(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

function emptyCourt() {
  const c = {};
  for (const p of POSITIONS) c[p] = null;
  return c;
}

function openStint(state, playerId, ev, position) {
  const p = state.players[playerId];
  if (!p) return;
  const already = p.stints.find((s) => s.endMatchMs == null);
  if (already) return; // já tem um período aberto — ignora silenciosamente
  p.stints.push({
    stintNumber: p.stints.length + 1,
    startEventId: ev.id,
    endEventId: null,
    startPeriod: state.currentPeriod,
    endPeriod: null,
    startMatchMs: ev.matchElapsedMs,
    endMatchMs: null,
    startPeriodMs: ev.periodElapsedMs,
    endPeriodMs: null,
    startingPosition: position || p.position || null,
    endingReason: null,
  });
}

function closeStint(state, playerId, ev, reason) {
  const p = state.players[playerId];
  if (!p) return;
  const open = p.stints.find((s) => s.endMatchMs == null);
  if (!open) return;
  open.endEventId = ev.id;
  open.endPeriod = state.currentPeriod;
  open.endMatchMs = ev.matchElapsedMs;
  open.endPeriodMs = ev.periodElapsedMs;
  open.endingReason = reason;
}

function closeAllStints(state, ev, reason) {
  for (const id of Object.keys(state.players)) closeStint(state, id, ev, reason);
}

function expel(state, ev, playerId) {
  const p = state.players[playerId];
  if (!p || p.status === PLAYER_MATCH_STATUS.EXPELLED) return;
  closeStint(state, playerId, ev, STINT_END_REASON.EXPELLED);
  clearFromCourt(state, playerId);
  p.status = PLAYER_MATCH_STATUS.EXPELLED;
  p.position = null;
  p.expelledAtMatchMs = ev.matchElapsedMs;
}

/* ------------------------------------------------------------------- 5v4 */

/**
 * Guarda-redes avançado: a baliza entregue a um jogador de campo para atacar com
 * mais um. Reconhece-se sozinho — assim que quem ocupa a baliza não é
 * guarda-redes de posição, a equipa está em 5v4 e a contagem começa.
 *
 * O botão no cartão do guarda-redes existe para o caso contrário: um guarda-redes
 * a sério que sobe para jogar como quinto. Ninguém o adivinha, por isso pergunta-se.
 */
export function powerPlayAutomatico(state) {
  const pid = state.court.GOALKEEPER;
  if (!pid) return false;
  const p = state.players[pid];
  if (!p) return false;
  // Sem posição registada não se inventa nada: um plantel antigo, importado sem
  // posições, não pode passar o jogo inteiro marcado como 5v4.
  if (!p.preferredPosition) return false;
  return normalizePosition(p.preferredPosition) !== 'GOALKEEPER';
}

/**
 * Abre ou fecha o período de 5v4 conforme a situação em campo mudou. Chamada
 * depois de cada evento: é o campo que manda, não quem carregou no botão.
 *
 * O botão do cartão sobrepõe-se ao automatismo nos dois sentidos — liga quando a
 * app não percebeu, desliga quando percebeu mal. A decisão vale enquanto for o
 * mesmo jogador a ocupar a baliza; trocar de guarda-redes é situação nova e o
 * automatismo volta a mandar.
 */
function syncPowerPlay(state, ev) {
  if (state.powerPlayOverrideGk !== (state.court.GOALKEEPER || null)) {
    state.powerPlayOverride = null;
    state.powerPlayOverrideGk = null;
  }

  const emJogo =
    state.currentPeriod > 0 &&
    state.status !== MATCH_STATUS.HALFTIME &&
    state.status !== MATCH_STATUS.FINISHED;
  const auto = powerPlayAutomatico(state);
  const ativo = emJogo && (state.powerPlayOverride ?? auto);
  const aberto = state.powerPlays.find((x) => x.endMatchMs == null) || null;

  if (ativo && !aberto) {
    state.powerPlays.push({
      startEventId: ev.id,
      startMatchMs: ev.matchElapsedMs,
      startPeriod: state.currentPeriod,
      endEventId: null,
      endMatchMs: null,
      endPeriod: null,
      manual: !auto,
    });
  } else if (!ativo && aberto) {
    aberto.endEventId = ev.id;
    aberto.endMatchMs = ev.matchElapsedMs;
    aberto.endPeriod = state.currentPeriod;
  }
}

/**
 * Quantos jogadores faltam a cada equipa, neste instante.
 *
 * Nós: as sanções por cumprir. Eles: o contador que o treinador vai acertando à
 * mão — o adversário não tem plantel registado, mas saber que estão reduzidos é
 * o que decide se um golo devolve ou não um jogador nosso.
 */
export function shorthandedCount(state, matchMs) {
  const nos = state.penalties.filter(
    (p) => p.endedMatchMs == null && p.startMatchMs + p.durationMs > matchMs
  ).length;
  return { nos, eles: state.opponentExpulsions || 0 };
}

function positionOf(state, playerId) {
  for (const pos of POSITIONS) if (state.court[pos] === playerId) return pos;
  return null;
}

function clearFromCourt(state, playerId) {
  const pos = positionOf(state, playerId);
  if (pos) state.court[pos] = null;
  return pos;
}

/**
 * @param {object} match  linha da tabela matches (configuração estática)
 * @param {array}  squad  linhas de match_squad
 * @param {array}  events linhas de match_events (qualquer ordem; anulados incluídos)
 */
export function buildMatchState(match, squad, events) {
  const state = {
    matchId: match.id,
    clubId: match.clubId,
    periodDurationMs: match.periodDurationMs,
    status: MATCH_STATUS.DRAFT,
    currentPeriod: 0,
    timerStatus: TIMER_STATUS.STOPPED,
    timerStartedAt: null,
    elapsedMatchMs: 0,
    periodElapsedMs: 0,
    teamScore: 0,
    opponentScore: 0,
    halftimeTeamScore: null,
    halftimeOpponentScore: null,
    firstHalfMs: null,
    secondHalfMs: null,
    startedAt: null,
    finishedAt: null,
    players: {},
    court: emptyCourt(),
    lastFirstHalfCourt: null,
    secondHalfLineupSet: false,
    penalties: [],
    goals: [],
    cards: [],
    fouls: [],
    warnings: [],
    // 5v4: períodos de guarda-redes avançado e o interruptor manual (null =
    // segue o automatismo; true/false = o treinador decidiu).
    powerPlays: [],
    powerPlayOverride: null,
    powerPlayOverrideGk: null,
    // Expulsões do adversário ainda por cumprir, contadas à mão.
    opponentExpulsions: 0,
  };

  for (const row of squad) {
    state.players[row.playerId] = {
      squadId: row.id,
      playerId: row.playerId,
      name: row.playerNameSnapshot,
      number: row.shirtNumberSnapshot,
      preferredPosition: row.preferredPosition || null,
      status:
        row.initialLocation === LOCATION.COURT
          ? PLAYER_MATCH_STATUS.ON_COURT
          : PLAYER_MATCH_STATUS.ON_BENCH,
      position: row.initialLocation === LOCATION.COURT ? row.initialPosition : null,
      expelledAtMatchMs: null,
      availableFromMs: 0,
      stints: [],
    };
    if (row.initialLocation === LOCATION.COURT && row.initialPosition) {
      state.court[row.initialPosition] = row.playerId;
    }
  }

  // Um evento pode estar desfeito de duas maneiras: com a marca `undoneAt` na
  // própria linha, ou por existir um EVENT_UNDONE que aponta para ele. As duas
  // contam — assim o estado é o mesmo venha ele do dispositivo ou do servidor,
  // onde só os eventos viajam.
  const undone = new Set(
    events
      .filter((e) => e.eventType === EVENT.EVENT_UNDONE)
      .map((e) => e.metadata?.targetEventId)
      .filter(Boolean)
  );

  const ordered = events
    .filter((e) => !e.undoneAt && !undone.has(e.id) && e.eventType !== EVENT.EVENT_UNDONE)
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  for (const ev of ordered) {
    applyEvent(state, ev);
    syncPowerPlay(state, ev);
  }

  // O resultado ao intervalo é DERIVADO dos golos da 1.ª parte, não fotografado
  // no apito. Corrigir um golo a frio — acrescentar um que faltava, mudar o
  // minuto de outro — tem de mexer também no que estava ao intervalo, senão o
  // jogo passa a contar duas histórias diferentes.
  if (state.firstHalfMs != null) {
    const naPrimeira = (g) => (g.period ? g.period === 1 : g.matchElapsedMs <= state.firstHalfMs);
    state.halftimeTeamScore = state.goals.filter((g) => g.team === 'US' && naPrimeira(g)).length;
    state.halftimeOpponentScore = state.goals.filter(
      (g) => g.team === 'THEM' && naPrimeira(g)
    ).length;
  }

  // Estado antes do apito inicial
  if (!state.startedAt) {
    const onCourt = POSITIONS.filter((p) => state.court[p]).length;
    state.status = onCourt === MAX_ON_COURT ? MATCH_STATUS.READY : MATCH_STATUS.DRAFT;
  }

  state.events = ordered;
  state.allEvents = events.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  // Desfazer só alcança a parte que está a decorrer: com a 2.ª parte a andar,
  // mexer numa substituição da 1.ª mudaria períodos já fechados.
  state.lastUndoable =
    [...ordered]
      .reverse()
      .find(
        (e) => UNDOABLE_EVENTS.has(e.eventType) && (e.period ?? 0) === state.currentPeriod
      ) || null;
  return state;
}

function applyEvent(state, ev) {
  const md = ev.metadata || {};
  switch (ev.eventType) {
    case EVENT.MATCH_CREATED:
      break;

    case EVENT.SQUAD_UPDATED: {
      // Jogador acrescentado com o jogo já a decorrer: só conta banco a partir daqui.
      for (const added of md.added || []) {
        const p = state.players[added.playerId];
        if (p) p.availableFromMs = ev.matchElapsedMs;
      }
      for (const removed of md.removed || []) {
        const p = state.players[removed.playerId];
        if (p) p.status = PLAYER_MATCH_STATUS.UNAVAILABLE;
      }
      break;
    }

    case EVENT.FIRST_HALF_STARTED: {
      state.currentPeriod = 1;
      state.elapsedMatchMs = 0;
      state.periodElapsedMs = 0;
      state.timerStatus = TIMER_STATUS.RUNNING;
      state.timerStartedAt = ev.createdAt;
      state.status = MATCH_STATUS.FIRST_HALF_RUNNING;
      state.startedAt = ev.createdAt;
      for (const pos of POSITIONS) {
        const pid = state.court[pos];
        if (pid) openStint(state, pid, ev, pos);
      }
      break;
    }

    case EVENT.CLOCK_PAUSED: {
      // O relógio só existe dentro de uma parte. No intervalo (ou antes do apito
      // inicial) um evento de relógio é ignorado — protege contra dados antigos
      // que pudessem fazer o jogo "retomar" com o campo vazio.
      if (state.currentPeriod === 0 || state.status === MATCH_STATUS.HALFTIME) break;
      state.elapsedMatchMs = ev.matchElapsedMs;
      state.periodElapsedMs = ev.periodElapsedMs;
      state.timerStatus = TIMER_STATUS.PAUSED;
      state.timerStartedAt = null;
      state.status =
        state.currentPeriod === 1 ? MATCH_STATUS.FIRST_HALF_PAUSED : MATCH_STATUS.SECOND_HALF_PAUSED;
      break;
    }

    case EVENT.CLOCK_RESUMED: {
      if (state.currentPeriod === 0 || state.status === MATCH_STATUS.HALFTIME) break;
      state.elapsedMatchMs = ev.matchElapsedMs;
      state.periodElapsedMs = ev.periodElapsedMs;
      state.timerStatus = TIMER_STATUS.RUNNING;
      state.timerStartedAt = ev.createdAt;
      state.status =
        state.currentPeriod === 1
          ? MATCH_STATUS.FIRST_HALF_RUNNING
          : MATCH_STATUS.SECOND_HALF_RUNNING;
      break;
    }

    case EVENT.FIRST_HALF_FINISHED: {
      state.elapsedMatchMs = ev.matchElapsedMs;
      state.periodElapsedMs = ev.periodElapsedMs;
      closeAllStints(state, ev, STINT_END_REASON.HALFTIME);
      state.timerStatus = TIMER_STATUS.PAUSED;
      state.timerStartedAt = null;
      state.status = MATCH_STATUS.HALFTIME;
      // O resultado ao intervalo não se fotografa aqui: é contado no fim, a
      // partir dos golos da 1.ª parte (ver buildMatchState).
      state.firstHalfMs = ev.periodElapsedMs;
      state.lastFirstHalfCourt = { ...state.court };
      state.court = emptyCourt();
      for (const p of Object.values(state.players)) {
        if (p.status === PLAYER_MATCH_STATUS.ON_COURT) p.status = PLAYER_MATCH_STATUS.ON_BENCH;
        p.position = null;
      }
      state.secondHalfLineupSet = false;
      // O 5v4 marcado à mão não atravessa o intervalo: a 2.ª parte começa com a
      // formação que o treinador escolher.
      state.powerPlayOverride = null;
      state.powerPlayOverrideGk = null;
      break;
    }

    case EVENT.SECOND_HALF_LINEUP_SET: {
      state.court = emptyCourt();
      for (const p of Object.values(state.players)) {
        if (p.status === PLAYER_MATCH_STATUS.ON_COURT || p.status === PLAYER_MATCH_STATUS.ON_BENCH) {
          p.status = PLAYER_MATCH_STATUS.ON_BENCH;
          p.position = null;
        }
      }
      for (const [pos, pid] of Object.entries(md.lineup || {})) {
        const p = state.players[pid];
        if (!p || p.status === PLAYER_MATCH_STATUS.EXPELLED) continue;
        state.court[pos] = pid;
        p.status = PLAYER_MATCH_STATUS.ON_COURT;
        p.position = pos;
      }
      state.secondHalfLineupSet = true;
      break;
    }

    case EVENT.SECOND_HALF_STARTED: {
      state.currentPeriod = 2;
      state.elapsedMatchMs = ev.matchElapsedMs;
      state.periodElapsedMs = 0;
      state.timerStatus = TIMER_STATUS.RUNNING;
      state.timerStartedAt = ev.createdAt;
      state.status = MATCH_STATUS.SECOND_HALF_RUNNING;
      // Cada jogador que começa a 2.ª parte inicia uma NOVA entrada (regra 3.5).
      for (const pos of POSITIONS) {
        const pid = state.court[pos];
        if (pid) openStint(state, pid, ev, pos);
      }
      break;
    }

    case EVENT.SUBSTITUTION: {
      const out = state.players[ev.playerOutId];
      const inn = state.players[ev.playerInId];
      if (!out || !inn) {
        state.warnings.push(`Substituição ignorada: jogador desconhecido (${ev.id}).`);
        break;
      }
      const pos = ev.position || positionOf(state, ev.playerOutId);
      closeStint(state, ev.playerOutId, ev, STINT_END_REASON.SUBSTITUTED);
      clearFromCourt(state, ev.playerOutId);
      out.status = PLAYER_MATCH_STATUS.ON_BENCH;
      out.position = null;
      state.court[pos] = ev.playerInId;
      inn.status = PLAYER_MATCH_STATUS.ON_COURT;
      inn.position = pos;
      openStint(state, ev.playerInId, ev, pos);
      break;
    }

    case EVENT.POSITION_CHANGED: {
      const pid = ev.playerId;
      const to = md.toPosition || ev.position;
      const p = state.players[pid];
      if (!p || !to) break;
      const from = positionOf(state, pid);
      const other = state.court[to];
      if (other && other !== pid) {
        state.court[to] = pid;
        if (from) state.court[from] = other;
        state.players[other].position = from;
      } else {
        if (from) state.court[from] = null;
        state.court[to] = pid;
      }
      p.position = to;
      break;
    }

    case EVENT.PLAYER_EXPELLED: {
      expel(state, ev, ev.playerId);
      break;
    }

    // Um amarelo é só um registo; o SEGUNDO amarelo do mesmo jogador no mesmo jogo
    // é uma expulsão, e é tratado aqui dentro — um evento só, sem depender de a
    // interface se lembrar de emitir também a expulsão.
    case EVENT.YELLOW_CARD: {
      const pid = ev.playerId || md.playerId;
      if (!state.players[pid]) break;
      const previous = state.cards.filter((c) => c.playerId === pid && c.type === CARD.YELLOW);
      const isSecond = previous.length >= 1;
      state.cards.push({
        eventId: ev.id,
        playerId: pid,
        type: CARD.YELLOW,
        period: state.currentPeriod,
        matchElapsedMs: ev.matchElapsedMs,
        secondYellow: isSecond,
      });
      if (isSecond) expel(state, ev, pid);
      break;
    }

    case EVENT.RED_CARD: {
      const pid = ev.playerId || md.playerId;
      if (!state.players[pid]) break;
      state.cards.push({
        eventId: ev.id,
        playerId: pid,
        type: CARD.RED,
        period: state.currentPeriod,
        matchElapsedMs: ev.matchElapsedMs,
        secondYellow: false,
      });
      expel(state, ev, pid);
      break;
    }

    case EVENT.PLAYER_REPLACED_AFTER_EXPULSION: {
      const inn = state.players[ev.playerInId];
      if (!inn || inn.status === PLAYER_MATCH_STATUS.EXPELLED) break;
      const pos = ev.position || POSITIONS.find((x) => !state.court[x]);
      if (!pos) break;
      state.court[pos] = ev.playerInId;
      inn.status = PLAYER_MATCH_STATUS.ON_COURT;
      inn.position = pos;
      openStint(state, ev.playerInId, ev, pos);
      break;
    }

    // Os 2 minutos de inferioridade. Guardamos apenas o instante de arranque em
    // tempo de jogo — o que falta é sempre derivado do relógio, por isso pára
    // quando o cronómetro pára e sobrevive a recarregar a página.
    case EVENT.PENALTY_STARTED: {
      const pid = ev.playerId || md.playerId;
      if (!pid) break;
      const open = state.penalties.find((p) => p.playerId === pid && p.endedMatchMs == null);
      if (open) break; // já existe um a correr para este jogador
      state.penalties.push({
        id: ev.id,
        playerId: pid,
        period: state.currentPeriod,
        startMatchMs: ev.matchElapsedMs,
        durationMs: md.durationMs || PENALTY_DURATION_MS,
        endedMatchMs: null,
        endedEarly: false,
        endedReason: null,
        endedByEventId: null,
      });
      break;
    }

    case EVENT.PENALTY_ENDED: {
      const pid = ev.playerId || md.playerId;
      const open = [...state.penalties].reverse().find((p) => p.playerId === pid && p.endedMatchMs == null);
      if (open) {
        open.endedMatchMs = ev.matchElapsedMs;
        open.endedEarly = true;
        open.endedReason = 'MANUAL';
      }
      break;
    }

    case EVENT.TEAM_GOAL_ADDED: {
      state.teamScore += 1;
      state.goals.push({
        eventId: ev.id,
        team: 'US',
        period: state.currentPeriod,
        matchElapsedMs: ev.matchElapsedMs,
        scorerId: md.scorerId || null,
        assistId: md.assistId || null,
        ownGoal: !!md.ownGoal,
        goalkeeperId: null,
      });
      break;
    }
    case EVENT.TEAM_GOAL_REMOVED: {
      state.teamScore = Math.max(0, state.teamScore - 1);
      const idx = findLastIndex(state.goals, (g) => g.team === 'US');
      if (idx >= 0) state.goals.splice(idx, 1);
      break;
    }

    // Marcador e assistência chegam depois do golo (o resultado é actualizado no
    // instante do toque; a atribuição vem a seguir, sem atrasar o marcador).
    // Os eventos são imutáveis, por isso a atribuição é um evento novo que
    // completa o anterior — o histórico fica com as duas linhas.
    case EVENT.GOAL_ATTRIBUTED: {
      const goal = state.goals.find((g) => g.eventId === md.targetEventId);
      if (!goal) break;
      if ('scorerId' in md) goal.scorerId = md.scorerId || null;
      if ('assistId' in md) goal.assistId = md.assistId || null;
      if ('ownGoal' in md) goal.ownGoal = !!md.ownGoal;
      // Num golo sofrido o que há para corrigir é quem estava à baliza.
      if ('goalkeeperId' in md) goal.goalkeeperId = md.goalkeeperId || null;
      // O minuto pode ser acertado a frio: um golo registado tarde de mais fica
      // com o tempo em que se carregou no botão, não com o tempo em que entrou.
      if (md.matchElapsedMs != null) {
        goal.matchElapsedMs = md.matchElapsedMs;
        if (md.period) goal.period = md.period;
      }
      break;
    }
    // Um golo sofrido devolve um jogador — mas só se estivermos mesmo em
    // inferioridade. Se as duas equipas tiverem o mesmo número de expulsos
    // (4v4, 3v3), ninguém está a ser castigado com menos gente do que o outro e
    // o golo não repõe nada. Daí o contador de expulsões do adversário: sem ele
    // a app não sabe quantos são eles.
    // Termina apenas a sanção mais antiga: cada golo devolve um jogador, não todos.
    case EVENT.OPPONENT_GOAL_ADDED: {
      state.opponentScore += 1;
      state.goals.push({
        eventId: ev.id,
        team: 'THEM',
        period: state.currentPeriod,
        matchElapsedMs: ev.matchElapsedMs,
        scorerId: null,
        assistId: null,
        ownGoal: false,
        // Quem estava à baliza neste momento. Não é preciso perguntar: o estado
        // do campo já sabe, e fica fixo no instante do golo.
        goalkeeperId: state.court.GOALKEEPER || null,
      });
      const { nos, eles } = shorthandedCount(state, ev.matchElapsedMs);
      const running =
        nos > eles
          ? state.penalties
              .filter(
                (p) => p.endedMatchMs == null && p.startMatchMs + p.durationMs > ev.matchElapsedMs
              )
              .sort((a, b) => a.startMatchMs - b.startMatchMs)
          : [];
      const first = running[0];
      if (first) {
        first.endedMatchMs = ev.matchElapsedMs;
        first.endedEarly = true;
        first.endedReason = 'GOAL_CONCEDED';
        first.endedByEventId = ev.id;
      }
      break;
    }

    case EVENT.OPPONENT_GOAL_REMOVED: {
      state.opponentScore = Math.max(0, state.opponentScore - 1);
      const gi = findLastIndex(state.goals, (g) => g.team === 'THEM');
      if (gi >= 0) state.goals.splice(gi, 1);
      // Golo registado por engano: a sanção que ele encurtou volta a correr.
      const undo = state.penalties
        .filter((p) => p.endedReason === 'GOAL_CONCEDED')
        .sort((a, b) => (b.endedMatchMs ?? 0) - (a.endedMatchMs ?? 0))[0];
      if (undo) {
        undo.endedMatchMs = null;
        undo.endedEarly = false;
        undo.endedReason = null;
        undo.endedByEventId = null;
      }
      break;
    }

    // Faltas acumuladas. Guardadas com a parte em que aconteceram, por isso a
    // contagem zera sozinha na segunda parte e o total do jogo continua a ser
    // a soma das duas — sem precisar de dois contadores separados.
    case EVENT.TEAM_FOUL_ADDED:
    case EVENT.OPPONENT_FOUL_ADDED: {
      state.fouls.push({
        eventId: ev.id,
        team: ev.eventType === EVENT.TEAM_FOUL_ADDED ? 'US' : 'THEM',
        period: state.currentPeriod,
        matchElapsedMs: ev.matchElapsedMs,
        playerId: md.playerId || null,
      });
      break;
    }

    // Como nos golos: o contador sobe no instante do toque e o autor vem a
    // seguir, num evento que completa o anterior sem o reescrever.
    case EVENT.FOUL_ATTRIBUTED: {
      const f = state.fouls.find((x) => x.eventId === md.targetEventId);
      if (f) f.playerId = md.playerId || null;
      break;
    }

    case EVENT.TEAM_FOUL_REMOVED:
    case EVENT.OPPONENT_FOUL_REMOVED: {
      const team = ev.eventType === EVENT.TEAM_FOUL_REMOVED ? 'US' : 'THEM';
      const i = findLastIndex(
        state.fouls,
        (f) => f.team === team && f.period === state.currentPeriod
      );
      if (i >= 0) state.fouls.splice(i, 1);
      break;
    }

    case EVENT.MATCH_FINISHED: {
      state.elapsedMatchMs = ev.matchElapsedMs;
      state.periodElapsedMs = ev.periodElapsedMs;
      closeAllStints(state, ev, STINT_END_REASON.MATCH_FINISHED);
      if (state.currentPeriod === 2) state.secondHalfMs = ev.periodElapsedMs;
      state.timerStatus = TIMER_STATUS.STOPPED;
      state.timerStartedAt = null;
      state.status = MATCH_STATUS.FINISHED;
      state.finishedAt = ev.createdAt;
      break;
    }

    case EVENT.MATCH_CORRECTED: {
      if (md.teamScore != null) state.teamScore = md.teamScore;
      if (md.opponentScore != null) state.opponentScore = md.opponentScore;
      break;
    }

    // O interruptor manual do 5v4. Quem abre e fecha o período em si é o
    // `syncPowerPlay`, a seguir a este evento — aqui só se muda a intenção.
    case EVENT.POWER_PLAY_STARTED:
    case EVENT.POWER_PLAY_ENDED: {
      state.powerPlayOverride = ev.eventType === EVENT.POWER_PLAY_STARTED;
      state.powerPlayOverrideGk = state.court.GOALKEEPER || null;
      break;
    }

    // Expulsões do adversário: um número, contado à mão. Não há cronómetro —
    // o treinador tira quando eles voltarem a ser cinco. Serve só para a app
    // saber se estamos ou não em inferioridade a sério.
    case EVENT.OPPONENT_EXPULSION_ADDED: {
      state.opponentExpulsions += 1;
      break;
    }
    case EVENT.OPPONENT_EXPULSION_REMOVED: {
      state.opponentExpulsions = Math.max(0, state.opponentExpulsions - 1);
      break;
    }

    default:
      state.warnings.push(`Evento desconhecido: ${ev.eventType}`);
  }
}

export function onCourtPlayers(state) {
  return POSITIONS.map((pos) => ({ pos, player: state.players[state.court[pos]] || null }));
}

export function benchPlayers(state) {
  return Object.values(state.players)
    .filter((p) => p.status !== PLAYER_MATCH_STATUS.ON_COURT)
    .sort((a, b) => {
      const rank = (p) => (p.status === PLAYER_MATCH_STATUS.ON_BENCH ? 0 : 1);
      return rank(a) - rank(b) || a.number - b.number;
    });
}

/** Faltas de uma equipa na parte indicada (por omissão, a que está a decorrer). */
export function foulsInPeriod(state, team, period = state.currentPeriod) {
  return state.fouls.filter((f) => f.team === team && f.period === period).length;
}

/** Total do jogo: primeira mais segunda parte. */
export function foulsTotal(state, team) {
  return state.fouls.filter((f) => f.team === team).length;
}

/** Está a decorrer um 5v4 neste momento? */
export function powerPlayAtivo(state) {
  return (state.powerPlays || []).some((x) => x.endMatchMs == null);
}

export function countOnCourt(state) {
  return POSITIONS.filter((p) => state.court[p]).length;
}

export function isLive(state) {
  return [
    MATCH_STATUS.FIRST_HALF_RUNNING,
    MATCH_STATUS.FIRST_HALF_PAUSED,
    MATCH_STATUS.SECOND_HALF_RUNNING,
    MATCH_STATUS.SECOND_HALF_PAUSED,
  ].includes(state.status);
}
