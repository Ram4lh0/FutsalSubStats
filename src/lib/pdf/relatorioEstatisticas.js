// lib/pdf/relatorioEstatisticas.js — a aba Estatísticas do escalão em PDF.
//
// O mesmo que o ecrã (app/team/page.jsx), pela mesma ordem: o resumo (jogos,
// V/E/D, golos), os destaques (os três primeiros de cada categoria), o 5v4 e a
// tabela inteira por jogador. A tabela tem catorze colunas, por isso a página
// é horizontal — na vertical os nomes ficavam cortados a meio.

import { fmt } from '../../domain/clock.js';
import { clubAggregate, powerPlayAggregate } from '../../domain/stats.js';
import { t } from '../i18n/index.js';
import { dataParaNome, nomeLimpo } from '../ficheiros.js';
import { COR, linhaDeFiltros, novoRelatorio } from './base.js';

/** As categorias dos destaques — as mesmas de components/stats/Destaques.jsx. */
const CATEGORIAS = [
  { chave: 'goals', etiqueta: 'stats.topGolos' },
  { chave: 'assists', etiqueta: 'stats.topAssistencias' },
  { chave: 'goalShare', etiqueta: 'stats.topPartG' },
  { chave: 'concededShare', etiqueta: 'stats.topPartGS' },
];

/** `estatisticas-seniores-2026-10-26.pdf`. */
export function nomePdfEstatisticas(team) {
  return `estatisticas-${nomeLimpo(team?.name, 'escalao')}-${dataParaNome()}.pdf`;
}

/** As linhas da tabela, pela ordem do ecrã: mais minutos primeiro. */
export function linhasDasEstatisticas(entries, roster) {
  const agg = clubAggregate(entries, roster);
  const linhas = Object.values(agg.perPlayer).sort(
    (a, b) => b.courtMs - a.courtMs || a.number - b.number
  );
  return { agg, linhas };
}

/** Os três primeiros de uma coluna, com a camisola a desempatar. */
function top3(linhas, chave) {
  return [...linhas]
    .filter((p) => (p[chave] || 0) > 0)
    .sort((a, b) => (b[chave] || 0) - (a[chave] || 0) || a.number - b.number)
    .slice(0, 3);
}

/**
 * @param {{club, team, entries, roster}} p  o que a aba recebe do TeamShell
 * @returns {Promise<Blob>}
 */
export async function gerarPdfEstatisticas({ club, team, entries, roster = [] }) {
  const { agg, linhas } = linhasDasEstatisticas(entries, roster);
  const pp = powerPlayAggregate(entries);

  const r = await novoRelatorio({
    titulo: t('pdf.estatisticas.titulo'),
    subtitulo: [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [
      linhaDeFiltros([
        [t('pdf.jogos'), t('pdf.jogosTerminados', { n: agg.finished })],
        [t('pdf.estatisticas.jogadores'), String(linhas.length)],
      ]),
    ],
    orientacao: 'landscape',
  });

  // --------------------------------------------------------------- resumo
  const dif = agg.goalsFor - agg.goalsAgainst;
  r.secao(t('pdf.resumo'), 20);
  r.cartoes(
    [
      { rotulo: t('stats.jogos'), valor: agg.matches, detalhe: t('stats.terminados', { n: agg.finished }) },
      { rotulo: t('stats.ved'), valor: `${agg.wins} / ${agg.draws} / ${agg.losses}` },
      { rotulo: t('painelv.marcados'), valor: agg.goalsFor },
      { rotulo: t('painelv.sofridos'), valor: agg.goalsAgainst },
      {
        rotulo: t('painelv.difCurta'),
        valor: dif > 0 ? `+${dif}` : String(dif),
        tom: dif > 0 ? 'win' : dif < 0 ? 'loss' : null,
      },
    ],
    { porLinha: 5 }
  );

  if (!linhas.length) {
    r.paragrafo(t('stats.semJogadores'));
    return r.terminar();
  }

  // ------------------------------------------------------------ destaques
  // Uma linha por categoria e os três primeiros lado a lado: lê-se como os
  // cartões do ecrã, sem gastar uma página em quatro caixas.
  r.secao(t('pdf.estatisticas.destaques'), 30);
  const lugar = (p, chave) => (p ? `${p.name} (${p[chave]})` : '—');
  r.tabela({
    colunas: [
      { titulo: t('pdf.estatisticas.categoria'), peso: 2 },
      { titulo: '1.º', peso: 2 },
      { titulo: '2.º', peso: 2 },
      { titulo: '3.º', peso: 2 },
    ],
    linhas: CATEGORIAS.map(({ chave, etiqueta }) => {
      const tres = top3(linhas, chave);
      return [{ texto: t(etiqueta), negrito: true }, lugar(tres[0], chave), lugar(tres[1], chave), lugar(tres[2], chave)];
    }),
  });

  // ------------------------------------------------------------------ 5v4
  if (pp.jogosCom) {
    r.secao('5v4', 20);
    r.cartoes(
      [
        { rotulo: t('resumo.tempo5v4'), valor: fmt(pp.totalMs), detalhe: t('stats.periodos5v4', { n: pp.periodos, jogos: pp.jogosCom }) },
        { rotulo: t('stats.golosEm5v4'), valor: pp.golosA },
        { rotulo: t('stats.sofridosEm5v4'), valor: pp.golosContra },
        {
          rotulo: t('stats.percentagem5v4'),
          valor: `${pp.percentagemJogos}%`,
        },
      ],
      { porLinha: 4 }
    );
  }

  // ---------------------------------------------------- tabela por jogador
  r.secao(t('stats.porJogador'), 40);
  const num = (titulo) => ({ titulo, alinhar: 'right' });
  r.tabela({
    tamanho: 7.4,
    colunas: [
      { titulo: t('stats.numero'), largura: 10, alinhar: 'right' },
      { titulo: t('stats.jogador'), largura: 52 },
      num(t('stats.jogos')),
      num(t('stats.golos')),
      num(t('stats.assistencias')),
      num(t('stats.partG')),
      num(t('stats.partGS')),
      num(t('stats.sofridos')),
      num(t('stats.faltas')),
      num(t('stats.faltasSofridas')),
      num(t('stats.amarelos')),
      num(t('stats.vermelhos')),
      { titulo: t('stats.tempoTotal'), alinhar: 'right', peso: 1.4 },
      { titulo: t('stats.mediaPorJogo'), alinhar: 'right', peso: 1.4 },
    ],
    linhas: linhas.map((p) => [
      p.number ?? '',
      p.name,
      p.matches,
      p.goals,
      p.assists,
      p.goalShare,
      p.concededShare,
      p.conceded,
      p.fouls,
      p.foulsSuffered,
      p.yellows ? { texto: p.yellows, cor: [180, 120, 0] } : 0,
      p.reds ? { texto: p.reds, cor: COR.vermelho } : 0,
      fmt(p.courtMs),
      fmt(p.avgCourtPerMatchMs),
    ]),
  });
  r.paragrafo(
    [
      `${t('stats.partG')} ${t('stats.partGTitulo')}`,
      `${t('stats.partGS')} ${t('stats.partGSTitulo')}`,
      `${t('stats.sofridos')} ${t('stats.sofridosTitulo')}`,
    ].join('  ·  '),
    { tamanho: 7 }
  );

  return r.terminar();
}
