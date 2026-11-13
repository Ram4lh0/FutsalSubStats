// domain/partilhado.js — a fusão de um jogo com registo partilhado: juntar o
// jogo dos Registos ao jogo dos Tempos. O formato (onde fica o papel, a hora e
// as marcas da fusão) está explicado em domain/partilha.js.
//
// Funções puras: a parte que lê e escreve a base está em lib/partilhado.js.

import { EVENT } from './constants.js';
import { CATALOGO, RESULTADO_REMATE, levaGolo, registar, registosDoJogo } from './registos.js';
import { papelContrario, partilhaTerminada, porOrdem } from './partilha.js';

export * from './partilha.js';

/** Até quanto tempo de diferença um remate "golo" dos Registos é o golo dos Tempos. */
export const JANELA_GOLO_MS = 90 * 1000;

/* ---------------------------------------------------- o mesmo jogo, ou não */

const chave = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

function mesmoDia(a, b) {
  if (a == null || b == null) return false;
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
}

/** Mesmo escalão, mesmo adversário (sem acentos nem maiúsculas) e mesmo dia. */
export function mesmoJogo(a, b) {
  if (!a || !b || a.id === b.id) return false;
  return (
    Boolean(a.teamId) &&
    a.teamId === b.teamId &&
    chave(a.opponentName) !== '' &&
    chave(a.opponentName) === chave(b.opponentName) &&
    mesmoDia(a.scheduledAt, b.scheduledAt)
  );
}

/** Porque é que um jogo (ainda) não se pode juntar. `null` = pode. */
export const MOTIVO = {
  NAO_TERMINADO: 'naoTerminado',
  NAO_SINCRONIZADO: 'naoSincronizado',
  JA_FUNDIDO: 'jaFundido',
};

/**
 * O que impede este jogo de entrar numa fusão, ou null.
 * `sincronizado` vem de fora (lib/partilhado.js): é a base local que o sabe.
 */
export function impedimento({ partilha, state, sincronizado }) {
  if (partilha.fusao || partilha.fundidoEm) return MOTIVO.JA_FUNDIDO;
  if (!partilhaTerminada(partilha, state)) return MOTIVO.NAO_TERMINADO;
  if (!sincronizado) return MOTIVO.NAO_SINCRONIZADO;
  return null;
}

/**
 * Os jogos que se podem juntar a este: mesmo escalão, adversário e dia, papel
 * contrário, por fundir. Cada um traz `motivo` (null se já pode ser juntado).
 *
 * @param {object} meu         { match, partilha }
 * @param {Array}  candidatos  [{ match, partilha, state, sincronizado }]
 */
export function jogosParaJuntar(meu, candidatos) {
  const quero = papelContrario(meu?.partilha?.papel);
  if (!quero) return [];
  return (candidatos || [])
    .filter(
      (c) =>
        !c.match.archivedAt &&
        c.partilha?.papel === quero &&
        !c.partilha.fusao &&
        !c.partilha.fundidoEm &&
        mesmoJogo(meu.match, c.match)
    )
    .map((c) => ({ ...c, motivo: impedimento(c) }))
    .sort((a, b) => (b.match.createdAt || 0) - (a.match.createdAt || 0));
}

/* --------------------------------------------------------- a hora e o relógio */

/** A hora real de um evento: a do aparelho se a tiver, senão a que houver. */
export function horaDe(ev) {
  const h = Number(ev?.metadata?.hora);
  return Number.isFinite(h) && h > 0 ? h : ev?.createdAt ?? null;
}

/**
 * Os pontos em que o relógio do jogo dos Tempos mudou de andamento: cada um
 * diz a hora real, a parte, o minuto do jogo e da parte nesse instante, e se
 * o relógio fica a correr a seguir. Segue as mesmas regras do reducer.
 *
 * @param {Array} eventos  `state.events` do jogo dos Tempos (já sem desfeitos)
 */
