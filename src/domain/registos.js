// domain/registos.js — registos extra do jogo ao vivo, ligados por escalão.
//
// Remates, defesas do GR, recuperações, perdas de bola, foras, cantos e
// ações +/−. Plano em
// PLANO-REGISTOS-POR-ESCALAO.md.
//
// Um só tipo de evento para todos: `STAT_RECORDED`, com o registo em
// `metadata.registo`. Um registo novo, daqui para a frente, é um valor novo
// nesse campo, sem migração. As correções a frio são `STAT_CORRECTED`, que
// apontam para o registo por `metadata.targetEventId` (como as faltas).
//
// Regra de ouro: os ids dos registos e os valores de `resultado` nunca mudam
// de significado. Um evento gravado hoje tem de querer dizer o mesmo daqui a
// três épocas.
//
// A config do escalão decide o que se REGISTA (que botões aparecem). Os
// eventos decidem o que se MOSTRA: o resumo, o painel e o CSV mostram um bloco
// sempre que o jogo tiver eventos desse tipo, haja config ou não.
//
// Coordenadas: o campo é desenhado na horizontal, a atacar para a DIREITA
// (como no ecrã do jogo: guarda-redes à esquerda, pivô à direita).
//   x: 0 = a nossa linha de fundo, 1 = a linha de fundo deles
//   y: 0 = lateral de cima, 1 = lateral de baixo
// É sempre relativo ao nosso sentido de ataque: a troca de campo ao intervalo
// não conta. Guarda-se o ponto tocado, nunca uma "zona": as zonas calculam-se
// na leitura e podem mudar sem reinterpretar eventos antigos.

import { makeEvent } from './actions.js';
import { EVENT } from './constants.js';
import { matchStatsTable } from './stats.js';

/** Versão da forma do `metadata`. Sobe só se um campo mudar de significado. */
export const VERSAO = 1;

export const REGISTO = {
  REMATE: 'remate',
  DEFESA_GR: 'defesa_gr',
  RECUPERACAO: 'recuperacao',
  FORA: 'fora',
  CANTO: 'canto',
  ACAO: 'acao',
  // Remates do adversário (pedido a 26/10/2026, clubes Personalizado): o que
  // aconteceu depois do remate e de onde rematou. Não tem jogador — não há
  // plantel deles.
  REMATE_ADV: 'remate_adv',
  // Perdas de bola (pedido a 27/10/2026, clubes Personalizado): quantas vezes
  // cada jogador perdeu a bola. Sem zona — o clube disse que não precisava.
  PERDA_BOLA: 'perda_bola',
  // Remates do adversário só contados (31/10/2026). Saiu do catálogo no
  // mesmo dia (`disponivel: false`): é o `remate_adv` sem zona e sem
  // resultado, agora que isso se escolhe por escalão. Lê-se na mesma.
  REMATE_ADV_SIMPLES: 'remate_adv_simples',
  // Pedidos a 31/10/2026 (clubes Personalizado), a partir das ações de outra
  // app: passes falhados por jogador, penáltis nossos e deles, e os
  // lançamentos de baliza de cada equipa.
  PASSE_FALHADO: 'passe_falhado',
  PENALTI: 'penalti',
  PENALTI_ADV: 'penalti_adv',
  LANCAMENTO_BALIZA: 'lancamento_baliza',
  // O livre de 10 metros, da 6.ª falta da parte em diante. É de TODOS os
  // escalões: não se liga no painel, grava-se sempre que o treinador diz se
  // foi golo. `equipa` é quem bate o livre.
  LIVRE_10M: 'livre_10m',
};

/** Resultado de um remate. `GOLO` corre primeiro o fluxo normal do golo. */
export const RESULTADO_REMATE = {
  GOLO: 'GOLO',
  DEFENDIDO: 'DEFENDIDO',
  BLOQUEADO: 'BLOQUEADO',
  FORA: 'FORA',
  POSTE: 'POSTE',
};

/** Penáltis: o que aconteceu ao pontapé. `GOLO` corre primeiro o fluxo do golo. */
export const RESULTADO_PENALTI = {
  GOLO: 'GOLO',
  DEFENDIDO: 'DEFENDIDO',
  FORA: 'FORA',
  POSTE: 'POSTE',
};

