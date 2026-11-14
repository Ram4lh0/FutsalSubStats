// lib/partilhado.js — jogo com registo partilhado: a parte que lê e escreve a
// base local. As regras estão em domain/partilhado.js (e o formato em
// domain/partilha.js).
//
// Nada aqui apaga o que quer que seja: juntar acrescenta eventos ao jogo dos
// Tempos e arquiva o dos Registos; desfazer acrescenta uma marca e repõe-o.

import * as db from './data/local.js';
import { events, loadMatch, matches } from './data/repository.js';
import { emDemo } from './demoEstado.js';
import { hasRemote } from './supabase/client.js';
import * as A from '../domain/actions.js';
import {
  MOTIVO,
  PAPEL,
  VERSAO,
  eventosDaFusao,
  impedimento,
  jogosParaJuntar,
  lerPartilha,
  mesmoJogo,
  planoDeFusao,
  resumoDosRegistos,
  resumoDosTempos,
} from '../domain/partilhado.js';
import { foulsTotal } from '../domain/reducer.js';

/** Um erro com a chave do dicionário, para o ecrã o dizer na língua certa. */
function erro(chave, texto) {
  const e = new Error(texto);
  e.chave = chave;
  return e;
}

/**
 * O jogo já chegou inteiro ao servidor? Linha do jogo, convocatória e eventos.
 *
 * Sem servidor configurado (a app só no aparelho) não há para onde sincronizar:
 * conta como sincronizado, senão nunca se podia juntar nada.
 */
export async function jogoSincronizado(matchId) {
  if (!hasRemote() || emDemo()) return true;
  const jogo = await db.get(db.STORES.matches, matchId);
  if (!jogo || jogo.dirty) return false;
  const convocados = await db.byIndex(db.STORES.matchSquad, 'by_match', matchId);
  if (convocados.some((c) => c.dirty)) return false;
  const evs = await db.byIndex(db.STORES.matchEvents, 'by_match', matchId);
  return evs.every((e) => e.syncedAt);
}

/** Um jogo carregado, com o que os eventos dizem da partilha e se já subiu. */
export async function carregarPartilhado(matchId) {
  const jogo = await loadMatch(matchId);
  if (!jogo) return null;
  return {
    ...jogo,
    partilha: lerPartilha(jogo.events),
    sincronizado: await jogoSincronizado(matchId),
  };
}

/** O que um jogo tem, para mostrar antes de juntar. */
export function oQueTem(jogo) {
  if (jogo.partilha.papel === PAPEL.TEMPOS) return { papel: PAPEL.TEMPOS, ...resumoDosTempos(jogo.state) };
  return { papel: PAPEL.REGISTOS, ...resumoDosRegistos(jogo.state) };
}

/**
 * Volta a escrever o resumo na linha do jogo (resultado, intervalo, faltas),
 * como no apito final. Depois de juntar ou desfazer, os golos e as faltas do
 * jogo mudaram, e é esta fotografia que quem olha para a tabela `matches` vê.
 */
async function gravarResumoDoJogo(matchId) {
  const jogo = await loadMatch(matchId);
  if (!jogo) return;
  await matches.gravarCampos(
    matchId,
    {
      teamFouls: foulsTotal(jogo.state, 'US'),
      teamScore: jogo.state.teamScore,
      opponentScore: jogo.state.opponentScore,
      halftimeTeamScore: jogo.state.halftimeTeamScore,
      halftimeOpponentScore: jogo.state.halftimeOpponentScore,
    },
    { sync: 'defer' }
  );
}

/**
 * Os jogos que se podem juntar a este (papel contrário, mesmo escalão,
 * adversário e dia). Cada um traz `motivo`: null se já pode ser juntado, ou
 * porque ainda não (não terminado, não sincronizado).
 */
export async function listarParaJuntar(matchId) {
  const meu = await carregarPartilhado(matchId);
  if (!meu?.partilha.papel) return { meu, lista: [] };
  const doEscalao = (await matches.listByTeam(meu.match.teamId)).filter((m) => mesmoJogo(meu.match, m));
  const candidatos = [];
  for (const m of doEscalao) {
    const c = await carregarPartilhado(m.id);
    if (c?.partilha.papel) candidatos.push(c);
  }
  return { meu, lista: jogosParaJuntar(meu, candidatos) };
}

/** Qual dos dois é o dos Tempos (a base) e qual o dos Registos. */
function arrumar(a, b) {
  if (a.partilha.papel === PAPEL.TEMPOS && b.partilha.papel === PAPEL.REGISTOS) return { base: a, outro: b };
  if (a.partilha.papel === PAPEL.REGISTOS && b.partilha.papel === PAPEL.TEMPOS) return { base: b, outro: a };
  throw erro('partilhado.erro.papeis', 'Só se junta um jogo de Tempos com um de Registos.');
}

