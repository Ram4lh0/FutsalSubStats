'use client';

// lib/demo.js — o jogo de experiência, para quem ainda não tem conta.
//
// Porque existe: a app pede conta, mas o que ela faz — cronometrar um jogo,
// marcar substituições, contar golos — não precisa de servidor nenhum. Obrigar
// a registar para experimentar isso é o motivo de rejeição mais comum da App
// Store, e é também mau negócio: ninguém cria conta para ver se vale a pena.
//
// Como funciona: monta-se uma equipa fictícia com o plantel completo e um jogo
// pronto a começar, tudo na base de dados do próprio dispositivo. O jogo é a
// sério — o mesmo código, o mesmo relógio, as mesmas estatísticas — só os nomes
// é que são inventados.
//
// O que NUNCA acontece: nada disto sobe para servidor nenhum. Sem sessão
// iniciada a fila de sincronização não tem para onde enviar, e quando a
// experiência acaba os dados são apagados por identificador, um a um. Quem
// tinha dados reais guardados no aparelho não perde nada.

import { clubs, teams, competitions, players, matches, squad, events } from './data/repository.js';
import { garantirDono, DONO_DEMO } from './data/owner.js';
import { t } from './i18n/index.js';
import { matchCreated } from '../domain/actions.js';
import { eventosPrimeiraParte } from '../domain/demoJogo.js';
import { emDemo, marcarDemo } from './demoEstado.js';
import { LOCATION, MATCH_TIMING } from '../domain/constants.js';

/** Identificadores fixos: é o que permite apagar só o que é da demonstração. */
export const DEMO = {
  clube: '00000000-dem0-4000-8000-000000000001',
  escalao: '00000000-dem0-4000-8000-000000000002',
  competicao: '00000000-dem0-4000-8000-000000000003',
  jogo: '00000000-dem0-4000-8000-000000000004',
};

const PLANTEL = [
  { nome: 'Rui Almeida', numero: 1, pos: 'GOALKEEPER' },
  { nome: 'Tiago Nunes', numero: 4, pos: 'FIXO' },
  { nome: 'Miguel Faria', numero: 7, pos: 'LEFT_WINGER' },
  { nome: 'André Costa', numero: 8, pos: 'RIGHT_WINGER' },
  { nome: 'Pedro Lima', numero: 9, pos: 'PIVOT' },
  { nome: 'João Marques', numero: 10, pos: 'UNIVERSAL' },
  { nome: 'Diogo Pinto', numero: 11, pos: 'LEFT_WINGER' },
  { nome: 'Bruno Serra', numero: 14, pos: 'PIVOT' },
  { nome: 'Nuno Teixeira', numero: 5, pos: 'FIXO' },
  { nome: 'Hugo Barros', numero: 12, pos: 'GOALKEEPER' },
];

/* --------------------------------------------------------------- estado */

export { emDemo };

/* --------------------------------------------------------------- montar */

/**
 * Monta a equipa e o jogo, e devolve o id do jogo.
 *
 * Se já existir uma experiência a meio, é deitada fora primeiro: começar de
 * novo tem de dar sempre um jogo por jogar, não um a meio de outra tentativa.
 *
 * Com `noIntervalo`, a 1.ª parte já vem jogada (`domain/demoJogo.js`) e o jogo
 * abre no intervalo. É assim a primeira experiência; quem repete no fim começa
 * do zero, para experimentar tudo.
 *
 * Com `conta` (o id de quem tem sessão iniciada), a base do aparelho não muda de
 * dono: a demo corre ao lado do que a conta já tenha (um clube ainda sem
 * escalão, por exemplo) e sai por identificador no fim. A sincronização fica
 * parada enquanto a demo corre (`lib/demoEstado.js`), por isso nada disto sobe.
 */
export async function iniciarDemo({ noIntervalo = false, conta = null } = {}) {
  await limparDemo();
  // Sem conta, a experiência é um dono como outro qualquer: se o aparelho ainda
  // tinha a equipa de alguém que saiu da conta, ela sai daqui antes de a
  // demonstração começar. Misturar as duas era o erro.
  const { trocou, perdidas } = conta
    ? { trocou: false, perdidas: 0 }
    : await garantirDono(DONO_DEMO);
  marcarDemo(true);

  const clube = await clubs.create({
    id: DEMO.clube,
    name: t('demo.clube'),
    shortName: 'DEMO',
    currentSeason: '2026/27',
    primaryColor: '#22c55e',
  });

  const escalao = await teams.create(clube.id, {
    id: DEMO.escalao,
    name: t('demo.escalao'),
    shortName: 'SEN',
    timing: MATCH_TIMING.TIMED,
  });

  const prova = await competitions.create(escalao.id, {
    id: DEMO.competicao,
    name: t('demo.competicao'),
  });

  const plantel = [];
  for (const p of PLANTEL) {
    plantel.push(
      await players.create(escalao.id, {
        name: p.nome,
        shirtNumber: p.numero,
        preferredPosition: p.pos,
      })
    );
  }

  const jogo = await matches.create(escalao.id, {
    id: DEMO.jogo,
    opponentName: t('demo.adversario'),
    opponentShortName: 'ADV',
    competitionId: prova.id,
    timing: MATCH_TIMING.TIMED,
    homeOrAway: 'HOME',
    scheduledAt: Date.now(),
    season: '2026/27',
  });

  // Convocatória com o cinco inicial já em campo: quem experimenta quer ver o
  // jogo, não preencher formulários. O resto do plantel fica no banco, que é
  // onde as substituições ganham sentido.
  const convocados = await squad.replace(
    jogo.id,
    plantel.map((p, i) => ({
      playerId: p.id,
      playerNameSnapshot: p.name,
      shirtNumberSnapshot: p.shirtNumber,
      preferredPosition: p.preferredPosition,
      initialPosition: i < 5 ? PLANTEL[i].pos : null,
      initialLocation: i < 5 ? LOCATION.COURT : LOCATION.BENCH,
    }))
  );

  const criado = await events.append(
    matchCreated({
      matchId: jogo.id,
      currentPeriod: 0,
      timerStatus: 'STOPPED',
      timerStartedAt: null,
      elapsedMatchMs: 0,
      periodElapsedMs: 0,
      teamScore: 0,
      opponentScore: 0,
    })
  );

  if (noIntervalo) {
    const novos = eventosPrimeiraParte({
      match: jogo,
      squad: convocados,
      events: [criado],
      jogadores: plantel.map((p) => p.id),
      inicio: Date.now() - 30 * 60_000,
    });
    // Gravados um a um, pela ordem: cada evento é uma fotografia do estado
    // depois do anterior, e o `seq` da base de dados tem de seguir essa ordem.
    for (const [i, ev] of novos.entries())
      await events.append(ev, { sync: i < novos.length - 1 ? 'defer' : 'immediate' });
  }

  return { matchId: jogo.id, limpou: trocou, perdidas };
}

/* --------------------------------------------------------------- limpar */

/**
 * Apaga o que a demonstração criou, e só isso.
 *
 * Por identificador, nunca com uma limpeza geral: quem esteve a usar a app com
 * conta e saiu tem os seus dados guardados no mesmo sítio, e uma experiência
 * não pode levá-los à frente.
 */
export async function limparDemo() {
  // Primeiro apagar, só depois desligar a marca: com sessão iniciada, cada
  // apagamento avisa a sincronização, e enquanto a marca estiver ligada ela não
  // envia nada. Pela ordem inversa, o FC Demonstração podia subir a meio.
  if (await clubs.get(DEMO.clube)) await clubs.remove(DEMO.clube);
  marcarDemo(false);
}