/** O livre de 10 metros: foi golo ou não. */
export const RESULTADO_10M = { GOLO: 'GOLO', FALHADO: 'FALHADO' };

/** Os "fixe" verde e vermelho: uma ação boa ou má, marcada à mão. */
export const RESULTADO_ACAO = { POSITIVA: 'POSITIVA', NEGATIVA: 'NEGATIVA' };

/**
 * As opções que um escalão pode mudar num registo, no painel. Cada registo diz
 * em `opcoes` quais lhe servem. Guardam-se em `team_stat_config.opcoes`, como
 * `{ registos: { remate: { zona: false } } }`; o que não estiver lá vale a
 * `omissao`. Os eventos guardam sempre o que têm, por isso mudar uma opção a
 * meio da época não estraga os jogos que já lá estão.
 */
export const OPCOES = {
  zona: { nome: 'pedir a zona', omissao: true },
  resultado: { nome: 'pedir o que aconteceu', omissao: true },
  cartao: { nome: 'botão no cartão do jogador', omissao: true },
  barra: { nome: 'botão na barra de cima (pergunta quem)', omissao: false },
};

/**
 * O catálogo da fase 1. Cada entrada diz quem faz o registo (`jogador` ou
 * `equipa`), se se pergunta onde foi (`ponto`) e que resultados admite.
 *
 * `disponivel: false` tira um registo da app inteira sem apagar nada: deixa de
 * se poder ligar no painel e os botões desaparecem, mesmo nos escalões que o
 * tenham na config. Os eventos que já existam continuam a ler-se.
 */
export const CATALOGO = {
  [REGISTO.REMATE]: {
    por: 'jogador',
    ponto: true,
    resultados: Object.values(RESULTADO_REMATE),
    opcoes: ['zona', 'resultado'],
    disponivel: true,
  },
  // O ponto é de onde rematou o adversário. Só o guarda-redes tem o botão.
  [REGISTO.DEFESA_GR]: {
    por: 'jogador',
    ponto: true,
    resultados: null,
    soGR: true,
    opcoes: ['zona'],
    disponivel: true,
  },
  [REGISTO.RECUPERACAO]: { por: 'jogador', ponto: true, resultados: null, opcoes: ['zona'], disponivel: true },
  // O fora só acontece numa linha lateral: o ponto fica encostado a ela.
  [REGISTO.FORA]: {
    por: 'equipa',
    ponto: true,
    lateral: true,
    resultados: null,
    opcoes: ['zona'],
    disponivel: true,
  },
  [REGISTO.CANTO]: { por: 'equipa', ponto: false, resultados: null, disponivel: true },
  // Ainda por decidir se entram já ou só com as notas da fase 2. Para as
  // desligar em toda a app basta pôr `disponivel: false` aqui.
  [REGISTO.ACAO]: {
    por: 'jogador',
    ponto: false,
    resultados: Object.values(RESULTADO_ACAO),
    disponivel: true,
  },
  // Os mesmos resultados de um remate nosso, vistos da nossa baliza: GOLO é
  // golo sofrido (corre primeiro o fluxo do golo do adversário), DEFENDIDO é
  // defesa do nosso GR. O ponto é de onde rematou — perto da NOSSA baliza
  // (x pequeno), que é para onde eles atacam. `equipa` é sempre THEM.
  [REGISTO.REMATE_ADV]: {
    por: 'equipa',
    soAdversario: true,
    ponto: true,
    resultados: Object.values(RESULTADO_REMATE),
    opcoes: ['zona', 'resultado'],
    disponivel: true,
  },
  [REGISTO.PERDA_BOLA]: { por: 'jogador', ponto: false, resultados: null, disponivel: true },
  [REGISTO.REMATE_ADV_SIMPLES]: {
    por: 'equipa',
    soAdversario: true,
    ponto: false,
    resultados: null,
    disponivel: false,
  },
  // Como a perda de bola, mas o escalão escolhe onde fica o botão: no cartão
  // de cada jogador, na barra de cima (pergunta quem falhou), ou nos dois.
  [REGISTO.PASSE_FALHADO]: {
    por: 'jogador',
    ponto: false,
    resultados: null,
    opcoes: ['cartao', 'barra'],
    disponivel: true,
  },
  // Penáltis nossos: quem bateu (pode ficar por dizer) e o que aconteceu.
  [REGISTO.PENALTI]: {
    por: 'jogador',
    jogadorOpcional: true,
    ponto: false,
    resultados: Object.values(RESULTADO_PENALTI),
    disponivel: true,
  },
  // Penáltis do adversário: DEFENDIDO é defesa do nosso guarda-redes.
  [REGISTO.PENALTI_ADV]: {
    por: 'equipa',
    soAdversario: true,
    ponto: false,
    resultados: Object.values(RESULTADO_PENALTI),
    disponivel: true,
  },
  [REGISTO.LANCAMENTO_BALIZA]: { por: 'equipa', ponto: false, resultados: null, disponivel: true },
  // `sempre`: não vai ao painel nem precisa de estar ligado. `jogadorOpcional`:
  // num livre nosso guarda-se quem bateu, se o treinador o disser.
  [REGISTO.LIVRE_10M]: {
    por: 'equipa',
    jogadorOpcional: true,
    ponto: false,
    resultados: Object.values(RESULTADO_10M),
    sempre: true,
    disponivel: true,
  },
};

