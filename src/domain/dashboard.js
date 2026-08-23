// domain/dashboard.js — os números que o painel visual desenha.
//
// A aba de estatísticas responde a tudo e não responde a nada de relance: uma
// tabela de catorze colunas obriga a comparar números à mão. Isto é o contrário
// — poucas perguntas, cada uma respondida por uma forma que se lê sem ler.
//
// Nada aqui vai buscar dados. Recebe as mesmas `entries` (`{ match, state }`)
// que o resto da aplicação já tem em mãos, e devolve estruturas prontas a
// desenhar. É por isso que dá para testar sem browser e sem base de dados.
//
// ## Um jogo só conta quando acabou
//
// Um jogo a decorrer tem meia parte de golos e meia hora de minutos por
// contabilizar. Deixá-lo entrar nas médias fazia a equipa parecer pior a cada
// jogo que começasse. Todas as funções daqui olham só para jogos terminados,
// com uma excepção declarada: os minutos por jogador, onde um jogo em curso
// ainda diz alguma coisa sobre quem está a jogar hoje.

import { MATCH_STATUS, normalizePosition, timingOf, timingConfig } from './constants.js';
import { clubAggregate, matchResult, playerMatchStats } from './stats.js';

/** Um jogo terminado. É a unidade de tudo o que se conta aqui. */
const acabado = (e) => e?.state?.status === MATCH_STATUS.FINISHED;

/** Só os terminados, do mais antigo para o mais recente. */
function terminados(entries) {
  return entries
    .filter(acabado)
    .slice()
    .sort((a, b) => (a.match.scheduledAt || 0) - (b.match.scheduledAt || 0));
}

/* ------------------------------------------------------------- filtros */

/**
 * Que tipos de jogo é que este escalão tem.
 *
 * Um escalão pode ter as duas coisas: o campeonato cronometrado, os
 * particulares corridos. Misturá-los num gráfico de faixas de tempo é comparar
 * partes de 20 minutos com partes de 30 — a última faixa de umas nem existe nas
 * outras, e o que sai é uma queda no fim que só quer dizer que metade dos jogos
 * acabou mais cedo.
 *
 * Quando só há um tipo não se pergunta nada a ninguém.
 */
export function tiposDeJogo(entries) {
  const tipos = new Set(terminados(entries).map((e) => timingOf(e.match)));
  return [...tipos];
}

/** As provas que aparecem nestes jogos, para o filtro do topo. */
export function provasComJogos(entries, competitions = []) {
  const ids = new Set(terminados(entries).map((e) => e.match.competitionId).filter(Boolean));
  return competitions.filter((c) => ids.has(c.id));
}

/**
 * Aplica os filtros do painel.
 *
 * `provas` vazio quer dizer todas — e não nenhuma. É a leitura que evita o
 * ecrã em branco de quem desmarcou tudo sem perceber que tinha desmarcado.
 */
export function filtrar(entries, { provas = [], tipo = null } = {}) {
  return entries.filter((e) => {
    if (tipo && timingOf(e.match) !== tipo) return false;
    if (provas.length && !provas.includes(e.match.competitionId)) return false;
    return true;
  });
}

/** A duração da parte destes jogos, para as faixas do gráfico. */
export function parteDosJogos(entries, tipo = null) {
  if (tipo) return timingConfig({ timing: tipo }).periodDurationMs;
  const tipos = tiposDeJogo(entries);
  // Com os dois tipos à mistura, manda o mais longo: assim nenhum golo fica de
  // fora da última faixa.
  return Math.max(...(tipos.length ? tipos : ['UNTIMED']).map(
    (x) => timingConfig({ timing: x }).periodDurationMs
  ));
}

/* ------------------------------------------------------ rotação e minutos */

