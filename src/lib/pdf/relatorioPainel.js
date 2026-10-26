// lib/pdf/relatorioPainel.js — o painel da época em PDF.
//
// Os mesmos números dos blocos do painel (domain/dashboard.js), pela mesma
// ordem, com os mesmos filtros que estão escolhidos no ecrã. Com um atleta
// escolhido, sai o relatório desse atleta — tal como o painel muda de forma.
//
// Há duas diferenças de propósito em relação ao ecrã. A forma mostra os dez
// últimos jogos (no telemóvel o painel mostra cinco, por falta de largura), e
// no fim vai a lista de todos os jogos do filtro: no papel não há toque para
// abrir o resumo, por isso quem lê precisa de saber de que jogos se fala.

import { fmt } from '../../domain/clock.js';
import {
  minutosPorJogador,
  golosPorFaixa,
  golosPorTipo,
  formaRecente,
  casaEFora,
  curvaDeForma,
  disciplina,
  painelDoAtleta,
  registosDaEpoca,
  eficacia,
  rematesPorJogo,
  rematesAdvDaEpoca,
  rematesAdvPorJogo,
  recuperacoesPorJogador,
} from '../../domain/dashboard.js';
import { REGISTO } from '../../domain/registos.js';
import { dayLabel } from '../format.js';
import { t } from '../i18n/index.js';
import { dataParaNome, nomeLimpo } from '../ficheiros.js';
import { COR, COR_TIPO_GOLO, Relatorio, linhaDeFiltros, novoRelatorio } from './base.js';

const etiquetasDe = (faixas) => faixas.map((f) => `${Math.round(f.deMs / 60_000)}'`);
const comSinal = (n) => (n > 0 ? `+${n}` : String(n));
const fmtAssinado = (ms) => `${ms > 0 ? '+' : ms < 0 ? '-' : ''}${fmt(Math.abs(ms))}`;
const letra = (r) => ({ W: t('painelv.v'), D: t('painelv.e'), L: t('painelv.d') })[r] || '';
const corResultado = (r) => (r === 'W' ? COR.verdeTinta : r === 'L' ? COR.vermelho : COR.muted);

/** O nome do ficheiro: `painel-sub-15-2026-10-26.pdf` (ou com o atleta). */
export function nomePdfPainel(team, atleta) {
  const partes = ['painel', nomeLimpo(team?.name, 'escalao')];
  if (atleta) partes.push(nomeLimpo(atleta, 'atleta'));
  return `${partes.join('-')}-${dataParaNome()}.pdf`;
}

/**
 * Gera o PDF do painel.
 *
 * @param {object} p
 * @param {object} p.club
 * @param {object} p.team
 * @param {Array}  p.entries      os jogos já filtrados (`filtrar`), como no ecrã
 * @param {Array}  p.roster
 * @param {number} p.parteMs      duração da parte (`parteDosJogos`)
 * @param {string[]} [p.provas]   nomes das competições escolhidas (vazio = todas)
 * @param {string} [p.tipo]       texto do tipo de jogo escolhido, se houver
 * @param {string} [p.atletaId]
 * @returns {Promise<Blob>}
 */