/**
 * Os registos que levam um golo atrás quando o resultado é `GOLO`: o golo
 * grava-se primeiro e o registo fica preso a ele por `goloEventId`.
 */
const REMATES = new Set([
  REGISTO.REMATE,
  REGISTO.REMATE_ADV,
  REGISTO.PENALTI,
  REGISTO.PENALTI_ADV,
  REGISTO.LIVRE_10M,
]);

/** O registo leva um golo atrás quando dá golo? (Remates, penáltis, 10 m.) */
export function levaGolo(registo) {
  return REMATES.has(registo);
}

/** Os ids pela ordem do catálogo — é a ordem em que aparecem em todo o lado. */
export const REGISTOS = Object.keys(CATALOGO);

/** Remates que foram à baliza (obrigaram o guarda-redes ou entraram). */
export const A_BALIZA = new Set([RESULTADO_REMATE.DEFENDIDO, RESULTADO_REMATE.GOLO]);

export const COR_RESULTADO = {
  GOLO: '#22c55e',
  DEFENDIDO: '#38bdf8',
  BLOQUEADO: '#f59e0b',
  FORA: '#94a3b8',
  POSTE: '#a78bfa',
};

/** Nos remates do adversário o golo é sofrido: vermelho, não verde. */
export const COR_RESULTADO_ADV = { ...COR_RESULTADO, GOLO: '#f43f5e' };

/** Penáltis e livres de 10 m: golo nosso verde, falhado cinzento. */
export const COR_PENALTI = {
  GOLO: '#22c55e',
  DEFENDIDO: '#38bdf8',
  FORA: '#94a3b8',
  POSTE: '#a78bfa',
  FALHADO: '#94a3b8',
};
export const COR_PENALTI_ADV = { ...COR_PENALTI, GOLO: '#f43f5e' };

export const COR_REGISTO = {
  recuperacao: '#f472b6',
  defesa_gr: '#38bdf8',
  fora_US: '#eaf1ff',
  fora_THEM: '#fb7185',
};

export function eRegistoConhecido(id) {
  return Object.prototype.hasOwnProperty.call(CATALOGO, id);
}

/** Os registos que se ligam no painel (os `sempre` não precisam). */
export function registosDoPainel() {
  return REGISTOS.filter((id) => CATALOGO[id].disponivel && !CATALOGO[id].sempre);
}

/**
 * Os registos que este escalão pode registar: o que a config diz, cortado
 * pelo que existe e está disponível no catálogo, pela ordem do catálogo.
 * Aceita a lista da config (array) ou nada.
 */
export function registosLigados(lista) {
  const pedidos = new Set(Array.isArray(lista) ? lista : []);
  return new Set(registosDoPainel().filter((id) => pedidos.has(id)));
}

