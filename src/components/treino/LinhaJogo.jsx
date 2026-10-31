'use client';

// components/treino/LinhaJogo.jsx — um jogo na lista das convocatórias: dia,
// adversário, hora, pavilhão e quantos estão convocados.

import { Badge } from '@/components/bits.jsx';
import { MATCH_STATUS } from '@/domain/constants.js';
import { pavilhaoEfetivo } from '@/lib/convocatoria.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

/** Um jogo ainda por jogar: nem começou nem acabou. */
export const porJogar = (e) => [MATCH_STATUS.DRAFT, MATCH_STATUS.READY].includes(e.state?.status || MATCH_STATUS.DRAFT);

export default function LinhaJogo({ entry, onAbrir, ativo = false, jogo = false }) {
  const t = useT();
  const locale = useLocale();
  const { match } = entry;
  const n = Object.keys(entry.state?.players || {}).length;
  const d = new Date(match.scheduledAt || match.createdAt);
  const pavilhao = pavilhaoEfetivo(match);
  return (
    <button type="button" className={`tlinha ${ativo ? 'is-ativo' : ''} ${jogo ? 'tlinha--jogo' : ''}`} onClick={onAbrir}>
      <span className="tlinha__dia">
        <strong>{d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').slice(0, 3)}</strong>
        <span>{d.getDate()}</span>
      </span>
      <span className="tlinha__info">
        {jogo ? <span className="tlinha__etiqueta">{t('treino.legendaJogo')}</span> : null}
        <strong>
          {match.homeOrAway === 'AWAY' ? '@ ' : 'vs '}
          {match.opponentName}
        </strong>
        <span className="muted">
          {' · '}
          {d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}{' '}
          {d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
          {pavilhao ? ` · ${pavilhao}` : ''}
        </span>
      </span>
      <span className={`tlinha__ut ${n ? 'is-on' : ''}`}>{n ? t('conv.nConvocados', { n }) : t('conv.porConvocar')}</span>
      {porJogar(entry) ? null : <Badge kind="muted">{t('conv.jogado')}</Badge>}
      <span className="tlinha__seta" aria-hidden="true">›</span>
    </button>
  );
}

