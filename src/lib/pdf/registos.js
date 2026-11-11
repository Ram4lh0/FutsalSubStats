// lib/pdf/registos.js — os registos extra (add-ons) no papel: o mapa dos
// remates (um campo nosso, outro do adversário), os campos das recuperações,
// defesas e foras, e as tabelas de registos extra. Partilhado pelo PDF do
// jogo e pelo do painel (equipa e atleta), para saírem iguais nos dois.
//
// No ecrã a legenda filtra (toca-se numa categoria); no papel não há toque,
// por isso a legenda leva o número de cada categoria e o campo mostra tudo.

import {
  COR_REGISTO,
  COR_RESULTADO,
  COR_RESULTADO_ADV,
  REGISTO,
  RESULTADO_REMATE,
} from '../../domain/registos.js';
import { t } from '../i18n/index.js';
import { linhasExtrasAtleta, linhasExtrasEquipa } from '../registosExtras.js';
import { COR, Relatorio } from './base.js';

const RESULTADOS = Object.values(RESULTADO_REMATE);
const ESPACO = 6; // entre dois campos lado a lado
const um = (n) => (n == null ? '—' : n.toFixed(1));

/** Os registos que têm ponto no campo, pela ordem dos filtros da app. */
export const REGISTOS_NO_MAPA = [REGISTO.REMATE, REGISTO.REMATE_ADV, REGISTO.RECUPERACAO, REGISTO.PERDA_BOLA, REGISTO.DEFESA_GR, REGISTO.LANCAMENTO_GR, REGISTO.FORA];

/** A legenda de um campo, com o número de pontos de cada categoria. */
export function itensDaLegenda(registo, pontos) {
  const conta = (f) => pontos.filter(f).length;
  if (registo === REGISTO.REMATE || registo === REGISTO.REMATE_ADV) {
    const adv = registo === REGISTO.REMATE_ADV;
    const itens = RESULTADOS.map((o) => ({
      cor: (adv ? COR_RESULTADO_ADV : COR_RESULTADO)[o],
      texto: t(`registos.${adv ? 'resultadoAdv' : 'resultado'}.${o}`),
      n: conta((p) => p.resultado === o),
      forma: adv && o !== RESULTADO_REMATE.GOLO ? 'anel' : 'bola',
    }));
    // Remates só com sítio (o escalão não pede o resultado): sem legenda.
    return itens.some((i) => i.n) ? itens : [];
  }
  if (registo === REGISTO.FORA) {
    return [
      { cor: COR_REGISTO.fora_US, texto: t('registos.legenda.forasNossos'), n: conta((p) => p.equipa !== 'THEM'), forma: 'losango' },
      { cor: COR_REGISTO.fora_THEM, texto: t('registos.legenda.forasDeles'), n: conta((p) => p.equipa === 'THEM'), forma: 'losango' },
    ];
  }
  if (registo === REGISTO.DEFESA_GR) {
    return [{ cor: COR_REGISTO.defesa_gr, texto: t('registos.legenda.defesas'), n: pontos.length, forma: 'quadrado' }];
  }
  if (registo === REGISTO.LANCAMENTO_GR) {
    return [{ cor: COR_REGISTO.lancamento_gr, texto: t('registos.legenda.lancamentosGR'), n: pontos.length }];
  }
  if (registo === REGISTO.PERDA_BOLA) {
    return [{ cor: COR_REGISTO.perda_bola, texto: t('registos.legenda.perdas'), n: pontos.length }];
  }
  return [{ cor: COR_REGISTO.recuperacao, texto: t('registos.legenda.recuperacoes'), n: pontos.length }];
}

/**
 * Campos lado a lado, dois por linha: `[{titulo, conta, registo, pontos}]`.
 * Cada um com o título por cima e a legenda por baixo. Um campo sozinho fica
 * ao centro, com a mesma largura (no papel, um campo da largura toda é
 * enorme e não diz mais nada).
 */
