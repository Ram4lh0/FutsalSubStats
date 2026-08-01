// domain/constants.js
// Enums e etiquetas. Espelham exactamente os tipos SQL de supabase/migrations/0001_init.sql.
// Ao migrar para Next.js este ficheiro passa tal e qual para src/domain/constants.ts.

/** Posições ocupáveis em campo. */
export const POSITIONS = ['GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT'];

/** Posições preferenciais do plantel: as de campo mais universal. */
export const POSITIONS_ALL = [...POSITIONS, 'UNIVERSAL'];

export const POSITION_LABEL = {
  GOALKEEPER: 'Guarda-redes',
  FIXO: 'Fixo',
  LEFT_WINGER: 'Ala esquerdo',
  RIGHT_WINGER: 'Ala direito',
  PIVOT: 'Pivot',
  UNIVERSAL: 'Universal',
  // Registos antigos ficaram com UNDEFINED; lê-se como universal.
  UNDEFINED: 'Universal',
};

export const POSITION_SHORT = {
  GOALKEEPER: 'GR',
  FIXO: 'FIXO',
  LEFT_WINGER: 'ALA E',
  RIGHT_WINGER: 'ALA D',
  PIVOT: 'PIVOT',
  UNIVERSAL: 'UNI',
  UNDEFINED: 'UNI',
};

/** UNDEFINED é o antigo nome de UNIVERSAL — normaliza para comparações. */
export function normalizePosition(pos) {
  return pos === 'UNDEFINED' || !pos ? 'UNIVERSAL' : pos;
}

export const FOOT = { RIGHT: 'RIGHT', LEFT: 'LEFT', BOTH: 'BOTH', UNKNOWN: 'UNKNOWN' };
export const FOOT_LABEL = {
  RIGHT: 'Direito',
  LEFT: 'Esquerdo',
  BOTH: 'Ambos',
  UNKNOWN: 'Não definido',
};
export const FOOT_ALL = [FOOT.RIGHT, FOOT.LEFT, FOOT.BOTH, FOOT.UNKNOWN];

export const MATCH_STATUS = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  FIRST_HALF_RUNNING: 'FIRST_HALF_RUNNING',
  FIRST_HALF_PAUSED: 'FIRST_HALF_PAUSED',
  HALFTIME: 'HALFTIME',
  SECOND_HALF_RUNNING: 'SECOND_HALF_RUNNING',
  SECOND_HALF_PAUSED: 'SECOND_HALF_PAUSED',
  FINISHED: 'FINISHED',
};

export const MATCH_STATUS_LABEL = {
  DRAFT: 'Preparação',
  READY: 'Pronto',
  FIRST_HALF_RUNNING: '1.ª parte',
  FIRST_HALF_PAUSED: '1.ª parte (parado)',
  HALFTIME: 'Intervalo',
  SECOND_HALF_RUNNING: '2.ª parte',
  SECOND_HALF_PAUSED: '2.ª parte (parado)',
  FINISHED: 'Terminado',
};

export const LIVE_STATUSES = [
  'FIRST_HALF_RUNNING',
  'FIRST_HALF_PAUSED',
  'HALFTIME',
  'SECOND_HALF_RUNNING',
  'SECOND_HALF_PAUSED',
];

export const TIMER_STATUS = { STOPPED: 'STOPPED', RUNNING: 'RUNNING', PAUSED: 'PAUSED' };

export const PLAYER_MATCH_STATUS = {
  ON_COURT: 'ON_COURT',
  ON_BENCH: 'ON_BENCH',
  EXPELLED: 'EXPELLED',
  UNAVAILABLE: 'UNAVAILABLE',
};

export const LOCATION = { COURT: 'COURT', BENCH: 'BENCH' };

