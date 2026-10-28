// domain/jogoManual.js — um jogo já jogado fora da app, registado à mão.
//
// Quem não registou o jogo ao vivo (ou o registou noutro sítio) quer chegar
// logo ao resumo e acrescentar lá, a frio, os golos, os cartões e o resto. Para
// isso o jogo tem de existir como jogado: as duas partes completas, sem
// paragens, com o cinco inicial em campo do princípio ao fim. Tal como na demo
// (`domain/demoJogo.js`), são eventos a sério, criados com as mesmas fábricas
// que a app usa a cada toque — o resumo, os tempos e as estatísticas leem-nos
// sem nenhum caso especial. Os minutos de cada um acertam-se depois em
// "Editar tempos".

import * as A from './actions.js';
import { buildMatchState } from './reducer.js';
import { timingConfig } from './constants.js';

const MIN = 60_000;
/** O intervalo entre as partes, só para os instantes reais baterem certo. */
const INTERVALO_MS = 10 * MIN;

/**
 * Os eventos de um jogo inteiro, do apito inicial ao final.
 *
 * `inicio` é o instante real em que o jogo "começou". Nunca fica no futuro: um
 * jogo que já acabou não pode ter eventos de amanhã.
 */
export function eventosJogoCompleto({ match, squad, events = [], inicio, agora = Date.now() }) {
  const parte = timingConfig(match).periodDurationMs;
  const comeco = Math.min(inicio ?? agora, agora - 2 * parte - INTERVALO_MS);
  const todos = [...events];
  const novos = [];
  const passo = (fabrica, instante) => {
    const st = buildMatchState(match, squad, todos);
    const ev = fabrica(st, instante);
    ev.seq = todos.length + 1;
    todos.push(ev);
    novos.push(ev);
    return st;
  };

  passo((s, now) => A.startFirstHalf(s, now), comeco);
  passo((s, now) => A.finishFirstHalf(s, now), comeco + parte);
  const intervalo = buildMatchState(match, squad, todos);
  const cinco = Object.fromEntries(
    Object.entries(intervalo.lastFirstHalfCourt || {}).filter(([, pid]) => pid)
  );
  const recomeco = comeco + parte + INTERVALO_MS;
  passo((s, now) => A.setSecondHalfLineup(s, cinco, now), recomeco);
  passo((s, now) => A.startSecondHalf(s, now), recomeco);
  passo((s, now) => A.finishMatch(s, now), recomeco + parte);

  // A base de dados atribui o `seq` ao gravar; aqui só serviu para reconstruir.
  return novos.map(({ seq, ...ev }) => ev);
}
