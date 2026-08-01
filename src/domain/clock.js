// domain/clock.js
// Modelo do cronómetro da secção 6 da especificação.
// Nada é gravado por segundo: o estado guarda o acumulado e o instante de arranque.
// Funções puras — migram sem alterações para o servidor.

import { TIMER_STATUS } from './constants.js';

/**
 * Relógio actual a partir do estado persistido.
 * tempo = acumulado + (agora - timerStartedAt) quando está a correr.
 */
export function readClock(state, now = Date.now()) {
  const running = state.timerStatus === TIMER_STATUS.RUNNING && state.timerStartedAt != null;
  const delta = running ? Math.max(0, now - state.timerStartedAt) : 0;
  return {
    running,
    matchMs: (state.elapsedMatchMs || 0) + delta,
    periodMs: (state.periodElapsedMs || 0) + delta,
  };
}

/** MM:SS (os minutos podem passar de 59). */
export function fmt(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Diferença assinada, útil para contagens decrescentes. */
export function fmtRemaining(ms) {
  if (ms == null) return '—';
  const sign = ms < 0 ? '+' : '';
  return sign + fmt(Math.abs(ms));
}

/**
 * Posição do relógio face à duração configurada da parte.
 *
 * A duração é uma REFERÊNCIA, não um limite: o cronómetro nunca pára sozinho.
 * Quem decide quando a parte acaba é o árbitro, e a aplicação não tem como saber
 * quanto tempo ele descontou — parar automaticamente aos 20:00 perderia tempo de
 * jogo real e estragava os tempos individuais (regra 3.4: o cronómetro da
 * aplicação é a única referência para todos os cálculos).
 */
export function periodProgress(state, periodDurationMs, now = Date.now()) {
  const c = readClock(state, now);
  const limit = periodDurationMs || 0;
  const diff = c.periodMs - limit;
  return {
    ...c,
    limitMs: limit,
    over: limit > 0 && diff >= 0,
    remainingMs: Math.max(0, -diff),
    overtimeMs: Math.max(0, diff),
  };
}

export function parseMinutesToMs(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60 * 1000);
}