export const EVENT = {
  MATCH_CREATED: 'MATCH_CREATED',
  SQUAD_UPDATED: 'SQUAD_UPDATED',
  FIRST_HALF_STARTED: 'FIRST_HALF_STARTED',
  CLOCK_PAUSED: 'CLOCK_PAUSED',
  CLOCK_RESUMED: 'CLOCK_RESUMED',
  FIRST_HALF_FINISHED: 'FIRST_HALF_FINISHED',
  SECOND_HALF_LINEUP_SET: 'SECOND_HALF_LINEUP_SET',
  SECOND_HALF_STARTED: 'SECOND_HALF_STARTED',
  SUBSTITUTION: 'SUBSTITUTION',
  POSITION_CHANGED: 'POSITION_CHANGED',
  PLAYER_EXPELLED: 'PLAYER_EXPELLED',
  PLAYER_REPLACED_AFTER_EXPULSION: 'PLAYER_REPLACED_AFTER_EXPULSION',
  PENALTY_STARTED: 'PENALTY_STARTED',
  PENALTY_ENDED: 'PENALTY_ENDED',
  YELLOW_CARD: 'YELLOW_CARD',
  RED_CARD: 'RED_CARD',
  TEAM_FOUL_ADDED: 'TEAM_FOUL_ADDED',
  TEAM_FOUL_REMOVED: 'TEAM_FOUL_REMOVED',
  OPPONENT_FOUL_ADDED: 'OPPONENT_FOUL_ADDED',
  OPPONENT_FOUL_REMOVED: 'OPPONENT_FOUL_REMOVED',
  FOUL_ATTRIBUTED: 'FOUL_ATTRIBUTED',
  TEAM_GOAL_ADDED: 'TEAM_GOAL_ADDED',
  TEAM_GOAL_REMOVED: 'TEAM_GOAL_REMOVED',
  OPPONENT_GOAL_ADDED: 'OPPONENT_GOAL_ADDED',
  OPPONENT_GOAL_REMOVED: 'OPPONENT_GOAL_REMOVED',
  GOAL_ATTRIBUTED: 'GOAL_ATTRIBUTED',
  MATCH_FINISHED: 'MATCH_FINISHED',
  EVENT_UNDONE: 'EVENT_UNDONE',
  MATCH_CORRECTED: 'MATCH_CORRECTED',
};

export const EVENT_LABEL = {
  MATCH_CREATED: 'Jogo criado',
  SQUAD_UPDATED: 'Convocatória alterada',
  FIRST_HALF_STARTED: 'Início da 1.ª parte',
  CLOCK_PAUSED: 'Tempo parado',
  CLOCK_RESUMED: 'Tempo retomado',
  FIRST_HALF_FINISHED: 'Fim da 1.ª parte',
  SECOND_HALF_LINEUP_SET: 'Formação da 2.ª parte definida',
  SECOND_HALF_STARTED: 'Início da 2.ª parte',
  SUBSTITUTION: 'Substituição',
  POSITION_CHANGED: 'Alteração de posição',
  PLAYER_EXPELLED: 'Expulsão',
  PLAYER_REPLACED_AFTER_EXPULSION: 'Reposição após expulsão',
  PENALTY_STARTED: 'Início da sanção',
  PENALTY_ENDED: 'Fim antecipado da sanção',
  YELLOW_CARD: 'Cartão amarelo',
  RED_CARD: 'Cartão vermelho',
  TEAM_FOUL_ADDED: 'Falta da equipa',
  TEAM_FOUL_REMOVED: 'Falta da equipa anulada',
  OPPONENT_FOUL_ADDED: 'Falta do adversário',
  OPPONENT_FOUL_REMOVED: 'Falta do adversário anulada',
  FOUL_ATTRIBUTED: 'Falta atribuída',
  TEAM_GOAL_ADDED: 'Golo da equipa',
  TEAM_GOAL_REMOVED: 'Golo da equipa anulado',
  OPPONENT_GOAL_ADDED: 'Golo do adversário',
  OPPONENT_GOAL_REMOVED: 'Golo do adversário anulado',
  GOAL_ATTRIBUTED: 'Golo atribuído',
  MATCH_FINISHED: 'Jogo terminado',
  EVENT_UNDONE: 'Ação desfeita',
  MATCH_CORRECTED: 'Correção',
};

