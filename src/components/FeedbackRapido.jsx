'use client';

// components/FeedbackRapido.jsx — o ícone de feedback da barra de topo.
//
// Deixa mandar feedback a qualquer momento, sem esperar pelos popups de
// `FeedbackInicial`. Cada envio é uma linha em `feedback_app` (migração
// 20261028100000) com o ecrã, a versão e a plataforma. Quando e o que se envia
// decide-se em `lib/feedbackRapido.js`.
//
// Sem rede o envio falha e o texto fica na janela: escrever outra vez o que se
// queria dizer é o que faz desistir.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { supabase } from '@/lib/supabase/client.js';
import { emDemo } from '@/lib/demo.js';
import { versoes } from '@/lib/atualizacoes.js';
import { useT } from '@/lib/i18n/index.js';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { mostrarFeedbackRapido, plataformaDe, linhaFeedback, MAX_TEXTO } from '@/lib/feedbackRapido.js';

export default function FeedbackRapido() {
  const { userId } = useAuth();
  const ui = useUI();
  const t = useT();
  const pathname = usePathname() || '';
  // Lido depois de montar: no servidor não há sessionStorage.
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(emDemo()), []);

  if (!mostrarFeedbackRapido({ userId, demo, pathname })) return null;

  const abrir = async () => {
    const enviado = await ui.open((close) => <FormFeedbackRapido pathname={pathname} onClose={close} />);
    if (enviado) ui.toast(t('feedbackRapido.obrigado'), 'ok');
  };

  return (
    <button
      type="button"
      className="btn btn--ghost btn--tiny mainnav-top__feedback"
      onClick={abrir}
      aria-label={t('feedbackRapido.abrir')}
      title={t('feedbackRapido.abrir')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

function FormFeedbackRapido({ pathname, onClose }) {
  const t = useT();
  const [texto, setTexto] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState(false);
  const vazio = !texto.trim();

  const submeter = async (e) => {
    e.preventDefault();
    const sb = supabase();
    const v = await versoes();
    const linha = linhaFeedback({
      texto,
      pathname,
      versao: v?.pacote || v?.casca || null,
      plataforma: plataformaDe(),
    });
    if (!linha || !sb) {
      setErro(!sb);
      return;
    }
    setAEnviar(true);
    setErro(false);
    let error = null;
    try {
      ({ error } = await sb.from('feedback_app').insert(linha));
    } catch (e2) {
      error = e2;
    }
    setAEnviar(false);
    if (error) setErro(true);
    else onClose(true);
  };

  return (
    <Dialog title={t('feedbackRapido.titulo')} onClose={() => onClose(false)}>
      <form className="form" onSubmit={submeter}>
        <label className="field">
          <span className="field__label">{t('feedbackRapido.pergunta')}</span>
          <textarea
            className="input input--area"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_TEXTO}
            placeholder={t('feedbackRapido.placeholder')}
            autoFocus
          />
        </label>
        {erro ? <p className="muted small">{t('feedbackRapido.erro')}</p> : null}
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onClose(false)}>
            {t('feedbackRapido.cancelar')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={vazio || aEnviar}>
            {t('feedbackRapido.enviar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
