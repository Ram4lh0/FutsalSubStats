// domain/partilha.js — jogo com registo partilhado (add-on 'jogo-partilhado'):
// o que os eventos dizem sobre o papel e a fusão. A fusão em si está em
// domain/partilhado.js, que volta a exportar tudo o que está aqui.
//
// Duas pessoas, dois aparelhos, dois jogos: um regista os TEMPOS (campo,
// banco, substituições, relógio, períodos, golos, cartões, faltas) e o outro
// os REGISTOS (remates, recuperações, perdas, …). No fim, "Juntar" copia os
// registos para o jogo dos Tempos, que passa a ser o jogo único.
//
// Nada disto precisa de colunas novas nem de tipos de evento novos. Vive tudo
// no `metadata` de eventos que já existem, e que as versões antigas ignoram:
//
//   MATCH_CREATED    metadata.partilhado = { v, papel }
//   MATCH_CORRECTED  metadata.partilhado = { v, terminado: <hora> }      (Registos)
//                                          { v, reaberto: true }         (Registos)
//                                          { v, fusao: { com, n, registos } }   (no jogo base)
//                                          { v, fundidoEm: { jogo, n } }        (no jogo dos Registos)
//                                          { v, fusaoDesfeita: { n } }          (nos dois)
//   MATCH_CORRECTED  metadata.partilhado = { v, relogio: { acao, parte, ms, hora } }
//                    O relógio do aparelho dos Registos (ver `relogioDosRegistos`).
//   qualquer evento  metadata.hora = a hora real do aparelho (ms), posta pelo
//                    `events.append` nos jogos partilhados. A hora que o
//                    servidor guarda é a do envio, e não serve para alinhar.
//   STAT_RECORDED    metadata.fusao = { de, origem, n } nos registos copiados.
//
// Quem faz o quê (desde a 1.39.0): o aparelho dos TEMPOS fica só com o tempo —
// campo, banco, substituições, relógio, períodos — e com o cartão vermelho,
// porque uma expulsão mexe em quem está em campo. O dos REGISTOS aponta os
// golos, as faltas, os amarelos e os registos de estatística, e tem o seu
// próprio relógio (corrido ou cronometrado, com fim da 1.ª parte e início da
// 2.ª) para cada ação ficar com a parte e o minuto em que aconteceu.
//
// O jogo dos Registos nunca "começa" para o resto da app: o relógio dele vive
// em `MATCH_CORRECTED`, não nos eventos de início e fim de parte. Por isso não
// conta como jogo no painel da época nem gasta um jogo grátis. Fundido, fica arquivado (o apagar
// recuperável de sempre) com a marca `fundidoEm`; desfazer a fusão repõe-no.
//
// Funções puras, e sem depender de domain/registos.js: é este ficheiro que os
// registos consultam para saber se um registo copiado ainda vale.

import { EVENT, MATCH_STATUS } from './constants.js';

export const ADDON_PARTILHADO = 'jogo-partilhado';

/** Versão da forma do `metadata.partilhado`. Sobe só se um campo mudar de significado. */
export const VERSAO = 1;

export const PAPEL = { TEMPOS: 'TEMPOS', REGISTOS: 'REGISTOS' };

/**
 * Os eventos que levam a hora real do aparelho num jogo partilhado: os que
 * mexem no relógio (é por eles que se sabe a que minuto correspondeu cada
 * hora) e os registos (é a hora deles que se converte em minuto).
 */
const COM_HORA = new Set([
  EVENT.FIRST_HALF_STARTED,
  EVENT.CLOCK_PAUSED,
  EVENT.CLOCK_RESUMED,
  EVENT.CLOCK_ADJUSTED,
  EVENT.FIRST_HALF_FINISHED,
  EVENT.SECOND_HALF_STARTED,
  EVENT.PERIOD_FINISHED,
  EVENT.EXTRA_TIME_STARTED,
  EVENT.MATCH_FINISHED,
  EVENT.STAT_RECORDED,
  // O que o aparelho dos Registos aponta além dos registos: golos, faltas e
  // cartões.
  EVENT.TEAM_GOAL_ADDED,
  EVENT.OPPONENT_GOAL_ADDED,
  EVENT.TEAM_FOUL_ADDED,
  EVENT.OPPONENT_FOUL_ADDED,
  EVENT.YELLOW_CARD,
  EVENT.RED_CARD,
  EVENT.OPPONENT_YELLOW_CARD,
]);

