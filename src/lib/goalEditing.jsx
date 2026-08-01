'use client';

// lib/goalEditing.jsx — correção de golos, partilhada pelo intervalo e pelo resumo.
//
// O mesmo treinador quer arranjar o mesmo engano nos dois sítios: ou o resultado
// inteiro está errado, ou só falta dizer quem marcou um golo em concreto. Manter
// isto num módulo evita que as duas vistas divirjam com o tempo.

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { events, loadMatch } from './data/repository.js';
import * as sync from './data/sync.js';
import * as A from '@/domain/actions.js';
import { EVENT, normalizePosition } from '@/domain/constants.js';
import { fmt } from '@/domain/clock.js';

export const OWN_GOAL = '__OWN_GOAL__';

/**
 * Quem estava em campo num dado instante do jogo, segundo os períodos derivados
 * dos eventos. Um golo é de quem estava a jogar naquele momento — no intervalo
 * ou no fim já não há ninguém em campo, por isso a pergunta é sempre "quem
 * estava lá", nunca "quem está lá".
 */
export function onCourtAt(state, ms) {
  return Object.values(state.players).filter((p) =>
    (p.stints || []).some(
      // Fim exclusivo: quem saiu exactamente naquele instante já não estava lá
      // — senão uma substituição feita no golo mostrava seis jogadores.
      (st) => st.startMatchMs <= ms && (st.endMatchMs == null || st.endMatchMs > ms)
    )
  );
}

/** "12:30" ou "12" → milissegundos. Texto inválido devolve o valor original. */
export function parseClock(txt, fallback) {
  const m = String(txt || '')
    .trim()
    .match(/^(\d{1,3})(?::([0-5]?\d))?$/);
  if (!m) return fallback;
  return (Number(m[1]) * 60 + Number(m[2] || 0)) * 1000;
}

/** Em que parte cai um dado instante, agora que o minuto pode ser corrigido. */
function periodOf(state, ms, fallback) {
  const primeira = state.firstHalfMs || 0;
  if (!primeira) return fallback;
  return ms > primeira ? 2 : 1;
}

/**
 * Ficha de um golo: tudo o que há para dizer sobre ele numa só janela, já
 * preenchida com o que está registado. Perguntar campo a campo obrigava a
 * atravessar três popups para corrigir um pormenor.
 */
