// lib/presencasExport.js — as presenças dos treinos em Excel e em PDF.
//
// Exporta o que o ecrã de presenças está a mostrar: o período escolhido
// (época, 30, 14 ou 7 dias) e a ordem da tabela. Duas partes em cada ficheiro:
//
//   · a grelha treino a treino — uma linha por atleta, uma coluna por treino,
//     com a cor de cada estado (a mesma dos botões da app);
//   · as contas por atleta — treinos, presenças, cada tipo de falta e a
//     percentagem —, com o total da equipa e a assiduidade de cada período.
//
// Só contam os treinos que contam no ecrã (realizados, não cancelados, com
// presenças marcadas), para os números baterem certo com o que se vê.

import {
  ESTADOS_PRESENCA,
  PRESENCA,
  deIsoDia,
  estatisticasPresencas,
  linhasDePresenca,
  periodosDePresenca,
  treinosContados,
} from '../domain/treino.js';
import { t, localeAtual } from './i18n/index.js';
import { dataParaNome, nomeLimpo } from './ficheiros.js';
import { COR, agoraTexto, novoRelatorio } from './pdf/base.js';
import { gerarXlsx } from './xlsx.js';

/** Abaixo disto a percentagem sai a vermelho — o mesmo limite do ecrã. */
const LIMITE_BAIXO = 70;
const PERIODOS = ['epoca', 'mes', 'quinzena', 'semana'];

/** As cores de cada estado, as dos botões (src/app/estilos/, `.tpbtn--*`). */
const COR_ESTADO = {
  [PRESENCA.PRESENTE]: { fundo: COR.verde, letra: [5, 36, 15] },
  [PRESENCA.FALTA_INJUSTIFICADA]: { fundo: COR.vermelho, letra: COR.branco },
  [PRESENCA.FALTA_JUSTIFICADA]: { fundo: COR.laranja, letra: [42, 23, 0] },
  [PRESENCA.LESAO]: { fundo: COR.roxo, letra: COR.branco },
};

export const nomeFicheiroPresencas = (team, ext) =>
  `presencas-${nomeLimpo(team?.name, 'escalao')}-${dataParaNome()}.${ext}`;

