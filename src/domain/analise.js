// domain/analise.js — o relatório pós-jogo e a análise da época (add-ons
// 'relatorio-pos-jogo', 'analise-indicadores' e 'analise-posicoes', pedidos a
// 19/11/2026 pelos Leões de Porto Salvo).
//
// Só contas: recebe o estado de um jogo (ou as `entries` `{ match, state }`
// do painel) e devolve números prontos a desenhar. Nada vai buscar dados.
//
// ## As regras das contas
//
// - **Um jogo só entra numa conta se tiver esses dados.** Um jogo em que
//   ninguém apontou remates não é um jogo com zero remates (é a regra de todo
//   o painel: ver domain/dashboard.js). Assim a eficácia de um jogador não sobe
//   nem desce com jogos em que não se registou nada.
// - **Remates.** São os remates registados. Um golo nosso marcado sem remate
//   registado (pelo botão do golo, quando o escalão pede o resultado do remate)
//   conta também como remate à baliza: um golo é sempre um remate. Os
//   autogolos do adversário não contam (não foi um remate nosso).
// - **Duelos.** O registo `duelo` (ganhou / perdeu) e o `duelo_def` (1x1
//   defensivo) contam ambos. Os duelos ganhos do adversário são os nossos
//   perdidos.
// - **Conversão de oportunidades** de um jogador: golos / (golos +
//   oportunidades falhadas), nos jogos em que se registaram oportunidades.
// - **Por 40'.** Por 40 minutos em campo (um jogo inteiro de futsal). Com
//   menos de um minuto não diz nada (`null`).

import { GOAL_TYPE, MATCH_STATUS, normalizePosition } from './constants.js';
import { playerMatchStats } from './stats.js';
import { A_BALIZA, REGISTO, RESULTADO_DUELO, RESULTADO_REMATE, registosDoJogo } from './registos.js';

export const QUARENTA_MIN = 40 * 60_000;

/** Os registos que contam como duelos. */
export const REGISTOS_DUELO = [REGISTO.DUELO, REGISTO.DUELO_DEF];

/** Os registos de oportunidades (um jogo com algum deles tem "oportunidades"). */
const REGISTOS_OPORTUNIDADE = [REGISTO.OPORTUNIDADE_CRIADA, REGISTO.OPORTUNIDADE_FALHADA];

/** Mínimos para o "melhor" de cada indicador (abaixo disto é sorte, não eficácia). */
export const MINIMOS = { remates: 3, duelos: 3, minutosRecup: 20 * 60_000 };

/** n por 40 minutos em `ms`. `null` com menos de um minuto. */
export function por40(n, ms) {
  return ms >= 60_000 ? (n * QUARENTA_MIN) / ms : null;
}

/** Percentagem inteira, ou `null` sem denominador. */
export function pct(n, total) {
  return total ? Math.round((n / total) * 100) : null;
}

const acabado = (e) => e?.state?.status === MATCH_STATUS.FINISHED;

function terminados(entries) {
  return (entries || [])
    .filter(acabado)
    .slice()
    .sort((a, b) => (a.match?.scheduledAt || 0) - (b.match?.scheduledAt || 0));
}

/**
 * Os últimos `n` jogos terminados (pelo dia do jogo). Sem `n`, devolve as
 * entradas como estão. Os jogos por acabar ficam de fora quando se escolhe
 * "últimos N": a pergunta é sobre jogos jogados.
 */
export function ultimosJogos(entries, n) {
  if (!n) return entries;
  return terminados(entries).slice(-n);
}

/** O golo é um autogolo do adversário (a nosso favor)? Esses não são remates nossos. */
function eAutogoloDeles(g) {
  return g.team === 'US' && (g.ownGoal || g.howScored === GOAL_TYPE.AUTOGOLO);
}

/** O golo sofrido foi um autogolo nosso? Também não é remate deles. */
function eAutogoloNosso(g) {
  return g.team === 'THEM' && (g.ownGoal || g.howScored === GOAL_TYPE.AUTOGOLO);
}

/* ------------------------------------------------------------ um jogo */

