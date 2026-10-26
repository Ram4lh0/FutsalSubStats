// domain/treino.js — o calendário de treinos e as contas das presenças.
//
// Tudo aqui é puro: recebe linhas e datas, devolve linhas e números. Não sabe o
// que é IndexedDB nem Supabase — é isso que deixa testar as regras sem rede.
//
// As datas são texto `AAAA-MM-DD`, sempre. Um treino é "dia 14 às 19h30" no
// pavilhão; converter para milissegundos e voltar abria a porta a um treino
// saltar de dia por causa de um fuso horário ou da hora de verão.

export const PRESENCA = {
  PRESENTE: 'PRESENTE',
  FALTA_INJUSTIFICADA: 'FALTA_INJUSTIFICADA',
  FALTA_JUSTIFICADA: 'FALTA_JUSTIFICADA',
  LESAO: 'LESAO',
};

export const ESTADOS_PRESENCA = [
  PRESENCA.PRESENTE,
  PRESENCA.FALTA_INJUSTIFICADA,
  PRESENCA.FALTA_JUSTIFICADA,
  PRESENCA.LESAO,
];

export const ESTADO_TREINO = { AGENDADO: 'AGENDADO', CANCELADO: 'CANCELADO' };

/* ------------------------------------------------------------- datas */

const pad = (n) => String(n).padStart(2, '0');

/** Primeira letra maiúscula e o resto como está: "outubro de 2026" → "Outubro de 2026". */
export function maiuscula(txt) {
  const s = String(txt || '');
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}

