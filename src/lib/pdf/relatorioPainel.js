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
  penaltisDaEpoca,
  penaltisDoAtleta,
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
  rematesAdvSimplesDaEpoca,
  recuperacoesPorJogador,
  perdasDaEpoca,
  perdasPorJogador,
  passesDaEpoca,
  passesPorJogador,
  bolasParadas,
  REGISTOS_BOLA_PARADA,
  defesasPorJogador,
  extrasDaEquipa,
  extrasDoAtleta,
  mapaDaEpoca,
  mapaDoAtleta,
  parteDosJogos,
} from '../../domain/dashboard.js';
import { clubAggregate } from '../../domain/stats.js';
import { REGISTO } from '../../domain/registos.js';
import { dayLabel } from '../format.js';
import { t } from '../i18n/index.js';
import { dataParaNome, nomeLimpo } from '../ficheiros.js';
import { COR, COR_TIPO_GOLO, Relatorio, linhaDeFiltros, novoRelatorio } from './base.js';
import { mapaDosRemates, mapasDosRegistos, tabelaExtrasAtleta, tabelaExtrasEquipa } from './registos.js';

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
 * @param {string} [p.jogo]       texto do jogo escolhido, se houver
 * @param {string} [p.atletaId]
 * @returns {Promise<Blob>}
 */