/**
 * Os remates de uma equipa num jogo, com os golos sem remate registado.
 * `null` quando o jogo não tem remates dessa equipa registados e o registo
 * não está ligado (`ligado`): aí não há dados, não há zero.
 *
 * `lista`: os registos do jogo, já lidos (para não os ler duas vezes).
 */
export function rematesDaEquipa(state, equipa, { lista = null, ligado = false } = {}) {
  const registos = lista || registosDoJogo(state);
  const id = equipa === 'THEM' ? REGISTO.REMATE_ADV : REGISTO.REMATE;
  const remates = registos.filter((r) => r.registo === id);
  if (!remates.length && !ligado) return null;
  const presos = new Set(remates.map((r) => r.goloEventId).filter(Boolean));
  const golosSoltos = (state.goals || []).filter(
    (g) =>
      g.team === equipa &&
      !presos.has(g.eventId) &&
      !(equipa === 'US' ? eAutogoloDeles(g) : eAutogoloNosso(g))
  );
  const conta = (res) => remates.filter((r) => r.resultado === res).length;
  return {
    total: remates.length + golosSoltos.length,
    aBaliza: remates.filter((r) => A_BALIZA.has(r.resultado)).length + golosSoltos.length,
    fora: conta(RESULTADO_REMATE.FORA),
    bloqueados: conta(RESULTADO_REMATE.BLOQUEADO),
    poste: conta(RESULTADO_REMATE.POSTE),
    golos: conta(RESULTADO_REMATE.GOLO) + golosSoltos.length,
    semResultado: remates.filter((r) => !r.resultado).length,
    // Os golos sem remate, por marcador (para os remates de cada jogador).
    golosSoltos,
  };
}

/** Amarelos e vermelhos de cada equipa, como o árbitro os mostrou. */
function cartoesDoJogo(state) {
  // Nós: como na ficha do jogo (stats.playerCards) — um segundo amarelo é
  // uma expulsão, não dois avisos.
  const nossos = state.cards || [];
  const segundos = new Set(nossos.filter((c) => c.secondYellow).map((c) => c.playerId));
  const amarelosUS = nossos.filter((c) => c.type === 'YELLOW').length - 2 * segundos.size;
  const vermelhosUS = nossos.filter((c) => c.type === 'RED').length + segundos.size;
  // Eles: os amarelos por número; as expulsões vêm do contador do adversário,
  // que já soma os segundos amarelos dados durante o jogo. Os acrescentados a
  // frio não mexem no contador: somam-se aqui.
  const deles = state.opponentCards || [];
  const seg = deles.filter((c) => c.secondYellow);
  const evs = new Map((state.events || []).map((e) => [e.id, e]));
  const aFrio = seg.filter((c) => evs.get(c.eventId)?.metadata?.aPosteriori).length;
  return {
    amarelos: { US: Math.max(0, amarelosUS), THEM: Math.max(0, deles.length - 2 * seg.length) },
    vermelhos: { US: vermelhosUS, THEM: (state.opponentExpulsions || 0) + aFrio },
  };
}

/**
 * A tabela "nós vs adversário" de um jogo: uma linha por número, com o valor
 * de cada lado (`null` = sem dados desse lado). As linhas sem dados de nenhum
 * dos lados não vêm. `sub: true` são as linhas por baixo dos remates.
 *
 * `ligados`: os registos ligados no escalão (um Set, ou nada). Com o registo
 * ligado, zero é zero; sem ele e sem eventos, é "sem dados".
 */
