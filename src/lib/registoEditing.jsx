'use client';

// lib/registoEditing.jsx — registos extra a frio, no intervalo e no resumo.
//
// O mesmo desenho das faltas (`foulEditing.jsx`): toca-se num registo da
// lista e abre a ficha dele, para corrigir o jogador, o resultado, o minuto
// ou o ponto no campo — ou para o apagar. A correção é um `STAT_CORRECTED`
// que aponta para o registo; apagar marca-o como desfeito, como nas faltas.
//
// Não se acrescentam registos a frio: um remate de que ninguém se lembra ao
// minuto e ao sítio vale menos do que nenhum.

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { events, loadMatch } from './data/repository.js';
import * as sync from './data/sync.js';
import * as A from '@/domain/actions.js';
import { fmt } from '@/domain/clock.js';
import {
  CATALOGO,
  COR_RESULTADO,
  COR_RESULTADO_ADV,
  RESULTADO_REMATE,
  corDoRegisto,
  corrigirRegisto,
} from '@/domain/registos.js';
import { CampoSvg } from '@/components/registos/CampoToque.jsx';
import { parseClock } from './goalEditing.jsx';
import { erroDoMinuto, periodoDoMinuto } from './foulEditing.jsx';
import { registoLabel } from './format.js';
import { t } from '@/lib/i18n/index.js';

/** Os resultados que se podem escolher a frio: um remate não entra nem sai do golo. */
function resultadosPossiveis(registo) {
  const def = CATALOGO[registo.registo];
  if (!def?.resultados) return [];
  if (registo.registo !== 'remate' && registo.registo !== 'remate_adv') return def.resultados;
  if (registo.resultado === RESULTADO_REMATE.GOLO) return [RESULTADO_REMATE.GOLO];
  return def.resultados.filter((r) => r !== RESULTADO_REMATE.GOLO);
}