export async function gerarPdfPainel({ club, team, entries, roster = [], parteMs, provas = [], tipo = '', jogo = '', atletaId = '' }) {
  const atleta = atletaId ? painelDoAtleta(entries, roster, atletaId, { parteMs, quantos: 1000 }) : null;
  const jogos = formaRecente(entries, { quantos: Infinity });

  const filtros = linhaDeFiltros([
    [t('painelv.competicao'), provas.length ? provas.join(', ') : t('painelv.todas')],
    [t('painelv.tipoDeJogo'), tipo],
    [t('painelv.jogo'), jogo],
    [t('pdf.jogos'), t('pdf.jogosTerminados', { n: jogos.length })],
  ]);
  const r = await novoRelatorio({
    titulo: atleta ? t('pdf.painel.tituloAtleta', { nome: atleta.jogador.name }) : t('pdf.painel.titulo'),
    subtitulo: [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [filtros],
  });

  if (atletaId) {
    if (atleta) relatorioDoAtleta(r, atleta, { entries, atletaId });
    else r.paragrafo(t('painelv.atletaSemDados'));
  } else if (!jogos.length && !minutosPorJogador(entries, roster).linhas.length) {
    r.paragrafo(t('painelv.semJogos'));
  } else {
    relatorioDaEquipa(r, { entries, roster, parteMs, jogos });
  }
  return r.terminar();
}

/* ------------------------------------------------------- ficha do atleta */

/** O nome do ficheiro: `atleta-tomas-ferreira-2026-11-07.pdf`. */
export function nomePdfAtleta(player) {
  return `atleta-${nomeLimpo(player?.name, 'atleta')}-${dataParaNome()}.pdf`;
}

/**
 * O PDF da ficha do jogador: tudo o que a ficha mostra, pela mesma ordem.
 *
 * Primeiro o resumo do topo (jogos, tempo, golos, assistências, saldo em campo
 * e, no guarda-redes, os sofridos), depois o relatório do atleta do painel —
 * minutos, utilização, impacto, períodos, disciplina, os registos extra que o
 * escalão aponta (tabela, eficácia dos remates, mapa) e os jogos. Os registos
 * só entram quando há dados deles, por isso o PDF muda de clube para clube
 * como a ficha.
 *
 * @param {object} p
 * @param {object} p.player
 * @param {object} p.club
 * @param {object} p.team
 * @param {Array}  p.entries   todos os jogos do escalão
 * @param {Array}  p.roster
 * @param {string} [p.subtitulo] posição, pé e estado, já em texto
 * @param {string} [p.foto]    data URL PNG/JPEG da foto do atleta
 * @returns {Promise<Blob>}
 */
export async function gerarPdfAtleta({ player, club, team, entries, roster = [], subtitulo = '', foto = null }) {
  const atletaId = player.id;
  const parteMs = parteDosJogos(entries);
  const atleta = painelDoAtleta(entries, roster.length ? roster : [player], atletaId, { parteMs, quantos: 1000 });
  const agg = clubAggregate(entries, [player]).perPlayer[atletaId] || null;
  const jogos = formaRecente(entries, { quantos: Infinity });

  const r = await novoRelatorio({
    titulo: `#${player.shirtNumber} ${player.name}`,
    subtitulo: subtitulo || [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [linhaDeFiltros([[t('pdf.jogos'), t('pdf.jogosTerminados', { n: jogos.length })]])],
    foto,
  });

  if (agg && agg.matches) {
    const gr = Boolean(atleta?.guardaRedes) || agg.conceded > 0;
    const porJogo = (n) => t('pdf.porJogo', { n: (agg.matches ? n / agg.matches : 0).toFixed(1) });
    const saldo = agg.goalShare - agg.concededShare;
    r.secao(t('pdf.resumo'), 20);
    r.cartoes(
      [
        { rotulo: t('stats.jogos'), valor: agg.matches },
        { rotulo: t('ficha.tempoDeJogo'), valor: fmt(agg.courtMs), detalhe: t('ficha.mediaPorJogo', { tempo: fmt(agg.avgCourtPerMatchMs) }) },
        gr ? { rotulo: t('stats.sofridos'), valor: agg.conceded, detalhe: porJogo(agg.conceded) } : null,
        { rotulo: t('stats.golos'), valor: agg.goals, detalhe: porJogo(agg.goals) },
        { rotulo: t('stats.assistencias'), valor: agg.assists, detalhe: porJogo(agg.assists) },
        {
          rotulo: t('ficha.saldoEmCampo'),
          valor: comSinal(saldo),
          tom: saldo > 0 ? 'win' : saldo < 0 ? 'loss' : undefined,
          detalhe: `${agg.goalShare} / ${agg.concededShare}`,
        },
      ],
      { porLinha: gr ? 3 : 5 }
    );
  }

  if (atleta && atleta.utilizacao.convocado) relatorioDoAtleta(r, atleta, { entries, atletaId });
  else r.paragrafo(t('ficha.semConvocatorias'));
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
    if (faixas.prolongamento?.marcados || faixas.prolongamento?.sofridos) {
      r.paragrafo(
        `${t('prolong.noProlongamento')} ${t('prolong.golosProlongamento', {
          marcados: faixas.prolongamento.marcados,
          sofridos: faixas.prolongamento.sofridos,
          jogos: faixas.prolongamento.jogos,
        })}`
      );
    }
  } else {
    r.paragrafo(t('painelv.semGolos'));
  }

  // ------------------------------------------ prolongamentos e penáltis
  const desempates = penaltisDaEpoca(entries);
  if (desempates.jogos || desempates.prolongamentos) {
    r.secao(t('penaltis.painelTitulo'), 30);
    r.cartoes([
      { rotulo: t('penaltis.painelProlongamentos'), valor: String(desempates.prolongamentos) },
      {
        rotulo: t('penaltis.painelDesempates'),
        valor: String(desempates.jogos),
        detalhe: t('penaltis.painelGanhosPerdidos', { g: desempates.ganhos, p: desempates.perdidos }),
      },
      { rotulo: t('penaltis.painelNossos'), valor: `${desempates.nossos.golos}/${desempates.nossos.batidos}` },
      {
        rotulo: t('penaltis.painelDefesas'),
        valor: `${desempates.deles.defendidos}/${desempates.deles.batidos}`,
        detalhe: t('penaltis.painelDelesGolo', { n: desempates.deles.golos }),
      },
    ]);
    if (desempates.porJogador.length) {
      r.tabela({
        colunas: [
          { titulo: t('stats.jogador'), peso: 3 },
          { titulo: t('penaltis.batidos'), alinhar: 'right' },
          { titulo: t('penaltis.res.GOLO'), alinhar: 'right' },
          { titulo: t('penaltis.res.DEFENDIDO'), alinhar: 'right' },
          { titulo: t('penaltis.res.FORA'), alinhar: 'right' },
        ],
        linhas: desempates.porJogador.map((j) => [`#${j.number} ${j.name}`, j.batidos, j.golos, j.defendidos, j.fora]),
      });
    }
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

/**
 * Os registos extra (add-ons) da época, pela ordem dos blocos do painel
 * (components/registos/BlocosDaEpoca.jsx) — só com jogos que os tenham.
 */
function registosExtra(r, entries) {
  const tipos = registosDaEpoca(entries);
  if (!tipos.size) return;
  tabelaExtrasEquipa(r, extrasDaEquipa(entries), tipos);
  if (tipos.has(REGISTO.REMATE)) {
    const efi = eficacia(entries);
    const remates = rematesPorJogo(entries);
    r.secao(t('registos.epoca.remates'), 30);
    // Com remates só contados (sem resultado), "à baliza" e eficácia saem.
    r.cartoes([
      { rotulo: t('registos.epoca.rematesPorJogo'), valor: efi.rematesPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: efi.jogos }) },
      ...(efi.semResultado
        ? []
        : [
            { rotulo: t('registos.col.aBaliza'), valor: efi.aBaliza, detalhe: t('registos.aBalizaDe', { n: efi.aBaliza, total: efi.remates }) },
            {
              rotulo: t('registos.epoca.eficacia'),
              valor: efi.percentagem == null ? '—' : `${efi.percentagem}%`,
              detalhe: t('registos.epoca.eficaciaDetalhe', { golos: efi.golos, aBaliza: efi.aBaliza }),
            },
          ]),
    ]);
    r.barrasH(
      remates.map((j) => ({
        rotulo: j.adversario,
        valor: j.remates,
        texto: j.semResultado ? String(j.remates) : t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
      }))
    );
  }
  if (tipos.has(REGISTO.REMATE_ADV)) {
    const adv = rematesAdvDaEpoca(entries);
    r.secao(t('registos.epoca.rematesAdv'), 30);
    r.cartoes([
      { rotulo: t('registos.epoca.rematesAdvPorJogo'), valor: adv.rematesPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: adv.jogos }) },
      ...(adv.semResultado
        ? []
        : [
            { rotulo: t('registos.col.aBaliza'), valor: adv.aBaliza, detalhe: t('registos.aBalizaDe', { n: adv.aBaliza, total: adv.remates }) },
            {
              rotulo: t('registos.epoca.defesaGR'),
              valor: adv.percentagemDefesa == null ? '—' : `${adv.percentagemDefesa}%`,
              detalhe: t('registos.epoca.defesaGRDetalhe', { defendidos: adv.defendidos, aBaliza: adv.aBaliza }),
            },
          ]),
    ]);
    r.barrasH(
      rematesAdvPorJogo(entries).map((j) => ({
        rotulo: j.adversario,
        valor: j.remates,
        texto: j.semResultado ? String(j.remates) : t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
      })),
      { cor: COR.vermelho }
    );
  }
  if (tipos.has(REGISTO.REMATE_ADV_SIMPLES)) {
    const adv = rematesAdvSimplesDaEpoca(entries);
    r.secao(t('registos.epoca.rematesAdv'), 30);
    r.cartoes([
      { rotulo: t('registos.epoca.rematesAdvPorJogo'), valor: adv.rematesPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: adv.jogos }) },
      { rotulo: t('registos.total.remate_adv_simples'), valor: adv.remates },
    ]);
    r.barrasH(
      adv.porJogo.map((j) => ({ rotulo: j.adversario, valor: j.remates, texto: String(j.remates) })),
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
  const defesas = defesasPorJogador(entries);
  if (defesas.length) {
    r.secao(t('registos.epoca.defesasGR'), 20);
    r.barrasH(
      defesas.map((j) => ({
        rotulo: `${j.number ?? ''} ${j.name}`.trim(),
        valor: j.defesas,
        texto: t('registos.epoca.perdasDetalhe', { n: j.defesas, porJogo: j.porJogo.toFixed(1) }),
      })),
      { cor: COR.info }
    );
  }
  if (tipos.has(REGISTO.PERDA_BOLA)) {
    const equipa = perdasDaEpoca(entries);
    r.secao(t('registos.epoca.perdas'), 30);
    r.cartoes([
      { rotulo: t('registos.epoca.perdasPorJogo'), valor: equipa.perdasPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: equipa.jogos }) },
      { rotulo: t('registos.total.perda_bola'), valor: equipa.perdas },
    ]);
    r.barrasH(
      perdasPorJogador(entries).map((j) => ({
        rotulo: `${j.number ?? ''} ${j.name}`.trim(),
        valor: j.perdas,
        texto: t('registos.epoca.perdasDetalhe', { n: j.perdas, porJogo: j.porJogo.toFixed(1) }),
      })),
      { cor: COR.vermelho }
    );
    r.paragrafo(t('registos.epoca.perdasNota'));
  }
  if (tipos.has(REGISTO.PASSE_FALHADO)) {
    const equipa = passesDaEpoca(entries);
    r.secao(t('registos.epoca.passes'), 30);
    r.cartoes([
      { rotulo: t('registos.epoca.passesPorJogo'), valor: equipa.passesPorJogo.toFixed(1), detalhe: t('painelv.emJogos', { n: equipa.jogos }) },
      { rotulo: t('registos.total.passe_falhado'), valor: equipa.passes },
    ]);
    r.barrasH(
      passesPorJogador(entries).map((j) => ({
        rotulo: `${j.number ?? ''} ${j.name}`.trim(),
        valor: j.passes,
        texto: t('registos.epoca.perdasDetalhe', { n: j.passes, porJogo: j.porJogo.toFixed(1) }),
      })),
      { cor: COR.vermelho }
    );
  }
  if (REGISTOS_BOLA_PARADA.some((id) => tipos.has(id))) {
    const bp = bolasParadas(entries);
    const golosEm = (x) => t('registos.golosEm', { golos: x.golos, total: x.total });
    r.secao(t('registos.epoca.bolasParadas'), 30);
    const cartoes = [];
    if (tipos.has(REGISTO.CANTO)) {
      cartoes.push({
        rotulo: t('registos.bp.cantos'),
        valor: bp.cantos.percentagem == null ? '—' : `${bp.cantos.percentagem}%`,
        detalhe: t('registos.bp.cantosDetalhe', { golos: bp.cantos.golos, cantos: bp.cantos.cantos }),
      });
    }
    if (tipos.has(REGISTO.PENALTI)) {
      cartoes.push({ rotulo: t('registos.total.penalti'), valor: `${bp.penaltis.golos}/${bp.penaltis.total}`, detalhe: golosEm(bp.penaltis) });
    }
    if (tipos.has(REGISTO.PENALTI_ADV)) {
      cartoes.push({ rotulo: t('registos.total.penalti_adv'), valor: `${bp.penaltisAdv.golos}/${bp.penaltisAdv.total}`, detalhe: golosEm(bp.penaltisAdv) });
    }
    if (tipos.has(REGISTO.LIVRE_10M)) {
      cartoes.push(
        { rotulo: t('registos.bp.livres10Nos'), valor: `${bp.livres10.US.golos}/${bp.livres10.US.total}`, detalhe: golosEm(bp.livres10.US) },
        { rotulo: t('registos.bp.livres10Eles'), valor: `${bp.livres10.THEM.golos}/${bp.livres10.THEM.total}`, detalhe: golosEm(bp.livres10.THEM) }
      );
    }
    if (cartoes.length) r.cartoes(cartoes, { porLinha: Math.min(4, cartoes.length) });
    r.barrasH(
      [
        ['bp.golosCanto', 'CANTO'],
        ['bp.golosLivre', 'LIVRE'],
        ['bp.golosPenalti', 'PENALTI'],
        ['bp.golos10m', 'LIVRE_10M'],
      ].map(([chave, tipo]) => ({
        rotulo: t(`registos.${chave}`),
        valor: bp.golos.US[tipo],
        texto: `${bp.golos.US[tipo]} ${t('registos.bp.marcados')} · ${bp.golos.THEM[tipo]} ${t('registos.bp.sofridos')}`,
      })),
      { cor: COR.info }
    );
    r.paragrafo(t('registos.bp.nota'));
  }

  // Os mapas: os remates (nossos e deles) e os outros registos com sítio.
  mapaDosRemates(r, {
    nossos: mapaDaEpoca(entries, REGISTO.REMATE),
    deles: mapaDaEpoca(entries, REGISTO.REMATE_ADV),
    rotuloNos: t('registos.calor.nos'),
    rotuloEles: t('registos.calor.eles'),
  });
  mapasDosRegistos(r, {
    titulo: t('registos.epoca.mapa'),
    registos: [REGISTO.RECUPERACAO, REGISTO.DEFESA_GR, REGISTO.FORA],
    pontosDe: (id) => (tipos.has(id) ? mapaDaEpoca(entries, id) : []),
  });
}