export function espelhoDoJogo(state, { ligados = null } = {}) {
  const lista = registosDoJogo(state);
  const liga = (id) => Boolean(ligados?.has?.(id));
  const tem = (id) => lista.some((r) => r.registo === id);
  const porEquipa = (id) => {
    if (!tem(id) && !liga(id)) return { US: null, THEM: null };
    const doTipo = lista.filter((r) => r.registo === id);
    return {
      US: doTipo.filter((r) => r.equipa === 'US').length,
      THEM: doTipo.filter((r) => r.equipa === 'THEM').length,
    };
  };

  const remUS = rematesDaEquipa(state, 'US', { lista, ligado: liga(REGISTO.REMATE) });
  const remTHEM = rematesDaEquipa(state, 'THEM', { lista, ligado: liga(REGISTO.REMATE_ADV) });
  // À baliza / fora / bloqueados / poste só de um lado em que todos os
  // remates têm o resultado (um escalão que só conta remates não o tem).
  const comDetalhe = (r) => Boolean(r && r.total > 0 && r.semResultado === 0);
  const subRemates = comDetalhe(remUS) || comDetalhe(remTHEM);
  const lado = (r, k) => (r ? r[k] : null);
  const ladoSub = (r, k) => (comDetalhe(r) ? r[k] : null);

  const duelos = lista.filter((r) => REGISTOS_DUELO.includes(r.registo));
  const comDuelos = duelos.length > 0 || REGISTOS_DUELO.some(liga);
  const cartoes = cartoesDoJogo(state);
  const faltas = state.fouls || [];

  const linhas = [
    { id: 'golos', US: state.teamScore ?? 0, THEM: state.opponentScore ?? 0 },
    { id: 'opCriadas', ...porEquipa(REGISTO.OPORTUNIDADE_CRIADA) },
    { id: 'remates', US: lado(remUS, 'total'), THEM: lado(remTHEM, 'total') },
    ...(subRemates
      ? ['aBaliza', 'fora', 'bloqueados', 'poste'].map((k) => ({
          id: k,
          sub: true,
          US: ladoSub(remUS, k),
          THEM: ladoSub(remTHEM, k),
        }))
      : []),
    { id: 'opFalhadas', ...porEquipa(REGISTO.OPORTUNIDADE_FALHADA) },
    {
      id: 'faltas',
      US: faltas.filter((f) => f.team === 'US').length,
      THEM: faltas.filter((f) => f.team === 'THEM').length,
    },
    { id: 'amarelos', ...cartoes.amarelos },
    { id: 'vermelhos', ...cartoes.vermelhos },
    {
      id: 'duelosGanhos',
      US: comDuelos ? duelos.filter((r) => r.resultado === RESULTADO_DUELO.GANHO).length : null,
      THEM: comDuelos ? duelos.filter((r) => r.resultado === RESULTADO_DUELO.PERDIDO).length : null,
    },
  ];
  return linhas.filter((l) => l.US != null || l.THEM != null);
}

/**
 * O desempenho de cada jogador num jogo: G, A, remates, oportunidades
 * criadas, recuperações, perdas, duelos (ganhos / total), oportunidades
 * falhadas, defesas e o tempo em campo. `colunas` diz que números têm dados
 * neste jogo (ou estão ligados), para não mostrar colunas vazias.
 */
export function desempenhoIndividual(state, { ligados = null } = {}) {
  const lista = registosDoJogo(state);
  const liga = (id) => Boolean(ligados?.has?.(id));
  const tem = (ids) => ids.some((id) => liga(id) || lista.some((r) => r.registo === id));
  const remUS = rematesDaEquipa(state, 'US', { lista, ligado: liga(REGISTO.REMATE) });
  const clockMs = state.elapsedMatchMs || 0;
  const opts = { goals: state.goals || [], cards: state.cards || [], fouls: state.fouls || [] };

  const colunas = {
    remates: Boolean(remUS),
    opCriadas: tem([REGISTO.OPORTUNIDADE_CRIADA]),
    recuperacoes: tem([REGISTO.RECUPERACAO]),
    perdas: tem([REGISTO.PERDA_BOLA]),
    duelos: tem(REGISTOS_DUELO),
    opFalhadas: tem([REGISTO.OPORTUNIDADE_FALHADA]),
    defesas: tem([REGISTO.DEFESA_GR]),
  };

  const jogadores = Object.values(state.players || {})
    .map((p) => {
      const s = playerMatchStats(p, clockMs, opts, state.finishedAt || Date.now());
      const meus = lista.filter((r) => r.playerId === p.playerId);
      const n = (id) => meus.filter((r) => r.registo === id).length;
      const meusDuelos = meus.filter((r) => REGISTOS_DUELO.includes(r.registo));
      const remates = remUS
        ? n(REGISTO.REMATE) + remUS.golosSoltos.filter((g) => g.scorerId === p.playerId).length
        : 0;
      return {
        playerId: p.playerId,
        number: p.number,
        name: p.name,
        courtMs: s.courtMs,
        golos: s.goals,
        assistencias: s.assists,
        remates,
        opCriadas: meus.filter((r) => r.registo === REGISTO.OPORTUNIDADE_CRIADA && r.equipa === 'US').length,
        recuperacoes: n(REGISTO.RECUPERACAO),
        perdas: n(REGISTO.PERDA_BOLA),
        duelos: meusDuelos.length,
        duelosGanhos: meusDuelos.filter((r) => r.resultado === RESULTADO_DUELO.GANHO).length,
        opFalhadas: meus.filter((r) => r.registo === REGISTO.OPORTUNIDADE_FALHADA && r.equipa === 'US').length,
        defesas: n(REGISTO.DEFESA_GR),
      };
    })
    .filter(
      (j) =>
        j.courtMs > 0 ||
        j.golos ||
        j.assistencias ||
        j.remates ||
        j.opCriadas ||
        j.recuperacoes ||
        j.perdas ||
        j.duelos ||
        j.opFalhadas ||
        j.defesas
    )
    .sort((a, b) => b.courtMs - a.courtMs || (a.number ?? 0) - (b.number ?? 0));

  return { colunas, jogadores };
}

