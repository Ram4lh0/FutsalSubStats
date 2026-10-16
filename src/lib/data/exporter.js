// data/exporter.js
// Exportação e backup (secção 20): JSON completo, CSV por jogo e CSV do plantel.

import { fmt } from '../../domain/clock.js';
import { matchStatsTable, powerPlayTotals } from '../../domain/stats.js';
import { foulsTotal, foulsInPeriod } from '../../domain/reducer.js';
import { REGISTO, resumoRegistos, temRegistos } from '../../domain/registos.js';
// Nada vem já de `constants.js`: as etiquetas que este ficheiro usava — posições,
// estados, eventos — passaram para os dicionários, e chegam aqui pelas funções
// de `format.js`. O CSV sai no idioma em que a app está a ser vista.
import {
  positionLabel,
  footLabel,
  homeAwayLabel,
  statusLabel,
  eventLabel,
} from '../format.js';
import { t, localeAtual } from '../i18n/index.js';

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  // ; como separador — abre correctamente no Excel em português.
  return '\uFEFF' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n');
}

/** As colunas dos registos extra de um jogador, pela ordem do cabeçalho. */
function colunasDeRegistos(j) {
  if (!j) return [0, 0, 0, 0, 0, 0];
  return [j.remates, j.rematesBaliza, j.recuperacoes, j.defesas, j.positivas, j.negativas];
}

export function matchSummaryCsv({ club, match, state, team, competition }) {
  const table = matchStatsTable(state, Date.now());
  const pp = powerPlayTotals(state, state.elapsedMatchMs);
  // Registos extra: só quando o jogo os tem. Um jogo sem eles sai como sempre.
  const reg = temRegistos(state) ? resumoRegistos(state, Date.now()) : null;
  const regDe = new Map((reg?.jogadores || []).map((j) => [j.playerId, j]));
  const rows = [
    [t('csv.clube'), club?.name || ''],
    [t('prep.adversario'), match.opponentName],
    [t('csv.data'), new Date(match.scheduledAt).toLocaleString(localeAtual())],
    [t('escalao.titulo'), team?.name || ''],
    [t('prep.competicao'), competition?.name || ''],
    [t('lista.local'), homeAwayLabel(match.homeOrAway)],
    [t('csv.estado'), statusLabel(state.status)],
    [t('csv.resultado'), `${state.teamScore}-${state.opponentScore}`],
    [
      t('resumo.aoIntervalo'),
      state.halftimeTeamScore == null
        ? ''
        : `${state.halftimeTeamScore}-${state.halftimeOpponentScore}`,
    ],
    [t('resumo.duracaoEfetiva'), fmt(state.elapsedMatchMs)],
    [t('csv.faltasNos'), foulsTotal(state, 'US')],
    [t('csv.faltasPrimeira'), foulsInPeriod(state, 'US', 1)],
    [t('csv.faltasSegunda'), foulsInPeriod(state, 'US', 2)],
    [t('csv.faltasDeles'), foulsTotal(state, 'THEM')],
    [t('resumo.tempo5v4'), fmt(pp.totalMs)],
    [t('resumo.periodos5v4'), pp.count],
    ...(reg?.tipos.has(REGISTO.FORA)
      ? [[t('registos.csv.foras'), `${reg.foras.US}-${reg.foras.THEM}`]]
      : []),
    ...(reg?.tipos.has(REGISTO.CANTO)
      ? [[t('registos.csv.cantos'), `${reg.cantos.US}-${reg.cantos.THEM}`]]
      : []),
    ...pp.periodos.map((x) => [
      t('csv.periodo5v4', { n: x.numero }),
      t('csv.detalhe5v4', {
        parte: x.startPeriod,
        inicio: fmt(x.startMatchMs),
        fim: x.endMatchMs == null ? t('csv.fim') : fmt(x.endMatchMs),
        duracao: fmt(x.durationMs),
      }),
    ]),
    [],
    [
      t('stats.numero'),
      t('stats.jogador'),
      t('stats.golos'),
      t('ficha.assistencias'),
      t('csv.golosSofridos'),
      t('stats.faltas'),
      t('stats.faltasSofridas'),
      t('stats.amarelos'),
      t('stats.vermelhos'),
      t('ficha.emCampo'),
      t('intervalo.entradas'),
      t('ficha.partGolos'),
      t('ficha.partSofridos'),
      t('csv.estado'),
      ...(reg
        ? [
            t('registos.col.remates'),
            t('registos.col.aBaliza'),
            t('registos.total.recuperacao'),
            t('registos.col.defesas'),
            t('registos.csv.acoesPositivas'),
            t('registos.csv.acoesNegativas'),
          ]
        : []),
    ],
  ];
  for (const p of table) {
    rows.push([
      p.number,
      p.name,
      p.goals,
      p.assists,
      p.conceded,
      p.fouls,
      p.foulsSuffered,
      p.yellows,
      p.reds,
      fmt(p.courtMs),
      p.entries,
      p.goalShare,
      p.concededShare,
      p.expelled ? t('resumo.expulso') : '',
      ...(reg ? colunasDeRegistos(regDe.get(p.playerId)) : []),
    ]);
  }
  rows.push([]);
  rows.push([
    t('csv.golo'),
    t('csv.equipa'),
    t('csv.parte'),
    t('csv.minuto'),
    t('csv.marcador'),
    t('csv.assistencia'),
    t('csv.autogolo'),
    t('csv.guardaRedes'),
  ]);
  (state.goals || []).forEach((g, i) => {
    const nm = (id) => (id ? state.players[id]?.name || '' : '');
    rows.push([
      i + 1,
      g.team === 'US' ? club?.name || t('nome.nos') : match.opponentName,
      g.period,
      fmt(g.matchElapsedMs),
      nm(g.scorerId),
      nm(g.assistId),
      g.ownGoal ? t('csv.sim') : '',
      nm(g.goalkeeperId),
    ]);
  });

  rows.push([]);
  rows.push([
    t('stats.jogador'),
    t('csv.entrada'),
    t('csv.parte'),
    t('csv.inicio'),
    t('csv.fimColuna'),
    t('csv.duracao'),
    t('plantel.posicao'),
    t('csv.motivoFim'),
  ]);
  for (const p of table) {
    for (const s of p.stints) {
      rows.push([
        `#${p.number} ${p.name}`,
        s.stintNumber,
        s.startPeriod,
        fmt(s.startMatchMs),
        s.endMatchMs == null ? '—' : fmt(s.endMatchMs),
        fmt(s.durationMs),
        s.startingPosition ? positionLabel(s.startingPosition) : '',
        s.endingReason || '',
      ]);
    }
  }
  return toCsv(rows);
}