export function linhaDoTempo(eventos) {
  const pontos = [];
  let periodo = 0;
  let pausa = false; // intervalo entre partes
  let corre = false;
  let penaltis = false;
  const ponto = (ev, campos) => {
    const hora = horaDe(ev);
    if (hora == null) return;
    pontos.push({ hora, periodo, ...campos });
  };

  for (const ev of porOrdem(eventos)) {
    const md = ev.metadata || {};
    const matchMs = Number(ev.matchElapsedMs) || 0;
    const periodMs = Number(ev.periodElapsedMs) || 0;
    switch (ev.eventType) {
      case EVENT.FIRST_HALF_STARTED:
        periodo = 1;
        pausa = false;
        corre = true;
        ponto(ev, { matchMs: 0, periodMs: 0, corre });
        break;
      case EVENT.CLOCK_PAUSED:
        if (periodo === 0 || pausa) break;
        corre = false;
        ponto(ev, { matchMs, periodMs, corre });
        break;
      case EVENT.CLOCK_RESUMED:
        if (periodo === 0 || pausa) break;
        corre = true;
        ponto(ev, { matchMs, periodMs, corre });
        break;
      case EVENT.CLOCK_ADJUSTED: {
        if (periodo === 0 || pausa) break;
        const pedido = Number(md.deltaMs) || 0;
        const delta = Math.max(pedido, -Math.min(matchMs, periodMs));
        ponto(ev, { matchMs: matchMs + delta, periodMs: periodMs + delta, corre });
        break;
      }
      case EVENT.FIRST_HALF_FINISHED:
        if (periodo !== 1 || pausa) break;
        pausa = true;
        corre = false;
        ponto(ev, { matchMs, periodMs, corre });
        break;
      case EVENT.SECOND_HALF_STARTED:
        periodo = 2;
        pausa = false;
        corre = true;
        ponto(ev, { matchMs, periodMs: 0, corre });
        break;
      case EVENT.PERIOD_FINISHED:
        if (periodo < 2 || pausa) break;
        pausa = true;
        corre = false;
        if (md.seguinte === 'PENALTIS' || periodo >= 4) penaltis = true;
        ponto(ev, { matchMs, periodMs, corre });
        break;
      case EVENT.EXTRA_TIME_STARTED:
        if (!pausa || penaltis || periodo < 2 || periodo >= 4) break;
        periodo += 1;
        pausa = false;
        corre = true;
        ponto(ev, { matchMs, periodMs: 0, corre });
        break;
      case EVENT.MATCH_FINISHED:
        if (periodo === 0) break;
        corre = false;
        // Terminado numa pausa, o fim é o da parte que já tinha fechado.
        if (pausa && pontos.length) {
          const ultimo = pontos[pontos.length - 1];
          ponto(ev, { matchMs: ultimo.matchMs, periodMs: ultimo.periodMs, corre, fim: true });
        } else {
          ponto(ev, { matchMs, periodMs, corre, fim: true });
        }
        break;
      default:
        break;
    }
  }
  return pontos;
}

/**
 * Em que parte e minuto do jogo dos Tempos caiu uma hora real.
 *
 * Antes do apito inicial vale o minuto 0 da 1.ª parte; numa paragem, o minuto
 * em que o relógio parou; no intervalo, o fim da parte que acabou; depois do
 * fim, o fim. Devolve null se o jogo dos Tempos não tiver relógio nenhum.
 */
