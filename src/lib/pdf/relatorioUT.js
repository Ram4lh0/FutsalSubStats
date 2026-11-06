// lib/pdf/relatorioUT.js — a unidade de treino em PDF, para imprimir ou mandar
// à equipa técnica.
//
// Cabeçalho com o dia e a hora, tema e objetivos, os exercícios por parte (com
// os minutos e a descrição) e, por baixo de cada exercício, as jogadas do quadro
// tático ligadas: a imagem do primeiro frame e um botão "Ver jogada animada"
// que abre o link público de 30 dias. Material e notas no fim.

import { t, localeAtual } from '../i18n/index.js';
import { COR, novoRelatorio } from './base.js';
import { minutosUT, nomeDaParte, partesDaUT } from '../data/unidadeTreino.js';
import { imagemDaJogada } from '../videoJogada.js';
import { urlDaJogada } from '../partilha.js';
import { deIsoDia, maiuscula } from '../../domain/treino.js';

// As cores das partes, pela ordem delas (as mesmas do ecrã).
const CORES_PARTE = [[245, 158, 11], COR.verde, [56, 189, 248], [167, 139, 250], [244, 63, 94], [20, 184, 166]];

/**
 * @param {object} p
 * @param {object} p.treino linha do treino (date, startTime, durationMin, location, notes)
 * @param {object} p.ut a unidade de treino
 * @param {Map<string, object>} p.jogadas jogadas do escalão por id (com `data` normalizado)
 * @returns {Promise<Blob>}
 */
export async function gerarPdfUT({ treino, ut, club, team, jogadas }) {
  const dia = maiuscula(deIsoDia(treino.date).toLocaleDateString(localeAtual(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const r = await novoRelatorio({
    titulo: ut.tema?.trim() || t('ut.aba'),
    subtitulo: [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [
      [dia, treino.startTime, t('treino.duracaoMin', { n: treino.durationMin }), treino.location].filter(Boolean).join('  ·  '),
    ],
  });
  const { doc } = r;

  // ------------------------------------------------------------ objetivos
  const objetivos = (ut.objetivos || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (objetivos.length) {
    r.secao(t('ut.objetivos'), 12);
    for (const o of objetivos) r.paragrafo(`•  ${o}`, { tamanho: 10, cor: COR.texto });
  }

  // ----------------------------------------------------------- exercícios
  const total = minutosUT(ut);
  r.secao(`${t('ut.exercicios')}  ·  ${t('ut.tempo', { n: total, total: treino.durationMin })}`, 20);
  let n = 0;
  for (const [i, parte] of partesDaUT(ut).entries()) {
    const lista = ut.exercicios.filter((e) => e.parte === parte.id);
    if (!lista.length) continue;
    const min = lista.reduce((s, e) => s + (Number(e.duracao) || 0), 0);

    // A faixa da parte, com a cor dela.
    r.garantir(22);
    r.y += 2;
    doc.setFillColor(...CORES_PARTE[i % CORES_PARTE.length]);
    doc.rect(r.M, r.y - 4.2, r.largura, 6.4, 'F');
    r.fonte(9.5, true).cor(COR.branco);
    r.texto((nomeDaParte(parte, t) || t('ut.parteSemNome')).toUpperCase(), r.M + 2.5, r.y);
    r.texto(t('treino.duracaoMin', { n: min }), r.M + r.largura - 2.5, r.y, { alinhar: 'right' });
    r.y += 7;

    for (const ex of lista) {
      n += 1;
      r.garantir(16);
      r.fonte(11, true).cor(COR.texto);
      r.texto(`${n}. ${ex.nome?.trim() || t('ut.semNome')}`, r.M, r.y, { maximo: r.largura - 22 });
      r.fonte(10, true).cor(COR.verdeTinta);
      r.texto(t('treino.duracaoMin', { n: ex.duracao }), r.M + r.largura, r.y, { alinhar: 'right' });
      r.y += 5.5;
      if (ex.descricao?.trim()) r.paragrafo(ex.descricao.trim(), { tamanho: 9.5, cor: COR.muted });

      for (const id of ex.jogadas || []) {
        const jg = jogadas.get(id);
        if (jg) desenharJogada(r, jg);
      }
      r.y += 2;
      doc.setDrawColor(...COR.linha);
      doc.setLineWidth(0.3);
      doc.line(r.M, r.y - 1, r.M + r.largura, r.y - 1);
      r.y += 3;
    }
  }
  if (!n) r.paragrafo(t('ut.semExercicios'), { tamanho: 9.5 });

  // -------------------------------------------------------- material, notas
  if (ut.material?.trim()) {
    r.secao(t('ut.material'), 10);
    r.paragrafo(ut.material.trim(), { tamanho: 10, cor: COR.texto });
  }
  if (treino.notes?.trim()) {
    r.secao(t('treino.notas'), 10);
    r.paragrafo(treino.notes.trim(), { tamanho: 10, cor: COR.texto });
  }
  return r.terminar();
}

/** A imagem da jogada com o título e, se houver link, o botão para a animação. */
function desenharJogada(r, jg) {
  const { doc } = r;
  const img = imagemDaJogada(jg.data);
  const w = Math.min(72, r.largura * 0.45);
  const h = (w * img.altura) / img.largura;
  r.garantir(h + 6);
  const y0 = r.y;
  doc.addImage(img.url, 'PNG', r.M, y0, w, h);

  const x = r.M + w + 5;
  const larg = r.largura - w - 5;
  r.fonte(7.5, true).cor(COR.muted);
  r.texto(t('ut.jogadaQuadro').toUpperCase(), x, y0 + 4);
  r.fonte(10.5, true).cor(COR.texto);
  r.texto(jg.title, x, y0 + 9.5, { maximo: larg });
  r.fonte(8.5).cor(COR.muted);
  r.texto(t(`tatica.categoria.${jg.category}`), x, y0 + 14.5, { maximo: larg });

  const ativo = jg.shareToken && jg.shareExpiresAt > Date.now();
  if (ativo) {
    const url = urlDaJogada(jg.shareToken);
    const bw = Math.min(48, larg);
    const by = y0 + 19;
    doc.setFillColor(...COR.verde);
    doc.roundedRect(x, by, bw, 8, 2, 2, 'F');
    // O "play" desenhado à mão: a Helvetica do PDF não tem o ▶.
    doc.setFillColor(...COR.branco);
    doc.triangle(x + 4, by + 2.3, x + 4, by + 5.7, x + 7, by + 4, 'F');
    r.fonte(9, true).cor(COR.branco);
    r.texto(t('ut.verAnimada'), x + 9, by + 5.3, { maximo: bw - 11 });
    doc.link(x, by, bw, 8, { url });
    r.fonte(7).cor(COR.muted);
    const ate = new Date(jg.shareExpiresAt).toLocaleDateString(localeAtual(), { day: 'numeric', month: 'short' });
    r.texto(t('ut.linkAte', { data: ate }), x, by + 12.5, { maximo: larg });
  }
  r.y = y0 + h + 4;
}