export function camposLadoALado(r, campos) {
  const lista = campos.filter((c) => c.pontos.length);
  if (!lista.length) return;
  const w = (r.largura - ESPACO) / 2;
  const alturaCampo = Relatorio.alturaCampo(w);
  for (let i = 0; i < lista.length; i += 2) {
    const linha = lista.slice(i, i + 2);
    const alturaLegenda = 14;
    r.garantir(6 + alturaCampo + alturaLegenda);
    const topo = r.y;
    let fundo = topo;
    linha.forEach((c, j) => {
      const x = linha.length === 1 ? r.M + (r.largura - w) / 2 : r.M + j * (w + ESPACO);
      r.sub(c.titulo, x, topo, w * 0.55);
      if (c.conta) {
        r.fonte(7.5).cor(COR.muted);
        r.texto(c.conta, x + w, topo, { alinhar: 'right', maximo: w * 0.45 });
      }
      const yCampo = topo + 1.5;
      const h = r.campo(c.pontos, { x, y: yCampo, w });
      const itens = itensDaLegenda(c.registo, c.pontos);
      const hl = itens.length ? r.legendaPontos(itens, { x, y: yCampo + h, largura: w }) : 0;
      fundo = Math.max(fundo, yCampo + h + hl);
    });
    r.y = fundo + 4;
  }
}

/** O mapa dos remates: os nossos num campo, os do adversário noutro. */
export function mapaDosRemates(r, { nossos, deles, rotuloNos, rotuloEles }) {
  if (!nossos.length && !deles.length) return;
  const w = (r.largura - ESPACO) / 2;
  r.secao(t('registos.calor.titulo'), Relatorio.alturaCampo(w) + 18);
  const golos = (ps) => ps.filter((p) => p.resultado === RESULTADO_REMATE.GOLO).length;
  camposLadoALado(r, [
    {
      titulo: rotuloNos,
      conta: t('registos.calor.conta', { n: nossos.length, golos: golos(nossos) }),
      registo: REGISTO.REMATE,
      pontos: nossos,
    },
    {
      titulo: rotuloEles,
      conta: t('registos.calor.contaAdv', { n: deles.length, golos: golos(deles) }),
      registo: REGISTO.REMATE_ADV,
      pontos: deles,
    },
  ]);
  r.paragrafo(t('registos.calor.nota'));
}

/**
 * Os campos dos outros registos com sítio (recuperações, defesas, foras), um
 * por registo. `pontosDe(id)` dá os pontos de cada um.
 */
export function mapasDosRegistos(r, { titulo, registos, pontosDe }) {
  const campos = registos
    .map((id) => {
      const pontos = pontosDe(id);
      return { titulo: t(`registos.total.${id}`), conta: String(pontos.length), registo: id, pontos };
    })
    .filter((c) => c.pontos.length);
  if (!campos.length) return;
  const w = (r.largura - ESPACO) / 2;
  r.secao(titulo, Relatorio.alturaCampo(w) + 18);
  camposLadoALado(r, campos);
}

/** A tabela dos registos extra de um atleta (a da ficha do jogador). */
export function tabelaExtrasAtleta(r, extras) {
  const linhas = linhasExtrasAtleta(extras, t);
  if (!linhas.length) return false;
  r.secao(t('registos.ext.titulo'), 25);
  r.tabela({
    colunas: [
      { titulo: t('registos.ext.registo'), peso: 2.2 },
      { titulo: t('registos.ext.total'), largura: 16, alinhar: 'right' },
      { titulo: t('registos.ext.porJogo'), largura: 18, alinhar: 'right' },
      { titulo: t('registos.ext.por10'), largura: 20, alinhar: 'right' },
      { titulo: t('registos.ext.detalhe'), peso: 3.4 },
    ],
    linhas: linhas.map(({ nome, r: x, detalhe }) => [nome, x.n, um(x.porJogo), um(x.por10), { texto: detalhe, cor: COR.muted }]),
  });
  r.paragrafo(t('registos.ext.nota'));
  return true;
}

/** A tabela-resumo dos registos da equipa (o topo dos blocos da época). */
export function tabelaExtrasEquipa(r, extras, tipos) {
  const linhas = linhasExtrasEquipa(extras, tipos, t);
  if (!linhas.length) return;
  r.secao(t('registos.ext.equipa'), 25);
  r.tabela({
    colunas: [
      { titulo: t('registos.ext.registo'), peso: 2.2 },
      { titulo: t('registos.ext.total'), largura: 16, alinhar: 'right' },
      { titulo: t('registos.ext.porJogo'), largura: 18, alinhar: 'right' },
      { titulo: t('registos.ext.detalhe'), peso: 3.6 },
    ],
    linhas: linhas.map(({ nome, total, porJogo, detalhe }) => [nome, total, um(porJogo), { texto: detalhe, cor: COR.muted }]),
  });
  r.paragrafo(t('registos.ext.notaEquipa'));
}
