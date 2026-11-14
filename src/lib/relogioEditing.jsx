'use client';

// lib/relogioEditing.jsx — dizer em que minuto está o jogo, de facto.
//
// Quem regista os tempos pode ter ficado para trás (ou à frente) do jogo real.
// Escreve-se o minuto certo da parte e o relógio acerta-se de uma vez, com um
// único evento de acerto (o mesmo dos botões ±10s / ±1s): os tempos de todos os
// jogadores seguem o relógio.

import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { fmt } from '@/domain/clock.js';
import { parseClock, mascaraTempo } from './goalEditing.jsx';
import { t } from '@/lib/i18n/index.js';

function RelogioDialog({ atualMs, onClose, onSave }) {
  const [texto, setTexto] = useState(fmt(atualMs));
  const ms = parseClock(texto, NaN);
  const invalido = !Number.isFinite(ms);
  return (
    <Dialog title={t('relogio.titulo')} onClose={onClose}>
      <div className="form">
        <p>{t('relogio.explicacao')}</p>
        <label className="field">
          <span className="field__label">{t('relogio.campo')}</span>
          <input
            className="input input--time"
            value={texto}
            inputMode="numeric"
            autoFocus
            onChange={(e) => setTexto(mascaraTempo(e.target.value, texto))}
          />
          <span className="field__hint">{t('relogio.agora', { tempo: fmt(atualMs) })}</span>
        </label>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" disabled={invalido} onClick={() => onSave(ms)}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}

/** Pergunta o minuto da parte. Devolve os ms escolhidos, ou null se fechar. */
export function perguntarMinutoDoRelogio(ui, atualMs) {
  return ui.open((close) => (
    <RelogioDialog atualMs={atualMs} onClose={() => close(null)} onSave={(v) => close(v)} />
  ));
}