export async function gerarPdfPainel({ club, team, entries, roster = [], parteMs, provas = [], tipo = '', atletaId = '' }) {
  const atleta = atletaId ? painelDoAtleta(entries, roster, atletaId, { parteMs, quantos: 1000 }) : null;
  const jogos = formaRecente(entries, { quantos: Infinity });

  const filtros = linhaDeFiltros([
    [t('painelv.competicao'), provas.length ? provas.join(', ') : t('painelv.todas')],
    [t('painelv.tipoDeJogo'), tipo],
    [t('pdf.jogos'), t('pdf.jogosTerminados', { n: jogos.length })],
  ]);
  const r = await novoRelatorio({
    titulo: atleta ? t('pdf.painel.tituloAtleta', { nome: atleta.jogador.name }) : t('pdf.painel.titulo'),
    subtitulo: [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [filtros],
  });

  if (atletaId) {
    if (atleta) relatorioDoAtleta(r, atleta);
    else r.paragrafo(t('painelv.atletaSemDados'));
  } else if (!jogos.length && !minutosPorJogador(entries, roster).linhas.length) {
    r.paragrafo(t('painelv.semJogos'));
  } else {
    relatorioDaEquipa(r, { entries, roster, parteMs, jogos });
  }
  return r.terminar();
}

/* ------------------------------------------------------------- equipa */

function relatorioDaEquipa(r, { entries, roster, parteMs, jogos }) {
  const min = minutosPorJogador(entries, roster);
  const lados = casaEFora(entries);
  const disc = disciplina(entries);
  const faixas = golosPorFaixa(entries, { parteMs });
  const forma = formaRecente(entries, { quantos: 10 });
  const curva = curvaDeForma(entries, { quantos: 10 });

  // --------------------------------------------------------------- resumo
  const soma = (k) => lados.casa[k] + lados.fora[k];
  const dif = soma('golosA') - soma('golosContra');
  r.secao(t('pdf.resumo'), 20);
  r.cartoes([
    { rotulo: t('pdf.jogos'), valor: soma('jogos') },
    { rotulo: `${t('painelv.v')} / ${t('painelv.e')} / ${t('painelv.d')}`, valor: `${soma('v')} / ${soma('e')} / ${soma('d')}` },
    { rotulo: t('pdf.golosMarcadosSofridos'), valor: `${soma('golosA')}–${soma('golosContra')}` },
    { rotulo: t('painelv.difCurta'), valor: comSinal(dif), tom: dif > 0 ? 'win' : dif < 0 ? 'loss' : undefined },
  ]);

  // ---------------------------------------------------- rotação e minutos
  r.secao(t('painelv.minutos'), 20);
  if (min.linhas.length) {
    r.barrasH(
      min.linhas.map((l) => ({ rotulo: `${l.number ?? ''} ${l.name}`.trim(), valor: l.ms, texto: fmt(l.ms), alerta: l.abaixo })),
      { referencia: min.media, rotuloReferencia: `${t('painelv.media')} · ${fmt(min.media)}` }
    );
    const abaixo = min.linhas.filter((l) => l.abaixo);
    r.paragrafo(
      abaixo.length
        ? t('painelv.aBaixoDaMedia', { nomes: abaixo.map((l) => l.name).join(', ') })
        : t('painelv.rotacaoEquilibrada'),
      { cor: abaixo.length ? COR.vermelho : COR.muted }
    );
  } else {
    r.paragrafo(t('stats.semDados'));
  }

  // ---------------------------------------------------- golos por período
  r.secao(t('painelv.quando'), Relatorio.alturaColunas() + 10);
  if (faixas.comDados) {
    partesLadoALado(r, faixas.primeira, faixas.segunda, {});
    r.legenda([
      { cor: COR.verde, texto: t('painelv.marcados') },
      { cor: COR.vermelho, texto: t('painelv.sofridos') },
    ]);
    r.paragrafo(t('pdf.notaFaixas', { n: faixas.jogos }));
  } else {
    r.paragrafo(t('painelv.semGolos'));
  }

  // -------------------------------------------------------- tipos de golo
  tiposDeGoloLadoALado(r, golosPorTipo(entries), golosPorTipo(entries, 'THEM'));

  // --------------------------------------------------- forma e resultados
  r.secao(t('painelv.forma'), 40);
  if (forma.length) {
    r.fitaForma(forma);
    r.escadaForma(curva.pontos);
    const lado = (l) => ({
      valor: `${l.v} / ${l.e} / ${l.d}`,
      detalhe: t('pdf.golosLado', { a: l.golosA, c: l.golosContra }),
    });
    r.cartoes(
      [
        { rotulo: t('painelv.emCasa'), ...lado(lados.casa) },
        { rotulo: t('painelv.foraDeCasa'), ...lado(lados.fora) },
      ],
      { porLinha: 2 }
    );
  } else {
    r.paragrafo(t('painelv.semJogos'));
  }

  // --------------------------------------------------- disciplina e faltas
  r.secao(t('painelv.disciplina'), 30);
  if (disc.jogos) {
    r.cartoes([
      { rotulo: t('painelv.faltasPorJogo'), valor: disc.mediaPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: disc.jogos }) },
      { rotulo: t('painelv.sofridasPorJogo'), valor: disc.mediaSofridasPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: disc.jogos }) },
      {
        rotulo: t('painelv.partesComCinco'),
        valor: `${disc.percentagemNoLimite}%`,
        detalhe: t('painelv.vezesEmPartes', { n: disc.noLimite, total: disc.partes }),
        tom: disc.percentagemNoLimite >= 50 ? 'loss' : undefined,
      },
    ]);
    if (disc.jogadores.length) {
      r.sub(t('painelv.tabelaFaltas'));
      r.y += 2;
      r.tabela({
        colunas: [
          { titulo: t('stats.numero'), largura: 12, alinhar: 'right' },
          { titulo: t('stats.jogador'), peso: 3 },
          { titulo: t('painelv.faltasFeitas'), alinhar: 'right' },
          { titulo: t('painelv.faltasSofridas'), alinhar: 'right' },
          { titulo: t('stats.amarelos'), alinhar: 'right' },
          { titulo: t('stats.vermelhos'), alinhar: 'right' },
        ],
        linhas: disc.jogadores.map((j) => [j.number ?? '', j.name, j.faltas, j.sofridas, j.amarelos, j.vermelhos]),
      });
    }
    if (!disc.comAutor) r.paragrafo(t('painelv.semAutor'));
  } else {
    r.paragrafo(t('painelv.semFaltas'));
  }

  registosExtra(r, entries);

  // --------------------------------------------------------------- jogos
  r.secao(t('pdf.jogos'), 20);
  if (jogos.length) {
    r.tabela({
      colunas: [
        { titulo: t('lista.data'), largura: 20 },
        { titulo: t('nome.adversario'), peso: 4 },
        { titulo: t('lista.local'), peso: 1.4 },
        { titulo: t('lista.resultado'), largura: 24, alinhar: 'center' },
        { titulo: '', largura: 10, alinhar: 'center' },
      ],
      // Do mais recente para o mais antigo, como a lista de jogos da app.
      linhas: [...jogos].reverse().map((j) => [
        dayLabel(j.quando),
        j.adversario,
        j.casa ? t('painelv.emCasa') : t('painelv.foraDeCasa'),
        `${j.nossos}–${j.deles}`,
        { texto: letra(j.resultado), cor: corResultado(j.resultado), negrito: true },
      ]),
    });
  } else {
    r.paragrafo(t('painelv.semJogos'));
  }
}