export function levaHora(eventType) {
  return COM_HORA.has(eventType);
}

/** Os eventos deste jogo dizem que ele é partilhado? */
export function ePartilhado(events) {
  return (events || []).some(
    (e) => e.eventType === EVENT.MATCH_CREATED && !e.undoneAt && papelValido(e.metadata?.partilhado?.papel)
  );
}

export function papelValido(papel) {
  return papel === PAPEL.TEMPOS || papel === PAPEL.REGISTOS ? papel : null;
}

export function papelContrario(papel) {
  if (papel === PAPEL.TEMPOS) return PAPEL.REGISTOS;
  if (papel === PAPEL.REGISTOS) return PAPEL.TEMPOS;
  return null;
}

/** O `metadata` do MATCH_CREATED de um jogo partilhado. */
export function metadataDeCriacao(papel) {
  const p = papelValido(papel);
  if (!p) throw new Error(`Papel desconhecido: ${papel}`);
  return { partilhado: { v: VERSAO, papel: p } };
}

export const porOrdem = (events) =>
  (events || [])
    .filter((e) => !e.undoneAt)
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

/**
 * O que os eventos dizem sobre a partilha deste jogo.
 *
 * @returns {{
 *   papel: 'TEMPOS'|'REGISTOS'|null,   null = jogo normal
 *   terminadoEm: number|null,          só nos Registos: quando se carregou em Terminar
 *   fusao: {com:string,n:number,registos:number}|null,   no jogo base: com que jogo foi juntado
 *   fundidoEm: {jogo:string,n:number}|null,              no jogo dos Registos: onde foi parar
 *   nFusoes: number                    quantas fusões já houve (feitas ou desfeitas)
 * }}
 */
export function lerPartilha(events) {
  const out = { papel: null, terminadoEm: null, fusao: null, fundidoEm: null, nFusoes: 0 };
  for (const ev of porOrdem(events)) {
    const p = ev.metadata?.partilhado;
    if (!p || typeof p !== 'object') continue;
    if (ev.eventType === EVENT.MATCH_CREATED) {
      if (papelValido(p.papel)) out.papel = p.papel;
      continue;
    }
    if (ev.eventType !== EVENT.MATCH_CORRECTED) continue;
    if (p.terminado != null) out.terminadoEm = Number(p.terminado) || ev.createdAt || null;
    if (p.reaberto === true) out.terminadoEm = null;
    if (p.fusao?.com) {
      const n = Number(p.fusao.n) || 1;
      out.fusao = { com: p.fusao.com, n, registos: Number(p.fusao.registos) || 0 };
      out.nFusoes = Math.max(out.nFusoes, n);
    }
    if (p.fundidoEm?.jogo) {
      const n = Number(p.fundidoEm.n) || 1;
      out.fundidoEm = { jogo: p.fundidoEm.jogo, n };
      out.nFusoes = Math.max(out.nFusoes, n);
    }
    if (p.fusaoDesfeita) {
      const n = Number(p.fusaoDesfeita.n) || 0;
      if (out.fusao && (!n || out.fusao.n === n)) out.fusao = null;
      if (out.fundidoEm && (!n || out.fundidoEm.n === n)) out.fundidoEm = null;
    }
  }
  // Só um jogo partilhado tem partilha: marcas soltas num jogo normal não contam.
  if (!out.papel) return { papel: null, terminadoEm: null, fusao: null, fundidoEm: null, nFusoes: 0 };
  return out;
}

/** O jogo já acabou, do ponto de vista de quem o regista? */
export function partilhaTerminada(partilha, state) {
  if (partilha?.papel === PAPEL.TEMPOS) return state?.status === MATCH_STATUS.FINISHED;
  if (partilha?.papel === PAPEL.REGISTOS) return partilha.terminadoEm != null;
  return false;
}

