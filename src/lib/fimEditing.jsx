'use client';

// lib/fimEditing.jsx — acertar o minuto em que o jogo acabou.
//
// Quem se esquece de carregar em "Terminar" deixa o relógio a andar, e o tempo
// de todos os que ficaram em campo (e de banco) cresce sem parar. Aqui diz-se
// em que minuto o jogo acabou de facto, e tudo passa a contar só até aí.

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { events, matches, loadMatch } from './data/repository.js';
import * as sync from './data/sync.js';
import * as A from '@/domain/actions.js';
import { foulsTotal } from '@/domain/reducer.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import { limitesDoFim, validarFim } from '@/domain/fimDoJogo.js';
import { fmt } from '@/domain/clock.js';
import { parseClock } from './goalEditing.jsx';
import { eventLabel } from './format.js';
import { t } from '@/lib/i18n/index.js';

/** Minuto sugerido: o fim normal do jogo, dentro dos limites possíveis. */
function sugestao(state, periodDurationMs, lim) {
  const normal = 2 * (periodDurationMs || 20 * 60000);
  return Math.min(lim.maxMs, Math.max(lim.minMs, normal));
}

function mensagem(erro) {
  if (!erro) return null;
  const v = erro.valores || {};
  return t(erro.chave, {
    tempo: v.tempo != null ? fmt(v.tempo) : '',
    minimo: v.minimo != null ? fmt(v.minimo) : '',
    maximo: v.maximo != null ? fmt(v.maximo) : '',
    tipo: v.tipo ? eventLabel(v.tipo) : '',
  });
}

function FimDialog({ state, periodDurationMs, onClose, onSave }) {
  const agora = Date.now();
  const lim = limitesDoFim(state, agora);
  const [texto, setTexto] = useState(fmt(sugestao(state, periodDurationMs, lim)));
  const ms = parseClock(texto, NaN);
  const erro = validarFim(state, ms, agora);
  const terminado = state.status === MATCH_STATUS.FINISHED;

  return (
    <Dialog title={terminado ? t('fim.titulo') : t('fim.tituloPorTerminar')} onClose={onClose}>
      <div className="form">
        <p>{t(terminado ? 'fim.explicacao' : 'fim.explicacaoPorTerminar')}</p>

        <label className="field">
          <span className="field__label">{t('fim.campo')}</span>
          <input
            className="input input--time"
            value={texto}
            inputMode="numeric"
            autoFocus
            onChange={(e) => setTexto(e.target.value)}
          />
          <span className="field__hint">{t('fim.dica')}</span>
        </label>

        <p className="field__hint">
          {t('fim.registado', { tempo: fmt(lim.maxMs) })}
          {lim.ultimoRegisto
            ? ` · ${t('fim.ultimoRegisto', {
                tempo: fmt(lim.ultimoRegisto.ms),
                tipo: eventLabel(lim.ultimoRegisto.tipo),
              })}`
            : ''}
        </p>

        {erro ? (
          <p className="field__hint" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>
            {mensagem(erro)}
          </p>
        ) : null}
      </div>

      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" disabled={!!erro} onClick={() => onSave(ms)}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}

/**
 * Pergunta o minuto e grava. Devolve true se algo foi guardado.
 * - jogo por terminar: o evento normal de fim, num minuto escolhido;
 * - jogo terminado: uma correção (os eventos antigos não se mexem).
 */
export async function adjustEnd(ui, { matchId, periodDurationMs, syncUser = null }) {
  const carregado = await loadMatch(matchId);
  if (!carregado) return false;

  const ms = await ui.open((close) => (
    <FimDialog
      state={carregado.state}
      periodDurationMs={periodDurationMs}
      onClose={() => close(null)}
      onSave={(v) => close(v)}
    />
  ));
  if (ms == null) return false;

  // Voltar a validar com o estado mais recente: pode ter chegado um registo
  // de outro dispositivo entretanto.
  const snap = await loadMatch(matchId);
  const agora = Date.now();
  const erro = validarFim(snap.state, ms, agora);
  if (erro) {
    ui.toast(mensagem(erro), 'error');
    return false;
  }

  const terminado = snap.state.status === MATCH_STATUS.FINISHED;
  await events.append(
    terminado ? A.adjustEnd(snap.state, ms, agora) : A.finishMatchAt(snap.state, ms, agora),
    { sync: 'defer' }
  );

  const fresco = await loadMatch(matchId);
  const s = fresco.state;
  await matches.update(
    matchId,
    terminado
      ? { finishedAt: s.finishedAt }
      : {
          teamFouls: foulsTotal(s, 'US'),
          status: s.status,
          startedAt: s.startedAt,
          finishedAt: s.finishedAt,
          teamScore: s.teamScore,
          opponentScore: s.opponentScore,
          halftimeTeamScore: s.halftimeTeamScore,
          halftimeOpponentScore: s.halftimeOpponentScore,
          currentPeriod: s.currentPeriod,
          timerStatus: s.timerStatus,
        },
    { sync: 'defer' }
  );
  if (syncUser) await sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast(t('fim.guardado', { tempo: fmt(ms) }), 'ok');
  return true;
}