/** Remates, eficácia e recuperações — só com jogos que os tenham registado. */
function registosExtra(r, entries) {
  const tipos = registosDaEpoca(entries);
  if (tipos.has(REGISTO.REMATE)) {
    const efi = eficacia(entries);
    const remates = rematesPorJogo(entries);
    r.secao(t('registos.epoca.remates'), 30);
    r.cartoes([
      { rotulo: t('registos.epoca.rematesPorJogo'), valor: efi.rematesPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: efi.jogos }) },
      { rotulo: t('registos.col.aBaliza'), valor: efi.aBaliza, detalhe: t('registos.aBalizaDe', { n: efi.aBaliza, total: efi.remates }) },
      {
        rotulo: t('registos.epoca.eficacia'),
        valor: efi.percentagem == null ? '—' : `${efi.percentagem}%`,
        detalhe: t('registos.epoca.eficaciaDetalhe', { golos: efi.golos, aBaliza: efi.aBaliza }),
      },
    ]);
    r.barrasH(
      remates.map((j) => ({
        rotulo: j.adversario,
        valor: j.remates,
        texto: t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
      }))
    );
  }
  if (tipos.has(REGISTO.REMATE_ADV)) {
    const adv = rematesAdvDaEpoca(entries);
    r.secao(t('registos.epoca.rematesAdv'), 30);
    r.cartoes([
      { rotulo: t('registos.epoca.rematesAdvPorJogo'), valor: adv.rematesPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: adv.jogos }) },
      { rotulo: t('registos.col.aBaliza'), valor: adv.aBaliza, detalhe: t('registos.aBalizaDe', { n: adv.aBaliza, total: adv.remates }) },
      {
        rotulo: t('registos.epoca.defesaGR'),
        valor: adv.percentagemDefesa == null ? '—' : `${adv.percentagemDefesa}%`,
        detalhe: t('registos.epoca.defesaGRDetalhe', { defendidos: adv.defendidos, aBaliza: adv.aBaliza }),
      },
    ]);
    r.barrasH(
      rematesAdvPorJogo(entries).map((j) => ({
        rotulo: j.adversario,
        valor: j.remates,
        texto: t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
      })),
      { cor: COR.vermelho }
    );
  }
  if (tipos.has(REGISTO.RECUPERACAO)) {
    const recup = recuperacoesPorJogador(entries);
    r.secao(t('registos.epoca.recuperacoes'), 20);
    r.barrasH(
      recup.map((j) => ({
        rotulo: `${j.number ?? ''} ${j.name}`.trim(),
        valor: j.recuperacoes,
        texto:
          j.por10 == null
            ? String(j.recuperacoes)
            : t('registos.epoca.recupDetalhe', { n: j.recuperacoes, por10: j.por10.toFixed(1) }),
      })),
      { cor: COR.info }
    );
    r.paragrafo(t('registos.epoca.recupNota'));
  }
}