function GoalDialog({ state, goal, title, onClose, onSave, toast }) {
  const nosso = goal.team === 'US';
  const emCampo = onCourtAt(state, goal.matchElapsedMs);
  const jogadores = emCampo.length ? emCampo : Object.values(state.players);
  const guardaRedes = Object.values(state.players).filter((p) => {
    const estavaNaBaliza = (p.stints || []).some(
      (st) =>
        st.startMatchMs <= goal.matchElapsedMs &&
        (st.endMatchMs == null || st.endMatchMs > goal.matchElapsedMs) &&
        st.startingPosition === 'GOALKEEPER'
    );
    return (
      estavaNaBaliza ||
      p.playerId === goal.goalkeeperId ||
      normalizePosition(p.preferredPosition) === 'GOALKEEPER'
    );
  });
  const pool = (nosso ? jogadores : guardaRedes).sort(
    (a, b) => a.number - b.number
  );

  const [quem, setQuem] = useState(
    nosso ? (goal.ownGoal ? OWN_GOAL : goal.scorerId || '') : goal.goalkeeperId || ''
  );
  const [assist, setAssist] = useState(goal.assistId || '');
  const [minuto, setMinuto] = useState(fmt(goal.matchElapsedMs));

  function guardar() {
    const ms = parseClock(minuto, goal.matchElapsedMs);
    // Um golo não pode ter acontecido depois do jogo: o tempo efectivo é o tecto
    // de tudo o que se passou dentro das quatro linhas.
    const limite = state.elapsedMatchMs || 0;
    if (limite && ms > limite) {
      toast(`O jogo só tem ${fmt(limite)}. Escolha um minuto até aí.`, 'error');
      return;
    }
    const patch = { matchElapsedMs: ms, period: periodOf(state, ms, goal.period) };
    if (nosso) {
      patch.ownGoal = quem === OWN_GOAL;
      patch.scorerId = patch.ownGoal ? null : quem || null;
      patch.assistId = patch.ownGoal ? null : assist || null;
      if (patch.scorerId && patch.scorerId === patch.assistId) patch.assistId = null;
    } else {
      patch.goalkeeperId = quem || null;
    }
    onSave(patch);
  }

  const opcoes = (extra = []) => (
    <>
      <option value="">{nosso ? 'Sem marcador registado' : 'Sem guarda-redes registado'}</option>
      {pool.map((p) => (
        <option key={p.playerId} value={p.playerId}>
          #{p.number} {p.name}
        </option>
      ))}
      {extra.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </>
  );

  return (
    <Dialog title={title || (nosso ? 'Golo marcado' : 'Golo sofrido')} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="field__label">{nosso ? 'Quem marcou' : 'Quem sofreu'}</span>
          <select className="input" value={quem} onChange={(e) => setQuem(e.target.value)}>
            {opcoes(nosso ? [{ id: OWN_GOAL, label: 'Autogolo do adversário' }] : [])}
          </select>
        </label>

        {nosso ? (
          <label className="field">
            <span className="field__label">Quem assistiu</span>
            <select className="input" value={assist} onChange={(e) => setAssist(e.target.value)}>
              <option value="">Sem assistência</option>
              {pool
                .filter((p) => p.playerId !== quem)
                .map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    #{p.number} {p.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">Minuto do jogo</span>
          <input
            className="input input--time"
            value={minuto}
            inputMode="numeric"
            onChange={(e) => setMinuto(e.target.value)}
          />
          <span className="field__hint">Formato mm:ss, em tempo de jogo.</span>
        </label>
      </div>

      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn--primary" onClick={guardar}>
          Guardar
        </button>
      </footer>
    </Dialog>
  );
}

/** Abre a ficha de um golo e devolve o que ficou por guardar (ou null). */
export function goalDialog(ui, state, goal, { title } = {}) {
  return ui.open((close) => (
    <GoalDialog
      state={state}
      goal={goal}
      title={title}
      toast={ui.toast}
      onClose={() => close(null)}
      onSave={(patch) => close(patch)}
    />
  ));
}

/**
 * Edita um golo isolado. Devolve true se mudou alguma coisa, para quem chama
 * saber se precisa de redesenhar.
 */
export async function editGoal(ui, { matchId, goal, syncUser = null }) {
  const antes = await loadMatch(matchId);
  if (!antes) return false;
  const patch = await goalDialog(ui, antes.state, goal);
  if (!patch) return false;
  await events.append(A.attributeGoal(antes.state, { targetEventId: goal.eventId, ...patch }));
  if (syncUser) await sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast(goal.team === 'US' ? 'Golo atualizado.' : 'Golo sofrido atualizado.', 'ok');
  return true;
}

function ScoreDialog({ state, ourName, opponentName, onClose, onSave }) {
  const [nossos, setNossos] = useState(String(state.teamScore));
  const [deles, setDeles] = useState(String(state.opponentScore));

  return (
    <Dialog title="Corrigir resultado" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="field__label">Golos do {ourName}</span>
          <input
            className="input"
            type="number"
            min={0}
            value={nossos}
            onChange={(e) => setNossos(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Golos do {opponentName}</span>
          <input
            className="input"
            type="number"
            min={0}
            value={deles}
            onChange={(e) => setDeles(e.target.value)}
          />
        </label>
        <p className="muted">A seguir confirma-se a ficha de cada golo, um a um.</p>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn btn--primary"
          onClick={() =>
            onSave({
              team: Math.max(0, Number(nossos) || 0),
              opponent: Math.max(0, Number(deles) || 0),
            })
          }
        >
          Continuar
        </button>
      </footer>
    </Dialog>
  );
}

/**
 * Correção em duas fases: primeiro o resultado certo, depois a ficha de cada
 * golo, um a um.
 *
 * O resultado é acertado acrescentando ou retirando golos — não com um valor
 * solto por cima. Assim o número de golos e a lista de golos nunca divergem, e
 * há mesmo um golo 1, 2, 3… para atribuir a alguém.
 */
export async function correctScore(ui, { matchId, ourName, opponentName, syncUser = null }) {
  const carregado = await loadMatch(matchId);
  if (!carregado) return false;

  const alvo = await ui.open((close) => (
    <ScoreDialog
      state={carregado.state}
      ourName={ourName}
      opponentName={opponentName}
      onClose={() => close(null)}
      onSave={(v) => close(v)}
    />
  ));
  if (!alvo) return false;

  await reconcileGoals(matchId, 'US', alvo.team);
  await reconcileGoals(matchId, 'THEM', alvo.opponent);

  const fresco = await loadMatch(matchId);
  const nossos = fresco.state.goals.filter((g) => g.team === 'US');
  const deles = fresco.state.goals.filter((g) => g.team === 'THEM');
  const fila = [
    ...nossos.map((g, i) => ({ goal: g, title: `${i + 1}.º golo do ${ourName}` })),
    ...deles.map((g, i) => ({ goal: g, title: `${i + 1}.º golo do ${opponentName}` })),
  ];

  for (const { goal, title } of fila) {
    const snap = await loadMatch(matchId);
    const patch = await goalDialog(ui, snap.state, goal, { title });
    if (!patch) break; // fechou a ficha: pára por aqui
    await events.append(A.attributeGoal(snap.state, { targetEventId: goal.eventId, ...patch }));
  }

  if (syncUser) await sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast('Correções guardadas.', 'ok');
  return true;
}

/** Acerta o número de golos de uma equipa acrescentando ou retirando. */
async function reconcileGoals(matchId, team, target) {
  const addType = team === 'US' ? EVENT.TEAM_GOAL_ADDED : EVENT.OPPONENT_GOAL_ADDED;
  const removeType = team === 'US' ? EVENT.TEAM_GOAL_REMOVED : EVENT.OPPONENT_GOAL_REMOVED;
  for (let guarda = 0; guarda < 40; guarda++) {
    const fresco = await loadMatch(matchId);
    const total = fresco.state.goals.filter((g) => g.team === team).length;
    if (total === target) return;
    await events.append(A.goal(fresco.state, total < target ? addType : removeType));
  }
}
