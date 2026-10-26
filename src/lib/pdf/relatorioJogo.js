// lib/pdf/relatorioJogo.js — o resumo de um jogo em PDF.
//
// O mesmo que o CSV do resumo (lib/data/exporter.js, `matchSummaryCsv`) —
// resultado, golos, 5v4, tabela dos jogadores —, mais os gráficos do jogo
// (components/stats/GraficosDoJogo.jsx), pela mesma ordem do ecrã. O CSV é
// para quem quer os números noutro programa; o PDF é para mandar ao clube ou
// imprimir para o balneário.

import { fmt } from '../../domain/clock.js';
import { MATCH_STATUS } from '../../domain/constants.js';
import { golosPorFaixa } from '../../domain/dashboard.js';
import { amarelosAdversario, faltasPorJogador, golosPorTipoNoJogo, mediaEmCampo } from '../../domain/intervalo.js';
import { foulsInPeriod, foulsTotal } from '../../domain/reducer.js';
import { matchResult, matchStatsTable, powerPlayTotals } from '../../domain/stats.js';
import { REGISTO, RESULTADO_REMATE, resumoRegistos, temRegistos } from '../../domain/registos.js';
import { clubShort, dateLabel, homeAwayLabel, opponentShort, statusLabel } from '../format.js';
import { t } from '../i18n/index.js';
import { dataParaNome, nomeLimpo } from '../ficheiros.js';
import { COR, novoRelatorio } from './base.js';
import { partesLadoALado, tiposDeGoloLadoALado } from './relatorioPainel.js';

/** `jogo-adversario-2026-10-25.pdf`, com a data do jogo. */
export function nomePdfJogo(match) {
  const quando = match?.scheduledAt ? new Date(match.scheduledAt) : new Date();
  return `jogo-${nomeLimpo(match?.opponentName, 'adversario')}-${dataParaNome(quando)}.pdf`;
}

/**
 * @param {{club, match, state, team, competition}} p  o mesmo que o CSV recebe
 * @returns {Promise<Blob>}
 */
