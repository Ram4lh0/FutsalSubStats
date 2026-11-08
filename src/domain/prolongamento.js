// domain/prolongamento.js — prolongamento e desempate por penáltis (07/11/2026).
//
// Pedido de um treinador (Minerva): taças e eliminatórias não acabam empatadas.
// As regras, das Leis do Jogo de Futsal (FIFA), que é o que isto segue:
//
// PROLONGAMENTO
// - Duas partes iguais de 5 minutos, com troca de campo e uma pausa curta entre
//   elas (não há intervalo longo). Os golos contam para o resultado, como na
//   parte normal — o resultado final é "a.p." (após prolongamento).
// - As faltas acumuladas da 2.ª parte CONTINUAM a contar no prolongamento (não
//   voltam a zero). Por isso a 6.ª falta pode chegar logo no 1.º minuto.
// - Uma sanção de 2 minutos a correr no fim da 2.ª parte continua no
//   prolongamento (conta em tempo de jogo, e o relógio pára entre partes).
//
// PENÁLTIS (pontapés da marca de grande penalidade)
// - Não contam para o resultado: o jogo fica empatado (ex.: 3–3) e o vencedor
//   sai dos penáltis ("4–2 g.p.").
// - Cinco para cada lado, alternados. Se, antes dos cinco, uma equipa já não
//   puder ser apanhada (mesmo marcando todos os que lhe faltam), acaba aí.
// - Empatados depois dos cinco: morte súbita, aos pares, até uma marcar e a
//   outra falhar com o mesmo número de penáltis.
// - No futsal podem bater todos os inscritos que não tenham sido expulsos
//   (jogadores em campo e suplentes). Ninguém bate o segundo antes de todos os
//   elegíveis terem batido o primeiro — daí a ordem dar a volta à lista.
// - Qualquer jogador elegível pode trocar com o guarda-redes.
//
// No modelo do jogo, o prolongamento são os períodos 3 e 4 — o relógio do jogo
// continua (40:00 → 45:00 → 50:00) e os tempos em campo contam como sempre. Os
// penáltis não têm relógio: são uma fase do jogo, guardada em `state.penaltis`.

import { MATCH_STATUS } from './constants.js';

/** Períodos: 1 e 2 são as partes; 3 e 4 o prolongamento. */
export const PERIODO = { PRIMEIRA: 1, SEGUNDA: 2, PROL1: 3, PROL2: 4 };

export const ehProlongamento = (period) => period === 3 || period === 4;

/** Minuto do jogo (ms) em que um período começou. */
export function inicioDoPeriodo(state, period) {
  if (!period || period <= 1) return 0;
  const v = state?.periodStarts?.[period];
  if (v != null) return v;
  if (period === 2) return state?.firstHalfMs || 0;
  return 0;
}

/** Tempo dentro da parte, a partir de um minuto do jogo. */
export function msNoPeriodo(state, period, ms) {
  return Math.max(0, (ms || 0) - inicioDoPeriodo(state, period));
}

/** A parte a que pertence um minuto do jogo (para registos a frio). */
export function periodoDoMinuto(state, ms) {
  let periodo = 1;
  for (const p of [2, 3, 4]) {
    const inicio = state?.periodStarts?.[p] ?? (p === 2 ? state?.firstHalfMs : null);
    if (inicio != null && ms >= inicio) periodo = p;
  }
  return periodo;
}

/** Houve prolongamento neste jogo? */
export function teveProlongamento(state) {
  return Boolean(state?.periodStarts?.[3] != null);
}

/** Houve (ou está a haver) desempate por penáltis? */
export function tevePenaltis(state) {
  return Boolean(state?.penaltis);
}

/**
 * Em que fase está o jogo, para o ecrã ao vivo escolher o que desenha.
 * PREP · PRIMEIRA · INTERVALO · SEGUNDA · PAUSA_PROL (antes da 1.ª parte do
 * prolongamento) · PROL1 · PAUSA_PROL2 · PROL2 · PENALTIS · FIM
 */
export function faseDoJogo(state) {
  if (!state) return 'PREP';
  if (state.status === MATCH_STATUS.FINISHED) return 'FIM';
  if (state.status === MATCH_STATUS.DRAFT || state.status === MATCH_STATUS.READY) return 'PREP';
  if (state.penaltis) return 'PENALTIS';
  const p = state.currentPeriod;
  if (state.status === MATCH_STATUS.HALFTIME) {
    if (p <= 1) return 'INTERVALO';
    if (p === 2) return 'PAUSA_PROL';
    return 'PAUSA_PROL2';
  }
  if (p === 1) return 'PRIMEIRA';
  if (p === 2) return 'SEGUNDA';
  if (p === 3) return 'PROL1';
  return 'PROL2';
}

/** Uma das pausas do prolongamento (não o intervalo da 1.ª para a 2.ª). */
export function emPausaDoProlongamento(state) {
  const f = faseDoJogo(state);
  return f === 'PAUSA_PROL' || f === 'PAUSA_PROL2';
}

/* ------------------------------------------------------------- penáltis */

/**
 * Zonas da baliza, vistas de quem remata (de frente para a baliza):
 * A/M/B = alto/meio/baixo, E/C/D = esquerda/centro/direita. Tanto a bola como
 * o mergulho do guarda-redes usam estas zonas e este ponto de vista — assim
 * "bola em BE, GR atirou-se para BD" lê-se sem pensar de que lado está quem.
 */
