'use client';

// components/Goals.jsx — os golos do jogo, por ordem e por parte.
//
// É a leitura que um treinador faz primeiro quando o jogo pára: quem marcou,
// quando, e com quem à baliza quando se sofreu.

import { fmt } from '@/domain/clock.js';
import { useT } from '@/lib/i18n/index.js';

export function GoalsTimeline({ state, ourName, opponentName, onEdit, emptyText }) {
  const t = useT();
  const golos = [...(state.goals || [])].sort((a, b) => a.matchElapsedMs - b.matchElapsedMs);
  // Com o jogo a decorrer ainda pode haver golos; terminado, já não há.
  if (!golos.length) return <p className="muted">{emptyText || t('golos.semGolos')}</p>;

  const nome = (id) => (id ? state.players[id]?.name || '' : '');

  return (
    <ol className="goalline">
      {golos.map((g) => {
        const nosso = g.team === 'US';
        const quem = g.ownGoal
          ? t('golos.autogolo')
          : nosso
            ? nome(g.scorerId) || t('golos.marcadorPorRegistar')
            : nome(g.goalkeeperId)
              ? t('golos.sofridoCom', { nome: nome(g.goalkeeperId) })
              : '';
        // Nos nossos golos edita-se marcador e assistência; nos sofridos, o
        // guarda-redes que estava à baliza.
        const editavel = Boolean(onEdit);
        const Tag = editavel ? 'button' : 'li';
        return (
          <Tag
            key={g.eventId}
            className={`goalline__item ${nosso ? 'is-ours' : 'is-theirs'} ${
              editavel ? 'is-editable' : ''
            }`}
            {...(editavel ? { onClick: () => onEdit(g) } : {})}
          >
            <span className="goalline__time mono">{fmt(g.matchElapsedMs)}</span>
            <span className="goalline__who">
              <strong>{nosso ? ourName : opponentName}</strong>
              {quem ? <span className="goalline__detail">{quem}</span> : null}
              {nosso && g.assistId ? (
                <span className="goalline__detail">
                  {t('golos.assist', { nome: nome(g.assistId) })}
                </span>
              ) : null}
            </span>
            {editavel ? (
              <span className="goalline__edit">{t('golos.editar')}</span>
            ) : (
              <span className="goalline__period">{t('golos.parteCurta', { n: g.period })}</span>
            )}
          </Tag>
        );
      })}
    </ol>
  );
}

/**
 * Golos separados por parte, lado a lado. Um treinador lê o jogo por partes —
 * "sofremos dois na segunda" — e não numa lista corrida de princípio ao fim.
 */
export function GoalsByHalf({ state, ...props }) {
  const t = useT();
  const todos = state.goals || [];
  return (
    <div className="goalhalves">
      {[1, 2].map((period) => (
        <section key={period} className="goalhalves__col">
          <h3 className="goalhalves__title">
            {period === 1 ? t('golos.primeiraParte') : t('golos.segundaParte')}
          </h3>
          <GoalsTimeline
            {...props}
            state={{ ...state, goals: todos.filter((g) => g.period === period) }}
          />
        </section>
      ))}
    </div>
  );
}
