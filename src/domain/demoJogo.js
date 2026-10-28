// domain/demoJogo.js — a 1.ª parte já jogada do jogo de experiência.
//
// A demonstração começa no intervalo: quem experimenta chega ao balneário com
// os minutos, os golos e as faltas da 1.ª parte já no ecrã, que é onde se vê
// para que serve registar. Para isso, a 1.ª parte é uma sequência de eventos a
// sério, criada com as mesmas fábricas que a app usa a cada toque — por isso os
// tempos, as estatísticas e o intervalo batem certo sem nenhum caso especial.
//
// Fica aqui, separado de `lib/demo.js`, porque não toca na base de dados: recebe
// o jogo, a convocatória e os eventos que já existem, e devolve os eventos novos.

import * as A from './actions.js';
import { buildMatchState } from './reducer.js';
import { EVENT } from './constants.js';

const MIN = 60_000;

/**
 * O guião da 1.ª parte, por minuto de jogo. Os jogadores são índices da
 * convocatória da demonstração (os cinco primeiros começam em campo, pela ordem
 * guarda-redes, fixo, ala esquerdo, ala direito, pivô).
 */
const GUIAO = [
  { min: 2, tipo: 'faltaDeles' },
  { min: 3, tipo: 'troca', sai: 2, entra: 6, pos: 'LEFT_WINGER' },
  { min: 5, tipo: 'golo', jogador: 4 },
  { min: 6, tipo: 'falta', jogador: 1 },
  { min: 7, tipo: 'troca', sai: 4, entra: 7, pos: 'PIVOT' },
  { min: 9, tipo: 'troca', sai: 1, entra: 8, pos: 'FIXO' },
  { min: 10, tipo: 'goloDeles' },
  { min: 11, tipo: 'falta', jogador: 3 },
  { min: 12, tipo: 'troca', sai: 3, entra: 5, pos: 'RIGHT_WINGER' },
  { min: 14, tipo: 'amarelo', jogador: 8 },
  { min: 15, tipo: 'golo', jogador: 6 },
  { min: 16, tipo: 'troca', sai: 6, entra: 2, pos: 'LEFT_WINGER' },
  { min: 17, tipo: 'falta', jogador: 7 },
  { min: 17.5, tipo: 'faltaDeles' },
  { min: 18, tipo: 'troca', sai: 7, entra: 4, pos: 'PIVOT' },
];

export const DURACAO_PRIMEIRA_DEMO_MS = 20 * MIN;

/**
 * Os eventos de uma 1.ª parte de 20 minutos, a acabar no intervalo.
 *
 * `jogadores` é a lista de ids de jogador pela ordem da convocatória da
 * demonstração; `inicio` é o instante real em que a 1.ª parte "começou" (no
 * passado: o relógio corre sem paragens, e cada evento cai no seu minuto).
 */
export function eventosPrimeiraParte({ match, squad, events = [], jogadores, inicio }) {
  const todos = [...events];
  const novos = [];
  const passo = (fabrica, minuto) => {
    const st = buildMatchState(match, squad, todos);
    const ev = fabrica(st, inicio + minuto * MIN);
    ev.seq = todos.length + 1;
    todos.push(ev);
    novos.push(ev);
    return ev;
  };

  passo((s, now) => A.startFirstHalf(s, now), 0);
  for (const g of GUIAO) {
    if (g.tipo === 'troca') {
      passo(
        (s, now) => A.substitute(s, { playerOutId: jogadores[g.sai], playerInId: jogadores[g.entra], position: g.pos }, now),
        g.min
      );
    } else if (g.tipo === 'golo') {
      passo((s, now) => A.teamGoalBy(s, jogadores[g.jogador], now), g.min);
    } else if (g.tipo === 'goloDeles') {
      passo((s, now) => A.goal(s, EVENT.OPPONENT_GOAL_ADDED, now), g.min);
    } else if (g.tipo === 'falta') {
      const falta = passo((s, now) => A.foul(s, EVENT.TEAM_FOUL_ADDED, now), g.min);
      passo((s, now) => A.attributeFoul(s, { targetEventId: falta.id, playerId: jogadores[g.jogador] }, now), g.min);
    } else if (g.tipo === 'faltaDeles') {
      passo((s, now) => A.foul(s, EVENT.OPPONENT_FOUL_ADDED, now), g.min);
    } else if (g.tipo === 'amarelo') {
      passo((s, now) => A.yellowCard(s, { playerId: jogadores[g.jogador] }, now), g.min);
    }
  }
  passo((s, now) => A.finishFirstHalf(s, now), DURACAO_PRIMEIRA_DEMO_MS / MIN);

  // A base de dados atribui o `seq` ao gravar; aqui só serviu para reconstruir.
  return novos.map(({ seq, ...ev }) => ev);
}