/**
 * Quanto tempo jogou cada um, e quem está a ficar para trás.
 *
 * ## Porquê a média e não o máximo
 *
 * A comparação óbvia seria contra quem joga mais. Mas o jogador que joga mais é
 * quase sempre um caso à parte — o capitão, o guarda-redes — e medir toda a
 * gente contra ele faz o plantel inteiro parecer esquecido. A média da equipa é
 * a linha honesta: metade fica acima, metade abaixo, e o que interessa é a
 * distância a que estão dela.
 *
 * ## Quem é assinalado
 *
 * Quem tem menos de 60% da média. Não é um número sagrado; é o ponto a partir
 * do qual a diferença deixa de se explicar por uma ou outra substituição e
 * passa a ser um padrão. Abaixo disso, ao fim de uma época, dá uma conversa
 * desagradável com o jogador ou com o pai.
 *
 * Só entram jogadores que foram convocados pelo menos uma vez: um nome que
 * nunca saiu do plantel não está a ser mal tratado, está fora das contas.
 */
export function minutosPorJogador(entries, roster = [], { limiar = 0.6 } = {}) {
  // Aqui entram também os jogos a decorrer: quem está em campo agora conta.
  const agg = clubAggregate(entries, roster);
  const linhas = Object.values(agg.perPlayer)
    .filter((p) => p.matches > 0)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      number: p.number,
      ms: p.courtMs,
      jogos: p.matches,
      mediaMs: p.avgCourtPerMatchMs,
    }))
    .sort((a, b) => b.ms - a.ms || a.number - b.number);

  const total = linhas.reduce((s, l) => s + l.ms, 0);
  const media = linhas.length ? Math.round(total / linhas.length) : 0;
  const maximo = linhas[0]?.ms || 0;

  return {
    linhas: linhas.map((l) => ({ ...l, abaixo: media > 0 && l.ms < media * limiar })),
    media,
    maximo,
    totalMs: total,
  };
}

/* --------------------------------------------------------- painel atleta */

function jogadorDaEntrada(state, playerId) {
  return Object.values(state.players || {}).find((p) => p.playerId === playerId) || null;
}

function jogadorDoPlantel(roster, playerId) {
  const r = roster.find((p) => (p.playerId || p.id) === playerId);
  if (!r) return null;
  return {
    playerId,
    name: r.name,
    number: r.number ?? r.shirtNumber,
    preferredPosition: r.preferredPosition ?? r.preferred_position ?? null,
  };
}

function statsDoJogador(state, playerId) {
  const p = jogadorDaEntrada(state, playerId);
  if (!p) return null;
  return playerMatchStats(p, state.elapsedMatchMs || 0, {
    goals: state.goals || [],
    cards: state.cards || [],
    fouls: state.fouls || [],
  });
}

function vazioFaixas(nFaixas, faixaMs) {
  return Array.from({ length: nFaixas }, (_, i) => ({
    deMs: i * faixaMs,
    ateMs: (i + 1) * faixaMs,
    golos: 0,
    assistencias: 0,
    sofridosBaliza: 0,
  }));
}

/**
 * Os mesmos jogos do painel, mas lidos a partir de um jogador.
 *
 * A vista da equipa responde a "como esta o escalo?". A do jogador responde a
 * outra pergunta: "como esta a ser usado este atleta, e o que acontece quando
 * esta em campo?". Por isso a forma da equipa sai, e entram utilizacao,
 * impacto, ultimos jogos e disciplina individual.
 */
