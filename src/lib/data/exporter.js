// data/exporter.js
// Exportação e backup (secção 20): JSON completo, CSV por jogo e CSV do plantel.

import { fmt } from '../../domain/clock.js';
import { matchStatsTable } from '../../domain/stats.js';
import { foulsTotal, foulsInPeriod } from '../../domain/reducer.js';
import {
  POSITION_LABEL,
  MATCH_STATUS_LABEL,
  HOME_AWAY_LABEL,
  EVENT_LABEL,
  FOOT_LABEL,
} from '../../domain/constants.js';

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  // ; como separador — abre correctamente no Excel em português.
  return '\uFEFF' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n');
}

export function matchSummaryCsv({ club, match, state }) {
  const table = matchStatsTable(state, Date.now());
  const rows = [
    ['Clube', club?.name || ''],
    ['Adversário', match.opponentName],
    ['Data', new Date(match.scheduledAt).toLocaleString('pt-PT')],
    ['Competição', match.competition || ''],
    ['Local', HOME_AWAY_LABEL[match.homeOrAway] || ''],
    ['Estado', MATCH_STATUS_LABEL[state.status]],
    ['Resultado', `${state.teamScore}-${state.opponentScore}`],
    [
      'Ao intervalo',
      state.halftimeTeamScore == null
        ? ''
        : `${state.halftimeTeamScore}-${state.halftimeOpponentScore}`,
    ],
    ['Duração efetiva', fmt(state.elapsedMatchMs)],
    ['Faltas (nós)', foulsTotal(state, 'US')],
    ['Faltas 1.ª parte', foulsInPeriod(state, 'US', 1)],
    ['Faltas 2.ª parte', foulsInPeriod(state, 'US', 2)],
    ['Faltas (adversário)', foulsTotal(state, 'THEM')],
    [],
    ['Nº', 'Jogador', 'Golos', 'Assistências', 'Golos sofridos', 'Faltas', 'Faltas sofridas', 'Amarelos', 'Vermelhos', 'Em campo', 'Entradas', 'Maior período', 'Menor período', 'Estado'],
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
      fmt(p.longestStintMs),
      fmt(p.shortestStintMs),
      p.expelled ? 'Expulso' : '',
    ]);
  }
  rows.push([]);
  rows.push(['Golo', 'Equipa', 'Parte', 'Minuto', 'Marcador', 'Assistência', 'Autogolo', 'Guarda-redes']);
  (state.goals || []).forEach((g, i) => {
    const nm = (id) => (id ? state.players[id]?.name || '' : '');
    rows.push([
      i + 1,
      g.team === 'US' ? club?.name || 'Nós' : match.opponentName,
      g.period,
      fmt(g.matchElapsedMs),
      nm(g.scorerId),
      nm(g.assistId),
      g.ownGoal ? 'sim' : '',
      nm(g.goalkeeperId),
    ]);
  });

  rows.push([]);
  rows.push(['Jogador', 'Entrada', 'Parte', 'Início', 'Fim', 'Duração', 'Posição', 'Motivo de fim']);
  for (const p of table) {
    for (const s of p.stints) {
      rows.push([
        `#${p.number} ${p.name}`,
        s.stintNumber,
        s.startPeriod,
        fmt(s.startMatchMs),
        s.endMatchMs == null ? '—' : fmt(s.endMatchMs),
        fmt(s.durationMs),
        POSITION_LABEL[s.startingPosition] || '',
        s.endingReason || '',
      ]);
    }
  }
  return toCsv(rows);
}

export function matchEventsCsv({ match, state }) {
  const rows = [['#', 'Evento', 'Parte', 'Tempo de jogo', 'Tempo da parte', 'Detalhe', 'Anulado']];
  for (const e of state.allEvents) {
    const name = (id) => state.players[id]?.name || '';
    const detail = [
      e.playerOutId ? `Sai ${name(e.playerOutId)}` : '',
      e.playerInId ? `Entra ${name(e.playerInId)}` : '',
      e.playerId ? name(e.playerId) : '',
      e.position ? POSITION_LABEL[e.position] : '',
    ]
      .filter(Boolean)
      .join(' · ');
    rows.push([
      e.seq,
      EVENT_LABEL[e.eventType] || e.eventType,
      e.period,
      fmt(e.matchElapsedMs),
      fmt(e.periodElapsedMs),
      detail,
      e.undoneAt ? 'sim' : '',
    ]);
  }
  return toCsv(rows);
}

export function rosterCsv(club, players) {
  const rows = [['Nº', 'Nome', 'Posição preferencial', 'Pé forte', 'Estado']];
  for (const p of players) {
    rows.push([
      p.shirtNumber,
      p.name,
      POSITION_LABEL[p.preferredPosition] || '',
      FOOT_LABEL[p.strongFoot || 'UNKNOWN'],
      p.isActive ? 'Ativo' : 'Inativo',
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