/** Tudo o que os dois ficheiros precisam, contado uma vez. */
function preparar({ treinos, presencas, jogadores, hoje, periodo = 'epoca', ordem = 'assiduidade' }) {
  const periodos = periodosDePresenca(hoje);
  const p = periodos[periodo] || periodos.epoca;
  const contas = estatisticasPresencas({ treinos, presencas, de: p.de, ate: p.ate });
  const colunas = treinosContados({ treinos, presencas, de: p.de, ate: p.ate });
  const linhas = linhasDePresenca(jogadores, contas.porJogador, ordem);
  const porPeriodo = PERIODOS.map((chave) => ({
    chave,
    contas: estatisticasPresencas({ treinos, presencas, de: periodos[chave].de, ate: periodos[chave].ate }),
  }));
  // Dois treinos no mesmo dia levam a hora no cabeçalho, para se distinguirem.
  const repetidos = new Set();
  const vistos = new Set();
  for (const c of colunas) {
    if (vistos.has(c.treino.date)) repetidos.add(c.treino.date);
    vistos.add(c.treino.date);
  }
  const locale = localeAtual();
  const rotuloCurto = (tr) => {
    const dia = deIsoDia(tr.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    return repetidos.has(tr.date) && tr.startTime ? `${dia} ${tr.startTime}` : dia;
  };
  const rotuloLongo = (tr) => {
    const dia = deIsoDia(tr.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return repetidos.has(tr.date) && tr.startTime ? `${dia} ${tr.startTime}` : dia;
  };
  const dataLonga = (iso) => deIsoDia(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return {
    periodo: periodos[periodo] ? periodo : 'epoca',
    de: p.de,
    ate: p.ate,
    contas,
    colunas,
    linhas,
    porPeriodo,
    rotuloCurto,
    rotuloLongo,
    textoPeriodo: `${t(`treino.periodo.${periodos[periodo] ? periodo : 'epoca'}`)} · ${t('presencasExport.deAte', {
      de: dataLonga(p.de),
      ate: dataLonga(p.ate),
    })}`,
  };
}

const nomeJogador = (j) => j.name || '—';
const faltasDe = (s) =>
  (s?.[PRESENCA.FALTA_INJUSTIFICADA] || 0) + (s?.[PRESENCA.FALTA_JUSTIFICADA] || 0) + (s?.[PRESENCA.LESAO] || 0);

/* ---------------------------------------------------------------- Excel */

/**
 * O livro de Excel: folha "Presenças" (a grelha) e folha "Estatísticas".
 * @returns {Promise<Blob>}
 */
export async function gerarXlsxPresencas({ club, team, ...dados }) {
  const d = preparar(dados);
  const cab = { negrito: true, cor: 'FFFFFF', fundo: '16233B', borda: true, alinhar: 'center' };
  const cabEsq = { ...cab, alinhar: 'left' };
  const cel = { borda: true, alinhar: 'center' };
  const celEsq = { borda: true };
  const estiloEstado = (e) =>
    COR_ESTADO[e] ? { borda: true, alinhar: 'center', negrito: true, fundo: COR_ESTADO[e].fundo, cor: COR_ESTADO[e].letra } : { ...cel, cor: '94A3B8' };

  // --------------------------------------------------------- Presenças
  const grelha = [
    [
      { v: t('stats.numero'), estilo: cab },
      { v: t('stats.jogador'), estilo: cabEsq },
      ...d.colunas.map((c) => ({ v: d.rotuloLongo(c.treino), estilo: cab })),
    ],
  ];
  for (const { jogador } of d.linhas) {
    grelha.push([
      { v: jogador.shirtNumber != null && jogador.shirtNumber !== '' ? Number(jogador.shirtNumber) || String(jogador.shirtNumber) : '', estilo: cel },
      { v: nomeJogador(jogador), estilo: celEsq },
      ...d.colunas.map((c) => {
        const e = c.presencas.get(jogador.id);
        return { v: e ? t(`treino.curto.${e}`) : '—', estilo: estiloEstado(e) };
      }),
    ]);
  }
  // Uma linha com os presentes de cada treino: a pergunta "quantos vieram
  // àquele treino?" é a segunda que se faz a esta grelha.
  grelha.push([
    { v: '', estilo: { ...cel, fundo: 'F1F5F9' } },
    { v: t('presencasExport.presentesNoTreino'), estilo: { ...celEsq, negrito: true, fundo: 'F1F5F9' } },
    ...d.colunas.map((c) => ({
      v: [...c.presencas.values()].filter((e) => e === PRESENCA.PRESENTE).length,
      estilo: { ...cel, negrito: true, fundo: 'F1F5F9' },
    })),
  ]);
  grelha.push([]);
  grelha.push([null, { v: t('presencasExport.legenda'), estilo: { negrito: true } }]);
  for (const e of ESTADOS_PRESENCA) {
    grelha.push([{ v: t(`treino.curto.${e}`), estilo: estiloEstado(e) }, { v: t(`treino.presenca.${e}`) }]);
  }
  grelha.push([{ v: '—', estilo: estiloEstado(null) }, { v: t('presencasExport.semMarcacao') }]);

  // ------------------------------------------------------- Estatísticas
  const info = (rotulo, valor) => [{ v: rotulo, estilo: { negrito: true } }, { v: valor }];
  const est = [
    info(t('csv.clube'), club?.name || ''),
    info(t('escalao.titulo'), team?.name || ''),
    info(t('presencasExport.periodo'), d.textoPeriodo),
    info(t('presencasExport.treinos'), d.contas.treinos),
    info(t('presencasExport.geradoEm'), agoraTexto()),
    [],
  ];
  const linhaCab = est.length;
  est.push(
    [
      t('stats.numero'),
      t('stats.jogador'),
      t('presencasExport.registos'),
      t('treino.presenca.PRESENTE'),
      t('treino.presenca.FALTA_INJUSTIFICADA'),
      t('treino.presenca.FALTA_JUSTIFICADA'),
      t('treino.presenca.LESAO'),
      t('presencasExport.faltasTotal'),
      t('presencasExport.percentagem'),
    ].map((v, i) => ({ v, estilo: i === 1 ? cabEsq : cab }))
  );
  const pctCel = (v, extra = {}) =>
    v == null
      ? { v: '—', estilo: { ...cel, ...extra } }
      : { v: v / 100, estilo: { ...cel, ...extra, formato: 'pct', negrito: true, cor: v < LIMITE_BAIXO ? 'DC2626' : '15803D' } };
  for (const { jogador, s } of d.linhas) {
    est.push([
      { v: jogador.shirtNumber != null && jogador.shirtNumber !== '' ? Number(jogador.shirtNumber) || String(jogador.shirtNumber) : '', estilo: cel },
      { v: nomeJogador(jogador), estilo: celEsq },
      { v: s?.total || 0, estilo: cel },
      { v: s?.[PRESENCA.PRESENTE] || 0, estilo: cel },
      { v: s?.[PRESENCA.FALTA_INJUSTIFICADA] || 0, estilo: s?.[PRESENCA.FALTA_INJUSTIFICADA] ? { ...cel, negrito: true, cor: 'DC2626' } : cel },
      { v: s?.[PRESENCA.FALTA_JUSTIFICADA] || 0, estilo: cel },
      { v: s?.[PRESENCA.LESAO] || 0, estilo: cel },
      { v: faltasDe(s), estilo: cel },
      pctCel(s?.assiduidade),
    ]);
  }
  const eq = d.contas.equipa;
  const tot = { ...cel, negrito: true, fundo: 'F1F5F9' };
  est.push([
    { v: '', estilo: tot },
    { v: t('presencasExport.equipa'), estilo: { ...tot, alinhar: 'left' } },
    { v: eq.total, estilo: tot },
    { v: eq[PRESENCA.PRESENTE], estilo: tot },
    { v: eq[PRESENCA.FALTA_INJUSTIFICADA], estilo: tot },
    { v: eq[PRESENCA.FALTA_JUSTIFICADA], estilo: tot },
    { v: eq[PRESENCA.LESAO], estilo: tot },
    { v: faltasDe(eq), estilo: tot },
    pctCel(d.contas.assiduidade, { fundo: 'F1F5F9' }),
  ]);
  est.push([]);
  est.push([{ v: t('presencasExport.porPeriodo'), estilo: { negrito: true } }]);
  est.push(
    [
      '',
      t('presencasExport.periodo'),
      t('presencasExport.treinos'),
      t('treino.presenca.PRESENTE'),
      t('treino.presenca.FALTA_INJUSTIFICADA'),
      t('treino.presenca.FALTA_JUSTIFICADA'),
      t('treino.presenca.LESAO'),
      t('presencasExport.faltasTotal'),
      t('presencasExport.percentagem'),
    ].map((v, i) => (i === 0 ? null : { v, estilo: i === 1 ? cabEsq : cab }))
  );
  for (const { chave, contas } of d.porPeriodo) {
    const e = contas.equipa;
    est.push([
      null,
      { v: t(`treino.periodo.${chave}`), estilo: { ...celEsq, negrito: chave === d.periodo } },
      { v: contas.treinos, estilo: cel },
      { v: e[PRESENCA.PRESENTE], estilo: cel },
      { v: e[PRESENCA.FALTA_INJUSTIFICADA], estilo: cel },
      { v: e[PRESENCA.FALTA_JUSTIFICADA], estilo: cel },
      { v: e[PRESENCA.LESAO], estilo: cel },
      { v: faltasDe(e), estilo: cel },
      pctCel(contas.assiduidade),
    ]);
  }
  est.push([]);
  est.push([null, { v: t('treino.notaAssiduidade', { limite: LIMITE_BAIXO }) }]);

  const largNome = Math.min(34, Math.max(16, ...d.linhas.map((l) => nomeJogador(l.jogador).length + 2)));
  return gerarXlsx([
    {
      nome: t('presencasExport.folhaPresencas'),
      larguras: [6, largNome, ...d.colunas.map((c) => Math.max(11, d.rotuloLongo(c.treino).length + 1))],
      congelar: { linhas: 1, colunas: 2 },
      linhas: grelha,
    },
    {
      nome: t('presencasExport.folhaEstatisticas'),
      larguras: [14, Math.max(largNome, 22), 14, 12, 18, 16, 10, 14, 13],
      congelar: { linhas: linhaCab + 1, colunas: 2 },
      linhas: est,
    },
  ]);
}

/* ------------------------------------------------------------------ PDF */

/**
 * O PDF: resumo, gráfico de presença por atleta, a tabela das contas e a
 * grelha treino a treino (partida em blocos de colunas quando não cabe).
 * @returns {Promise<Blob>}
 */
export async function gerarPdfPresencas({ club, team, ...dados }) {
  const d = preparar(dados);
  // Com muitos treinos a grelha pede o papel deitado.
  const orientacao = d.colunas.length > 14 ? 'landscape' : 'portrait';
  const r = await novoRelatorio({
    titulo: t('presencasExport.tituloPdf'),
    subtitulo: [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [`${t('presencasExport.periodo')}: ${d.textoPeriodo}  ·  ${t('presencasExport.treinos')}: ${d.contas.treinos}`],
    orientacao,
  });
  const eq = d.contas.equipa;
  const pct = (v) => (v == null ? '—' : `${v}%`);

  r.secao(t('pdf.resumo'), 20);
  r.cartoes(
    [
      {
        rotulo: t('treino.ordem.assiduidade'),
        valor: pct(d.contas.assiduidade),
        tom: d.contas.assiduidade != null && d.contas.assiduidade < LIMITE_BAIXO ? 'loss' : 'win',
      },
      { rotulo: t('presencasExport.treinos'), valor: d.contas.treinos },
      { rotulo: t('treino.presenca.FALTA_INJUSTIFICADA'), valor: eq[PRESENCA.FALTA_INJUSTIFICADA], tom: eq[PRESENCA.FALTA_INJUSTIFICADA] ? 'loss' : undefined },
      { rotulo: t('treino.presenca.FALTA_JUSTIFICADA'), valor: eq[PRESENCA.FALTA_JUSTIFICADA] },
      { rotulo: t('treino.presenca.LESAO'), valor: eq[PRESENCA.LESAO] },
    ],
    { porLinha: 5 }
  );

  if (!d.contas.treinos) {
    r.paragrafo(t('treino.semPresencasNoPeriodo'));
    return r.terminar();
  }

  // ------------------------------------------------- gráfico por atleta
  r.secao(t('presencasExport.grafico'), 20);
  const comDados = d.linhas.filter((l) => l.s);
  r.barrasH(
    comDados.map(({ jogador, s }) => ({
      rotulo: `${jogador.shirtNumber ?? ''} ${nomeJogador(jogador)}`.trim(),
      valor: s.assiduidade || 0,
      texto: `${pct(s.assiduidade)}  (${s[PRESENCA.PRESENTE]}/${s.total})`,
      alerta: s.assiduidade != null && s.assiduidade < LIMITE_BAIXO,
    })),
    { referencia: d.contas.assiduidade || 0, rotuloReferencia: `${t('presencasExport.equipa')} · ${pct(d.contas.assiduidade)}` }
  );
  r.paragrafo(t('treino.notaAssiduidade', { limite: LIMITE_BAIXO }), { tamanho: 7.5 });

  // ------------------------------------------------- contas por atleta
  r.secao(t('presencasExport.folhaEstatisticas'), 20);
  const vermelhoSe = (v) => (v ? { texto: v, cor: COR.vermelho, negrito: true } : 0);
  const linhas = d.linhas.map(({ jogador, s }) => [
    jogador.shirtNumber ?? '',
    nomeJogador(jogador),
    s?.total || 0,
    s?.[PRESENCA.PRESENTE] || 0,
    vermelhoSe(s?.[PRESENCA.FALTA_INJUSTIFICADA] || 0),
    s?.[PRESENCA.FALTA_JUSTIFICADA] || 0,
    s?.[PRESENCA.LESAO] || 0,
    {
      texto: pct(s?.assiduidade),
      negrito: true,
      cor: s?.assiduidade != null && s.assiduidade < LIMITE_BAIXO ? COR.vermelho : COR.verdeTinta,
    },
  ]);
  linhas.push([
    '',
    t('presencasExport.equipa'),
    eq.total,
    eq[PRESENCA.PRESENTE],
    eq[PRESENCA.FALTA_INJUSTIFICADA],
    eq[PRESENCA.FALTA_JUSTIFICADA],
    eq[PRESENCA.LESAO],
    pct(d.contas.assiduidade),
  ]);
  r.tabela({
    colunas: [
      { titulo: t('stats.numero'), largura: 10, alinhar: 'right' },
      { titulo: t('stats.jogador'), peso: 3 },
      { titulo: t('presencasExport.registos'), alinhar: 'right' },
      { titulo: t('treino.curto.PRESENTE'), alinhar: 'right' },
      { titulo: t('treino.curto.FALTA_INJUSTIFICADA'), alinhar: 'right' },
      { titulo: t('treino.curto.FALTA_JUSTIFICADA'), alinhar: 'right' },
      { titulo: t('treino.curto.LESAO'), alinhar: 'right' },
      { titulo: t('presencasExport.percentagem'), alinhar: 'right' },
    ],
    linhas,
    destaque: new Set([linhas.length - 1]),
  });

  // --------------------------------------------- grelha treino a treino
  // Um bloco que caiba inteiro numa página não se parte entre duas — e o
  // título vai com ele, em vez de ficar sozinho no fundo da página.
  const altBloco = 6.5 + (d.linhas.length + 1) * 5.6 + 10;
  const cabeInteiro = altBloco < r.fundoUtil - 30;
  r.secao(t('presencasExport.grelha'), cabeInteiro ? altBloco + 12 : 30);
  r.legenda([
    ...ESTADOS_PRESENCA.map((e) => ({ cor: COR_ESTADO[e].fundo, texto: `${t(`treino.curto.${e}`)} ${t(`treino.presenca.${e}`)}` })),
    { cor: COR.linha, texto: t('presencasExport.semMarcacao') },
  ]);
  r.y += 1;
  const fixasW = 10 + 42;
  const colW = 10.5;
  // Quando não cabem todos os treinos na largura, a grelha parte-se em blocos
  // de colunas iguais (24 treinos com lugar para 20 dão 12 + 12, e não 20 + 4).
  const cabem = Math.max(1, Math.floor((r.largura - fixasW) / colW));
  const nBlocos = Math.ceil(d.colunas.length / cabem);
  const porBloco = Math.ceil(d.colunas.length / Math.max(1, nBlocos));
  for (let i = 0; i < d.colunas.length; i += porBloco) {
    const bloco = d.colunas.slice(i, i + porBloco);
    if (cabeInteiro) r.garantir(altBloco);
    if (nBlocos > 1) {
      r.garantir(20);
      r.sub(t('presencasExport.grelhaParte', { de: i + 1, ate: i + bloco.length, total: d.colunas.length }));
      r.y += 2.5;
    }
    r.tabela({
      tamanho: 7,
      largura: fixasW + bloco.length * colW,
      colunas: [
        { titulo: t('stats.numero'), largura: 10, alinhar: 'right' },
        { titulo: t('stats.jogador'), largura: 42 },
        ...bloco.map((c) => ({ titulo: d.rotuloCurto(c.treino), largura: colW, alinhar: 'center' })),
      ],
      linhas: [
        ...d.linhas.map(({ jogador }) => [
          jogador.shirtNumber ?? '',
          nomeJogador(jogador),
          ...bloco.map((c) => {
            const e = c.presencas.get(jogador.id);
            return e
              ? { texto: t(`treino.curto.${e}`), fundo: COR_ESTADO[e].fundo, cor: COR_ESTADO[e].letra, negrito: true }
              : { texto: '—', cor: COR.cinzento };
          }),
        ]),
        [
          '',
          { texto: t('presencasExport.presentesNoTreino'), negrito: true },
          ...bloco.map((c) => ({
            texto: [...c.presencas.values()].filter((e) => e === PRESENCA.PRESENTE).length,
            negrito: true,
          })),
        ],
      ],
    });
  }

  // ------------------------------------------------ todos os períodos
  r.secao(t('presencasExport.porPeriodo'), 20);
  r.cartoes(
    d.porPeriodo.map(({ chave, contas }) => ({
      rotulo: t(`treino.periodo.${chave}`),
      valor: pct(contas.assiduidade),
      detalhe: t(contas.treinos === 1 ? 'treino.cartaoHintUm' : 'treino.cartaoHint', {
        treinos: contas.treinos,
        fi: contas.equipa[PRESENCA.FALTA_INJUSTIFICADA],
        fj: contas.equipa[PRESENCA.FALTA_JUSTIFICADA],
        l: contas.equipa[PRESENCA.LESAO],
      }),
      tom: chave === d.periodo ? 'win' : undefined,
    }))
  );

  return r.terminar();
}
