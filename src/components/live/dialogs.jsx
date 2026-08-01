'use client';

// components/live/dialogs.jsx — as perguntas que o jogo faz.
//
// Todas devolvem uma promessa, para as vistas poderem escrever a sequência de um
// golo (quem marcou → quem assistiu) numa função só, em vez de a partir em
// pedaços ligados por callbacks.

import { Dialog } from '@/lib/ui.jsx';
import { POSITIONS, POSITION_LABEL, PLAYER_MATCH_STATUS } from '@/domain/constants.js';
import { fmt } from '@/domain/clock.js';
import { playerMatchStats } from '@/domain/stats.js';

/**
 * Escolher um jogador. Só quem está em campo: um golo, uma assistência ou uma
 * falta são de quem estava a jogar naquele momento, não de quem está no banco.
 *
 * Resolve com o id, `null` se escolher "nenhum", ou `undefined` se fechar.
 */
export function pickPlayer(ui, state, title, { exclude, allowNone = false, noneLabel = 'Nenhum', extra = [] } = {}) {
  const opcoes = Object.values(state.players)
    .filter((p) => p.playerId !== exclude && p.status === PLAYER_MATCH_STATUS.ON_COURT)
    .sort((a, b) => a.number - b.number);

  return ui.open((close) => (
    <Dialog title={title} onClose={() => close(undefined)}>
      <div className="picklist">
        {opcoes.map((p) => (
          <button key={p.playerId} className="picklist__item" onClick={() => close(p.playerId)}>
            <span className="picklist__num">#{p.number}</span>
            <span className="picklist__name">{p.name}</span>
            <span className="picklist__pos">{POSITION_LABEL[p.position] || ''}</span>
          </button>
        ))}
        {extra.map((o) => (
          <button
            key={o.id}
            className="picklist__item picklist__item--special"
            onClick={() => close(o.id)}
          >
            {o.label}
          </button>
        ))}
        {allowNone ? (
          <button className="picklist__item picklist__item--clear" onClick={() => close(null)}>
            {noneLabel}
          </button>
        ) : null}
      </div>
    </Dialog>
  ));
}

/** Da sexta falta em diante, cada uma dá livre de 10 metros ao adversário. */
export function tenMetreAlert(ui, { beneficia, faltou, n }) {
  return ui.open((close) => (
    <Dialog title={`Livre de 10m para o ${beneficia}`} onClose={() => close(null)}>
      <div className="tenm">
        <p className="tenm__count">
          {n}.ª falta de {faltou}
        </p>
        <p className="modal__text">Livre de 10m.</p>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--primary" onClick={() => close(null)}>
          Entendido
        </button>
      </footer>
    </Dialog>
  ));
}

/** Quem entra numa posição vazia, depois de uma expulsão cumprida. */
export function pickReplacement(ui, state, position) {
  const opcoes = Object.values(state.players).filter(
    (p) => p.status === PLAYER_MATCH_STATUS.ON_BENCH
  );
  return ui.open((close) => (
    <Dialog title={`Colocar em ${POSITION_LABEL[position]}`} onClose={() => close(null)}>
      <div className="picklist">
        {opcoes.map((p) => (
          <button key={p.playerId} className="picklist__item" onClick={() => close(p.playerId)}>
            <span className="picklist__num">#{p.number}</span>
            <span className="picklist__name">{p.name}</span>
          </button>
        ))}
      </div>
    </Dialog>
  ));
}

export function positionMenu(ui, state, p) {
  const posicoes = POSITIONS.filter((pos) => pos !== p.position);
  return ui.open((close) => (
    <Dialog title={`Posição de #${p.number} ${p.name}`} onClose={() => close(null)}>
      <div className="menu">
        {posicoes.map((pos) => {
          const ocupante = state.players[state.court[pos]];
          return (
            <button key={pos} className="menu__item" onClick={() => close(pos)}>
              {POSITION_LABEL[pos]}
              {ocupante ? (
                <span className="menu__hint">
                  troca com #{ocupante.number} {ocupante.name}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Dialog>
  ));
}

/** Períodos em campo de um jogador, com os totais no topo. */
export function stintsDialog(ui, state, p, clockMs) {
  const s = playerMatchStats(state.players[p.playerId], clockMs);
  const mini = (label, value) => (
    <div className="stat" key={label}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );

  return ui.open((close) => (
    <Dialog title={`#${p.number} ${p.name}`} onClose={() => close(null)}>
      <div className="grid grid--stats">
        {mini('Em campo', fmt(s.courtMs))}
        {mini('Entradas', s.entries)}
        {mini('Maior período', fmt(s.longestStintMs))}
        {mini('Menor período', fmt(s.entries ? s.shortestStintMs : 0))}
      </div>
      {s.stints.length ? (
        <ul className="stintlist">
          {s.stints.map((x) => (
            <li key={x.stintNumber}>
              <strong>Entrada {x.stintNumber}</strong>
              {` — ${x.startPeriod}.ª parte — ${fmt(x.startMatchMs)} a ${
                x.open ? 'agora' : fmt(x.endMatchMs)
              } — `}
              <span className="mono">{fmt(x.durationMs)}</span>
              {x.startingPosition ? (
                <span className="muted"> · {POSITION_LABEL[x.startingPosition]}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Ainda não entrou em campo.</p>
      )}
    </Dialog>
  ));
}