/**
 * As opções de um registo neste escalão, já com as omissões: por exemplo
 * `{ zona: true, resultado: false }`. Só traz as que o registo admite.
 * `opcoes` é a coluna `team_stat_config.opcoes` (ou nada).
 */
export function opcoesDoRegisto(opcoes, id) {
  const def = CATALOGO[id];
  const gravadas = opcoes?.registos?.[id] || {};
  const out = {};
  for (const o of def?.opcoes || []) {
    out[o] = typeof gravadas[o] === 'boolean' ? gravadas[o] : OPCOES[o].omissao;
  }
  return out;
}

/** As opções de todos os registos, para os ecrãs: `{ remate: { zona, resultado }, … }`. */
export function opcoesDosRegistos(opcoes) {
  return Object.fromEntries(
    REGISTOS.filter((id) => CATALOGO[id].opcoes).map((id) => [id, opcoesDoRegisto(opcoes, id)])
  );
}

/**
 * Valida as opções para gravar: `{ remate: { zona: false }, … }`. Devolve
 * `{ registos }` só com o que o catálogo admite, ou `{ erro }`.
 */
export function validarOpcoes(porRegisto) {
  if (porRegisto == null) return { registos: {} };
  if (typeof porRegisto !== 'object' || Array.isArray(porRegisto)) {
    return { erro: 'as opções têm de ser um objeto' };
  }
  const registos = {};
  for (const [id, valores] of Object.entries(porRegisto)) {
    const def = CATALOGO[id];
    if (!def?.opcoes) return { erro: `o registo ${id} não tem opções` };
    for (const [o, v] of Object.entries(valores || {})) {
      if (!def.opcoes.includes(o)) return { erro: `opção desconhecida: ${id}.${o}` };
      if (typeof v !== 'boolean') return { erro: `a opção ${id}.${o} tem de ser verdadeiro ou falso` };
      if (!registos[id]) registos[id] = {};
      registos[id][o] = v;
    }
  }
  return { registos };
}

/**
 * Valida uma lista para gravar na config. Devolve `{ registos }` (sem
 * repetidos, pela ordem do catálogo) ou `{ erro, desconhecidos }`.
 */
export function validarListaDeRegistos(lista) {
  if (!Array.isArray(lista)) return { erro: 'a lista de registos tem de ser um array' };
  const desconhecidos = lista.filter(
    (id) => !eRegistoConhecido(id) || !CATALOGO[id].disponivel || CATALOGO[id].sempre
  );
  if (desconhecidos.length) {
    return { erro: `registo desconhecido: ${desconhecidos.join(', ')}`, desconhecidos };
  }
  const pedidos = new Set(lista);
  return { registos: REGISTOS.filter((id) => pedidos.has(id)) };
}

