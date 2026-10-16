'use client';

// components/registos/ListaRegistos.jsx — os registos extra do jogo, por
// ordem, para corrigir ou apagar a frio. Mesma lista das faltas (as classes
// `goalline`): minuto, o que foi e de quem. Com `onEdit`, cada linha abre a
// ficha do registo.

import { fmt } from '@/domain/clock.js';
import { registosDoJogo } from '@/domain/registos.js';
import { registoLabel } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';

export default function ListaRegistos({ state, ourName, opponentName, onEdit }) {
  const t = useT();
  const lista = registosDoJogo(state);
  if (!lista.length) return <p className="muted">{t('registos.nadaApontado')}</p>;

  return (
    <ol className="goalline goalline--cols">
      {lista.map((r) => {
        const p = r.playerId ? state.players[r.playerId] : null;
        const nossa = r.equipa !== 'THEM';
        const quem = p ? `#${p.number} ${p.name}` : nossa ? ourName : opponentName;
        const editavel = Boolean(onEdit);
        const Tag = editavel ? 'button' : 'li';
        return (
          <Tag
            key={r.eventId}
            className={`goalline__item ${nossa ? 'is-ours' : 'is-theirs'} ${editavel ? 'is-editable' : ''}`}
            {...(editavel ? { onClick: () => onEdit(r) } : {})}
          >
            <span className="goalline__time mono">{fmt(r.matchElapsedMs)}</span>
            <span className="goalline__who">
              <strong>{registoLabel(r, state.players)}</strong>
              <span className="goalline__detail">{quem}</span>
            </span>
            {editavel ? (
              <span className="goalline__edit">{t('golos.editar')}</span>
            ) : (
              <span className="goalline__period">{t('golos.parteCurta', { n: r.period })}</span>
            )}
          </Tag>
        );
      })}
    </ol>
  );
}