export function painelDoAtleta(
  entries,
  roster = [],
  playerId,
  { quantos = 5, faixaMs = 5 * 60_000, parteMs = 20 * 60_000 } = {}
) {
  if (!playerId) return null;

  const min = minutosPorJogador(entries, roster);
  const linhaMinutos = min.linhas.find((l) => l.playerId === playerId) || null;
  const noPlantel = jogadorDoPlantel(roster, playerId);
  const nosJogos = entries.map((e) => jogadorDaEntrada(e.state, playerId)).find(Boolean) || null;
  const jogador = linhaMinutos
    ? { ...noPlantel, ...nosJogos, ...linhaMinutos }
    : noPlantel || nosJogos || null;
  if (!jogador) return null;
  const guardaRedes =
    normalizePosition(jogador.preferredPosition) === 'GOALKEEPER' ||
    entries.some(({ state }) => {
      const p = jogadorDaEntrada(state, playerId);
      return normalizePosition(p?.preferredPosition) === 'GOALKEEPER';
    });

  const jogosTerminados = terminados(entries);
  const nFaixas = Math.max(1, Math.ceil(parteMs / faixaMs));
  const partes = { 1: vazioFaixas(nFaixas, faixaMs), 2: vazioFaixas(nFaixas, faixaMs) };

  const utilizacao = {
    jogos: jogosTerminados.length,
    convocado: 0,
    utilizado: 0,
    titular: 0,
    banco: 0,
    entradas: 0,
    mediaEntradaMs: 0,
    percentagemUtilizacao: 0,
  };
  const impacto = {
    golos: 0,
    assistencias: 0,
    golosEquipa: 0,
    sofridosEquipa: 0,
    saldo: 0,
    sofridosBaliza: 0,
  };
  const disc = {
    jogos: 0,
    faltas: 0,
    sofridas: 0,
    amarelos: 0,
    vermelhos: 0,
    faltasPorJogo: 0,
    sofridasPorJogo: 0,
  };
  const ultimos = [];

  let tempoEntradaTotal = 0;
  let comDadosPeriodo = false;

  for (const { match, state } of jogosTerminados) {
    const p = jogadorDaEntrada(state, playerId);
    const s = statsDoJogador(state, playerId);
    const convocado = Boolean(p);
    const utilizado = Boolean(s && s.courtMs > 0);
    const titular = Boolean(
      s && s.stints.some((st) => st.startMatchMs === 0 && st.durationMs > 0)
    );

    if (convocado) utilizacao.convocado += 1;
    if (utilizado) utilizacao.utilizado += 1;
    if (titular) utilizacao.titular += 1;
    if (utilizado && !titular) utilizacao.banco += 1;

    if (s) {
      utilizacao.entradas += s.entries;
      tempoEntradaTotal += s.courtMs;
      impacto.golos += s.goals;
      impacto.assistencias += s.assists;
      impacto.golosEquipa += s.goalShare;
      impacto.sofridosEquipa += s.concededShare;
      impacto.sofridosBaliza += s.conceded;
      disc.jogos += 1;
      disc.faltas += s.fouls;
      disc.sofridas += s.foulsSuffered;
      disc.amarelos += s.yellows;
      disc.vermelhos += s.reds;
    }

    const primeira = state.firstHalfMs || 0;
    for (const g of state.goals || []) {
      const marcou = g.scorerId === playerId;
      const assistiu = g.assistId === playerId;
      const sofreuComoGuardaRedes = guardaRedes && g.team === 'THEM' && g.goalkeeperId === playerId;
      if (!marcou && !assistiu && !sofreuComoGuardaRedes) continue;
      const parte = g.period === 2 ? 2 : 1;
      const naParte = parte === 2 ? g.matchElapsedMs - primeira : g.matchElapsedMs;
      const i = Math.min(nFaixas - 1, Math.max(0, Math.floor(naParte / faixaMs)));
      if (marcou) partes[parte][i].golos += 1;
      if (assistiu) partes[parte][i].assistencias += 1;
      if (sofreuComoGuardaRedes) partes[parte][i].sofridosBaliza += 1;
      comDadosPeriodo = true;
    }

    ultimos.push({
      matchId: match.id,
      quando: match.scheduledAt || null,
      adversario: match.opponentShortName || match.opponentName || '—',
      resultado: matchResult(state),
      nossos: state.teamScore,
      deles: state.opponentScore,
      convocado,
      utilizado,
      titular,
      minutosMs: s?.courtMs || 0,
      golos: s?.goals || 0,
      assistencias: s?.assists || 0,
      faltas: s?.fouls || 0,
    });
  }

  utilizacao.mediaEntradaMs = utilizacao.entradas
    ? Math.round(tempoEntradaTotal / utilizacao.entradas)
    : 0;
  utilizacao.percentagemUtilizacao = utilizacao.jogos
    ? Math.round((utilizacao.utilizado / utilizacao.jogos) * 100)
    : 0;
  impacto.saldo = impacto.golosEquipa - impacto.sofridosEquipa;
  disc.faltasPorJogo = disc.jogos ? disc.faltas / disc.jogos : 0;
  disc.sofridasPorJogo = disc.jogos ? disc.sofridas / disc.jogos : 0;

  const comMedia = (f) => ({
    ...f,
    jogos: jogosTerminados.length,
    mediaGolos: jogosTerminados.length ? f.golos / jogosTerminados.length : 0,
    mediaAssistencias: jogosTerminados.length ? f.assistencias / jogosTerminados.length : 0,
    mediaSofridosBaliza: jogosTerminados.length ? f.sofridosBaliza / jogosTerminados.length : 0,
  });

  return {
    jogador,
    guardaRedes,
    minutos: {
      totalMs: linhaMinutos?.ms || 0,
      mediaJogadorMs: linhaMinutos?.mediaMs || 0,
      mediaEquipaMs: min.media,
      diferencaMs: (linhaMinutos?.ms || 0) - min.media,
      abaixo: Boolean(linhaMinutos?.abaixo),
    },
    utilizacao,
    impacto,
    periodos: {
      faixaMs,
      nFaixas,
      jogos: jogosTerminados.length,
      primeira: partes[1].map(comMedia),
      segunda: partes[2].map(comMedia),
      comDados: comDadosPeriodo,
    },
    ultimos: ultimos.slice(-quantos).reverse(),
    disciplina: disc,
  };
}