/* ---------------------------------------------------------- a época */

/**
 * Quanto tempo se jogou: a união dos períodos em campo de todos os jogadores.
 * Num jogo inteiro é o tempo do cronómetro; com o filtro de período do painel
 * (que corta os períodos em campo, ver dashboard.recortarPorPeriodo) é só o
 * tempo dessa janela — o `elapsedMatchMs` não muda com o corte.
 */
export function tempoDeJogo(state) {
  const fim = state.elapsedMatchMs || 0;
  const ints = [];
  for (const p of Object.values(state.players || {})) {
    for (const st of p.stints || []) {
      const a = st.startMatchMs ?? 0;
      const b = st.endMatchMs ?? fim;
      if (b > a) ints.push([a, b]);
    }
  }
  ints.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let ini = null;
  let ate = null;
  for (const [a, b] of ints) {
    if (ini == null || a > ate) {
      if (ini != null) total += ate - ini;
      ini = a;
      ate = b;
    } else if (b > ate) ate = b;
  }
  if (ini != null) total += ate - ini;
  return total;
}

/**
 * Lê os jogos terminados uma vez e devolve, por jogo, o que as contas da
 * época precisam: os registos, os remates nossos (ou null) e se tem duelos,
 * recuperações, oportunidades e defesas.
 */
function lerJogos(entries) {
  return terminados(entries).map((e) => {
    const { state } = e;
    const lista = registosDoJogo(state);
    const tem = (ids) => lista.some((r) => ids.includes(r.registo));
    const clockMs = state.elapsedMatchMs || 0;
    const opts = { goals: state.goals || [], cards: state.cards || [], fouls: state.fouls || [] };
    const stats = new Map(
      Object.values(state.players || {}).map((p) => [
        p.playerId,
        playerMatchStats(p, clockMs, opts, state.finishedAt || Date.now()),
      ])
    );
    return {
      e,
      lista,
      stats,
      remates: rematesDaEquipa(state, 'US', { lista }),
      comDuelos: tem(REGISTOS_DUELO),
      comRecup: tem([REGISTO.RECUPERACAO]),
      comOport: tem(REGISTOS_OPORTUNIDADE),
      comDefesas: tem([REGISTO.DEFESA_GR]),
      duracaoMs: tempoDeJogo(state),
    };
  });
}

/** Junta por jogador (playerId) as contas de cada jogo. */
function porJogador(jogos, contar) {
  const out = new Map();
  for (const j of jogos) {
    for (const p of Object.values(j.e.state.players || {})) {
      const s = j.stats.get(p.playerId);
      const atual = out.get(p.playerId) || { playerId: p.playerId, number: p.number, name: p.name };
      if (contar(atual, j, p, s) !== false) out.set(p.playerId, atual);
    }
  }
  return [...out.values()];
}

/** O melhor de uma lista: o maior `valor`, desempatado pelo maior `desempate`. */
function melhor(linhas, valor, desempate) {
  let best = null;
  for (const l of linhas) {
    const v = valor(l);
    if (v == null) continue;
    if (!best || v > valor(best) || (v === valor(best) && desempate(l) > desempate(best))) best = l;
  }
  return best;
}

