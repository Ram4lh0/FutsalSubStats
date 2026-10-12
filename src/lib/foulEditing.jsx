'use client';

// lib/foulEditing.jsx — faltas a frio, partilhadas pelo intervalo e pelo resumo.
//
// Durante o jogo as faltas vão-se perdendo: o treinador está a fazer uma
// substituição, o árbitro apita e ninguém toca no botão. No intervalo (ou no
// fim) quer acrescentar as que faltam, dizer quem as fez ou sofreu, acertar o
// minuto — ou apagar uma que não era. É o mesmo par de sítios dos golos, por
// isso vive ao lado de `goalEditing.jsx` e segue as mesmas regras.

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { events, matches, loadMatch } from './data/repository.js';
import * as sync from './data/sync.js';
import * as A from '@/domain/actions.js';
import { foulsTotal } from '@/domain/reducer.js';
import { fmt } from '@/domain/clock.js';
import { onCourtAt, parseClock } from './goalEditing.jsx';
import { t } from '@/lib/i18n/index.js';

/**
 * Em que parte cai um minuto. Sem fim da 1.ª parte registado o jogo ainda não
 * passou do intervalo, por isso é a 1.ª.
 */
export function periodoDoMinuto(state, ms) {
  const primeira = state.firstHalfMs || 0;
  if (!primeira) return 1;
  return ms > primeira ? 2 : 1;
}

/**
 * Valida o minuto escrito. Devolve a chave de tradução do erro, ou null.
 * O tecto é o tempo de jogo já jogado: no intervalo, o fim da 1.ª parte.
 */
export function erroDoMinuto(state, ms) {
  if (!Number.isFinite(ms)) return 'faltas.minutoInvalido';
  const limite = state.elapsedMatchMs || 0;
  if (limite && ms > limite) return 'golos.minutoForaDoJogo';
  return null;
}

