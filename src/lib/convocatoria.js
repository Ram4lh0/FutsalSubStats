// lib/convocatoria.js — a convocatória de um jogo, pronta a mandar.
//
// A convocatória em si não é nada de novo: é o jogo (adversário, dia, hora,
// casa/fora) mais os convocados (`match_squad`), que já sincronizam. Aqui fica
// o que falta para a mandar para o grupo: o pavilhão, o texto do WhatsApp e o
// PDF.
//
// O pavilhão de cada jogo é a coluna `matches.venue` e sincroniza com o resto
// do jogo. O pavilhão de casa do escalão, que só serve para pré-preencher os
// jogos em casa, fica por agora neste aparelho (localStorage).

import { t, localeAtual } from './i18n/index.js';
import { COR, novoRelatorio } from './pdf/base.js';

const CHAVE_CASA = (teamId) => `fss:pavilhaoCasa:${teamId}`;

function ler(chave) {
  try {
    return localStorage.getItem(chave) || '';
  } catch {
    return '';
  }
}

function gravar(chave, valor) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch {
    // Sem armazenamento: o pavilhão fica por dizer, o resto funciona.
  }
}

export const pavilhaoDeCasa = (teamId) => ler(CHAVE_CASA(teamId));
export const gravarPavilhaoDeCasa = (teamId, v) => gravar(CHAVE_CASA(teamId), (v || '').trim());

/** O pavilhão a mostrar: o do jogo, ou o de casa quando o jogo é em casa. */
export function pavilhaoEfetivo(match) {
  return match.venue || (match.homeOrAway === 'HOME' ? pavilhaoDeCasa(match.teamId) : '');
}

/** Convocados por número de camisola (sem número vão para o fim). */
export function ordenarConvocados(lista) {
  return [...lista].sort(
    (a, b) => (Number(a.shirtNumberSnapshot) || 999) - (Number(b.shirtNumberSnapshot) || 999)
  );
}

function diaTexto(ts) {
  const s = new Date(ts).toLocaleDateString(localeAtual(), { weekday: 'long', day: 'numeric', month: 'long' });
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}

function horaTexto(ts) {
  return new Date(ts).toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' });
}

/** As linhas de cima da convocatória, iguais no texto e no PDF. */
function cabecalho({ match, team, competicao }) {
  const pavilhao = pavilhaoEfetivo(match);
  return {
    titulo: `${team?.name || ''} vs ${match.opponentName}`.trim(),
    linhas: [
      [t('conv.dia'), diaTexto(match.scheduledAt)],
      [t('conv.hora'), horaTexto(match.scheduledAt)],
      [t('conv.local'), t(`local.${match.homeOrAway || 'HOME'}`)],
      pavilhao ? [t('conv.pavilhao'), pavilhao] : null,
      competicao ? [t('conv.competicao'), competicao] : null,
    ].filter(Boolean),
  };
}

/** O texto para colar no grupo do WhatsApp. Sem emojis, por pontos. */
export function textoConvocatoria({ match, team, convocados, competicao }) {
  const c = cabecalho({ match, team, competicao });
  const linhas = [
    `*${t('conv.tituloTexto')}*`,
    `*${c.titulo}*`,
    '',
    ...c.linhas.map(([k, v]) => `${k}: ${v}`),
    '',
    `*${t('conv.convocadosN', { n: convocados.length })}*`,
    ...ordenarConvocados(convocados).map(
      (s) => `${s.shirtNumberSnapshot != null && s.shirtNumberSnapshot !== '' ? `${s.shirtNumberSnapshot}. ` : '- '}${s.playerNameSnapshot}`
    ),
  ];
  return linhas.join('\n');
}

/** O PDF de uma página: cabeçalho do jogo e a lista dos convocados. */
export async function pdfConvocatoria({ match, team, club, convocados, competicao }) {
  const c = cabecalho({ match, team, competicao });
  const r = await novoRelatorio({
    titulo: t('conv.tituloTexto'),
    subtitulo: [club?.name, team?.name].filter(Boolean).join(' · '),
    info: [c.titulo],
  });
  r.secao(t('conv.jogo'), 20);
  for (const [k, v] of c.linhas) r.paragrafo(`${k}: ${v}`, { tamanho: 11, cor: COR.texto });
  r.secao(t('conv.convocadosN', { n: convocados.length }), 20);
  r.tabela({
    colunas: [
      { titulo: t('conv.numero'), largura: 18, alinhar: 'center' },
      { titulo: t('conv.jogador') },
    ],
    linhas: ordenarConvocados(convocados).map((s) => [s.shirtNumberSnapshot ?? '', s.playerNameSnapshot]),
    tamanho: 10,
  });
  return r.terminar();
}