/**
 * Os indicadores da equipa num conjunto de jogos (os do filtro):
 *  - eficácia de finalização: golos / remates (%), e o jogador com a melhor
 *    (com pelo menos `MINIMOS.remates` remates);
 *  - duelos ganhos: ganhos / total (%), e o melhor (pelo menos `MINIMOS.duelos`);
 *  - recuperações: total e média por 40 minutos de jogo, e o jogador com mais
 *    por 40' em campo (pelo menos `MINIMOS.minutosRecup` em campo).
 * Cada um traz `jogos`: em quantos jogos havia esses dados (0 = sem dados).
 */
export function indicadoresDaEquipa(entries) {
  const jogos = lerJogos(entries);

  // Eficácia de finalização
  const comRemates = jogos.filter((j) => j.remates);
  const golos = comRemates.reduce((t, j) => t + j.remates.golos, 0);
  const remates = comRemates.reduce((t, j) => t + j.remates.total, 0);
  const finalizadores = porJogador(comRemates, (a, j, p) => {
    a.golos = (a.golos || 0) + (j.stats.get(p.playerId)?.goals || 0);
    a.remates =
      (a.remates || 0) +
      j.lista.filter((r) => r.registo === REGISTO.REMATE && r.playerId === p.playerId).length +
      j.remates.golosSoltos.filter((g) => g.scorerId === p.playerId).length;
  }).map((l) => ({ ...l, pct: pct(l.golos, l.remates) }));
  const melhorFin = melhor(
    finalizadores.filter((l) => l.remates >= MINIMOS.remates),
    (l) => l.pct,
    (l) => l.golos
  );

  // Duelos
  const comDuelos = jogos.filter((j) => j.comDuelos);
  let duelos = 0;
  let ganhos = 0;
  for (const j of comDuelos) {
    for (const r of j.lista) {
      if (!REGISTOS_DUELO.includes(r.registo)) continue;
      duelos += 1;
      if (r.resultado === RESULTADO_DUELO.GANHO) ganhos += 1;
    }
  }
  const duelistas = porJogador(comDuelos, (a, j, p) => {
    const meus = j.lista.filter((r) => REGISTOS_DUELO.includes(r.registo) && r.playerId === p.playerId);
    a.duelos = (a.duelos || 0) + meus.length;
    a.ganhos = (a.ganhos || 0) + meus.filter((r) => r.resultado === RESULTADO_DUELO.GANHO).length;
  }).map((l) => ({ ...l, pct: pct(l.ganhos, l.duelos) }));
  const melhorDuelo = melhor(
    duelistas.filter((l) => l.duelos >= MINIMOS.duelos),
    (l) => l.pct,
    (l) => l.ganhos
  );

  // Recuperações
  const comRecup = jogos.filter((j) => j.comRecup);
  const recuperacoes = comRecup.reduce(
    (t, j) => t + j.lista.filter((r) => r.registo === REGISTO.RECUPERACAO).length,
    0
  );
  const duracaoMs = comRecup.reduce((t, j) => t + j.duracaoMs, 0);
  const recuperadores = porJogador(comRecup, (a, j, p, s) => {
    a.recuperacoes =
      (a.recuperacoes || 0) +
      j.lista.filter((r) => r.registo === REGISTO.RECUPERACAO && r.playerId === p.playerId).length;
    a.courtMs = (a.courtMs || 0) + (s?.courtMs || 0);
  }).map((l) => ({ ...l, por40: por40(l.recuperacoes, l.courtMs) }));
  const melhorRecup = melhor(
    recuperadores.filter((l) => l.courtMs >= MINIMOS.minutosRecup),
    (l) => l.por40,
    (l) => l.recuperacoes
  );

  return {
    finalizacao: {
      jogos: comRemates.length,
      golos,
      remates,
      pct: pct(golos, remates),
      melhor: melhorFin,
      jogadores: finalizadores.filter((l) => l.remates > 0).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.golos - a.golos),
    },
    duelos: {
      jogos: comDuelos.length,
      ganhos,
      total: duelos,
      pct: pct(ganhos, duelos),
      melhor: melhorDuelo,
      jogadores: duelistas.filter((l) => l.duelos > 0).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.ganhos - a.ganhos),
    },
    recuperacoes: {
      jogos: comRecup.length,
      total: recuperacoes,
      duracaoMs,
      por40: por40(recuperacoes, duracaoMs),
      melhor: melhorRecup,
      jogadores: recuperadores
        .filter((l) => l.recuperacoes > 0 || l.courtMs > 0)
        .sort((a, b) => (b.por40 ?? -1) - (a.por40 ?? -1) || b.recuperacoes - a.recuperacoes),
    },
  };
}

