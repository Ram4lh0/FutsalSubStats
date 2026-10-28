'use client';

// lib/cardEditing.jsx — cartões a frio, no intervalo e no resumo.
//
// Um cartão pode não ter vindo de uma falta apontada, ou ter ficado por apontar
// no calor do jogo. Aqui acrescenta-se (nosso, com o jogador; do adversário, só
// com o número), corrige-se ou apaga-se. Corrigir é tirar o antigo e pôr um novo
// no minuto certo — como mudar a equipa de uma falta (`foulEditing.jsx`).
//
// Um cartão acrescentado a frio não expulsa nem mexe nos tempos de ninguém: o
// jogo já passou, e os tempos acertam-se em "Editar tempos".

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { events, loadMatch } from './data/repository.js';
import * as sync from './data/sync.js';
import * as A from '@/domain/actions.js';
import { CARD } from '@/domain/constants.js';
import { fmt } from '@/domain/clock.js';
import { onCourtAt, parseClock, mascaraTempo } from './goalEditing.jsx';
import { erroDoMinuto, periodoDoMinuto } from './foulEditing.jsx';
import { t } from '@/lib/i18n/index.js';

function CardDialog({ state, card, ourName, opponentName, onClose, onSave, onDelete }) {
  const nova = !card;
  const [equipa, setEquipa] = useState(card?.team || 'US');
  const [tipo, setTipo] = useState(card?.type || CARD.YELLOW);
  const [jogador, setJogador] = useState(card?.playerId || '');
  const [numero, setNumero] = useState(card?.number != null ? String(card.number) : '');
  const [minuto, setMinuto] = useState(card ? fmt(card.matchElapsedMs) : '');

  const ms = parseClock(minuto, NaN);
  const erro = minuto.trim() ? erroDoMinuto(state, ms) : null;
  const num = Number(numero);
  const numeroValido = Number.isInteger(num) && num >= 1 && num <= 99;
  const valido =
    Number.isFinite(ms) && !erro && (equipa === 'US' ? Boolean(jogador) : numeroValido);

  const todos = Object.values(state.players).sort((a, b) => a.number - b.number);
  const emCampo =
    Number.isFinite(ms) && !erro ? onCourtAt(state, ms).sort((a, b) => a.number - b.number) : [];
  const idsEmCampo = new Set(emCampo.map((p) => p.playerId));
  const restantes = todos.filter((p) => !idsEmCampo.has(p.playerId));
  const opcao = (p) => (
    <option key={p.playerId} value={p.playerId}>
      #{p.number} {p.name}
    </option>
  );

  return (
    <Dialog title={nova ? t('cartoes.novo') : t('cartoes.corrigir')} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="field__label">{t('cartoes.deQuem')}</span>
          <select
            className="input"
            value={equipa}
            onChange={(e) => {
              setEquipa(e.target.value);
              if (e.target.value === 'THEM') setTipo(CARD.YELLOW);
            }}
          >
            <option value="US">{ourName}</option>
            <option value="THEM">{opponentName}</option>
          </select>
        </label>

        {equipa === 'US' ? (
          <>
            <label className="field">
              <span className="field__label">{t('cartoes.tipo')}</span>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value={CARD.YELLOW}>{t('cartao.YELLOW')}</option>
                <option value={CARD.RED}>{t('cartao.RED')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('registos.col.jogador')}</span>
              <select className="input" value={jogador} onChange={(e) => setJogador(e.target.value)}>
                <option value="">{t('cartoes.escolherJogador')}</option>
                {emCampo.length ? (
                  <>
                    <optgroup label={t('faltas.emCampo')}>{emCampo.map(opcao)}</optgroup>
                    <optgroup label={t('faltas.restantes')}>{restantes.map(opcao)}</optgroup>
                  </>
                ) : (
                  todos.map(opcao)
                )}
              </select>
            </label>
          </>
        ) : (
          <label className="field">
            <span className="field__label">{t('dialogo.amareloAdvNumero')}</span>
            <input
              className="input"
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </label>
        )}

        <label className="field">
          <span className="field__label">{t('golos.minuto')}</span>
          <input
            className="input input--time"
            value={minuto}
            inputMode="numeric"
            placeholder="mm:ss"
            autoFocus={nova}
            onChange={(e) => setMinuto(mascaraTempo(e.target.value, minuto))}
          />
          <span className="field__hint">
            {Number.isFinite(ms) && !erro
              ? t('faltas.contaPara', { n: periodoDoMinuto(state, ms) })
              : t('golos.minutoDica')}
          </span>
        </label>
        {erro ? (
          <p className="field__hint" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>
            {t(erro, { tempo: fmt(state.elapsedMatchMs || 0) })}
          </p>
        ) : null}
        <p className="muted small">{t('cartoes.aFrioNota')}</p>
      </div>

      <footer className="modal__actions">
        {nova ? null : (
          <button className="btn btn--ghost btn--danger" onClick={onDelete}>
            {t('cartoes.apagar')}
          </button>
        )}
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button
          className="btn btn--primary"
          disabled={!valido}
          onClick={() =>
            onSave({
              team: equipa,
              type: equipa === 'US' ? tipo : CARD.YELLOW,
              playerId: equipa === 'US' ? jogador : null,
              number: equipa === 'THEM' ? num : null,
              matchElapsedMs: ms,
              period: periodoDoMinuto(state, ms),
            })
          }
        >
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}

function abrir(ui, state, card, nomes) {
  return ui.open((close) => (
    <CardDialog
      state={state}
      card={card}
      ourName={nomes.ourName}
      opponentName={nomes.opponentName}
      onClose={() => close(null)}
      onSave={(v) => close({ acao: 'guardar', ...v })}
      onDelete={() => close({ acao: 'apagar' })}
    />
  ));
}

async function apagar(state, eventId) {
  const alvo = (state.allEvents || []).find((e) => e.id === eventId);
  if (!alvo) return false;
  await events.markUndone(alvo.id, null);
  await events.append(A.undoEvent(state, alvo));
  return true;
}

function eventoNovo(state, r) {
  return r.team === 'US'
    ? A.lateCard(state, r)
    : A.lateOpponentYellow(state, {
        number: r.number,
        matchElapsedMs: r.matchElapsedMs,
        period: r.period,
      });
}

/** Já foi expulso pelos dois amarelos? Um terceiro ao mesmo número não existe. */
function advJaExpulso(state, r, ignorar) {
  return (
    r.team === 'THEM' &&
    (state.opponentCards || []).some(
      (c) => c.number === r.number && c.secondYellow && c.eventId !== ignorar
    )
  );
}

/** Acrescenta um cartão que ficou por apontar. Devolve true se gravou. */
export async function addCard(ui, { matchId, ourName, opponentName, syncUser = null }) {
  const antes = await loadMatch(matchId);
  if (!antes) return false;
  const r = await abrir(ui, antes.state, null, { ourName, opponentName });
  if (!r) return false;

  const snap = await loadMatch(matchId);
  if (erroDoMinuto(snap.state, r.matchElapsedMs)) return false;
  if (advJaExpulso(snap.state, r)) {
    ui.toast(t('acao.advJaExpulso'), 'error');
    return false;
  }
  await events.append(eventoNovo(snap.state, r));
  if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast(t('cartoes.acrescentado'), 'ok');
  return true;
}

/** Corrige ou apaga um cartão. Devolve true se mudou alguma coisa. */
export async function editCard(ui, { matchId, card, ourName, opponentName, syncUser = null }) {
  const antes = await loadMatch(matchId);
  if (!antes) return false;
  const r = await abrir(ui, antes.state, card, { ourName, opponentName });
  if (!r) return false;

  if (r.acao === 'apagar') {
    const ok = await ui.confirmar(
      t('cartoes.confirmaApagar', {
        equipa: card.team === 'US' ? ourName : opponentName,
        tempo: fmt(card.matchElapsedMs),
      }),
      { okLabel: t('cartoes.apagar'), title: t('cartoes.apagar') }
    );
    if (!ok) return false;
    const snap = await loadMatch(matchId);
    if (!(await apagar(snap.state, card.eventId))) return false;
    if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
    ui.toast(t('cartoes.apagado'), 'ok');
    return true;
  }

  const snap = await loadMatch(matchId);
  if (erroDoMinuto(snap.state, r.matchElapsedMs)) return false;
  if (advJaExpulso(snap.state, r, card.eventId)) {
    ui.toast(t('acao.advJaExpulso'), 'error');
    return false;
  }
  if (!(await apagar(snap.state, card.eventId))) return false;
  const depois = await loadMatch(matchId);
  await events.append(eventoNovo(depois.state, r));
  if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast(t('cartoes.atualizado'), 'ok');
  return true;
}