// Só estes eventos podem ser desfeitos pelo botão DESFAZER.
// Eventos de relógio e de transição de parte alteram o estado temporal e exigem correção manual.
export const UNDOABLE_EVENTS = new Set([
  EVENT.SUBSTITUTION,
  EVENT.POSITION_CHANGED,
  EVENT.PLAYER_EXPELLED,
  EVENT.PLAYER_REPLACED_AFTER_EXPULSION,
  EVENT.YELLOW_CARD,
  EVENT.RED_CARD,
  EVENT.PENALTY_STARTED,
  EVENT.PENALTY_ENDED,
  EVENT.TEAM_FOUL_ADDED,
  EVENT.TEAM_FOUL_REMOVED,
  EVENT.OPPONENT_FOUL_ADDED,
  EVENT.OPPONENT_FOUL_REMOVED,
  EVENT.TEAM_GOAL_ADDED,
  EVENT.TEAM_GOAL_REMOVED,
  EVENT.OPPONENT_GOAL_ADDED,
  EVENT.OPPONENT_GOAL_REMOVED,
]);

export const CARD = { YELLOW: 'YELLOW', RED: 'RED' };
export const CARD_LABEL = { YELLOW: 'Amarelo', RED: 'Vermelho' };

export const STINT_END_REASON = {
  SUBSTITUTED: 'SUBSTITUTED',
  HALFTIME: 'HALFTIME',
  MATCH_FINISHED: 'MATCH_FINISHED',
  EXPELLED: 'EXPELLED',
  CORRECTED: 'CORRECTED',
};

/**
 * Como se joga: com tempo cronometrado (parado a cada interrupção) ou corrido.
 * É uma propriedade do CLUBE, não de cada jogo — a mesma equipa joga sempre nas
 * mesmas condições. Cada jogo guarda uma cópia, para que alterar o clube não
 * reescreva o passado.
 */
export const MATCH_TIMING = { TIMED: 'TIMED', UNTIMED: 'UNTIMED' };

export const MATCH_TIMING_LABEL = {
  TIMED: 'Cronometrado (20 min por parte)',
  UNTIMED: 'Corrido (30 min por parte)',
};

export const MATCH_TIMING_SHORT = { TIMED: 'Cronometrado', UNTIMED: 'Corrido' };

export const TIMING_CONFIG = {
  TIMED: { periodDurationMs: 20 * 60 * 1000, penaltyDurationMs: 2 * 60 * 1000 },
  UNTIMED: { periodDurationMs: 30 * 60 * 1000, penaltyDurationMs: 3 * 60 * 1000 },
};

/** Jogos e clubes antigos não têm o campo: leem-se como corridos. */
export function timingOf(entity) {
  return entity?.timing === MATCH_TIMING.TIMED ? MATCH_TIMING.TIMED : MATCH_TIMING.UNTIMED;
}

export function timingConfig(entity) {
  return TIMING_CONFIG[timingOf(entity)];
}

// Sanção de inferioridade numérica após expulsão. Contada em tempo de JOGO:
// se o cronómetro parar, a contagem pára com ele. A duração vem do tipo de jogo.
export const PENALTY_DURATION_MS = TIMING_CONFIG.UNTIMED.penaltyDurationMs;

/** Últimos segundos da sanção em que o cartão passa a alerta. */
export const PENALTY_ALERT_MS = 10 * 1000;

/**
 * Faltas acumuladas por parte. À quinta a equipa fica em risco; a partir da
 * sexta, cada falta dá livre direto dos 10 metros ao adversário, sem barreira.
 * A contagem zera no início de cada parte.
 */
export const FOUL_LIMIT = 5;

export const MAX_SQUAD = 14;
/** Abaixo de cinco dá para jogar, mas a app pergunta se é mesmo isso. */
export const MIN_SQUAD = 3;
export const MAX_ON_COURT = 5;
export const DEFAULT_PERIOD_MS = 20 * 60 * 1000;

export const HOME_AWAY = { HOME: 'HOME', AWAY: 'AWAY' };
export const HOME_AWAY_LABEL = { HOME: 'Casa', AWAY: 'Fora' };
