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
import { matchCreated } from '../domain/actions.js';
import { LOCATION, MATCH_TIMING } from '../domain/constants.js';

const FLAG = 'futsal-demo';

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

export function emDemo() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

function marcar(ligado) {
  if (typeof window === 'undefined') return;
  try {
    if (ligado) window.sessionStorage.setItem(FLAG, '1');
    else window.sessionStorage.removeItem(FLAG);
  } catch {
    /* sem sessionStorage — a demonstração corre à mesma nesta sessão */
  }
}

/* --------------------------------------------------------------- montar */

/**
 * Monta a equipa e o jogo, e devolve o id do jogo.
 *
 * Se já existir uma experiência a meio, é deitada fora primeiro: começar de
 * novo tem de dar sempre um jogo por jogar, não um a meio de outra tentativa.
 */
export async function iniciarDemo() {
  await limparDemo();
  // A experiência é um dono como outro qualquer: se o aparelho ainda tinha a
  // equipa de alguém que saiu da conta, ela sai daqui antes de a demonstração
  // começar. Misturar as duas era o erro.
  const { trocou, perdidas } = await garantirDono(DONO_DEMO);
  marcar(true);

  const clube = await clubs.create({
    id: DEMO.clube,
    name: 'FC Demonstração',
    shortName: 'DEMO',
    currentSeason: '2026/27',
    primaryColor: '#22c55e',
  });

  const escalao = await teams.create(clube.id, {
    id: DEMO.escalao,
    name: 'Séniores',
    shortName: 'SEN',
    timing: MATCH_TIMING.TIMED,
  });

  const prova = await competitions.create(escalao.id, {
    id: DEMO.competicao,
    name: 'Jogo de experiência',
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
    opponentName: 'AD Vizinhança',
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
  await squad.replace(
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

  await events.append(
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
  marcar(false);
  if (await clubs.get(DEMO.clube)) await clubs.remove(DEMO.clube);
}