function RegistoDialog({ state, registo, ourName, opponentName, onClose, onSave, onDelete }) {
  const def = CATALOGO[registo.registo];
  const [jogador, setJogador] = useState(registo.playerId || '');
  const [equipa, setEquipa] = useState(registo.equipa || 'US');
  const [resultado, setResultado] = useState(registo.resultado || '');
  const [minuto, setMinuto] = useState(fmt(registo.matchElapsedMs));
  const [ponto, setPonto] = useState(
    registo.x != null && registo.y != null ? { x: registo.x, y: registo.y } : null
  );

  const ms = parseClock(minuto, NaN);
  const erro = minuto.trim() ? erroDoMinuto(state, ms) : 'faltas.minutoInvalido';
  const valido = Number.isFinite(ms) && !erro && (def.por !== 'jogador' || jogador);
  const resultados = resultadosPossiveis(registo);
  const cores = def.soAdversario ? COR_RESULTADO_ADV : COR_RESULTADO;
  const todos = Object.values(state.players).sort((a, b) => a.number - b.number);
  const marca = ponto
    ? [{ ...registo, id: 'atual', x: ponto.x, y: ponto.y, cor: corDoRegisto({ ...registo, equipa, resultado }) }]
    : [];

  return (
    <Dialog title={t('registos.corrigir', { registo: t(`registos.nome.${registo.registo}`) })} onClose={onClose} wide>
      <div className="form">
        {def.por === 'jogador' ? (
          <label className="field">
            <span className="field__label">{t('registos.col.jogador')}</span>
            <select className="input" value={jogador} onChange={(e) => setJogador(e.target.value)}>
              {todos.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : def.soAdversario ? null : (
          <label className="field">
            <span className="field__label">{t('registos.aFavorDe')}</span>
            <select className="input" value={equipa} onChange={(e) => setEquipa(e.target.value)}>
              <option value="US">{ourName}</option>
              <option value="THEM">{opponentName}</option>
            </select>
          </label>
        )}

        {resultados.length > 1 ? (
          <div className="field">
            <span className="field__label">{t('registos.resultadoRotulo')}</span>
            <div className="regzona__opcoes">
              {resultados.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`regzona__opcao ${resultado === r ? 'is-on' : ''}`}
                  style={cores[r] ? { '--cor': cores[r] } : undefined}
                  onClick={() => setResultado(r)}
                >
                  {cores[r] ? <span className="regzona__bola" /> : null}
                  {t(`registos.${def.soAdversario ? 'resultadoAdv' : 'resultado'}.${r}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {registo.resultado === RESULTADO_REMATE.GOLO ? (
          <p className="field__hint">{t('registos.goloNaoMuda')}</p>
        ) : null}

        <label className="field">
          <span className="field__label">{t('golos.minuto')}</span>
          <input
            className="input input--time"
            value={minuto}
            inputMode="numeric"
            placeholder="mm:ss"
            onChange={(e) => setMinuto(e.target.value)}
          />
          <span className="field__hint">
            {Number.isFinite(ms) && !erro
              ? t('faltas.contaPara', { n: periodoDoMinuto(state, ms) })
              : t('golos.minutoDica')}
          </span>
        </label>
        {erro && minuto.trim() ? (
          <p className="field__hint" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>
            {t(erro, { tempo: fmt(state.elapsedMatchMs || 0) })}
          </p>
        ) : null}

        {def.ponto ? (
          <div className="field">
            <span className="field__label">{t('registos.onde')}</span>
            <CampoSvg markers={marca} lateral={Boolean(def.lateral)} onPick={setPonto} />
            <span className="field__hint">
              {ponto ? t('registos.tocaParaMudar') : t('registos.semPonto')}
              {ponto ? (
                <>
                  {' · '}
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setPonto(null)}>
                    {t('registos.tirarPonto')}
                  </button>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>

      <footer className="modal__actions">
        <button className="btn btn--ghost btn--danger" onClick={onDelete}>
          {t('registos.apagar')}
        </button>
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button
          className="btn btn--primary"
          disabled={!valido}
          onClick={() =>
            onSave({
              playerId: def.por === 'jogador' ? jogador : null,
              equipa,
              resultado: resultado || null,
              matchElapsedMs: ms,
              period: periodoDoMinuto(state, ms),
              x: ponto?.x ?? null,
              y: ponto?.y ?? null,
            })
          }
        >
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}

/**
 * Só o que mudou vai na correção: um evento que repete tudo diria que se
 * corrigiu o jogador quando só se mexeu no minuto.
 */
export function camposMudados(registo, novo) {
  const def = CATALOGO[registo.registo];
  const campos = {};
  if (def.por === 'jogador' && novo.playerId && novo.playerId !== registo.playerId) {
    campos.playerId = novo.playerId;
  }
  if (def.por === 'equipa' && novo.equipa !== registo.equipa) campos.equipa = novo.equipa;
  if (def.resultados && novo.resultado && novo.resultado !== registo.resultado) {
    campos.resultado = novo.resultado;
  }
  if (novo.matchElapsedMs !== registo.matchElapsedMs) {
    campos.matchElapsedMs = novo.matchElapsedMs;
    campos.period = novo.period;
  }
  if (def.ponto && (novo.x !== registo.x || novo.y !== registo.y)) {
    campos.x = novo.x;
    campos.y = novo.y;
  }
  return campos;
}

/** Corrige ou apaga um registo. Devolve true se mudou alguma coisa. */
export async function editRegisto(ui, { matchId, registo, ourName, opponentName, syncUser = null }) {
  const antes = await loadMatch(matchId);
  if (!antes) return false;
  const r = await ui.open((close) => (
    <RegistoDialog
      state={antes.state}
      registo={registo}
      ourName={ourName}
      opponentName={opponentName}
      onClose={() => close(null)}
      onSave={(v) => close({ acao: 'guardar', ...v })}
      onDelete={() => close({ acao: 'apagar' })}
    />
  ));
  if (!r) return false;

  const snap = await loadMatch(matchId);
  if (r.acao === 'apagar') {
    const ok = await ui.confirmar(
      t('registos.confirmaApagar', {
        registo: registoLabel(registo, snap.state.players),
        tempo: fmt(registo.matchElapsedMs),
      }),
      { okLabel: t('registos.apagar'), title: t('registos.apagar') }
    );
    if (!ok) return false;
    const alvo = (snap.state.allEvents || []).find((e) => e.id === registo.eventId);
    if (!alvo) return false;
    await events.markUndone(alvo.id, null);
    await events.append(A.undoEvent(snap.state, alvo));
    if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
    ui.toast(t('registos.apagado'), 'ok');
    return true;
  }

  if (erroDoMinuto(snap.state, r.matchElapsedMs)) return false;
  const campos = camposMudados(registo, r);
  if (!Object.keys(campos).length) return false;
  await events.append(corrigirRegisto(snap.state, { targetEventId: registo.eventId, ...campos }));
  if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast(t('registos.atualizado'), 'ok');
  return true;
}
