'use client';

// components/Fouls.jsx — as faltas do jogo, por ordem e por parte.
//
// Mesma lista dos golos (as mesmas classes `goalline`), porque se lê da mesma
// maneira: minuto, equipa e o jogador nosso envolvido. Com `onEdit`, cada
// linha abre a ficha da falta para a corrigir ou apagar.

import { fmt } from '@/domain/clock.js';
import { useT } from '@/lib/i18n/index.js';

export function FoulsTimeline({ state, ourName, opponentName, onEdit, emptyText }) {
  const t = useT();
  const faltas = [...(state.fouls || [])].sort((a, b) => a.matchElapsedMs - b.matchElapsedMs);
  if (!faltas.length) return <p className="muted">{emptyText || t('faltas.semFaltas')}</p>;

  const nome = (id) => {
    const p = id ? state.players[id] : null;
    return p ? `#${p.number} ${p.name}` : '';
  };

  return (
    <ol className="goalline">
      {faltas.map((f) => {
        const nossa = f.team === 'US';
        const quem = nome(f.playerId);
        const detalhe = quem
          ? t(nossa ? 'faltas.cometidaPor' : 'faltas.sofridaPor', { nome: quem })
          : t('faltas.porRegistar');
        const editavel = Boolean(onEdit);
        const Tag = editavel ? 'button' : 'li';
        return (
          <Tag
            key={f.eventId}
            className={`goalline__item ${nossa ? 'is-ours' : 'is-theirs'} ${
              editavel ? 'is-editable' : ''
            }`}
            {...(editavel ? { onClick: () => onEdit(f) } : {})}
          >
            <span className="goalline__time mono">{fmt(f.matchElapsedMs)}</span>
            <span className="goalline__who">
              <strong>{nossa ? ourName : opponentName}</strong>
              <span className="goalline__detail">{detalhe}</span>
            </span>
            {editavel ? (
              <span className="goalline__edit">{t('golos.editar')}</span>
            ) : (
              <span className="goalline__period">{t('golos.parteCurta', { n: f.period })}</span>
            )}
          </Tag>
        );
      })}
    </ol>
  );
}

/** Faltas separadas por parte, com a contagem de cada equipa no título. */
export function FoulsByHalf({ state, ...props }) {
  const t = useT();
  const todas = state.fouls || [];
  return (
    <div className="goalhalves">
      {[1, 2].map((period) => {
        const daParte = todas.filter((f) => f.period === period);
        return (
          <section key={period} className="goalhalves__col">
            <h3 className="goalhalves__title">
              {period === 1 ? t('golos.primeiraParte') : t('golos.segundaParte')}
              {' · '}
              {t('faltas.contagem', {
                nos: daParte.filter((f) => f.team === 'US').length,
                eles: daParte.filter((f) => f.team === 'THEM').length,
              })}
            </h3>
            <FoulsTimeline {...props} state={{ ...state, fouls: daParte }} />
          </section>
        );
      })}
    </div>
  );
}
