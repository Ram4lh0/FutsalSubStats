'use client';

// lib/temposEditing.jsx — corrigir os tempos de um jogador no fim do jogo.
//
// A ficha das entradas de um jogador, editável: de que minuto a que minuto
// esteve em campo, em cada entrada. Acrescenta-se uma entrada que faltou,
// tira-se uma que não existiu, acerta-se um minuto. Grava a lista inteira num
// `MATCH_CORRECTED` (ver domain/tempos.js); as substituições registadas ao
// vivo ficam como estão.
//
// Quem não sabe as trocas todas escolhe "Só o total": escreve quanto tempo o
// jogador esteve em campo e as entradas ajustam-se a esse total
// (`ajustarAoTotal`).
//
// No intervalo abre-se com `parte: 1`: só se veem e corrigem as entradas da
// 1.ª parte, e a 2.ª, que ainda está por jogar, não é tocada.

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { events, loadMatch } from './data/repository.js';
import * as sync from './data/sync.js';
import * as A from '@/domain/actions.js';
import { fmt } from '@/domain/clock.js';
import {
  ajustarAoTotal,
  entradasDe,
  excessoEmCampo,
  limitesDasPartes,
  metadataDosTempos,
  parteDe,
  validarEntradas,
} from '@/domain/tempos.js';
import { parseClock } from './goalEditing.jsx';
import { t } from '@/lib/i18n/index.js';

function mensagem(erro) {
  if (!erro) return null;
  const v = erro.valores || {};
  return t(erro.chave, {
    maximo: v.maximo != null ? fmt(v.maximo) : '',
    intervalo: v.intervalo != null ? fmt(v.intervalo) : '',
  });
}

/** Uma entrada nova: a seguir à última, ou no início do jogo. */
function entradaNova(state, linhas, parte) {
  const { total } = limitesDasPartes(state, { parte });
  const fins = linhas.map((l) => parseClock(l.fim, NaN)).filter(Number.isFinite);
  // Sem espaço depois da última (acaba no fim do jogo), começa no início.
  const depois = fins.length ? Math.max(...fins) : 0;
  const inicio = depois < total ? depois : 0;
  return { inicio: fmt(inicio), fim: fmt(Math.min(total, inicio + 60000)) };
}

const soma = (lista) => lista.reduce((a, e) => a + (e.fimMs - e.inicioMs), 0);

