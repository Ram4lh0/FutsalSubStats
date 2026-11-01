// data/exporter.js
// Exportação e backup (secção 20): JSON completo, CSV por jogo e CSV do plantel.

import { fmt } from '../../domain/clock.js';
import { matchStatsTable, powerPlayTotals } from '../../domain/stats.js';
import { foulsTotal, foulsInPeriod } from '../../domain/reducer.js';
import { REGISTO, resumoRegistos, temRegistos } from '../../domain/registos.js';
import { entregarFicheiro } from '../ficheiros.js';
import { pareceXlsx, pareceXlsAntigo, xlsxParaCsv } from './folhaXlsx.js';
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
  if (!j) return [0, 0, 0, 0, 0, 0, 0];
  // As perdas de bola e os passes falhados vieram depois: ficam no fim, para
  // não mexer nas colunas de antes.
  return [j.remates, j.rematesBaliza, j.recuperacoes, j.defesas, j.positivas, j.negativas, j.perdas, j.passes];
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
    ...(reg?.tipos.has(REGISTO.REMATE_ADV)
      ? [
          [t('registos.total.remate_adv'), reg.rematesAdv],
          [t('registos.csv.rematesAdvBaliza'), reg.rematesAdvBaliza],
          ...Object.entries(reg.porResultadoAdv).map(([o, n]) => [
            `${t('registos.total.remate_adv')} · ${t(`registos.resultadoAdv.${o}`)}`,
            n,
          ]),
        ]
      : []),
    ...(reg?.tipos.has(REGISTO.REMATE_ADV_SIMPLES)
      ? [[t('registos.total.remate_adv_simples'), reg.rematesAdvSimples]]
      : []),
    ...(reg?.tipos.has(REGISTO.PENALTI)
      ? [[t('registos.csv.penaltis'), `${reg.penaltis.golos}/${reg.penaltis.total}`]]
      : []),
    ...(reg?.tipos.has(REGISTO.PENALTI_ADV)
      ? [[t('registos.csv.penaltisAdv'), `${reg.penaltisAdv.golos}/${reg.penaltisAdv.total}`]]
      : []),
    ...(reg?.tipos.has(REGISTO.LIVRE_10M)
      ? [
          [t('registos.csv.livres10Nos'), `${reg.livres10.US.golos}/${reg.livres10.US.total}`],
          [t('registos.csv.livres10Eles'), `${reg.livres10.THEM.golos}/${reg.livres10.THEM.total}`],
        ]
      : []),
    ...(reg?.tipos.has(REGISTO.LANCAMENTO_BALIZA)
      ? [[t('registos.csv.lancamentos'), `${reg.lancamentos.US}-${reg.lancamentos.THEM}`]]
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
            t('registos.total.perda_bola'),
            t('registos.total.passe_falhado'),
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
  // Pela ordem do jogo (parte e minuto), não pela ordem em que foram registados.
  const golos = [...(state.goals || [])].sort(
    (a, b) => (a.period ?? 0) - (b.period ?? 0) || (a.matchElapsedMs ?? 0) - (b.matchElapsedMs ?? 0)
  );
  golos.forEach((g, i) => {
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


// Na app nativa o `<a download>` não faz nada (a WebView do Android ignora-o),
// por isso o ficheiro vai pela mesma entrega dos PDF: guardar e partilhar.
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  return entregarFicheiro(blob, filename, mime, { titulo: filename });
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

/** O que o seletor deixa escolher para o plantel e o calendário. */
const TIPOS_FOLHA = [
  '.csv',
  'text/csv',
  'text/comma-separated-values',
  '.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

/**
 * Escolher uma folha de cálculo (CSV ou .xlsx) e devolvê-la como texto de CSV.
 *
 * O .xlsx é convertido aqui (ver folhaXlsx.js), por isso quem chama lê sempre
 * um CSV. Um ficheiro que não se consegue ler atira um erro com `chave` (para
 * mostrar ao treinador); cancelar devolve null.
 */
export function pickFolha() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = TIPOS_FOLHA;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (pareceXlsAntigo(bytes)) throw Object.assign(new Error('xls'), { chave: 'folha.xlsAntigo' });
        if (pareceXlsx(bytes)) {
          try {
            return resolve(xlsxParaCsv(bytes));
          } catch {
            throw Object.assign(new Error('xlsx'), { chave: 'folha.ilegivel' });
          }
        }
        resolve(new TextDecoder('utf-8').decode(bytes));
      } catch (e) {
        reject(e.chave ? e : Object.assign(e, { chave: 'folha.ilegivel' }));
      }
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