/* ------------------------------------- quando marcamos e quando sofremos */

/**
 * Golos marcados e sofridos por faixas de tempo dentro de cada parte.
 *
 * ## Porquê dentro da parte e não do jogo
 *
 * Os golos guardam o tempo desde o início do jogo. Somar tudo numa linha só
 * daria faixas que não querem dizer nada: os 25 minutos de um jogo de duas
 * partes de 20 são "cinco minutos da segunda parte", e ninguém pensa assim. A
 * pergunta do treinador é sempre relativa à parte — entramos mal, caímos no
 * fim.
 *
 * O comprimento da primeira parte vem do próprio jogo (`firstHalfMs`), porque
 * varia: prolongamentos, paragens, um árbitro que deixou correr.
 *
 * ## As faixas
 *
 * Cinco minutos. Menos do que isso e cada barra tem zero ou um golo, e o que se
 * vê é ruído; mais e a "queda nos últimos minutos" — que é o que se vem cá
 * procurar — dilui-se dentro de uma barra larga.
 */
export function golosPorFaixa(entries, { faixaMs = 5 * 60_000, parteMs = 20 * 60_000 } = {}) {
  const nFaixas = Math.max(1, Math.ceil(parteMs / faixaMs));
  const vazio = () =>
    Array.from({ length: nFaixas }, (_, i) => ({
      deMs: i * faixaMs,
      ateMs: (i + 1) * faixaMs,
      marcados: 0,
      sofridos: 0,
    }));
  const partes = { 1: vazio(), 2: vazio() };
  let comDados = false;
  const jogos = terminados(entries).length;

  for (const { state } of terminados(entries)) {
    const primeira = state.firstHalfMs || 0;
    for (const g of state.goals || []) {
      const parte = g.period === 2 ? 2 : 1;
      // Do início do jogo para o início da parte.
      const naParte = parte === 2 ? g.matchElapsedMs - primeira : g.matchElapsedMs;
      // Um golo depois do tempo regulamentar cai na última faixa em vez de se
      // perder: aconteceu, e nos descontos é precisamente quando dói mais.
      const i = Math.min(nFaixas - 1, Math.max(0, Math.floor(naParte / faixaMs)));
      partes[parte][i][g.team === 'US' ? 'marcados' : 'sofridos'] += 1;
      comDados = true;
    }
  }

  // A média por jogo é o que torna as faixas comparáveis entre escalões e entre
  // épocas: "sofremos 7 golos dos 15 aos 20" não diz nada sem se saber se foram
  // 7 em 8 jogos ou em 40. Vai calculada daqui, e não no desenho, porque quem
  // desenha não tem de saber quantos jogos foram.
  const comMedia = (faixa) => ({
    ...faixa,
    jogos,
    mediaMarcados: jogos ? faixa.marcados / jogos : 0,
    mediaSofridos: jogos ? faixa.sofridos / jogos : 0,
  });

  return {
    faixaMs,
    nFaixas,
    jogos,
    primeira: partes[1].map(comMedia),
    segunda: partes[2].map(comMedia),
    comDados,
  };
}