/* ------------------------------------------------------------- atleta */

function relatorioDoAtleta(r, dados) {
  const min = dados.minutos;
  const u = dados.utilizacao;
  const imp = dados.impacto;
  const disc = dados.disciplina;
  const gr = dados.guardaRedes;

  r.secao(t('painelv.atletaMinutos', { nome: dados.jogador.name }), 30);
  r.cartoes([
    { rotulo: t('stats.tempoTotal'), valor: fmt(min.totalMs) },
    { rotulo: t('painelv.mediaAtleta'), valor: fmt(min.mediaJogadorMs) },
    {
      rotulo: t('painelv.diferencaMedia'),
      valor: fmtAssinado(min.diferencaMs),
      tom: min.diferencaMs < 0 ? 'loss' : min.diferencaMs > 0 ? 'win' : undefined,
    },
  ]);
  r.barrasH([
    { rotulo: dados.jogador.name, valor: min.totalMs, texto: fmt(min.totalMs), alerta: min.abaixo },
    { rotulo: t('painelv.mediaTempoTotalPlantel'), valor: min.mediaEquipaMs, texto: fmt(min.mediaEquipaMs), cor: COR.cinzento },
  ]);

  r.secao(t('painelv.utilizacao'), 20);
  r.cartoes(
    [
      { rotulo: t('painelv.convocado'), valor: u.convocado, detalhe: t('painelv.emJogos', { n: u.jogos }) },
      { rotulo: t('painelv.utilizado'), valor: u.utilizado, detalhe: `${u.percentagemUtilizacao}%` },
      { rotulo: t('painelv.titular'), valor: u.titular },
      { rotulo: t('painelv.entrouBanco'), valor: u.banco },
      { rotulo: t('painelv.mediaEntrada'), valor: fmt(u.mediaEntradaMs) },
    ],
    { porLinha: 5 }
  );

  r.secao(t('painelv.impacto'), 20);
  r.cartoes(
    [
      { rotulo: t('stats.golos'), valor: imp.golos },
      { rotulo: t('stats.assistencias'), valor: imp.assistencias },
      { rotulo: t('painelv.golosEquipaEmCampo'), valor: imp.golosEquipa },
      { rotulo: t('painelv.sofridosEquipaEmCampo'), valor: imp.sofridosEquipa },
      { rotulo: t('painelv.saldoComAtleta'), valor: comSinal(imp.saldo), tom: imp.saldo > 0 ? 'win' : imp.saldo < 0 ? 'loss' : undefined },
      gr ? { rotulo: t('painelv.sofridosBaliza'), valor: imp.sofridosBaliza } : null,
    ],
    { porLinha: 3 }
  );

  r.secao(t(gr ? 'painelv.sofridosBalizaPeriodo' : 'painelv.golosAssistenciasPeriodo'), Relatorio.alturaColunas(!gr) + 10);
  if (dados.periodos.comDados) {
    partesLadoALado(r, dados.periodos.primeira, dados.periodos.segunda, {
      chaveA: gr ? 'sofridosBaliza' : 'golos',
      chaveB: gr ? null : 'assistencias',
      corA: gr ? COR.vermelho : COR.verde,
      corB: COR.info,
    });
    r.legenda(
      gr
        ? [{ cor: COR.vermelho, texto: t('painelv.sofridosBaliza') }]
        : [
            { cor: COR.verde, texto: t('stats.golos') },
            { cor: COR.info, texto: t('stats.assistencias') },
          ]
    );
  } else {
    r.paragrafo(t(gr ? 'painelv.semSofridosBaliza' : 'painelv.semGolosAtleta'));
  }

  r.secao(t('painelv.disciplina'), 20);
  if (disc.jogos) {
    r.cartoes([
      { rotulo: t('painelv.faltasFeitas'), valor: disc.faltas, detalhe: t('pdf.porJogo', { n: disc.faltasPorJogo.toFixed(1) }) },
      { rotulo: t('painelv.faltasSofridas'), valor: disc.sofridas, detalhe: t('pdf.porJogo', { n: disc.sofridasPorJogo.toFixed(1) }) },
      { rotulo: t('stats.amarelos'), valor: disc.amarelos, tom: disc.amarelos ? 'draw' : undefined },
      { rotulo: t('stats.vermelhos'), valor: disc.vermelhos, tom: disc.vermelhos ? 'loss' : undefined },
    ]);
  } else {
    r.paragrafo(t('painelv.semFaltasAtleta'));
  }

  r.secao(t('pdf.jogos'), 20);
  if (dados.ultimos.length) {
    const estado = (j) =>
      !j.convocado
        ? t('painelv.naoConvocado')
        : !j.utilizado
          ? t('painelv.naoUtilizado')
          : j.titular
            ? t('painelv.titular')
            : t('painelv.entrou');
    r.tabela({
      colunas: [
        { titulo: t('lista.data'), largura: 17 },
        { titulo: t('nome.adversario'), peso: 3 },
        { titulo: t('lista.resultado'), largura: 20, alinhar: 'center' },
        { titulo: t('lista.estado'), peso: 1.8 },
        { titulo: t('stats.tempoTotal'), largura: 22, alinhar: 'right' },
        { titulo: t('stats.golos'), largura: 15, alinhar: 'right' },
        { titulo: t('stats.assistencias'), largura: 15, alinhar: 'right' },
        { titulo: t('stats.faltas'), largura: 15, alinhar: 'right' },
      ],
      linhas: dados.ultimos.map((j) => [
        dayLabel(j.quando),
        j.adversario,
        { texto: `${letra(j.resultado)}  ${j.nossos}–${j.deles}`, cor: corResultado(j.resultado) },
        { texto: estado(j), cor: j.utilizado ? COR.texto : COR.muted },
        fmt(j.minutosMs),
        j.golos,
        j.assistencias,
        j.faltas,
      ]),
    });
  } else {
    r.paragrafo(t('painelv.semJogos'));
  }
}