/* ------------------------------------------------------------- atleta */

function relatorioDoAtleta(r, dados, { entries, atletaId }) {
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

  registosDoAtleta(r, entries, atletaId);
  penaltisDoAtletaPdf(r, entries, atletaId);

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

/**
 * Os registos extra do atleta (o que o painel e a ficha mostram): a tabela de
 * cada registo, os remates com eficácia e o mapa dele (remates, recuperações
 * e defesas com sítio marcado).
 */
function registosDoAtleta(r, entries, atletaId) {
  const extras = extrasDoAtleta(entries, atletaId);
  if (!tabelaExtrasAtleta(r, extras)) return;
  const { por, remates } = extras;
  if (por.remate?.jogos > 0 && remates.comResultado) {
    r.secao(t('registos.total.remate'), 20);
    r.cartoes([
      { rotulo: t('registos.total.remate'), valor: por.remate.n, detalhe: t('painelv.emJogos', { n: por.remate.jogos }) },
      {
        rotulo: t('registos.col.aBaliza'),
        valor: remates.percentagemBaliza == null ? '—' : `${remates.percentagemBaliza}%`,
        detalhe: t('registos.aBalizaDe', { n: remates.aBaliza, total: remates.comResultado }),
      },
      {
        rotulo: t('registos.ext.pctGolo'),
        valor: remates.percentagemGolo == null ? '—' : `${remates.percentagemGolo}%`,
        detalhe: t('registos.golosEm', { golos: remates.golos, total: remates.comResultado }),
      },
    ]);
  }
  mapasDosRegistos(r, {
    titulo: t('registos.ext.mapaAtleta'),
    registos: [REGISTO.REMATE, REGISTO.RECUPERACAO, REGISTO.DEFESA_GR],
    pontosDe: (id) => (por[id]?.jogos > 0 ? mapaDoAtleta(entries, id, atletaId) : []),
  });
}

/**
 * A baliza dos penáltis do desempate do atleta: para onde bateu e, se foi
 * guarda-redes, para onde remataram e para onde se atirou (09/11/2026).
 */
function penaltisDoAtletaPdf(r, entries, atletaId) {
  const p = penaltisDoAtleta(entries, atletaId);
  if (!p.batidos.length && !p.comoGr.length) return;
  const tipoDe = (res) => (res === 'GOLO' ? 'golo' : res === 'DEFENDIDO' ? 'defendido' : 'fora');
  const gap = 10;
  const w = Math.min(80, (r.largura - gap) / 2);
  r.secao(t('penaltis.atletaTitulo'), 20 + Relatorio.alturaBaliza(w));
  const cartoes = [];
  if (p.batidos.length) {
    cartoes.push({
      rotulo: t('penaltis.atletaBatidos'),
      valor: `${p.golos}/${p.batidos.length}`,
      detalhe: t('penaltis.atletaDetalhe', { d: p.defendidos, f: p.fora }),
    });
  }
  if (p.comoGr.length) {
    cartoes.push({
      rotulo: t('penaltis.atletaDefesas'),
      valor: `${p.grDefendidos}/${p.comoGr.length}`,
      detalhe: t('penaltis.atletaGrDetalhe', { g: p.grGolos, f: p.grFora }),
    });
  }
  cartoes.push({ rotulo: t('penaltis.atletaJogos'), valor: String(p.jogos) });
  r.cartoes(cartoes);
  const balizas = [];
  if (p.batidos.length) {
    balizas.push([t('penaltis.atletaOndeBateu'), p.batidos.map((k, i) => ({ zona: k.zona, tipo: tipoDe(k.resultado), texto: i + 1 }))]);
  }
  if (p.comoGr.length) {
    balizas.push([
      t('penaltis.atletaComoGr'),
      [
        ...p.comoGr.map((k, i) => ({ zona: k.zona, tipo: tipoDe(k.resultado), texto: i + 1 })),
        ...p.comoGr.map((k, i) => (k.mergulho ? { zona: k.mergulho, tipo: 'gr', texto: i + 1 } : null)).filter(Boolean),
      ],
    ]);
  }
  const alt = Relatorio.alturaBaliza(w);
  r.garantir(alt + 10);
  balizas.forEach(([titulo, marcas], i) => {
    r.baliza(marcas, { x: r.M + i * (w + gap), y: r.y, w, titulo });
  });
  r.y += alt + 2;
  r.legenda([
    { cor: COR.verde, texto: t('penaltis.res.GOLO') },
    { cor: COR.info, texto: t('penaltis.res.DEFENDIDO') },
    { cor: COR.vermelho, texto: t('penaltis.res.FORA') },
  ]);
  r.paragrafo(t('penaltis.vistaDeQuemRemata'));
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