/**
 * Carrega os dois jogos e confirma que se podem juntar. Devolve a base (Tempos),
 * o outro (Registos) e o plano: o que a fusão vai fazer, para mostrar antes.
 */
export async function prepararFusao(idA, idB) {
  const a = await carregarPartilhado(idA);
  const b = await carregarPartilhado(idB);
  if (!a || !b) throw erro('partilhado.erro.naoEncontrado', 'Jogo não encontrado.');
  const { base, outro } = arrumar(a, b);
  if (!mesmoJogo(base.match, outro.match)) {
    throw erro('partilhado.erro.diferentes', 'Os dois jogos não são do mesmo escalão, adversário e dia.');
  }
  for (const j of [base, outro]) {
    const motivo = j.match.archivedAt ? MOTIVO.JA_FUNDIDO : impedimento(j);
    if (motivo) throw erro(`partilhado.erro.${motivo}`, `O jogo não se pode juntar: ${motivo}.`);
  }
  const n = Math.max(base.partilha.nFusoes, outro.partilha.nFusoes) + 1;
  return { base, outro, n, plano: planoDeFusao({ base, outro, n }) };
}

/**
 * Junta os dois jogos. A base é sempre o dos Tempos.
 *
 * A ordem é a que aguenta uma falha a meio: primeiro os registos (com ids
 * fixos, repetir não duplica), depois a marca no jogo base — é ela que os põe
 * à vista — e só no fim a marca e o arquivo do jogo dos Registos.
 */
export async function juntar(idA, idB) {
  const { base, outro, n, plano } = await prepararFusao(idA, idB);
  for (const ev of plano.eventos) await events.append(ev, { sync: 'defer' });
  await events.append(
    A.correction(base.state, {
      partilhado: { v: VERSAO, fusao: { com: outro.match.id, n, registos: plano.total } },
    }),
    { sync: 'defer' }
  );
  await events.append(
    A.correction(outro.state, { partilhado: { v: VERSAO, fundidoEm: { jogo: base.match.id, n } } }),
    { sync: 'defer' }
  );
  await gravarResumoDoJogo(base.match.id);
  await matches.gravarCampos(outro.match.id, { archivedAt: Date.now() });
  return { baseId: base.match.id, outroId: outro.match.id, n, plano };
}

/**
 * Desfaz a fusão de um jogo base: os registos copiados deixam de contar e o
 * jogo dos Registos volta à lista, como estava.
 */
export async function desfazerFusao(baseId, userId = null) {
  const base = await carregarPartilhado(baseId);
  const fusao = base?.partilha.fusao;
  if (!fusao) throw erro('partilhado.erro.semFusao', 'Este jogo não está juntado a nenhum.');
  const { n, com } = fusao;

  // A marca é o que conta (o que uma fusão desfeita copiou deixa de se ler).
  // Marcar esses eventos também como desfeitos serve as versões antigas da app.
  await events.append(A.correction(base.state, { partilhado: { v: VERSAO, fusaoDesfeita: { n } } }), {
    sync: 'defer',
  });
  for (const ev of eventosDaFusao(base.events, n)) {
    await events.markUndone(ev.id, userId, { sync: 'defer' });
  }

  await gravarResumoDoJogo(baseId);

  const outro = await carregarPartilhado(com);
  if (outro) {
    if (outro.partilha.fundidoEm) {
      await events.append(
        A.correction(outro.state, { partilhado: { v: VERSAO, fusaoDesfeita: { n } } }),
        { sync: 'defer' }
      );
    }
    await matches.gravarCampos(com, { archivedAt: null });
  }
  return { baseId, outroId: com, n, reposto: Boolean(outro) };
}

/** Papel Registos: dar o jogo por terminado (ou voltar a abri-lo). */
export async function terminarRegistos(matchId, agora = Date.now()) {
  const jogo = await loadMatch(matchId);
  if (!jogo) return null;
  await events.append(A.correction(jogo.state, { partilhado: { v: VERSAO, terminado: agora } }, agora), {
    sync: 'defer',
  });
  return loadMatch(matchId);
}

export async function reabrirRegistos(matchId) {
  const jogo = await loadMatch(matchId);
  if (!jogo) return null;
  await events.append(A.correction(jogo.state, { partilhado: { v: VERSAO, reaberto: true } }), {
    sync: 'defer',
  });
  return loadMatch(matchId);
}