function FoulDialog({ state, foul, ourName, opponentName, onClose, onSave, onDelete }) {
  const nova = !foul;
  const [equipa, setEquipa] = useState(foul?.team || 'US');
  const [jogador, setJogador] = useState(foul?.playerId || '');
  const [minuto, setMinuto] = useState(foul ? fmt(foul.matchElapsedMs) : '');

  const ms = parseClock(minuto, NaN);
  const erro = minuto.trim() ? erroDoMinuto(state, ms) : null;
  const valido = Number.isFinite(ms) && !erro;

  // Quem estava em campo naquele minuto vem primeiro; os outros convocados
  // continuam lá, para o minuto não ter de estar certo ao segundo.
  const todos = Object.values(state.players).sort((a, b) => a.number - b.number);
  const emCampo = valido ? onCourtAt(state, ms).sort((a, b) => a.number - b.number) : [];
  const idsEmCampo = new Set(emCampo.map((p) => p.playerId));
  const restantes = todos.filter((p) => !idsEmCampo.has(p.playerId));

  const opcao = (p) => (
    <option key={p.playerId} value={p.playerId}>
      #{p.number} {p.name}
    </option>
  );

  return (
    <Dialog title={nova ? t('faltas.novaFalta') : t('faltas.corrigirFalta')} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="field__label">{t('faltas.deQuem')}</span>
          <select className="input" value={equipa} onChange={(e) => setEquipa(e.target.value)}>
            <option value="US">{t('faltas.de', { equipa: ourName })}</option>
            <option value="THEM">{t('faltas.de', { equipa: opponentName })}</option>
          </select>
        </label>

        <label className="field">
          {/* Do adversário não há plantel: numa falta deles o jogador que
              interessa é o nosso que a sofreu. */}
          <span className="field__label">
            {equipa === 'US' ? t('acao.quemFezFalta') : t('acao.quemSofreuFalta')}
          </span>
          <select className="input" value={jogador} onChange={(e) => setJogador(e.target.value)}>
            <option value="">{t('faltas.porRegistar')}</option>
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

        <label className="field">
          <span className="field__label">{t('golos.minuto')}</span>
          <input
            className="input input--time"
            value={minuto}
            inputMode="numeric"
            placeholder="mm:ss"
            autoFocus={nova}
            onChange={(e) => setMinuto(e.target.value)}
          />
          <span className="field__hint">
            {valido
              ? t('faltas.contaPara', { n: periodoDoMinuto(state, ms) })
              : t('golos.minutoDica')}
          </span>
        </label>

        {erro ? (
          <p className="field__hint" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>
            {t(erro, { tempo: fmt(state.elapsedMatchMs || 0) })}
          </p>
        ) : null}
      </div>

      <footer className="modal__actions">
        {nova ? null : (
          <button className="btn btn--ghost btn--danger" onClick={onDelete}>
            {t('faltas.apagar')}
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
              playerId: jogador || null,
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

function abrir(ui, state, foul, nomes) {
  return ui.open((close) => (
    <FoulDialog
      state={state}
      foul={foul}
      ourName={nomes.ourName}
      opponentName={nomes.opponentName}
      onClose={() => close(null)}
      onSave={(v) => close({ acao: 'guardar', ...v })}
      onDelete={() => close({ acao: 'apagar' })}
    />
  ));
}

/** Apaga uma falta concreta — não a última, como o botão "−" do jogo ao vivo. */
async function apagar(state, eventId) {
  const alvo = (state.allEvents || []).find((e) => e.id === eventId);
  if (!alvo) return false;
  await events.markUndone(alvo.id, null);
  await events.append(A.undoEvent(state, alvo));
  return true;
}

/**
 * O total de faltas também vive na linha do jogo (`matches.team_fouls`), para
 * o histórico e as exportações não terem de refazer o jogo a partir dos
 * eventos. Uma falta corrigida tem de chegar lá.
 */
async function fechar(matchId, syncUser) {
  const fresco = await loadMatch(matchId);
  if (fresco) await matches.update(matchId, { teamFouls: foulsTotal(fresco.state, 'US') });
  if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
}

/** Acrescenta uma falta que ficou por registar. Devolve true se gravou. */
export async function addFoul(ui, { matchId, ourName, opponentName, syncUser = null }) {
  const antes = await loadMatch(matchId);
  if (!antes) return false;
  const r = await abrir(ui, antes.state, null, { ourName, opponentName });
  if (!r) return false;

  const snap = await loadMatch(matchId);
  if (erroDoMinuto(snap.state, r.matchElapsedMs)) return false;
  await events.append(A.lateFoul(snap.state, r));
  await fechar(matchId, syncUser);
  ui.toast(t('faltas.acrescentada'), 'ok');
  return true;
}

/**
 * Corrige ou apaga uma falta. Mudar de equipa não é uma correção do autor:
 * uma falta nossa e uma deles contam em contadores diferentes, por isso sai a
 * antiga e entra uma nova no mesmo minuto.
 */
export async function editFoul(ui, { matchId, foul, ourName, opponentName, syncUser = null }) {
  const antes = await loadMatch(matchId);
  if (!antes) return false;
  const r = await abrir(ui, antes.state, foul, { ourName, opponentName });
  if (!r) return false;

  if (r.acao === 'apagar') {
    const ok = await ui.confirmar(
      t('faltas.confirmaApagar', {
        equipa: foul.team === 'US' ? ourName : opponentName,
        tempo: fmt(foul.matchElapsedMs),
      }),
      { okLabel: t('faltas.apagar'), title: t('faltas.apagar') }
    );
    if (!ok) return false;
    const snap = await loadMatch(matchId);
    if (!(await apagar(snap.state, foul.eventId))) return false;
    await fechar(matchId, syncUser);
    ui.toast(t('faltas.apagada'), 'ok');
    return true;
  }

  const snap = await loadMatch(matchId);
  if (erroDoMinuto(snap.state, r.matchElapsedMs)) return false;
  if (r.team !== foul.team) {
    if (!(await apagar(snap.state, foul.eventId))) return false;
    const depois = await loadMatch(matchId);
    await events.append(A.lateFoul(depois.state, r));
  } else {
    await events.append(A.correctFoul(snap.state, { targetEventId: foul.eventId, ...r }));
  }
  await fechar(matchId, syncUser);
  ui.toast(t('faltas.atualizada'), 'ok');
  return true;
}