/** `Date` local → `AAAA-MM-DD`. */
export function isoDia(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `AAAA-MM-DD` → `Date` à meia-noite local (sem passar por UTC). */
export function deIsoDia(txt) {
  const [a, m, d] = String(txt).split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(txt, n) {
  const d = deIsoDia(txt);
  d.setDate(d.getDate() + n);
  return isoDia(d);
}

/**
 * Onde acaba a época de quem está em `hoje`: 30 de junho. É a mesma data em
 * que acabam as licenças, e é até lá que a rotina gera treinos.
 */
export function fimDaEpoca(hoje) {
  const d = deIsoDia(hoje);
  const ano = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `${ano}-06-30`;
}

/** 1 de julho da época de `hoje`. */
export function inicioDaEpoca(hoje) {
  const d = deIsoDia(hoje);
  const ano = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${ano}-07-01`;
}

/* ------------------------------------------------------- ids estáveis */

/**
 * Um uuid derivado de um texto — sempre o mesmo para o mesmo texto.
 *
 * Serve dois casos em que dois aparelhos têm de chegar ao mesmo id sem falarem
 * um com o outro: o treino que a rotina gera para um dia (rotina + data), e a
 * presença de um jogador num treino (treino + jogador). Com ids ao acaso, o
 * telemóvel do treinador e o do adjunto criavam duas linhas para a mesma coisa.
 *
 * Não é criptografia; é um hash de 128 bits (cyrb128) com a forma de um uuid v4,
 * que é o que o Postgres aceita numa coluna `uuid`.
 */
export function uuidDe(texto) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < texto.length; i++) {
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
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  const variante = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variante}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const idTreinoDaRotina = (routineId, data) => uuidDe(`treino:${routineId}:${data}`);
export const idPresenca = (sessionId, playerId) => uuidDe(`presenca:${sessionId}:${playerId}`);

/* ------------------------------------------------------ rotina → treinos */

/**
 * Os treinos que a rotina pede entre `de` e `ate` (inclusive).
 *
 * @param {Array<{id, weekday, startTime, durationMin, location, deletedAt}>} rotinas
 * @returns {Array<{id, routineId, date, startTime, durationMin, location}>}
 */
export function treinosDaRotina(rotinas, de, ate) {
  const ativas = rotinas.filter((r) => !r.deletedAt);
  if (!ativas.length || de > ate) return [];
  const saida = [];
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    const semana = deIsoDia(dia).getDay();
    for (const r of ativas) {
      if (Number(r.weekday) !== semana) continue;
      saida.push({
        id: idTreinoDaRotina(r.id, dia),
        routineId: r.id,
        date: dia,
        startTime: r.startTime,
        durationMin: r.durationMin,
        location: r.location || null,
      });
    }
  }
  return saida;
}

/**
 * O que muda nos treinos quando a rotina muda.
 *
 * As regras:
 *   · o passado não se toca — já aconteceu;
 *   · um treino editado à mão (`edited`) não se toca — o treinador decidiu;
 *   · um treino com presenças marcadas não se apaga, mesmo que a rotina já não
 *     o peça — seria perder o registo;
 *   · os outros acompanham a rotina: aparecem, mudam de hora, ou saem.
 *
 * @param {object} p
 * @param {Array} p.rotinas
 * @param {Array} p.treinos todos os treinos do escalão (incluindo apagados)
 * @param {Set<string>} p.comPresencas ids dos treinos que já têm presenças
 * @param {string} p.hoje `AAAA-MM-DD`
 * @param {string} [p.ate] por omissão, o fim da época
 * @returns {{criar: Array, atualizar: Array, apagar: Array}}
 */
export function planearTreinos({ rotinas, treinos, comPresencas = new Set(), hoje, ate }) {
  const limite = ate || fimDaEpoca(hoje);
  const pedidos = new Map(treinosDaRotina(rotinas, hoje, limite).map((t) => [t.id, t]));
  const existentes = new Map(treinos.map((t) => [t.id, t]));

  const criar = [];
  const atualizar = [];
  const apagar = [];

  for (const [id, pedido] of pedidos) {
    const atual = existentes.get(id);
    if (!atual) {
      criar.push({ ...pedido, status: ESTADO_TREINO.AGENDADO, edited: false, notes: null });
      continue;
    }
    if (atual.edited) continue;
    if (atual.deletedAt) {
      // Voltou a ser pedido (ex.: a rotina mudou e depois voltou atrás).
      atualizar.push({ ...atual, ...pedido, deletedAt: null });
      continue;
    }
    if (
      atual.startTime !== pedido.startTime ||
      Number(atual.durationMin) !== Number(pedido.durationMin) ||
      (atual.location || null) !== (pedido.location || null)
    ) {
      atualizar.push({ ...atual, ...pedido });
    }
  }

  for (const t of treinos) {
    if (!t.routineId || t.deletedAt || t.edited) continue;
    if (t.date < hoje || t.date > limite) continue;
    if (pedidos.has(t.id)) continue;
    if (comPresencas.has(t.id)) continue;
    apagar.push(t);
  }

  return { criar, atualizar, apagar };
}

/* ------------------------------------------------------------- presenças */

/** O treino conta para as estatísticas? Só se aconteceu e tem presenças. */
function contaParaEstatistica(treino, presencasDoTreino, hoje) {
  return (
    !treino.deletedAt &&
    treino.status !== ESTADO_TREINO.CANCELADO &&
    treino.date <= hoje &&
    presencasDoTreino.length > 0
  );
}

function vazio() {
  return {
    [PRESENCA.PRESENTE]: 0,
    [PRESENCA.FALTA_INJUSTIFICADA]: 0,
    [PRESENCA.FALTA_JUSTIFICADA]: 0,
    [PRESENCA.LESAO]: 0,
    total: 0,
  };
}

/** Percentagem inteira, ou `null` quando não há base para a calcular. */
export function percentagem(parte, total) {
  return total ? Math.round((parte / total) * 100) : null;
}

/**
 * As presenças de um período, por equipa e por jogador.
 *
 * Assiduidade = presenças ÷ registos. As faltas — injustificadas, justificadas
 * e lesões — contam-se cada uma à parte, para o treinador ver qual é qual.
 *
 * @param {object} p
 * @param {Array} p.treinos
 * @param {Array} p.presencas
 * @param {string} p.de `AAAA-MM-DD` inclusive (null = desde sempre)
 * @param {string} p.ate `AAAA-MM-DD` inclusive (normalmente hoje)
 * @returns {{treinos: number, equipa: object, assiduidade: number|null,
 *            porJogador: Map<string, object>}}
 */
export function estatisticasPresencas({ treinos, presencas, de = null, ate }) {
  const porTreino = new Map();
  for (const p of presencas) {
    if (!porTreino.has(p.sessionId)) porTreino.set(p.sessionId, []);
    porTreino.get(p.sessionId).push(p);
  }

  const equipa = vazio();
  const porJogador = new Map();
  let n = 0;

  for (const t of treinos) {
    if (de && t.date < de) continue;
    const doTreino = porTreino.get(t.id) || [];
    if (!contaParaEstatistica(t, doTreino, ate)) continue;
    n += 1;
    for (const p of doTreino) {
      if (!(p.status in equipa)) continue;
      equipa[p.status] += 1;
      equipa.total += 1;
      if (!porJogador.has(p.playerId)) porJogador.set(p.playerId, vazio());
      const j = porJogador.get(p.playerId);
      j[p.status] += 1;
      j.total += 1;
    }
  }

  for (const j of porJogador.values()) {
    j.assiduidade = percentagem(j[PRESENCA.PRESENTE], j.total);
  }

  return {
    treinos: n,
    equipa,
    assiduidade: percentagem(equipa[PRESENCA.PRESENTE], equipa.total),
    porJogador,
  };
}

/**
 * Os treinos que contam num período, do mais antigo para o mais recente — as
 * colunas da grelha de presenças que se exporta (Excel, PDF). São os mesmos
 * que `estatisticasPresencas` conta, para a grelha e os totais baterem certo.
 *
 * @returns {Array<{treino: object, presencas: Map<string, string>}>}
 *          `presencas`: playerId → estado
 */
export function treinosContados({ treinos, presencas, de = null, ate }) {
  const porTreino = new Map();
  for (const p of presencas) {
    if (!porTreino.has(p.sessionId)) porTreino.set(p.sessionId, []);
    porTreino.get(p.sessionId).push(p);
  }
  return treinos
    .filter((t) => (!de || t.date >= de) && contaParaEstatistica(t, porTreino.get(t.id) || [], ate))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || '').localeCompare(String(b.startTime || '')))
    .map((t) => ({
      treino: t,
      presencas: new Map((porTreino.get(t.id) || []).map((p) => [p.playerId, p.status])),
    }));
}

/**
 * As linhas da tabela de assiduidade, por jogador e pela ordem escolhida no
 * ecrã. Fica aqui, e não no componente, para a exportação sair pela mesma
 * ordem que a tabela que se está a ver.
 *
 * Entra quem tem registos no período e quem está ativo no plantel (com zero).
 *
 * @param {Array} jogadores o plantel
 * @param {Map<string, object>} porJogador de `estatisticasPresencas`
 * @param {'assiduidade'|'faltas'|'numero'} ordem
 * @returns {Array<{jogador: object, s: object|undefined}>}
 */
export function linhasDePresenca(jogadores, porJogador, ordem = 'assiduidade') {
  const lista = jogadores
    .map((j) => ({ jogador: j, s: porJogador.get(j.id) }))
    .filter((l) => l.s || l.jogador.isActive !== false);
  const valor = (l) => {
    if (ordem === 'numero') return Number(l.jogador.shirtNumber) || 999;
    if (ordem === 'faltas') return -(l.s?.[PRESENCA.FALTA_INJUSTIFICADA] || 0);
    return l.s?.assiduidade ?? 101;
  };
  return lista.sort((a, b) => valor(a) - valor(b) || (a.jogador.name || '').localeCompare(b.jogador.name || ''));
}

/** Os períodos da aba: época, últimos 30, 14 e 7 dias. */
export function periodosDePresenca(hoje) {
  return {
    epoca: { de: inicioDaEpoca(hoje), ate: hoje },
    mes: { de: somarDias(hoje, -29), ate: hoje },
    quinzena: { de: somarDias(hoje, -13), ate: hoje },
    semana: { de: somarDias(hoje, -6), ate: hoje },
  };
}

/**
 * Quem faltou e quem foi, num período — para a janela de detalhe de cada
 * cartão. Por tipo de falta, cada jogador com as datas em que faltou (mais
 * recente primeiro); e à parte quem esteve em todos os treinos marcados.
 *
 * @returns {{treinos: number,
 *            faltas: Object<string, Array<{playerId, datas: string[]}>>,
 *            sempre: string[]}}
 */
export function detalhePresencas({ treinos, presencas, de = null, ate }) {
  const porTreino = new Map();
  for (const p of presencas) {
    if (!porTreino.has(p.sessionId)) porTreino.set(p.sessionId, []);
    porTreino.get(p.sessionId).push(p);
  }
  const faltas = {
    [PRESENCA.FALTA_INJUSTIFICADA]: new Map(),
    [PRESENCA.FALTA_JUSTIFICADA]: new Map(),
    [PRESENCA.LESAO]: new Map(),
  };
  const presentes = new Map();
  const comFalta = new Set();
  let n = 0;
  for (const t of treinos) {
    if (de && t.date < de) continue;
    const doTreino = porTreino.get(t.id) || [];
    if (!contaParaEstatistica(t, doTreino, ate)) continue;
    n += 1;
    for (const p of doTreino) {
      if (p.status === PRESENCA.PRESENTE) {
        presentes.set(p.playerId, (presentes.get(p.playerId) || 0) + 1);
        continue;
      }
      const m = faltas[p.status];
      if (!m) continue;
      comFalta.add(p.playerId);
      if (!m.has(p.playerId)) m.set(p.playerId, []);
      m.get(p.playerId).push(t.date);
    }
  }
  const lista = (m) =>
    [...m.entries()]
      .map(([playerId, datas]) => ({ playerId, datas: datas.sort().reverse() }))
      .sort((a, b) => b.datas.length - a.datas.length);
  return {
    treinos: n,
    faltas: Object.fromEntries(Object.entries(faltas).map(([k, m]) => [k, lista(m)])),
    sempre: [...presentes.keys()].filter((id) => !comFalta.has(id)),
  };
}

/* ---------------------------------------------------------- calendário */

/**
 * As semanas de um mês, para desenhar a grelha: começa à segunda-feira e
 * preenche com os dias dos meses vizinhos.
 *
 * @param {number} ano
 * @param {number} mes 0–11
 * @returns {string[][]} semanas de 7 dias `AAAA-MM-DD`
 */
export function grelhaDoMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1);
  const recuo = (primeiro.getDay() + 6) % 7; // segunda = 0
  let dia = isoDia(new Date(ano, mes, 1 - recuo));
  const semanas = [];
  do {
    const semana = [];
    for (let i = 0; i < 7; i++) {
      semana.push(dia);
      dia = somarDias(dia, 1);
    }
    semanas.push(semana);
  } while (deIsoDia(dia).getMonth() === mes);
  return semanas;
}

/** O estado de um treino para o calendário. */
export function estadoNoCalendario(treino, temPresencas, hoje) {
  if (treino.status === ESTADO_TREINO.CANCELADO) return 'cancelado';
  if (temPresencas) return 'realizado';
  if (treino.date < hoje) return 'porMarcar';
  return 'agendado';
}