export const ZONAS_BALIZA = ['AE', 'AC', 'AD', 'ME', 'MC', 'MD', 'BE', 'BC', 'BD'];
/** Bola fora da baliza (ao lado, por cima ou ao poste). */
export const ZONA_FORA = 'FORA';

export const RESULTADO_PENALTI = { GOLO: 'GOLO', DEFENDIDO: 'DEFENDIDO', FORA: 'FORA' };

export const PENALTIS_POR_EQUIPA = 5;

/** Estado inicial dos penáltis, quando o jogo lá chega. */
export function penaltisVazios() {
  return { ordem: [], primeiro: null, kicks: [], iniciados: false };
}

/**
 * Tudo o que o ecrã dos penáltis e o resumo precisam de saber.
 * @param {object} pen  state.penaltis
 * @returns {{
 *   nos:number, eles:number, batidosNos:number, batidosEles:number,
 *   decidido:boolean, vencedor:'US'|'THEM'|null, morteSubita:boolean,
 *   proximaEquipa:'US'|'THEM'|null, proximoMarcador:string|null,
 *   seqNos:array, seqEles:array }}
 */
export function resumoPenaltis(pen) {
  const kicks = pen?.kicks || [];
  const nossos = kicks.filter((k) => k.team === 'US');
  const deles = kicks.filter((k) => k.team === 'THEM');
  const nos = nossos.filter((k) => k.resultado === RESULTADO_PENALTI.GOLO).length;
  const eles = deles.filter((k) => k.resultado === RESULTADO_PENALTI.GOLO).length;
  const kN = nossos.length;
  const kE = deles.length;

  let decidido = false;
  if (kN <= PENALTIS_POR_EQUIPA && kE <= PENALTIS_POR_EQUIPA) {
    const faltamN = PENALTIS_POR_EQUIPA - kN;
    const faltamE = PENALTIS_POR_EQUIPA - kE;
    if (nos > eles + faltamE || eles > nos + faltamN) decidido = true;
  }
  if (!decidido && kN >= PENALTIS_POR_EQUIPA && kE >= PENALTIS_POR_EQUIPA && kN === kE && nos !== eles) {
    decidido = true;
  }
  const vencedor = decidido ? (nos > eles ? 'US' : 'THEM') : null;

  // Alternados a partir de quem começou: com o mesmo número batido, bate quem
  // começou; senão, a outra equipa.
  const primeiro = pen?.primeiro || 'US';
  const segundo = primeiro === 'US' ? 'THEM' : 'US';
  const batidos = (team) => (team === 'US' ? kN : kE);
  const proximaEquipa = decidido
    ? null
    : batidos(primeiro) <= batidos(segundo)
      ? primeiro
      : segundo;

  // A ordem dá a volta: ninguém repete antes de todos terem batido.
  const ordem = (pen?.ordem || []).filter(Boolean);
  const proximoMarcador = ordem.length ? ordem[kN % ordem.length] : null;

  return {
    nos,
    eles,
    batidosNos: kN,
    batidosEles: kE,
    decidido,
    vencedor,
    morteSubita: kN > PENALTIS_POR_EQUIPA || kE > PENALTIS_POR_EQUIPA ||
      (kN === PENALTIS_POR_EQUIPA && kE === PENALTIS_POR_EQUIPA && !decidido),
    proximaEquipa,
    proximoMarcador,
    seqNos: nossos,
    seqEles: deles,
  };
}

/** O guarda-redes para o próximo penálti deles: o do anterior, senão o último em campo. */
export function guardaRedesDosPenaltis(state) {
  const deles = (state?.penaltis?.kicks || []).filter((k) => k.team === 'THEM' && k.goalkeeperId);
  if (deles.length) return deles[deles.length - 1].goalkeeperId;
  return state?.lastFirstHalfCourt?.GOALKEEPER || null;
}

/**
 * Quem pode bater: todos os convocados que não foram expulsos. A ordem
 * sugerida começa por quem acabou em campo (sem o guarda-redes), depois o
 * banco por número, e o guarda-redes no fim.
 */
export function elegiveisPenaltis(state) {
  const ultimos = Object.values(state?.lastFirstHalfCourt || {}).filter(Boolean);
  const gr = state?.lastFirstHalfCourt?.GOALKEEPER || null;
  return Object.values(state?.players || {})
    .filter((p) => p.status !== 'EXPELLED' && p.status !== 'UNAVAILABLE')
    .sort((a, b) => {
      const rank = (p) => (p.playerId === gr ? 2 : ultimos.includes(p.playerId) ? 0 : 1);
      return rank(a) - rank(b) || Number(a.number) - Number(b.number);
    });
}

/**
 * Texto curto do resultado: "3–3 a.p." / "3–3 (4–2 g.p.)". Devolve as partes,
 * para cada ecrã juntar com a sua tradução.
 */
export function marcadorDoDesempate(state) {
  if (!state) return null;
  const pen = state.penaltis ? resumoPenaltis(state.penaltis) : null;
  return {
    aposProlongamento: teveProlongamento(state),
    penaltis: pen && (pen.batidosNos || pen.batidosEles) ? { nos: pen.nos, eles: pen.eles, vencedor: pen.vencedor } : null,
  };
}
