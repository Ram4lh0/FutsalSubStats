'use client';

// components/Cards.jsx — os cartões do jogo, por ordem.
//
// Mesma lista das faltas e dos golos (as classes `goalline`): minuto, a quem e
// que cartão. Os nossos vêm do plantel; os do adversário só têm o número. Com
// `onEdit`, cada linha abre a ficha do cartão para o corrigir ou apagar.

import { fmt } from '@/domain/clock.js';
import { CARD } from '@/domain/constants.js';
import { useT } from '@/lib/i18n/index.js';

/** Os cartões nossos e deles numa só lista, pela ordem do jogo. */
export function cartoesDoJogo(state) {
  const nossos = (state.cards || []).map((c) => ({
    eventId: c.eventId,
    team: 'US',
    type: c.type,
    playerId: c.playerId,
    number: null,
    period: c.period,
    matchElapsedMs: c.matchElapsedMs,
    secondYellow: Boolean(c.secondYellow),
  }));
  const deles = (state.opponentCards || []).map((c) => ({
    eventId: c.eventId,
    team: 'THEM',
    type: CARD.YELLOW,
    playerId: null,
    number: c.number,
    period: c.period ?? 1,
    matchElapsedMs: c.matchElapsedMs,
    secondYellow: Boolean(c.secondYellow),
  }));
  return [...nossos, ...deles].sort((a, b) => a.matchElapsedMs - b.matchElapsedMs);
}

export function CardsTimeline({ state, ourName, opponentName, onEdit, emptyText }) {
  const t = useT();
  const cartoes = cartoesDoJogo(state);
  if (!cartoes.length) return <p className="muted">{emptyText || t('cartoes.semCartoes')}</p>;

  return (
    <ol className="goalline">
      {cartoes.map((c) => {
        const nosso = c.team === 'US';
        const p = c.playerId ? state.players[c.playerId] : null;
        const quem = nosso ? (p ? `#${p.number} ${p.name}` : '') : `#${c.number}`;
        const tipo =
          c.type === CARD.RED
            ? t('cartao.RED')
            : c.secondYellow
              ? t('cartoes.segundoAmarelo')
              : t('cartao.YELLOW');
        const editavel = Boolean(onEdit);
        const Tag = editavel ? 'button' : 'li';
        return (
          <Tag
            key={c.eventId}
            className={`goalline__item ${nosso ? 'is-ours' : 'is-theirs'} ${
              editavel ? 'is-editable' : ''
            }`}
            {...(editavel ? { onClick: () => onEdit(c) } : {})}
          >
            <span className="goalline__time mono">{fmt(c.matchElapsedMs)}</span>
            <span className="goalline__who">
              <strong>{nosso ? ourName : opponentName}</strong>
              <span className="goalline__detail">
                <span
                  className={`cardchip cardchip--${c.type === CARD.RED ? 'red' : 'yellow'}`}
                />{' '}
                {tipo}
                {quem ? ` · ${quem}` : ''}
              </span>
            </span>
            {editavel ? (
              <span className="goalline__edit">{t('golos.editar')}</span>
            ) : (
              <span className="goalline__period">{t('golos.parteCurta', { n: c.period })}</span>
            )}
          </Tag>
        );
      })}
    </ol>
  );
}
