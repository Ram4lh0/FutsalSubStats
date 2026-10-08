// domain/intervalo.js — os números que o ecrã do intervalo desenha.
//
// Separado do componente pela razão de sempre: são contas sobre o estado do
// jogo, e assim testam-se sem browser. O intervalo dura dez minutos e o
// treinador olha para isto de pé, no balneário — cada função devolve já a forma
// que o gráfico quer, sem nada para decidir do lado de quem desenha.

import { goalTypesFor } from './constants.js';

/**
 * Média de tempo em campo de todos os convocados, contando com quem ainda não
 * jogou. É de propósito: a pergunta do intervalo é «quem está abaixo do que lhe
 * cabia?», e quem tem zero minutos é precisamente quem mais conta para ela.
 */
export function mediaEmCampo(linhas) {
  if (!linhas.length) return 0;
  return linhas.reduce((a, l) => a + (l.courtMs || 0), 0) / linhas.length;
}

/**
 * Quem fez faltas, da mais para a menos. Quem não fez nenhuma fica de fora: no
 * intervalo procura-se quem está carregado, não a lista toda outra vez.
 * `emRisco` marca quem já viu amarelo — no futsal não há limite de faltas por
 * jogador, o que pesa é o cartão.
 */
export function faltasPorJogador(linhas) {
  return linhas
    .filter((l) => (l.fouls || 0) > 0)
    .map((l) => ({
      playerId: l.playerId,
      number: l.number,
      name: l.name,
      fouls: l.fouls,
      emRisco: (l.yellows || 0) > 0 && !(l.reds > 0),
    }))
    .sort((a, b) => b.fouls - a.fouls || Number(b.emRisco) - Number(a.emRisco));
}

/**
 * Os amarelos do adversário agrupados por número de camisola.
 *
 * Primeiro quem está «à bica» (um amarelo, ainda em campo), por ordem do
 * número; depois os expulsos por segundo amarelo, que já não contam para a 2.ª
 * parte mas convém lembrar que a equipa jogou com menos.
 */
export function amarelosAdversario(state) {
  const porNumero = new Map();
  for (const c of state.opponentCards || []) {
    const atual = porNumero.get(c.number) || { number: c.number, amarelosMs: [], expulso: false };
    atual.amarelosMs.push(c.matchElapsedMs ?? 0);
    if (c.secondYellow) atual.expulso = true;
    porNumero.set(c.number, atual);
  }
  const lista = [...porNumero.values()];
  const porCamisola = (a, b) => Number(a.number) - Number(b.number) || String(a.number).localeCompare(String(b.number));
  return [
    ...lista.filter((x) => !x.expulso).sort(porCamisola),
    ...lista.filter((x) => x.expulso).sort(porCamisola),
  ];
}

/**
 * Golos de um só jogo por tipo, na forma que o `Pizza` quer. Golos sem tipo
 * apontado não entram — tal como no painel da época (`golosPorTipo`).
 */
export function golosPorTipoNoJogo(state, team = 'US') {
  const tipos = goalTypesFor(team);
  const contagem = Object.fromEntries(tipos.map((tipo) => [tipo, 0]));
  for (const g of state.goals || []) {
    if (g.team === team && g.howScored && g.howScored in contagem) contagem[g.howScored] += 1;
  }
  return tipos.map((tipo) => ({ chave: tipo, valor: contagem[tipo] }));
}
