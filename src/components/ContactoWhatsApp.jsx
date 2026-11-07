'use client';

// components/ContactoWhatsApp.jsx — convite para falar connosco pelo WhatsApp,
// só para as contas que pusermos à mão na tabela `contacto_whatsapp` (migração
// 20261107120000).
//
// Aparece uma vez, na próxima abertura da app, na língua da app (a escolhida
// nas definições ou, sem escolha, a do telemóvel). O botão abre o WhatsApp para
// o nosso número com a mensagem já escrita nessa língua. Respondido ou fechado,
// fica marcado no servidor (`mostrado_em`) e não volta.
//
// Segue as regras do `FeedbackInicial`: nada no jogo ao vivo, no tutorial, nos
// ecrãs sem sessão nem por cima de outra janela.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { supabase } from '@/lib/supabase/client.js';
import { noJogoAoVivo } from '@/lib/routes.js';
import { idiomaAtual, useT } from '@/lib/i18n/index.js';
import { useUI } from '@/lib/ui.jsx';
import { abrirFora } from '@/lib/partilha.js';
import { readGuidedTutorialState } from '@/lib/tutorial.js';

const NUMERO = '351911034493';
const SEM_POPUP = /^\/(login|password|delete-account|privacy|tutorial|jogo)(\/|$)/;
// Já visto neste aparelho: poupa a pergunta ao servidor a cada ecrã.
const CHAVE_VISTO = 'futsal-contacto-wpp';

function ler(chave) {
  try {
    return globalThis.localStorage?.getItem(chave) ?? null;
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    globalThis.localStorage?.setItem(chave, valor);
  } catch {
    /* sem storage: vale a marca do servidor */
  }
}

export function linkContacto(texto) {
  return `https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}`;
}

export default function ContactoWhatsApp() {
  const { userId, user } = useAuth();
  const ui = useUI();
  const t = useT();
  const pathname = usePathname() || '';
  const aTratar = useRef(null);
  const janelaAberta = useRef(ui.dialogOpen);
  janelaAberta.current = ui.dialogOpen;

  const bloqueado =
    !userId || ui.dialogOpen || noJogoAoVivo(pathname) || SEM_POPUP.test(pathname);

  useEffect(() => {
    if (bloqueado || aTratar.current === userId) return;
    if (ler(`${CHAVE_VISTO}:${userId}`) === '1') return;
    if (readGuidedTutorialState().active) return;
    const sb = supabase();
    if (!sb) return;

    let cancelado = false;
    // Depois do popup de feedback (1,5 s): se esse abrir, este espera a vez.
    const espera = setTimeout(async () => {
      if (cancelado) return;
      aTratar.current = userId;
      const { data, error } = await sb
        .from('contacto_whatsapp')
        .select('mostrado_em')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        aTratar.current = null;
        return;
      }
      if (!data || data.mostrado_em) {
        // Sem pedido (ou já visto): só se guarda o "já visto", para poder
        // entrar um pedido novo mais tarde sem reinstalar.
        if (data?.mostrado_em) gravar(`${CHAVE_VISTO}:${userId}`, '1');
        return;
      }
      if (cancelado || janelaAberta.current) {
        aTratar.current = null;
        return;
      }

      const idioma = idiomaAtual();
      const mensagem = t('contactoWpp.mensagem', { email: user?.email || '' });
      const resposta = await ui.open((close) => (
        <PopupContacto mensagem={mensagem} onClose={close} />
      ));
      gravar(`${CHAVE_VISTO}:${userId}`, '1');
      await sb
        .from('contacto_whatsapp')
        .update({
          mostrado_em: new Date().toISOString(),
          resposta: resposta ? 'whatsapp' : 'agora_nao',
          idioma,
        })
        .eq('user_id', userId)
        .then(
          () => {},
          () => {}
        );
    }, 3000);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [bloqueado, pathname, userId, user?.email, ui, t]);

  return null;
}

function PopupContacto({ mensagem, onClose }) {
  const t = useT();

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onClose(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  const falar = () => {
    abrirFora(linkContacto(mensagem));
    onClose(true);
  };

  return (
    <div className="backdrop">
      <div className="modal fbpop" role="dialog" aria-modal="true" aria-labelledby="wpppop-titulo">
        <button
          type="button"
          className="fbpop__close"
          onClick={() => onClose(false)}
          aria-label={t('comum.fechar')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="fbpop__badge wpppop__badge" aria-hidden="true">
          <IconeWhatsApp size={28} />
        </div>
        <h2 id="wpppop-titulo" className="fbpop__title">
          {t('contactoWpp.titulo')}
        </h2>
        <p className="fbpop__sub">{t('contactoWpp.sub')}</p>

        <button type="button" className="btn btn--block wpppop__btn" onClick={falar}>
          <IconeWhatsApp size={20} />
          {t('contactoWpp.botao')}
        </button>
        <button type="button" className="btn btn--ghost btn--block wpppop__depois" onClick={() => onClose(false)}>
          {t('contactoWpp.agoraNao')}
        </button>
      </div>
    </div>
  );
}

function IconeWhatsApp({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"
      />
    </svg>
  );
}
