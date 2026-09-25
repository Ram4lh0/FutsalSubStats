'use client';

// components/live/dialogs.jsx — as perguntas que o jogo faz.
//
// Todas devolvem uma promessa, para as vistas poderem escrever a sequência de um
// golo (quem marcou → quem assistiu) numa função só, em vez de a partir em
// pedaços ligados por callbacks.

import { Dialog } from '@/lib/ui.jsx';
import { POSITIONS, PLAYER_MATCH_STATUS } from '@/domain/constants.js';
import { fmt } from '@/domain/clock.js';
import { playerMatchStats } from '@/domain/stats.js';
import { positionLabel } from '@/lib/format.js';
import { t } from '@/lib/i18n/index.js';

/**
 * Escolher um jogador. Só quem está em campo: um golo, uma assistência ou uma
 * falta são de quem estava a jogar naquele momento, não de quem está no banco.
 *
 * Resolve com o id, `null` se escolher "nenhum", ou `undefined` se fechar.
 */
export function pickPlayer(ui, state, title, { exclude, allowNone = false, noneLabel, extra = [] } = {}) {
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
            <span className="picklist__pos">{p.position ? positionLabel(p.position) : ''}</span>
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
            {noneLabel || t('dialogo.nenhum')}
          </button>
        ) : null}
      </div>
    </Dialog>
  ));
}

/** Da sexta falta em diante, cada uma dá livre de 10 metros ao adversário. */
export function tenMetreAlert(ui, { beneficia, faltou, n }) {
  return ui.open((close) => (
    <Dialog title={t('dialogo.livre10', { equipa: beneficia })} onClose={() => close(null)}>
      <div className="tenm">
        <p className="tenm__count">{t('dialogo.faltaN', { n, equipa: faltou })}</p>
        <p className="modal__text">{t('dialogo.livre10Texto')}</p>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--primary" onClick={() => close(null)}>
          {t('dialogo.entendido')}
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
    <Dialog title={t('dialogo.colocarEm', { posicao: positionLabel(position) })} onClose={() => close(null)}>
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
    <Dialog title={t('dialogo.posicaoDe', { numero: p.number, nome: p.name })} onClose={() => close(null)}>
      <div className="menu">
        {posicoes.map((pos) => {
          const ocupante = state.players[state.court[pos]];
          return (
            <button key={pos} className="menu__item" onClick={() => close(pos)}>
              {positionLabel(pos)}
              {ocupante ? (
                <span className="menu__hint">
                  {t('dialogo.trocaCom', { numero: ocupante.number, nome: ocupante.name })}
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
        {mini(t('ficha.emCampo'), fmt(s.courtMs))}
        {mini(t('intervalo.entradas'), s.entries)}
        {mini(t('ficha.partGolos'), s.goalShare)}
        {mini(t('ficha.partSofridos'), s.concededShare)}
      </div>
      {s.stints.length ? (
        <ul className="stintlist">
          {s.stints.map((x) => (
            <li key={x.stintNumber}>
              <strong>{t('dialogo.entrada', { n: x.stintNumber })}</strong>
              {t('dialogo.periodoLinha', {
                parte: x.startPeriod,
                inicio: fmt(x.startMatchMs),
                fim: x.open ? t('dialogo.agora') : fmt(x.endMatchMs),
              })}
              <span className="mono">{fmt(x.durationMs)}</span>
              {x.startingPosition ? (
                <span className="muted"> · {positionLabel(x.startingPosition)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('dialogo.aindaNaoEntrou')}</p>
      )}
    </Dialog>
  ));
}

/**
 * Pedir o número do adversário que levou amarelo. Só o número: a app não tem
 * o plantel deles, por isso é o único dado que dá para apontar (pedido a
 * 25/09/2026).
 *
 * Input não controlado de propósito: esta função corre uma vez só (`ui.open`
 * chama-a de novo em cada renderização do `UIProvider`, sem hooks — ver
 * lib/ui.jsx), por isso o valor tem de viver no próprio campo do DOM, não
 * numa variável de React que se perdia a cada nova renderização.
 */
export function opponentYellowCardDialog(ui) {
  const campo = { current: null };
  return ui.open((close) => (
    <Dialog title={t('dialogo.amareloAdvTitulo')} onClose={() => close(null)}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const numero = Number(campo.current?.value);
          if (!Number.isInteger(numero) || numero < 1 || numero > 99) return;
          close(numero);
        }}
      >
        <label className="field">
          <span className="field__label">{t('dialogo.amareloAdvNumero')}</span>
          <input
            ref={(el) => {
              campo.current = el;
            }}
            className="input"
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            autoFocus
          />
        </label>
        <button className="btn btn--primary" type="submit">
          {t('dialogo.registar')}
        </button>
      </form>
    </Dialog>
  ));
}

/**
 * Consultar (e corrigir) os amarelos do adversário apontados até agora.
 *
 * Tocar num cartão da lista devolve-o para quem chamou remover — a
 * confirmação e a remoção em si ficam do lado de fora (ver
 * `verCartoesAdversario` em match/live/page.jsx), tal como já acontece com o
 * botão "Desfazer" do rodapé.
 */
export function opponentCardsListDialog(ui, state) {
  const cartoes = state.opponentCards || [];
  return ui.open((close) => (
    <Dialog title={t('dialogo.amareladosAdvTitulo')} onClose={() => close(null)}>
      {cartoes.length ? (
        <>
          <p className="muted small">{t('dialogo.amareladosAdvDica')}</p>
          <div className="picklist">
            {cartoes.map((c) => {
              const ev = state.allEvents?.find((e) => e.id === c.eventId);
              return (
                <button
                  key={c.eventId}
                  className="picklist__item"
                  onClick={() => (ev ? close({ eventId: c.eventId, number: c.number, event: ev }) : null)}
                  disabled={!ev}
                >
                  <span className="cardchip cardchip--yellow" />
                  <span className="picklist__num">#{c.number}</span>
                  <span className="picklist__name">
                    {c.secondYellow ? t('dialogo.segundoAmareloAdv') : t('dialogo.primeiroAmareloAdv')}
                  </span>
                  <span className="picklist__pos">{fmt(c.matchElapsedMs)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="muted">{t('dialogo.semAmareladosAdv')}</p>
      )}
    </Dialog>
  ));
}