export function matchEventsCsv({ match, state }) {
  const rows = [
    [
      '#',
      t('historico.acao'),
      t('csv.parte'),
      t('novo.tempoDeJogo'),
      t('historico.tempo'),
      t('historico.detalhe'),
      t('historico.anulado'),
      t('registos.csv.registo'),
      t('registos.csv.resultado'),
      'x',
      'y',
    ],
  ];
  for (const e of state.allEvents) {
    const name = (id) => state.players[id]?.name || '';
    const detail = [
      e.playerOutId ? t('historico.sai', { nome: name(e.playerOutId) }) : '',
      e.playerInId ? t('historico.entra', { nome: name(e.playerInId) }) : '',
      e.playerId ? name(e.playerId) : '',
      e.position ? positionLabel(e.position) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    // Os registos levam os ids tal como estão guardados (`remate`,
    // `DEFENDIDO`): são estáveis, ao contrário das etiquetas, e é o que serve
    // a quem vai cruzar o ficheiro noutro programa.
    const md = e.metadata || {};
    const ehRegisto = e.eventType === 'STAT_RECORDED' || e.eventType === 'STAT_CORRECTED';
    rows.push([
      e.seq,
      eventLabel(e.eventType, e, state.players) || e.eventType,
      e.period,
      fmt(e.matchElapsedMs),
      fmt(e.periodElapsedMs),
      detail,
      e.undoneAt ? t('csv.sim') : '',
      ehRegisto ? md.registo || '' : '',
      ehRegisto ? md.resultado || '' : '',
      ehRegisto && md.x != null ? md.x : '',
      ehRegisto && md.y != null ? md.y : '',
    ]);
  }
  return toCsv(rows);
}


export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJson(filename, obj) {
  download(filename, JSON.stringify(obj, null, 2), 'application/json');
}

export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    };
    input.click();
  });
}

export function slug(s) {
  return (s || 'ficheiro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
