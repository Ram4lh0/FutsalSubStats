'use client';

// components/FeedbackDemo.jsx — o pedido de opinião no fim do jogo de
// experiência.
//
// Quem acabou a demo acabou de ver o que a app faz: é a melhor altura para
// perguntar o que achou. A resposta vai para uma tabela própria, `feedback_demo`
// (migração 20261028120000), onde se pode escrever mas não ler pela app. O painel interno mostra-a na aba
// Feedback, com o momento "demo".
//
// Pede sempre o email: sem ele não há a quem responder. Aparece uma vez por
// sessão; fechar sem responder não grava nada.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client.js';
import { versoes } from '@/lib/atualizacoes.js';
import { plataformaDe, MAX_TEXTO } from '@/lib/feedbackRapido.js';
import { useT } from '@/lib/i18n/index.js';
import { Dialog, useUI } from '@/lib/ui.jsx';

const CHAVE = 'futsal-feedback-demo';

function jaPedido() {
  try {
    return globalThis.sessionStorage?.getItem(CHAVE) === '1';
  } catch {
    return true;
  }
}

function marcarPedido() {
  try {
    globalThis.sessionStorage?.setItem(CHAVE, '1');
  } catch {
    /* sem storage: pode voltar a perguntar, não faz mal */
  }
}

/** Pede a opinião uma vez, pouco depois de `ativo` passar a verdadeiro. */
export default function FeedbackDemo({ ativo, emailDaConta = '' }) {
  const ui = useUI();
  const t = useT();
  const aberto = useRef(false);

  useEffect(() => {
    if (!ativo || aberto.current || jaPedido()) return;
    const espera = setTimeout(async () => {
      aberto.current = true;
      marcarPedido();
      const enviado = await ui.open((close) => <FormFeedbackDemo emailDaConta={emailDaConta} onClose={close} />);
      if (enviado) ui.toast(t('feedbackDemo.obrigado'), 'ok');
    }, 1500);
    return () => clearTimeout(espera);
  }, [ativo, emailDaConta, ui, t]);

  return null;
}

function FormFeedbackDemo({ emailDaConta, onClose }) {
  const t = useT();
  const [opiniao, setOpiniao] = useState('');
  // Com sessão iniciada já se sabe o email da conta; fica escrito, e pode mudar-se.
  const [email, setEmail] = useState(emailDaConta);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState(false);

  const submeter = async (e) => {
    e.preventDefault();
    const texto = opiniao.trim().slice(0, MAX_TEXTO);
    const sb = supabase();
    if (!texto) return;
    if (!sb) return setErro(true);
    setAEnviar(true);
    setErro(false);
    const v = await versoes();
    let error = null;
    try {
      ({ error } = await sb.from('feedback_demo').insert({
        opiniao: texto,
        email: email.trim().slice(0, 320) || null,
        versao: v?.pacote || v?.casca || null,
        plataforma: plataformaDe(),
      }));
    } catch (e2) {
      error = e2;
    }
    setAEnviar(false);
    if (error) setErro(true);
    else onClose(true);
  };

  return (
    <Dialog title={t('feedbackDemo.titulo')} onClose={() => onClose(false)}>
      <form className="form" onSubmit={submeter}>
        <label className="field">
          <span className="field__label">{t('feedbackDemo.opiniao')}</span>
          <textarea
            className="input input--area"
            value={opiniao}
            onChange={(e) => setOpiniao(e.target.value)}
            maxLength={MAX_TEXTO}
            placeholder={t('feedbackDemo.opiniaoPlaceholder')}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field__label">{t('feedbackDemo.email')}</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            autoComplete="email"
            inputMode="email"
          />
          <span className="field__hint">{t('feedbackDemo.emailDica')}</span>
        </label>
        {erro ? <p className="muted small">{t('feedbackDemo.erro')}</p> : null}
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onClose(false)}>
            {t('feedbackDemo.agoraNao')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!opiniao.trim() || aEnviar}>
            {t('feedbackDemo.enviar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