/* --------------------------------------------------- forma e resultados */

/**
 * Os últimos jogos, do mais antigo para o mais recente.
 *
 * Por esta ordem de propósito: uma série lê-se da esquerda para a direita como
 * uma frase, e o que interessa numa fita de resultados é a direcção — três
 * derrotas seguidas a terminar em vitória conta uma história diferente do
 * contrário, e com o mais recente à esquerda ninguém a lê bem.
 */
export function formaRecente(entries, { quantos = 8 } = {}) {
  return terminados(entries)
    .slice(-quantos)
    .map(({ match, state }) => ({
      matchId: match.id,
      quando: match.scheduledAt || null,
      adversario: match.opponentShortName || match.opponentName || '—',
      nossos: state.teamScore,
      deles: state.opponentScore,
      resultado: matchResult(state), // 'W' | 'D' | 'L'
      casa: match.homeOrAway !== 'AWAY',
    }));
}

/** Vitórias, empates e derrotas em casa e fora, com os golos de cada lado. */
export function casaEFora(entries) {
  const base = () => ({ jogos: 0, v: 0, e: 0, d: 0, golosA: 0, golosContra: 0 });
  const r = { casa: base(), fora: base() };
  for (const { match, state } of terminados(entries)) {
    const lado = match.homeOrAway === 'AWAY' ? r.fora : r.casa;
    lado.jogos += 1;
    lado.golosA += state.teamScore;
    lado.golosContra += state.opponentScore;
    const res = matchResult(state);
    if (res === 'W') lado.v += 1;
    else if (res === 'D') lado.e += 1;
    else lado.d += 1;
  }
  return r;
}

/**
 * A curva de forma dos últimos jogos: sobe com uma vitória, desce com uma
 * derrota, fica na mesma com um empate.
 *
 * ## Porquê degraus e não a diferença de golos
 *
 * A diferença de golos acumulada tinha um problema: um 6–2 mexia a linha seis
 * vezes mais do que um 1–0, e uma goleada num jogo sem história dominava o
 * desenho de uma época inteira. O que o treinador quer ver aqui não é quanto se
 * ganhou, é **se** se ganhou — e se a equipa vem a subir ou a descer.
 *
 * Um degrau por jogo trata todas as vitórias por igual, que é como a
 * classificação as trata.
 *
 * Começa no zero e é relativo: o número não quer dizer nada sozinho, a
 * inclinação é que diz tudo.
 */
export function curvaDeForma(entries, { quantos = 8 } = {}) {
  let nivel = 0;
  const ultimos = terminados(entries).slice(-quantos);
  const pontos = ultimos.map(({ match, state }, i) => {
    const res = matchResult(state);
    nivel += res === 'W' ? 1 : res === 'L' ? -1 : 0;
    return {
      i,
      matchId: match.id,
      adversario: match.opponentShortName || match.opponentName || '—',
      resultado: res,
      nivel,
    };
  });
  return { pontos, jogos: ultimos.length };
}