export function posicaoNoRelogio(pontos, hora) {
  if (!pontos?.length) return null;
  const fim = pontos.find((p) => p.fim) || null;
  let atual = null;
  for (const p of pontos) {
    if (p.hora <= hora) atual = p;
    else break;
  }
  let pos;
  if (!atual || hora == null) {
    const primeiro = pontos[0];
    pos = { period: primeiro.periodo || 1, matchElapsedMs: primeiro.matchMs, periodElapsedMs: primeiro.periodMs };
  } else {
    const d = atual.corre ? Math.max(0, hora - atual.hora) : 0;
    pos = {
      period: atual.periodo || 1,
      matchElapsedMs: atual.matchMs + d,
      periodElapsedMs: atual.periodMs + d,
    };
  }
  // Um fim num minuto escolhido à mão fica antes da hora em que se carregou
  // no botão: nada pode cair depois dele.
  if (fim && pos.matchElapsedMs > fim.matchMs) {
    const excesso = pos.matchElapsedMs - fim.matchMs;
    pos = {
      period: fim.periodo || pos.period,
      matchElapsedMs: fim.matchMs,
      periodElapsedMs: pos.period === fim.periodo ? Math.max(0, pos.periodElapsedMs - excesso) : fim.periodMs,
    };
  }
  return {
    period: pos.period,
    matchElapsedMs: Math.round(pos.matchElapsedMs),
    periodElapsedMs: Math.round(pos.periodElapsedMs),
  };
}

/* ------------------------------------------------------------- a fusão */

