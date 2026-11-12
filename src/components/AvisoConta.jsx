'use client';

// components/AvisoConta.jsx — mensagem escrita à mão para uma conta (tabela
// `avisos_conta`, migração 20261112170000): agradecer uma compra, pedir
// desculpa por um problema, avisar de alguma coisa.
//
// O título e o texto vêm do servidor, tal como estão escritos (sem tradução).
// Aparece uma vez, na próxima abertura da app; fechado, fica marcado
// (`mostrado_em`) e não volta. Havendo vários, mostra o mais antigo primeiro.
//
// Segue as regras do `ContactoWhatsApp`: nada no jogo ao vivo, no tutorial,
// nos ecrãs sem sessão nem por cima de outra janela.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { supabase } from '@/lib/supabase/client.js';
import { noJogoAoVivo } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';
import { useUI } from '@/lib/ui.jsx';
import { readGuidedTutorialState } from '@/lib/tutorial.js';

const SEM_POPUP = /^\/(login|password|delete-account|privacy|tutorial|jogo)(\/|$)/;

export default function AvisoConta() {
  const { userId } = useAuth();
  const ui = useUI();
  const pathname = usePathname() || '';
  const aTratar = useRef(null);
  const janelaAberta = useRef(ui.dialogOpen);
  janelaAberta.current = ui.dialogOpen;

  const bloqueado =
    !userId || ui.dialogOpen || noJogoAoVivo(pathname) || SEM_POPUP.test(pathname);

  useEffect(() => {
    if (bloqueado || aTratar.current === userId) return;
    if (readGuidedTutorialState().active) return;
    const sb = supabase();
    if (!sb) return;

    let cancelado = false;
    // Depois do feedback (1,5 s) e do WhatsApp (3 s): se algum abrir, espera a vez.
    const espera = setTimeout(async () => {
      if (cancelado) return;
      aTratar.current = userId;
      const { data, error } = await sb
        .from('avisos_conta')
        .select('id, titulo, mensagem')
        .eq('user_id', userId)
        .is('mostrado_em', null)
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        // Sem rede: tenta outra vez noutro ecrã. Sem avisos: não volta a perguntar nesta sessão.
        if (error) aTratar.current = null;
        return;
      }
      if (cancelado || janelaAberta.current) {
        aTratar.current = null;
        return;
      }

      await ui.open((close) => (
        <PopupAviso titulo={data.titulo} mensagem={data.mensagem} onClose={close} />
      ));
      await sb
        .from('avisos_conta')
        .update({ mostrado_em: new Date().toISOString() })
        .eq('id', data.id)
        .then(
          () => {},
          () => {}
        );
      // Pode haver outro à espera: deixa o próximo ecrã ir buscá-lo.
      aTratar.current = null;
    }, 4500);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [bloqueado, pathname, userId, ui]);

  return null;
}

function PopupAviso({ titulo, mensagem, onClose }) {
  const t = useT();

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onClose(true);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  return (
    <div className="backdrop">
      <div className="modal fbpop" role="dialog" aria-modal="true" aria-labelledby="avisopop-titulo">
        <button
          type="button"
          className="fbpop__close"
          onClick={() => onClose(true)}
          aria-label={t('comum.fechar')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <h2 id="avisopop-titulo" className="fbpop__title">
          {titulo}
        </h2>
        <p className="fbpop__sub" style={{ whiteSpace: 'pre-line' }}>
          {mensagem}
        </p>

        <button type="button" className="btn btn--block" onClick={() => onClose(true)}>
          {t('avisoConta.ok')}
        </button>
      </div>
    </div>
  );
}