/** Uma coordenada entre 0 e 1, com três casas. `null` fica `null`. */
export function arredondar(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

/** Um fora vale a linha lateral mais próxima: 0 a de cima, 1 a de baixo. */
export function aLinhaLateral(y) {
  return y < 0.5 ? 0 : 1;
}

function equipaValida(equipa) {
  return equipa === 'THEM' ? 'THEM' : 'US';
}

/* ------------------------------------------------------------- escrita */

/**
 * Cria o evento de um registo. Lança se o registo, o resultado ou o jogador
 * não fizerem sentido: um evento mal formado não se apaga depois.
 *
 * Remate com GOLO: o golo grava-se primeiro, pelo fluxo normal, e o remate
 * leva o id desse `TEAM_GOAL_ADDED` em `goloEventId`.
 */
export function registar(
  state,
  {
    registo,
    playerId = null,
    equipa = 'US',
    resultado = null,
    x = null,
    y = null,
    goloEventId = null,
    // Só nos registos acrescentados a frio: o minuto e a parte em que foi.
    matchElapsedMs = null,
    period = null,
  },
  now = Date.now()
) {
  const def = CATALOGO[registo];
  if (!def) throw new Error(`Registo desconhecido: ${registo}`);
  if (def.por === 'jogador' && !playerId && !def.jogadorOpcional) {
    throw new Error(`O registo ${registo} precisa de jogador.`);
  }
  // Um remate sem resultado é válido quando o escalão não o pede: fica só
  // contado. Um resultado que não exista, nunca.
  const semResultado = resultado == null && Boolean(def.opcoes?.includes('resultado'));
  if (def.resultados && !semResultado && !def.resultados.includes(resultado)) {
    throw new Error(`Resultado inválido para ${registo}: ${resultado}`);
  }

  const metadata = {
    v: VERSAO,
    registo,
    // Os registos de jogador são sempre nossos; os do adversário, sempre deles.
    equipa: def.por === 'jogador' ? 'US' : def.soAdversario ? 'THEM' : equipaValida(equipa),
  };
  if (def.resultados && !semResultado) metadata.resultado = resultado;
  // Quem bateu, num registo de equipa que o admite (o livre de 10 m nosso).
  let comJogador = null;
  if (def.por === 'jogador') comJogador = playerId || null;
  else if (def.jogadorOpcional && metadata.equipa === 'US') comJogador = playerId || null;
  if (def.ponto) {
    const px = arredondar(x);
    let py = arredondar(y);
    if (def.lateral && py != null) py = aLinhaLateral(py);
    metadata.x = px != null && py != null ? px : null;
    metadata.y = px != null && py != null ? py : null;
  }
  if (REMATES.has(registo) && resultado === RESULTADO_REMATE.GOLO) {
    metadata.goloEventId = goloEventId || null;
  }

  return makeEvent(
    state,
    EVENT.STAT_RECORDED,
    {
      playerId: comJogador,
      metadata,
      ...(matchElapsedMs != null
        ? {
            matchElapsedMs,
            period,
            periodElapsedMs:
              period === 2 ? matchElapsedMs - (state.firstHalfMs || 0) : matchElapsedMs,
          }
        : {}),
    },
    now
  );
}

/**
 * Corrige um registo a frio: o jogador, o resultado, o ponto ou o minuto.
 * Só os campos que vierem mudam.
 *
 * O resultado de um remate não passa de nem para `GOLO`: isso mexia no
 * marcador sem passar pelo golo. Para isso corrige-se o golo.
 */
export function corrigirRegisto(state, { targetEventId, ...campos }, now = Date.now()) {
  if (!targetEventId) throw new Error('Correção sem registo.');
  const alvo = (state.events || []).find(
    (e) => e.id === targetEventId && e.eventType === EVENT.STAT_RECORDED
  );
  const atual = alvo ? lerRegisto(alvo) : null;
  const def = atual ? CATALOGO[atual.registo] : null;

  const metadata = { v: VERSAO, targetEventId };
  if ('playerId' in campos) {
    if (def?.por === 'equipa' && !def.jogadorOpcional) {
      throw new Error('Este registo é da equipa, não de um jogador.');
    }
    if (!campos.playerId && !def?.jogadorOpcional) throw new Error('O registo precisa de jogador.');
    metadata.playerId = campos.playerId || null;
  }
  if ('equipa' in campos && !def?.soAdversario) metadata.equipa = equipaValida(campos.equipa);
  if ('resultado' in campos) {
    if (def && (!def.resultados || !def.resultados.includes(campos.resultado))) {
      throw new Error(`Resultado inválido: ${campos.resultado}`);
    }
    const golo = RESULTADO_REMATE.GOLO;
    if (REMATES.has(atual?.registo) && (campos.resultado === golo) !== (atual.resultado === golo)) {
      throw new Error('Um remate não passa a golo (nem deixa de o ser) por correção.');
    }
    metadata.resultado = campos.resultado;
  }
  if ('x' in campos || 'y' in campos) {
    const px = arredondar(campos.x);
    let py = arredondar(campos.y);
    if (def?.lateral && py != null) py = aLinhaLateral(py);
    metadata.x = px != null && py != null ? px : null;
    metadata.y = px != null && py != null ? py : null;
  }
  if (campos.matchElapsedMs != null) {
    metadata.matchElapsedMs = Math.max(0, Math.round(Number(campos.matchElapsedMs)));
    if (campos.period) metadata.period = campos.period;
  }

  return makeEvent(
    state,
    EVENT.STAT_CORRECTED,
    { playerId: metadata.playerId ?? null, metadata },
    now
  );
}

/* ------------------------------------------------------------- leitura */

function lerRegisto(ev) {
  const md = ev.metadata || {};
  return {
    eventId: ev.id,
    registo: md.registo,
    playerId: ev.playerId || md.playerId || null,
    equipa: md.equipa === 'THEM' ? 'THEM' : 'US',
    resultado: md.resultado ?? null,
    x: md.x ?? null,
    y: md.y ?? null,
    goloEventId: md.goloEventId ?? null,
    period: ev.period ?? null,
    matchElapsedMs: ev.matchElapsedMs ?? 0,
    seq: ev.seq ?? null,
    createdAt: ev.createdAt ?? null,
    corrigido: false,
  };
}

/**
 * A lista final dos registos do jogo:
 *  - só os que não foram desfeitos (o `state.events` do reducer já os tira);
 *  - com as correções aplicadas, pela ordem em que foram feitas;
 *  - sem os remates `GOLO` cujo golo foi desfeito ou tirado;
 *  - sem registos que esta versão não conheça (os da fase 2 e seguintes).
 */
export function registosDoJogo(state) {
  const evs = state?.events || [];
  const porId = new Map();
  for (const ev of evs) {
    if (ev.eventType !== EVENT.STAT_RECORDED) continue;
    if (!eRegistoConhecido(ev.metadata?.registo)) continue;
    porId.set(ev.id, lerRegisto(ev));
  }
  if (!porId.size) return [];

  for (const ev of evs) {
    if (ev.eventType !== EVENT.STAT_CORRECTED) continue;
    const md = ev.metadata || {};
    const r = porId.get(md.targetEventId);
    if (!r) continue;
    const def = CATALOGO[r.registo];
    if ('playerId' in md && (md.playerId || def.jogadorOpcional)) {
      if (def.por === 'jogador' || def.jogadorOpcional) r.playerId = md.playerId || null;
    }
    if ('equipa' in md && def.por === 'equipa' && !def.soAdversario) {
      r.equipa = md.equipa === 'THEM' ? 'THEM' : 'US';
    }
    if ('resultado' in md && def.resultados?.includes(md.resultado)) {
      const golo = RESULTADO_REMATE.GOLO;
      // A mesma regra da escrita: um remate não entra nem sai do golo por aqui.
      if (!REMATES.has(r.registo) || (md.resultado === golo) === (r.resultado === golo)) {
        r.resultado = md.resultado;
      }
    }
    if ('x' in md || 'y' in md) {
      r.x = md.x ?? null;
      r.y = md.y ?? null;
    }
    if (md.matchElapsedMs != null) {
      r.matchElapsedMs = md.matchElapsedMs;
      if (md.period) r.period = md.period;
    }
    r.corrigido = true;
  }

  const golos = new Set((state.goals || []).map((g) => g.eventId));
  return [...porId.values()]
    .filter(
      (r) =>
        !(
          REMATES.has(r.registo) &&
          r.resultado === RESULTADO_REMATE.GOLO &&
          r.goloEventId &&
          !golos.has(r.goloEventId)
        )
    )
    .sort(
      (a, b) =>
        (a.period ?? 0) - (b.period ?? 0) ||
        a.matchElapsedMs - b.matchElapsedMs ||
        (a.seq ?? 0) - (b.seq ?? 0)
    );
}

/** O jogo tem algum registo? (Decide se os blocos aparecem.) */
export function temRegistos(state) {
  return registosDoJogo(state).length > 0;
}

/** Totais da equipa e uma linha por jogador. */
export function resumoRegistos(state, now = Date.now()) {
  const lista = registosDoJogo(state);
  const de = (id) => lista.filter((r) => r.registo === id);
  const remates = de(REGISTO.REMATE);
  const porResultado = Object.fromEntries(Object.values(RESULTADO_REMATE).map((o) => [o, 0]));
  for (const r of remates) if (r.resultado in porResultado) porResultado[r.resultado] += 1;
  const porEquipa = (id) => ({
    US: de(id).filter((r) => r.equipa === 'US').length,
    THEM: de(id).filter((r) => r.equipa === 'THEM').length,
  });
  const acoes = de(REGISTO.ACAO);
  const rematesAdv = de(REGISTO.REMATE_ADV);
  const porResultadoAdv = Object.fromEntries(Object.values(RESULTADO_REMATE).map((o) => [o, 0]));
  for (const r of rematesAdv) if (r.resultado in porResultadoAdv) porResultadoAdv[r.resultado] += 1;
  // Penáltis e livres de 10 m: quantos e quantos deram golo.
  const bolaParada = (lista) => {
    const porResultado = {};
    for (const r of lista) if (r.resultado) porResultado[r.resultado] = (porResultado[r.resultado] || 0) + 1;
    return {
      total: lista.length,
      golos: lista.filter((r) => r.resultado === RESULTADO_REMATE.GOLO).length,
      porResultado,
    };
  };
  const livres = de(REGISTO.LIVRE_10M);

  const tempos = new Map(matchStatsTable(state, now).map((r) => [r.playerId, r.courtMs]));
  const jogadores = Object.values(state.players || {})
    .map((p) => {
      const meus = lista.filter((r) => r.playerId === p.playerId);
      const rem = meus.filter((r) => r.registo === REGISTO.REMATE);
      const courtMs = tempos.get(p.playerId) || 0;
      const recuperacoes = meus.filter((r) => r.registo === REGISTO.RECUPERACAO).length;
      const perdas = meus.filter((r) => r.registo === REGISTO.PERDA_BOLA).length;
      const passes = meus.filter((r) => r.registo === REGISTO.PASSE_FALHADO).length;
      return {
        playerId: p.playerId,
        number: p.number,
        name: p.name,
        courtMs,
        remates: rem.length,
        rematesBaliza: rem.filter((r) => A_BALIZA.has(r.resultado)).length,
        golosRemate: rem.filter((r) => r.resultado === RESULTADO_REMATE.GOLO).length,
        recuperacoes,
        recup10: recuperacoesPor10(recuperacoes, courtMs),
        defesas: meus.filter((r) => r.registo === REGISTO.DEFESA_GR).length,
        perdas,
        perdas10: recuperacoesPor10(perdas, courtMs),
        passes,
        passes10: recuperacoesPor10(passes, courtMs),
        positivas: meus.filter(
          (r) => r.registo === REGISTO.ACAO && r.resultado === RESULTADO_ACAO.POSITIVA
        ).length,
        negativas: meus.filter(
          (r) => r.registo === REGISTO.ACAO && r.resultado === RESULTADO_ACAO.NEGATIVA
        ).length,
      };
    })
    .filter(
      (j) =>
        j.courtMs > 0 ||
        j.remates ||
        j.recuperacoes ||
        j.defesas ||
        j.perdas ||
        j.passes ||
        j.positivas ||
        j.negativas
    )
    .sort((a, b) => b.courtMs - a.courtMs || (a.number ?? 0) - (b.number ?? 0));

  return {
    total: lista.length,
    // Que registos aparecem neste jogo: decide que colunas e blocos se mostram.
    tipos: new Set(lista.map((r) => r.registo)),
    remates: remates.length,
    rematesBaliza: remates.filter((r) => A_BALIZA.has(r.resultado)).length,
    // Remates sem resultado (o escalão não o pede): sem eles todos com
    // resultado, "à baliza" e eficácia não querem dizer nada.
    rematesComResultado: remates.filter((r) => r.resultado).length,
    porResultado,
    rematesAdv: rematesAdv.length,
    rematesAdvBaliza: rematesAdv.filter((r) => A_BALIZA.has(r.resultado)).length,
    rematesAdvComResultado: rematesAdv.filter((r) => r.resultado).length,
    porResultadoAdv,
    rematesAdvSimples: de(REGISTO.REMATE_ADV_SIMPLES).length,
    defesas: de(REGISTO.DEFESA_GR).length,
    recuperacoes: de(REGISTO.RECUPERACAO).length,
    perdas: de(REGISTO.PERDA_BOLA).length,
    passes: de(REGISTO.PASSE_FALHADO).length,
    penaltis: bolaParada(de(REGISTO.PENALTI)),
    penaltisAdv: bolaParada(de(REGISTO.PENALTI_ADV)),
    livres10: {
      US: bolaParada(livres.filter((r) => r.equipa === 'US')),
      THEM: bolaParada(livres.filter((r) => r.equipa === 'THEM')),
    },
    foras: porEquipa(REGISTO.FORA),
    cantos: porEquipa(REGISTO.CANTO),
    // Golos de canto (pelo tipo do golo), para os cantos convertidos.
    golosCanto: {
      US: (state.goals || []).filter((g) => g.team === 'US' && g.howScored === 'CANTO').length,
      THEM: (state.goals || []).filter((g) => g.team === 'THEM' && g.howScored === 'CANTO').length,
    },
    lancamentos: porEquipa(REGISTO.LANCAMENTO_BALIZA),
    acoes: {
      positivas: acoes.filter((r) => r.resultado === RESULTADO_ACAO.POSITIVA).length,
      negativas: acoes.filter((r) => r.resultado === RESULTADO_ACAO.NEGATIVA).length,
    },
    jogadores,
  };
}

/**
 * Quantos de cada registo tem cada jogador, para os números nos botões do
 * cartão: Map playerId → { remate, recuperacao, defesa_gr, perda_bola, passe_falhado,
 * positivas, negativas }.
 */
export function contagemPorJogador(state) {
  const out = new Map();
  for (const r of registosDoJogo(state)) {
    if (!r.playerId) continue;
    if (!out.has(r.playerId)) {
      out.set(r.playerId, {
        remate: 0,
        recuperacao: 0,
        defesa_gr: 0,
        perda_bola: 0,
        passe_falhado: 0,
        positivas: 0,
        negativas: 0,
      });
    }
    const c = out.get(r.playerId);
    if (r.registo === REGISTO.ACAO) {
      if (r.resultado === RESULTADO_ACAO.POSITIVA) c.positivas += 1;
      else if (r.resultado === RESULTADO_ACAO.NEGATIVA) c.negativas += 1;
    } else if (r.registo in c) {
      c[r.registo] += 1;
    }
  }
  return out;
}

/**
 * Recuperações (ou perdas) por 10 minutos em campo. Abaixo de um minuto não
 * diz nada.
 */
export function recuperacoesPor10(recuperacoes, courtMs) {
  return courtMs >= 60 * 1000 ? (recuperacoes * 600000) / courtMs : null;
}

/** A cor de um ponto no campo. */
export function corDoRegisto(r) {
  if (r.registo === REGISTO.PENALTI_ADV) return COR_PENALTI_ADV[r.resultado] || '#ffffff';
  if (r.registo === REGISTO.PENALTI) return COR_PENALTI[r.resultado] || '#ffffff';
  if (r.registo === REGISTO.LIVRE_10M) {
    return (r.equipa === 'THEM' ? COR_PENALTI_ADV : COR_PENALTI)[r.resultado] || '#ffffff';
  }
  if (r.registo === REGISTO.REMATE_ADV) return COR_RESULTADO_ADV[r.resultado] || '#ffffff';
  if (r.registo === REGISTO.REMATE) return COR_RESULTADO[r.resultado] || '#ffffff';
  if (r.registo === REGISTO.FORA) return r.equipa === 'THEM' ? COR_REGISTO.fora_THEM : COR_REGISTO.fora_US;
  return COR_REGISTO[r.registo] || '#ffffff';
}

/**
 * Os pontos para desenhar no campo. `registos` filtra por id
 * (ex.: `['remate']`); sem ele vêm todos os que têm ponto.
 */
export function marcadores(state, { registos } = {}) {
  return paraMarcadores(registosDoJogo(state), { registos });
}

/** O mesmo, a partir de uma lista já lida (o painel da época junta vários jogos). */
export function paraMarcadores(lista, { registos } = {}) {
  const out = [];
  for (const r of lista) {
    if (r.x == null || r.y == null) continue;
    if (registos && !registos.includes(r.registo)) continue;
    out.push({
      id: r.eventId,
      registo: r.registo,
      cor: corDoRegisto(r),
      x: r.x,
      y: r.y,
      resultado: r.resultado,
      equipa: r.equipa,
      playerId: r.playerId,
      matchElapsedMs: r.matchElapsedMs,
      period: r.period,
    });
  }
  return out;
}
