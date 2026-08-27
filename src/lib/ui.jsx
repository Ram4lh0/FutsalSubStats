'use client';

// lib/ui.jsx — avisos e janelas, os mesmos de sempre mas em React.
//
// As vistas continuam a poder escrever `await confirmar('Apagar?')` no meio de
// uma função assíncrona, como faziam antes. É isso que mantém os fluxos do jogo
// legíveis: perguntar quem marcou não parte a função em três pedaços.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { t } from '@/lib/i18n/index.js';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const seq = useRef(0);

  const toast = useCallback((message, kind = 'info', ms = 2600) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  /** Abre uma janela e devolve uma promessa com o que o utilizador escolheu. */
  const open = useCallback((render) => {
    const id = ++seq.current;
    return new Promise((resolve) => {
      const close = (value) => {
        setDialogs((d) => d.filter((x) => x.id !== id));
        resolve(value);
      };
      setDialogs((d) => [...d, { id, render, close }]);
    });
  }, []);

  // As etiquetas são lidas quando a janela abre, não quando o módulo carrega:
  // se fossem valores por omissão avaliados uma vez, ficavam presas ao idioma
  // que estava escolhido no arranque.
  const confirmar = useCallback(
    (mensagem, { okLabel, cancelLabel, danger = true, title } = {}) =>
      open((close) => (
        <Dialog title={title || t('comum.confirmar')} onClose={() => close(false)}>
          <p className="modal__text">{mensagem}</p>
          <footer className="modal__actions">
            <button className="btn btn--ghost" onClick={() => close(false)}>
              {cancelLabel || t('comum.cancelar')}
            </button>
            <button
              className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => close(true)}
            >
              {okLabel || t('comum.confirmar')}
            </button>
          </footer>
        </Dialog>
      )),
    [open]
  );

  const value = useMemo(
    () => ({ toast, open, confirmar, dialogOpen: dialogs.length > 0 }),
    [toast, open, confirmar, dialogs.length]
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <div className="toasts" id="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
      {dialogs.map((d) => (
        <div key={d.id}>{d.render(d.close)}</div>
      ))}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI fora do UIProvider');
  return ctx;
}

/** Caixa com fundo escurecido. Clicar fora ou no ✕ fecha sem escolher nada. */
export function Dialog({ title, children, onClose, wide = false }) {
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button
            className="btn btn--ghost btn--icon"
            onClick={onClose}
            aria-label={t('comum.fechar')}
          >
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