/* ------------------------------------------------------------- comuns */

/** A 1.ª e a 2.ª parte lado a lado, cada uma com as suas colunas. */
export function partesLadoALado(r, primeira, segunda, opcoes) {
  const comBaixo = opcoes.chaveB !== null;
  const alt = Relatorio.alturaColunas(comBaixo);
  r.garantir(alt + 6);
  const gap = 10;
  const w = (r.largura - gap) / 2;
  const etiquetas = etiquetasDe(primeira);
  [
    [t('painelv.primeiraParte'), primeira],
    [t('painelv.segundaParte'), segunda],
  ].forEach(([titulo, faixas], i) => {
    const x = r.M + i * (w + gap);
    r.sub(titulo, x, r.y, w);
    r.colunasEspelhadas(faixas, etiquetas, { x, y: r.y + 2, w, ...opcoes });
  });
  r.y += alt + 4;
}

/** Os tipos de golo marcados e sofridos, dois donuts lado a lado. */
export function tiposDeGoloLadoALado(r, marcados, sofridos, titulo = t('painelv.tiposDeGolo')) {
  const fatias = (lista) =>
    lista.map((f) => ({ ...f, rotulo: t(`golos.tipo.${f.chave}`), cor: COR_TIPO_GOLO[f.chave] || COR.cinzento }));
  const a = fatias(marcados);
  const b = fatias(sofridos);
  const alt = Math.max(Relatorio.alturaDonut(a), Relatorio.alturaDonut(b));
  r.secao(titulo, alt + 6);
  if (![...a, ...b].some((f) => f.valor > 0)) {
    r.paragrafo(t('painelv.semGolosClassificados'));
    return;
  }
  const gap = 10;
  const w = (r.largura - gap) / 2;
  [
    [t('painelv.marcados'), a],
    [t('painelv.sofridos'), b],
  ].forEach(([sub, lista], i) => {
    const x = r.M + i * (w + gap);
    r.sub(sub, x, r.y, w);
    r.donut(lista, { x, y: r.y + 2, w, vazio: t('painelv.semGolosClassificados') });
  });
  r.y += alt + 6;
}
