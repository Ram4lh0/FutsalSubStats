// domain/visaoGeral.js — a visão geral do clube: todos os escalões de uma vez.
//
// Nasceu de um coordenador: "o presidente pergunta os resultados e eu faço um
// print dessa janela e envio". A pergunta é sempre a mesma — como correu o fim
// de semana ao clube inteiro — e até aqui a resposta obrigava a abrir os
// escalões um a um.
//
// A unidade é a semana (segunda a domingo), porque é assim que os jogos de
// formação acontecem: um sábado e um domingo, com todos os escalões em campo.
// "Época" junta tudo, para quem quer comparar escalões a prazo.
//
// Tudo aqui é puro: recebe os escalões com os seus `{match, state}` já
// reconstruídos e devolve números. O ecrã só desenha.

import { MATCH_STATUS } from './constants.js';
import { matchResult } from './stats.js';

const DIA = 24 * 60 * 60 * 1000;

/** Segunda-feira, 00:00 (hora local), da semana em que cai `ts`. */
export function inicioDaSemana(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // getDay(): domingo é 0. A semana do futsal começa à segunda.
  const recuo = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - recuo);
  return d.getTime();
}

/** A semana de `ts`, como intervalo [inicio, fim[. */
export function semanaDe(ts) {
  const inicio = inicioDaSemana(ts);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  return { inicio, fim: fim.getTime() };
}

/** A semana `n` semanas antes (negativo) ou depois (positivo). */
export function andarSemanas(semana, n) {
  const meio = semana.inicio + 3.5 * DIA;
  const d = new Date(meio);
  d.setDate(d.getDate() + n * 7);
  return semanaDe(d.getTime());
}

const quando = (entrada) => new Date(entrada.match.scheduledAt || 0).getTime();

/**
 * A semana que se mostra ao abrir.
 *
 * A desta semana, se já tem algum jogo começado ou terminado: é o fim de
 * semana que se está a viver. Senão, a do último jogo que já se jogou — numa
 * terça-feira o que interessa ainda é o fim de semana que passou, e uma semana
 * só com jogos marcados não tem resultados para mostrar.
 */
export function semanaPorOmissao(escaloes, agora = Date.now()) {
  const atual = semanaDe(agora);
  const jogados = escaloes
    .flatMap((e) => e.entries)
    .filter((x) => x.state.status !== MATCH_STATUS.DRAFT && x.state.status !== MATCH_STATUS.READY);
  if (jogados.some((x) => quando(x) >= atual.inicio && quando(x) < atual.fim)) return atual;
  const passados = jogados.filter((x) => quando(x) < atual.fim).map(quando);
  return passados.length ? semanaDe(Math.max(...passados)) : atual;
}

function vazio() {
  return { jogos: 0, terminados: 0, vitorias: 0, empates: 0, derrotas: 0, marcados: 0, sofridos: 0, aDecorrer: 0, agendados: 0 };
}

function somar(total, entrada) {
  const { status, teamScore = 0, opponentScore = 0 } = entrada.state;
  total.jogos += 1;
  if (status === MATCH_STATUS.DRAFT || status === MATCH_STATUS.READY) {
    total.agendados += 1;
    return total;
  }
  // Um jogo a decorrer conta para os golos (o presidente quer saber como vai)
  // mas não para vitórias e derrotas, que ainda não existem.
  total.marcados += teamScore;
  total.sofridos += opponentScore;
  if (status !== MATCH_STATUS.FINISHED) {
    total.aDecorrer += 1;
    return total;
  }
  total.terminados += 1;
  const r = matchResult(entrada.state);
  if (r === 'W') total.vitorias += 1;
  else if (r === 'L') total.derrotas += 1;
  else total.empates += 1;
  return total;
}

/**
 * O resumo do clube num período.
 *
 * @param {{team: object, entries: {match: object, state: object}[]}[]} escaloes
 *   pela ordem em que devem aparecer.
 * @param {{inicio: number, fim: number} | null} periodo  null = época toda.
 * @returns {{
 *   escaloes: {team: object, jogos: object[], totais: object}[],
 *   totais: object,
 * }} cada escalão com os seus jogos do período (por data) e as contas; e as
 *   contas do clube inteiro.
 */
export function resumoDoClube(escaloes, periodo = null) {
  const dentro = (x) => !periodo || (quando(x) >= periodo.inicio && quando(x) < periodo.fim);
  const totais = vazio();
  const linhas = escaloes.map(({ team, entries }) => {
    const jogos = entries.filter(dentro).sort((a, b) => quando(a) - quando(b));
    const contas = jogos.reduce(somar, vazio());
    for (const chave of Object.keys(totais)) totais[chave] += contas[chave];
    return { team, jogos, totais: contas };
  });
  return { escaloes: linhas, totais };
}

/** As métricas que se podem comparar entre escalões, e como se calcula cada uma. */
export const METRICAS = {
  marcados: (t) => t.marcados,
  sofridos: (t) => t.sofridos,
  vitorias: (t) => t.vitorias,
  diferenca: (t) => t.marcados - t.sofridos,
  mediaSofridos: (t) => {
    const n = t.terminados + t.aDecorrer;
    return n ? t.sofridos / n : 0;
  },
};

/**
 * Os escalões que jogaram, ordenados por uma métrica (maior primeiro), para
 * as barras de comparação. Quem não jogou fica de fora: um zero de quem não
 * entrou em campo lia-se como um mau resultado.
 */
export function compararEscaloes(resumo, metrica) {
  const valor = METRICAS[metrica] || METRICAS.marcados;
  return resumo.escaloes
    .filter((e) => e.totais.terminados + e.totais.aDecorrer > 0)
    .map((e) => ({ team: e.team, totais: e.totais, valor: valor(e.totais) }))
    .sort((a, b) => b.valor - a.valor);
}