function TemposDialog({ state, jogador, parte, onClose, onSave, onRepor }) {
  const so = { parte };
  const registadas = entradasDe(state, jogador.playerId, so);
  const [modo, setModo] = useState('entradas');
  const [linhas, setLinhas] = useState(() =>
    registadas.map((e) => ({ inicio: fmt(e.inicioMs), fim: fmt(e.fimMs) }))
  );
  const [totalTexto, setTotalTexto] = useState(() => fmt(soma(registadas)));
  const { primeira, total } = limitesDasPartes(state, so);

  // Modo entradas: a lista escrita à mão.
  const escritas = linhas.map((l) => ({ inicioMs: parseClock(l.inicio, NaN), fimMs: parseClock(l.fim, NaN) }));
  // Modo total: as entradas registadas, esticadas ou encolhidas até ao total.
  const alvo = parseClock(totalTexto, NaN);
  const erroTotal = !Number.isFinite(alvo)
    ? { chave: 'tempos.erro.minuto' }
    : alvo > total
      ? { chave: 'tempos.erro.foraDoJogo', valores: { maximo: total } }
      : null;
  const ajustadas = modo === 'total' && !erroTotal ? ajustarAoTotal(state, jogador.playerId, alvo, so) : [];

  const entradas = modo === 'total' ? ajustadas : escritas;
  const erro = modo === 'total' ? erroTotal : validarEntradas(state, escritas, so);
  const excesso = erro ? null : excessoEmCampo(state, jogador.playerId, entradas, so);
  const totalMs = erro ? null : soma(entradas);

  const mudar = (i, campo, valor) =>
    setLinhas((atuais) => atuais.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  return (
    <Dialog
      title={t(parte === 1 ? 'tempos.tituloParte1' : 'tempos.titulo', { numero: jogador.number, nome: jogador.name })}
      onClose={onClose}
      wide
    >
      <div className="form">
        <div className="tempos__modos" role="tablist">
          {[
            ['entradas', t('tempos.modoEntradas')],
            ['total', t('tempos.modoTotal')],
          ].map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={modo === id}
              className={`chip ${modo === id ? 'is-on' : ''}`.trim()}
              onClick={() => setModo(id)}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {modo === 'total' ? (
          <>
            <p className="muted small">
              {parte === 1
                ? t('tempos.explicacaoTotalParte1', { fim: fmt(total) })
                : t('tempos.explicacaoTotal', { fim: fmt(total) })}
            </p>
            <label className="field">
              <span className="field__label">{t('tempos.totalEmCampo')}</span>
              <input
                className="input input--time tempos__totalInput"
                value={totalTexto}
                inputMode="numeric"
                placeholder="mm:ss"
                autoFocus
                onChange={(e) => setTotalTexto(e.target.value)}
              />
              <span className="field__hint">{t('tempos.registadoAoVivo', { tempo: fmt(soma(registadas)) })}</span>
            </label>
            {ajustadas.length ? (
              <p className="field__hint">
                {t('tempos.ficaCom')}{' '}
                {ajustadas
                  .map((e) => `${fmt(e.inicioMs)}–${fmt(e.fimMs)} (${t('tempos.parte', { n: parteDe(state, e.inicioMs) })})`)
                  .join(' · ')}
              </p>
            ) : null}
            <p className="muted small">{t('tempos.aproximado')}</p>
          </>
        ) : (
          <>
        <p className="muted small">
          {parte === 1
            ? t('tempos.explicacaoParte1', { fim: fmt(total) })
            : t('tempos.explicacao', { intervalo: fmt(primeira), fim: fmt(total) })}
        </p>

        {linhas.length ? (
          <ul className="tempos">
            {linhas.map((l, i) => {
              const ini = entradas[i].inicioMs;
              const comErro = erro?.indice === i;
              return (
                <li key={i} className={`tempos__linha ${comErro ? 'is-erro' : ''}`.trim()}>
                  <span className="tempos__rot">
                    {t('dialogo.entrada', { n: i + 1 })}
                    {Number.isFinite(ini) ? (
                      <span className="muted"> · {t('tempos.parte', { n: parteDe(state, ini) })}</span>
                    ) : null}
                  </span>
                  <label className="tempos__campo">
                    <span className="field__label">{t('tempos.entrou')}</span>
                    <input
                      className="input input--time"
                      value={l.inicio}
                      inputMode="numeric"
                      placeholder="mm:ss"
                      onChange={(e) => mudar(i, 'inicio', e.target.value)}
                    />
                  </label>
                  <label className="tempos__campo">
                    <span className="field__label">{t('tempos.saiu')}</span>
                    <input
                      className="input input--time"
                      value={l.fim}
                      inputMode="numeric"
                      placeholder="mm:ss"
                      onChange={(e) => mudar(i, 'fim', e.target.value)}
                    />
                  </label>
                  <span className="tempos__dur mono">
                    {Number.isFinite(entradas[i].fimMs - ini) && entradas[i].fimMs > ini
                      ? fmt(entradas[i].fimMs - ini)
                      : '—'}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--tiny tempos__tirar"
                    aria-label={t('tempos.tirar', { n: i + 1 })}
                    title={t('tempos.tirar', { n: i + 1 })}
                    onClick={() => setLinhas((atuais) => atuais.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{t('tempos.semEntradas')}</p>
        )}

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setLinhas((atuais) => [...atuais, entradaNova(state, atuais, parte)])}
        >
          + {t('tempos.acrescentar')}
        </button>
          </>
        )}

        <p className="tempos__total">
          {t('ficha.emCampo')}: <strong className="mono">{totalMs == null ? '—' : fmt(totalMs)}</strong>
        </p>

        {erro ? (
          <p className="field__hint" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>
            {mensagem(erro)}
          </p>
        ) : null}
        {excesso != null ? (
          <p className="field__hint" style={{ color: 'var(--warn, #f59e0b)' }}>
            {t('tempos.avisoSeis', { tempo: fmt(excesso) })}
          </p>
        ) : null}
      </div>

      <footer className="modal__actions">
        {jogador.temposCorrigidos ? (
          <button className="btn btn--ghost" onClick={onRepor}>
            {t('tempos.repor')}
          </button>
        ) : null}
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" disabled={!!erro} onClick={() => onSave(entradas)}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}

/** Abre a ficha dos tempos de um jogador e grava. Devolve true se mudou. */
export async function editarTempos(ui, { matchId, playerId, parte = null, syncUser = null }) {
  const antes = await loadMatch(matchId);
  const jogador = antes?.state.players[playerId];
  if (!jogador) return false;

  const r = await ui.open((close) => (
    <TemposDialog
      state={antes.state}
      jogador={jogador}
      parte={parte}
      onClose={() => close(null)}
      onSave={(entradas) => close({ entradas })}
      onRepor={() => close({ entradas: null })}
    />
  ));
  if (!r) return false;

  // Voltar a validar com o estado mais recente: pode ter chegado uma correção
  // de outro aparelho entretanto.
  const snap = await loadMatch(matchId);
  if (r.entradas) {
    const erro = validarEntradas(snap.state, r.entradas, { parte });
    if (erro) {
      ui.toast(mensagem(erro), 'error');
      return false;
    }
  } else {
    const ok = await ui.confirmar(t('tempos.confirmaRepor', { nome: jogador.name }), {
      okLabel: t('tempos.repor'),
    });
    if (!ok) return false;
  }

  await events.append(A.corrigirTempos(snap.state, metadataDosTempos(playerId, r.entradas, { parte })));
  if (syncUser) sync.saveNow(syncUser.userId, syncUser.email);
  ui.toast(r.entradas ? t('tempos.guardados') : t('tempos.repostos'), 'ok');
  return true;
}