/** Quatro inteiros de 32 bits a partir de um texto (cyrb128). */
function cyrb128(texto) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < texto.length; i += 1) {
    const k = texto.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * O id do registo copiado: sempre o mesmo para o mesmo registo de origem, o
 * mesmo jogo base e a mesma fusão. É o que faz de uma fusão repetida (dois
 * toques, dois aparelhos ao mesmo tempo, uma falha a meio) uma operação sem
 * efeito: o `client_event_id` é único, aqui e no servidor.
 */
export function idDeFusao(origemId, baseId, n) {
  const hex = cyrb128(`fusao|${baseId}|${origemId}|${n}`)
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('')
    .split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** A equipa de um golo que este registo pode ter dado. */
function equipaDoGolo(r) {
  return r.equipa === 'THEM' ? 'THEM' : 'US';
}

/**
 * O que a fusão vai fazer, sem tocar em nada: os eventos a acrescentar ao jogo
 * base (o dos Tempos) e os números para mostrar antes de confirmar.
 *
 * - Só os registos passam (com as correções já aplicadas). Golos, cartões,
 *   substituições e relógio do jogo dos Registos, se os houvesse, ficam lá.
 * - Cada registo fica na parte e no minuto do relógio dos Tempos em que a sua
 *   hora real caiu.
 * - Um remate, penálti ou livre com GOLO é ligado ao golo dos Tempos da mesma
 *   equipa mais próximo (e do mesmo marcador, quando os dois o dizem), dentro
 *   de `JANELA_GOLO_MS`. Sem par, fica contado como remate e não mexe no
 *   resultado: quem manda no resultado é o jogo dos Tempos.
 * - Registos de quem não está na convocatória do jogo base passam na mesma
 *   (contam nos totais da equipa), e vêm listados em `foraDaConvocatoria`.
 *
 * @param {object} o
 * @param {object} o.base   { match, state } do jogo dos Tempos
 * @param {object} o.outro  { match, squad, state } do jogo dos Registos
 * @param {number} o.n      o número desta fusão (1 na primeira)
 */
export function planoDeFusao({ base, outro, n = 1 }) {
  const pontos = linhaDoTempo(base.state?.events || []);
  const origem = new Map((outro.state?.events || []).map((e) => [e.id, e]));
  const registosDaBase = registosDoJogo(base.state);
  const golosUsados = new Set(registosDaBase.map((r) => r.goloEventId).filter(Boolean));
  const golos = base.state?.goals || [];
  const nomes = new Map(
    (outro.squad || []).map((s) => [
      s.playerId,
      { playerId: s.playerId, name: s.playerNameSnapshot, number: s.shirtNumberSnapshot },
    ])
  );

  const eventos = [];
  const porRegisto = {};
  const fora = new Map();
  let golosLigados = 0;
  let golosSemPar = 0;
  let semHora = 0;
  let ignorados = 0;

  for (const r of registosDoJogo(outro.state)) {
    const ev = origem.get(r.eventId);
    const hora = ev ? horaDe(ev) : null;
    if (hora == null) semHora += 1;
    const pos = posicaoNoRelogio(pontos, hora) || { period: 1, matchElapsedMs: 0, periodElapsedMs: 0 };
    const def = CATALOGO[r.registo];

    let goloEventId = null;
    if (levaGolo(r.registo) && r.resultado === RESULTADO_REMATE.GOLO) {
      const equipa = equipaDoGolo(r);
      const par = golos
        .filter(
          (g) =>
            g.team === equipa &&
            !golosUsados.has(g.eventId) &&
            Math.abs((g.matchElapsedMs || 0) - pos.matchElapsedMs) <= JANELA_GOLO_MS &&
            (!r.playerId || !g.scorerId || g.scorerId === r.playerId)
        )
        .sort(
          (a, b) =>
            Math.abs((a.matchElapsedMs || 0) - pos.matchElapsedMs) -
            Math.abs((b.matchElapsedMs || 0) - pos.matchElapsedMs)
        )[0];
      if (par) {
        goloEventId = par.eventId;
        golosUsados.add(par.eventId);
        golosLigados += 1;
      } else {
        golosSemPar += 1;
      }
    }

    let novo;
    try {
      novo = registar(
        base.state,
        {
          registo: r.registo,
          playerId: r.playerId,
          equipa: r.equipa,
          resultado: r.resultado,
          x: r.x,
          y: r.y,
          goloEventId,
          matchElapsedMs: pos.matchElapsedMs,
          period: pos.period,
        },
        hora ?? Date.now()
      );
    } catch {
      // Um registo que esta versão não sabe escrever fica no jogo de origem.
      ignorados += 1;
      continue;
    }

    const id = idDeFusao(r.eventId, base.match.id, n);
    eventos.push({
      ...novo,
      id,
      clientEventId: id,
      matchId: base.match.id,
      period: pos.period,
      matchElapsedMs: pos.matchElapsedMs,
      periodElapsedMs: pos.periodElapsedMs,
      metadata: {
        ...novo.metadata,
        ...(hora != null ? { hora } : {}),
        fusao: { de: outro.match.id, origem: r.eventId, n },
      },
    });
    porRegisto[r.registo] = (porRegisto[r.registo] || 0) + 1;

    if (r.playerId && (def?.por === 'jogador' || def?.jogadorOpcional) && !base.state?.players?.[r.playerId]) {
      const j = fora.get(r.playerId) || {
        ...(nomes.get(r.playerId) || { playerId: r.playerId, name: null, number: null }),
        registos: 0,
      };
      j.registos += 1;
      fora.set(r.playerId, j);
    }
  }

  return {
    eventos,
    total: eventos.length,
    porRegisto,
    golosLigados,
    golosSemPar,
    semHora,
    ignorados,
    foraDaConvocatoria: [...fora.values()].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    // O jogo dos Tempos pode já ter registos (os livres de 10 m, ou alguns
    // acrescentados a frio): ficam, ao lado dos que chegam.
    registosNaBase: registosDaBase.length,
  };
}

/** Os registos que uma fusão copiou para o jogo base (para a desfazer). */
export function eventosDaFusao(events, n) {
  return (events || []).filter(
    (e) =>
      e.eventType === EVENT.STAT_RECORDED &&
      !e.undoneAt &&
      e.metadata?.fusao &&
      Number(e.metadata.fusao.n) === Number(n)
  );
}

/** O que o jogo dos Tempos tem, para o resumo antes de juntar. */
export function resumoDosTempos(state) {
  const players = Object.values(state?.players || {});
  return {
    resultado: { nos: state?.teamScore ?? 0, eles: state?.opponentScore ?? 0 },
    partes: state?.currentPeriod || 0,
    duracaoMs: state?.elapsedMatchMs || 0,
    substituicoes: (state?.substitutions || []).length,
    golos: (state?.goals || []).length,
    cartoes: (state?.cards || []).length,
    convocados: players.length,
  };
}