/* -------------------------------------------------- disciplina e faltas */

/**
 * Faltas, cartões e faltas sofridas.
 *
 * ## Por jogo, e não por parte
 *
 * A média por parte era rigorosa e ilegível: "0,8 faltas por parte" não é um
 * número que alguém tenha na cabeça, e ninguém fala assim à beira do campo. Por
 * jogo é a unidade em que se pensa.
 *
 * O limite das cinco continua a contar-se por parte, porque é aí que a regra
 * vive — a contagem zera ao intervalo, e uma equipa com quatro faltas em cada
 * parte nunca esteve em perigo. São duas perguntas diferentes e cada uma fica
 * na sua unidade.
 *
 * ## As faltas de cada jogador podem não existir
 *
 * A falta é sempre da equipa; atribuí-la a alguém é um segundo toque que a app
 * pede mas não obriga. Num jogo apontado à pressa, todas as faltas ficam sem
 * dono — e um gráfico de barras todas a zero é pior do que gráfico nenhum, que
 * foi exactamente o que aconteceu. Daí o `comAutor`: quem desenha decide o que
 * mostrar em vez de desenhar vazio.
 */
export function disciplina(entries, { limite = 5 } = {}) {
  let jogos = 0;
  let partes = 0;
  let totalNossas = 0;
  let totalSofridas = 0;
  let noLimite = 0;
  const porJogador = new Map();

  for (const { state } of terminados(entries)) {
    jogos += 1;
    const nossas = (state.fouls || []).filter((f) => f.team === 'US');
    const deles = (state.fouls || []).filter((f) => f.team === 'THEM');
    totalNossas += nossas.length;
    totalSofridas += deles.length;

    for (const parte of [1, 2]) {
      // Uma parte que nunca começou não conta como uma parte sem faltas.
      if (parte === 2 && state.firstHalfMs == null) continue;
      partes += 1;
      if (nossas.filter((f) => f.period === parte).length >= limite) noLimite += 1;
    }

    for (const p of Object.values(state.players || {})) {
      const a = porJogador.get(p.playerId) || {
        playerId: p.playerId,
        name: p.name,
        number: p.number,
        faltas: 0,
        sofridas: 0,
        amarelos: 0,
        vermelhos: 0,
      };
      a.name = p.name;
      a.number = p.number;
      a.faltas += nossas.filter((f) => f.playerId === p.playerId).length;
      // A falta sofrida é do adversário e o jogador guardado é o **nosso** que a
      // sofreu — é assim que o jogo ao vivo a grava.
      a.sofridas += deles.filter((f) => f.playerId === p.playerId).length;
      const meus = (state.cards || []).filter((c) => c.playerId === p.playerId);
      a.amarelos += meus.filter((c) => c.type === 'YELLOW').length;
      a.vermelhos += meus.filter((c) => c.type === 'RED').length;
      porJogador.set(p.playerId, a);
    }
  }

  const jogadores = [...porJogador.values()]
    .filter((j) => j.faltas || j.sofridas || j.amarelos || j.vermelhos)
    .sort(
      (a, b) =>
        b.faltas - a.faltas ||
        b.vermelhos - a.vermelhos ||
        b.amarelos - a.amarelos ||
        b.sofridas - a.sofridas
    );

  return {
    jogos,
    partes,
    totalNossas,
    totalSofridas,
    mediaPorJogo: jogos ? totalNossas / jogos : 0,
    mediaSofridasPorJogo: jogos ? totalSofridas / jogos : 0,
    noLimite,
    percentagemNoLimite: partes ? Math.round((noLimite / partes) * 100) : 0,
    // Houve alguma falta atribuída a alguém? Sem isto o gráfico por jogador é
    // uma fila de zeros.
    comAutor: jogadores.some((j) => j.faltas > 0),
    comSofridas: jogadores.some((j) => j.sofridas > 0),
    jogadores,
  };
}