export async function gerarPdfJogo({ club, match, state, team, competition }) {
  const agora = Date.now();
  const tabela = matchStatsTable(state, agora);
  const pp = powerPlayTotals(state, state.elapsedMatchMs);
  const res = matchResult(state);
  const nos = clubShort(club);
  const eles = opponentShort(match);

  const r = await novoRelatorio({
    titulo: `${nos} ${state.teamScore} – ${state.opponentScore} ${eles}`,
    subtitulo: [t('jogo.vs', { adversario: match.opponentName }), dateLabel(match.scheduledAt), homeAwayLabel(match.homeOrAway)]
      .filter(Boolean)
      .join(' · '),
    info: [[club?.name, team?.name, competition?.name, statusLabel(state.status)].filter(Boolean).join(' · ')],
  });

  // --------------------------------------------------------------- resumo
  r.secao(t('pdf.resumo'), 20);
  const textoRes =
    res === 'W' ? t('resultado.vitoria') : res === 'L' ? t('resultado.derrota') : res === 'D' ? t('resultado.empate') : t('resumo.emCurso');
  r.cartoes(
    [
      {
        rotulo: t('resumo.resultado'),
        valor: `${state.teamScore} – ${state.opponentScore}`,
        detalhe: textoRes,
        tom: res === 'W' ? 'win' : res === 'L' ? 'loss' : res === 'D' ? 'draw' : undefined,
      },
      {
        rotulo: t('resumo.aoIntervalo'),
        valor: state.halftimeTeamScore == null ? '—' : `${state.halftimeTeamScore} – ${state.halftimeOpponentScore}`,
      },
      { rotulo: t('resumo.duracaoEfetiva'), valor: fmt(state.elapsedMatchMs) },
      {
        rotulo: t('resumo.faltas'),
        valor: `${foulsTotal(state, 'US')} – ${foulsTotal(state, 'THEM')}`,
        detalhe: t('resumo.faltasDetalhe', { p1: foulsInPeriod(state, 'US', 1), p2: foulsInPeriod(state, 'US', 2) }),
      },
      pp.count
        ? {
            rotulo: t('resumo.tempo5v4'),
            valor: fmt(pp.totalMs),
            detalhe: t('resumo.total5v4', {
              tempo: fmt(pp.totalMs),
              n: pp.count,
              periodos: pp.count === 1 ? t('resumo.periodo') : t('resumo.periodos'),
            }),
          }
        : null,
    ],
    { porLinha: pp.count ? 5 : 4 }
  );

  // ---------------------------------------------------------------- golos
  const nome = (id) => (id ? state.players[id]?.name || '' : '');
  const golos = state.goals || [];
  r.secao(t('resumo.golos'), 15);
  if (golos.length) {
    r.tabela({
      colunas: [
        { titulo: '#', largura: 8, alinhar: 'right' },
        { titulo: t('csv.parte'), largura: 13, alinhar: 'center' },
        { titulo: t('csv.minuto'), largura: 16, alinhar: 'right' },
        { titulo: t('csv.equipa'), peso: 1.6 },
        { titulo: t('csv.marcador'), peso: 2 },
        { titulo: t('csv.assistencia'), peso: 2 },
        { titulo: t('pdf.tipoGolo'), peso: 1.8 },
      ],
      linhas: golos.map((g, i) => {
        const nosso = g.team === 'US';
        const marcador = [nome(g.scorerId), g.ownGoal ? `(${t('csv.autogolo')})` : ''].filter(Boolean).join(' ');
        return [
          i + 1,
          g.period,
          fmt(g.matchElapsedMs),
          { texto: nosso ? nos : eles, cor: nosso ? COR.verdeTinta : COR.vermelho, negrito: true },
          marcador,
          nome(g.assistId),
          g.howScored ? t(`golos.tipo.${g.howScored}`) : '',
        ];
      }),
    });
  } else {
    r.paragrafo(state.status === MATCH_STATUS.FINISHED ? t('resumo.semGolos') : t('golos.semGolos'));
  }

  // ------------------------------------------------------------------ 5v4
  if (pp.count) {
    r.secao(t('resumo.periodos5v4'), 15);
    r.tabela({
      colunas: [
        { titulo: '#', largura: 10, alinhar: 'right' },
        { titulo: t('csv.parte'), largura: 16, alinhar: 'center' },
        { titulo: t('csv.inicio'), alinhar: 'right' },
        { titulo: t('csv.fimColuna'), alinhar: 'right' },
        { titulo: t('csv.duracao'), alinhar: 'right' },
      ],
      linhas: pp.periodos.map((x) => [
        x.numero,
        x.startPeriod,
        fmt(x.startMatchMs),
        x.open || x.endMatchMs == null ? t('resumo.fimDoJogo') : fmt(x.endMatchMs),
        fmt(x.durationMs),
      ]),
    });
  }

  // ------------------------------------------------------------- gráficos
  // Pela ordem do GraficosDoJogo: período, minutos, faltas, amarelos do
  // adversário, tipos de golo.
  const parteMs = match.periodDurationMs || 20 * 60_000;
  const faixas = golosPorFaixa([{ state: { ...state, status: MATCH_STATUS.FINISHED } }], { parteMs });
  if (faixas.comDados) {
    r.secao(t('painelv.quando'), 52);
    partesLadoALado(r, faixas.primeira, faixas.segunda, {});
    r.legenda([
      { cor: COR.verde, texto: t('painelv.marcados') },
      { cor: COR.vermelho, texto: t('painelv.sofridos') },
    ]);
  }

  const media = mediaEmCampo(tabela);
  r.secao(t('intervalo.minutos'), 20);
  r.barrasH(
    [...tabela]
      .sort((a, b) => b.courtMs - a.courtMs)
      .map((l) => ({ rotulo: `#${l.number} ${l.name}`, valor: l.courtMs, texto: fmt(l.courtMs) })),
    { referencia: media, rotuloReferencia: t('intervalo.mediaMinutos', { tempo: fmt(Math.round(media)) }) }
  );

  const faltas = faltasPorJogador(tabela);
  r.secao(t('intervalo.faltasJogador'), 12);
  if (faltas.length) {
    r.barrasH(
      faltas.map((f) => ({
        rotulo: `#${f.number} ${f.name}`,
        valor: f.fouls,
        texto: String(f.fouls),
        cor: f.emRisco ? COR.laranja : COR.verde,
      }))
    );
    if (faltas.some((f) => f.emRisco)) r.paragrafo(t('intervalo.faltasEmRisco'));
  } else {
    r.paragrafo(t('intervalo.semFaltas'));
  }

  const amarelos = amarelosAdversario(state);
  if (amarelos.length) {
    r.secao(t('intervalo.amarelosAdversario'), 12);
    r.tabela({
      colunas: [
        { titulo: t('stats.numero'), largura: 16, alinhar: 'right' },
        { titulo: '', peso: 1 },
      ],
      linhas: amarelos.map((a) => [
        `#${a.number}`,
        {
          texto: a.expulso
            ? t('intervalo.advExpulso', { tempo: fmt(a.amarelosMs[a.amarelosMs.length - 1]) })
            : t('intervalo.advAmarelo', { tempo: fmt(a.amarelosMs[0]) }),
          cor: a.expulso ? COR.vermelho : COR.texto,
        },
      ]),
    });
  }

  tiposDeGoloLadoALado(r, golosPorTipoNoJogo(state, 'US'), golosPorTipoNoJogo(state, 'THEM'), t('intervalo.tiposDeGolo'));

  // ------------------------------------------------------------ jogadores
  r.secao(t('resumo.jogadores'), 20);
  r.tabela({
    tamanho: 7.4,
    colunas: [
      { titulo: t('stats.numero'), largura: 9, alinhar: 'right' },
      { titulo: t('stats.jogador'), peso: 1 },
      { titulo: t('ficha.golosCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('ficha.assistCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('ficha.sofridosCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('intervalo.faltasCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('intervalo.faltasSofridasCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('ficha.amarelosCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('ficha.vermelhosCurto'), largura: 9, alinhar: 'right' },
      { titulo: t('ficha.emCampo'), largura: 17, alinhar: 'right' },
      { titulo: t('intervalo.entradas'), largura: 15, alinhar: 'right' },
      { titulo: t('stats.partG'), largura: 15, alinhar: 'right' },
      { titulo: t('stats.partGS'), largura: 15, alinhar: 'right' },
    ],
    linhas: tabela.map((s) => [
      s.number,
      { texto: s.expelled ? `${s.name} (${t('resumo.expulso')})` : s.name, cor: s.expelled ? COR.vermelho : COR.texto },
      s.goals,
      s.assists,
      s.conceded,
      s.fouls,
      s.foulsSuffered,
      s.yellows,
      s.reds,
      fmt(s.courtMs),
      s.entries,
      s.goalShare,
      s.concededShare,
    ]),
  });
  r.paragrafo(
    [
      `${t('ficha.golosCurto')} ${t('stats.golos')}`,
      `${t('ficha.assistCurto')} ${t('ficha.assistencias')}`,
      `${t('ficha.sofridosCurto')} ${t('stats.sofridosTitulo')}`,
      `${t('intervalo.faltasCurto')} ${t('intervalo.faltasCometidas')}`,
      `${t('intervalo.faltasSofridasCurto')} ${t('intervalo.faltasSofridas')}`,
      `${t('ficha.amarelosCurto')} ${t('ficha.cartoesAmarelos')}`,
      `${t('ficha.vermelhosCurto')} ${t('ficha.cartoesVermelhos')}`,
      `${t('stats.partG')} ${t('stats.partGTitulo')}`,
      `${t('stats.partGS')} ${t('stats.partGSTitulo')}`,
    ].join('  ·  '),
    { tamanho: 7 }
  );

  registosDoJogo(r, state, match);

  if (match.notes) {
    r.secao(t('resumo.notas'), 10);
    r.paragrafo(match.notes, { tamanho: 9, cor: COR.texto });
  }

  return r.terminar();
}

/**
 * Os registos extra do jogo (remates, remates do adversário, defesas, …), só
 * quando o jogo os tem — o mesmo critério do painel do resumo.
 */
function registosDoJogo(r, state, match) {
  if (!temRegistos(state)) return;
  const reg = resumoRegistos(state, Date.now());
  const tem = (id) => reg.tipos.has(id);
  const eles = opponentShort(match);
  const cartoes = [];
  if (tem(REGISTO.REMATE)) {
    cartoes.push({
      rotulo: t('registos.total.remate'),
      valor: reg.remates,
      detalhe: t('registos.aBalizaDe', { n: reg.rematesBaliza, total: reg.remates }),
    });
  }
  if (tem(REGISTO.REMATE_ADV)) {
    cartoes.push({
      rotulo: t('registos.total.remate_adv'),
      valor: reg.rematesAdv,
      detalhe: t('registos.aBalizaDe', { n: reg.rematesAdvBaliza, total: reg.rematesAdv }),
    });
  }
  if (tem(REGISTO.DEFESA_GR)) cartoes.push({ rotulo: t('registos.total.defesa_gr'), valor: reg.defesas });
  if (tem(REGISTO.RECUPERACAO)) cartoes.push({ rotulo: t('registos.total.recuperacao'), valor: reg.recuperacoes });
  if (tem(REGISTO.FORA)) cartoes.push({ rotulo: t('registos.total.fora'), valor: `${reg.foras.US} – ${reg.foras.THEM}` });
  if (tem(REGISTO.CANTO)) cartoes.push({ rotulo: t('registos.total.canto'), valor: `${reg.cantos.US} – ${reg.cantos.THEM}` });
  if (!cartoes.length) return;

  r.secao(t('registos.titulo'), 30);
  r.cartoes(cartoes, { porLinha: Math.min(4, cartoes.length) });
  if (tem(REGISTO.REMATE_ADV)) {
    r.garantir(45);
    r.sub(`${t('registos.total.remate_adv')} — ${eles}`);
    r.y += 2.5;
    r.tabela({
      colunas: [
        { titulo: t('registos.resultadoRotulo'), peso: 3 },
        { titulo: '#', alinhar: 'right' },
      ],
      linhas: Object.values(RESULTADO_REMATE).map((o) => [
        t(`registos.resultadoAdv.${o}`),
        reg.porResultadoAdv[o],
      ]),
    });
  }
}