/** O jogador é guarda-redes? Pela posição no plantel, ou por ter jogado à baliza. */
function eGuardaRedes(entries, roster, playerId) {
  const r = (roster || []).find((p) => (p.playerId || p.id) === playerId);
  if (normalizePosition(r?.preferredPosition ?? r?.preferred_position) === 'GOALKEEPER') return true;
  return (entries || []).some(
    ({ state }) => normalizePosition(state?.players?.[playerId]?.preferredPosition) === 'GOALKEEPER'
  );
}

/**
 * Os indicadores de um jogador num conjunto de jogos:
 *  - minutos e jogos (em que entrou);
 *  - eficácia de finalização: golos / remates (%), nos jogos com remates;
 *  - conversão de oportunidades: golos / (golos + oportunidades falhadas) (%),
 *    nos jogos com oportunidades registadas;
 *  - duelos ganhos: ganhos / total (%);
 *  - remates: total e por 40' em campo (nos jogos com remates);
 *  - guarda-redes: defesas, golos sofridos por 40' à baliza e percentagem de
 *    defesas (defesas / (defesas + golos sofridos), nos jogos com defesas).
 */
export function indicadoresDoAtleta(entries, roster, playerId) {
  if (!playerId) return null;
  const jogos = lerJogos(entries).filter((j) => j.e.state.players?.[playerId]);
  const out = {
    guardaRedes: eGuardaRedes(entries, roster, playerId),
    jogos: 0,
    minutosMs: 0,
    golos: 0,
    finalizacao: { jogos: 0, golos: 0, remates: 0, courtMs: 0, pct: null, por40: null },
    conversao: { jogos: 0, golos: 0, falhadas: 0, pct: null },
    duelos: { jogos: 0, ganhos: 0, total: 0, pct: null },
    gr: { defesas: 0, sofridos: 0, sofridosComDefesas: 0, jogosDefesas: 0, sofridos40: null, pctDefesas: null },
  };
  for (const j of jogos) {
    const s = j.stats.get(playerId);
    const courtMs = s?.courtMs || 0;
    const golos = s?.goals || 0;
    const meus = j.lista.filter((r) => r.playerId === playerId);
    if (courtMs > 0 || golos || meus.length) out.jogos += 1;
    out.minutosMs += courtMs;
    out.golos += golos;
    out.gr.sofridos += s?.conceded || 0;

    if (j.remates) {
      const f = out.finalizacao;
      f.jogos += 1;
      f.golos += golos;
      f.remates +=
        meus.filter((r) => r.registo === REGISTO.REMATE).length +
        j.remates.golosSoltos.filter((g) => g.scorerId === playerId).length;
      f.courtMs += courtMs;
    }
    if (j.comOport) {
      out.conversao.jogos += 1;
      out.conversao.golos += golos;
      out.conversao.falhadas += meus.filter(
        (r) => r.registo === REGISTO.OPORTUNIDADE_FALHADA && r.equipa === 'US'
      ).length;
    }
    if (j.comDuelos) {
      const d = meus.filter((r) => REGISTOS_DUELO.includes(r.registo));
      out.duelos.jogos += 1;
      out.duelos.total += d.length;
      out.duelos.ganhos += d.filter((r) => r.resultado === RESULTADO_DUELO.GANHO).length;
    }
    if (j.comDefesas) {
      out.gr.jogosDefesas += 1;
      out.gr.defesas += meus.filter((r) => r.registo === REGISTO.DEFESA_GR).length;
      out.gr.sofridosComDefesas += s?.conceded || 0;
    }
  }
  const f = out.finalizacao;
  f.pct = pct(f.golos, f.remates);
  f.por40 = por40(f.remates, f.courtMs);
  out.conversao.pct = pct(out.conversao.golos, out.conversao.golos + out.conversao.falhadas);
  out.duelos.pct = pct(out.duelos.ganhos, out.duelos.total);
  out.gr.sofridos40 = por40(out.gr.sofridos, out.minutosMs);
  out.gr.pctDefesas = pct(out.gr.defesas, out.gr.defesas + out.gr.sofridosComDefesas);
  return out;
}