/**
 * O número da fusão que está em vigor neste jogo, ou null. Um registo copiado
 * por uma fusão (`metadata.fusao.n`) só conta enquanto essa fusão valer: uma
 * fusão que ficou a meio (sem a marca final) ou que foi desfeita não deixa
 * registos à vista.
 */
export function fusaoEmVigor(events) {
  return lerPartilha(events).fusao?.n ?? null;
}

/* ------------------------------------------- o relógio do aparelho dos Registos */

export const RELOGIO = { INICIO: 'INICIO', PAUSA: 'PAUSA', RETOMA: 'RETOMA', FIM: 'FIM' };

/** Quantas partes pode ter o jogo dos Registos (duas, mais o prolongamento). */
export const MAX_PARTES = 4;

/**
 * O `metadata` de um toque no relógio dos Registos. `ms` é o tempo da parte
 * nesse instante e `hora` a hora real do aparelho.
 */
export function metadataDoRelogio(acao, { parte, ms = 0, hora }) {
  if (!Object.values(RELOGIO).includes(acao)) throw new Error(`Ação de relógio desconhecida: ${acao}`);
  return {
    partilhado: {
      v: VERSAO,
      relogio: { acao, parte: Number(parte) || 1, ms: Math.max(0, Math.round(Number(ms) || 0)), hora },
    },
  };
}

/**
 * O relógio do aparelho dos Registos, lido dos eventos.
 *
 * @returns {{
 *   parte: number,        0 = ainda não começou
 *   aCorrer: boolean,
 *   emPausa: boolean,     entre partes (ou depois da última)
 *   periodMs: number,     tempo da parte, agora
 *   matchMs: number,      tempo do jogo, agora (as partes anteriores somadas)
 *   duracoes: object      quanto durou cada parte já fechada
 * }}
 */
export function relogioDosRegistos(events, agora = Date.now()) {
  let parte = 0;
  let base = 0;
  let desde = null;
  let emPausa = false;
  const duracoes = {};
  for (const ev of porOrdem(events)) {
    if (ev.eventType !== EVENT.MATCH_CORRECTED) continue;
    const r = ev.metadata?.partilhado?.relogio;
    if (!r) continue;
    const hora = Number(r.hora) || ev.createdAt || agora;
    const ms = Math.max(0, Number(r.ms) || 0);
    if (r.acao === RELOGIO.INICIO) {
      parte = Math.min(MAX_PARTES, Number(r.parte) || parte + 1);
      base = 0;
      desde = hora;
      emPausa = false;
    } else if (parte === 0 || emPausa) {
      // Sem parte a decorrer não há relógio para parar, retomar ou fechar.
    } else if (r.acao === RELOGIO.PAUSA) {
      base = ms;
      desde = null;
    } else if (r.acao === RELOGIO.RETOMA) {
      base = ms;
      desde = hora;
    } else if (r.acao === RELOGIO.FIM) {
      base = ms;
      desde = null;
      emPausa = true;
      duracoes[parte] = ms;
    }
  }
  const periodMs = base + (desde != null ? Math.max(0, agora - desde) : 0);
  let antes = 0;
  for (let p = 1; p < parte; p += 1) antes += duracoes[p] || 0;
  return {
    parte,
    aCorrer: desde != null,
    emPausa,
    periodMs: Math.round(periodMs),
    matchMs: Math.round(antes + periodMs),
    duracoes,
  };
}

/**
 * Um evento copiado por uma fusão que não está em vigor? Esses não entram no
 * jogo: nem uma fusão que ficou a meio nem uma que foi desfeita deixam golos,
 * faltas ou cartões à vista. Devolve a função que o diz, para o reducer.
 */
export function foraDeVigor(events) {
  if (!(events || []).some((e) => e.metadata?.fusao)) return () => false;
  const emVigor = fusaoEmVigor(events);
  return (e) => Boolean(e.metadata?.fusao) && Number(e.metadata.fusao.n) !== emVigor;
}