/* --------------------------------------------------------- por posição */

/** Os grupos de posição do filtro, pela ordem dos chips. */
export const GRUPOS_POSICAO = ['TODAS', 'GOALKEEPER', 'FIXO', 'ALA', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT', 'UNIVERSAL'];

/** Os pés do filtro. */
export const GRUPOS_PE = ['TODOS', 'LEFT', 'RIGHT', 'BOTH'];

function cabeNaPosicao(pos, grupo) {
  if (!grupo || grupo === 'TODAS') return true;
  if (grupo === 'ALA') return pos === 'LEFT_WINGER' || pos === 'RIGHT_WINGER';
  return pos === grupo;
}

function cabeNoPe(pe, grupo) {
  if (!grupo || grupo === 'TODOS') return true;
  return pe === grupo;
}

/**
 * A tabela por posição: por jogador, a posição e o pé do plantel, os minutos,
 * os golos, os golos por 40', os golos da equipa marcados e sofridos com ele
 * em campo, e a diferença por 40' em campo ((GM − GS) / minutos × 40). Com o
 * total do grupo filtrado (a soma dos minutos e dos golos, e as médias por
 * 40' desse total).
 *
 * `posicao`: um de `GRUPOS_POSICAO` ('ALA' são os dois alas); `pe`: um de
 * `GRUPOS_PE`. Só entram jogadores que jogaram (minutos > 0) nesses jogos.
 */
export function analisePorPosicao(entries, roster = [], { posicao = 'TODAS', pe = 'TODOS' } = {}) {
  const doPlantel = new Map((roster || []).map((r) => [r.playerId || r.id, r]));
  const acc = new Map();
  for (const { state } of terminados(entries)) {
    const clockMs = state.elapsedMatchMs || 0;
    const opts = { goals: state.goals || [], cards: state.cards || [], fouls: state.fouls || [] };
    for (const p of Object.values(state.players || {})) {
      const s = playerMatchStats(p, clockMs, opts, state.finishedAt || Date.now());
      if (!s.courtMs && !s.goals) continue;
      const r = doPlantel.get(p.playerId);
      const a = acc.get(p.playerId) || {
        playerId: p.playerId,
        number: r?.shirtNumber ?? r?.number ?? p.number,
        name: r?.name || p.name,
        posicao: normalizePosition(r?.preferredPosition ?? r?.preferred_position ?? p.preferredPosition),
        pe: r?.strongFoot ?? r?.strong_foot ?? 'UNKNOWN',
        jogos: 0,
        courtMs: 0,
        golos: 0,
        gm: 0,
        gs: 0,
      };
      if (s.courtMs > 0) a.jogos += 1;
      a.courtMs += s.courtMs;
      a.golos += s.goals;
      a.gm += s.goalShare;
      a.gs += s.concededShare;
      acc.set(p.playerId, a);
    }
  }
  const linhas = [...acc.values()]
    .filter((a) => a.courtMs > 0)
    .filter((a) => cabeNaPosicao(a.posicao, posicao) && cabeNoPe(a.pe || 'UNKNOWN', pe))
    .map((a) => ({
      ...a,
      golos40: por40(a.golos, a.courtMs),
      dif: a.gm - a.gs,
      dif40: por40(a.gm - a.gs, a.courtMs),
    }))
    .sort((a, b) => b.courtMs - a.courtMs || (a.number ?? 0) - (b.number ?? 0));
  const soma = (k) => linhas.reduce((t, l) => t + l[k], 0);
  const courtMs = soma('courtMs');
  const total = {
    jogadores: linhas.length,
    courtMs,
    golos: soma('golos'),
    gm: soma('gm'),
    gs: soma('gs'),
  };
  total.golos40 = por40(total.golos, courtMs);
  total.dif40 = por40(total.gm - total.gs, courtMs);
  return { linhas, total };
}
