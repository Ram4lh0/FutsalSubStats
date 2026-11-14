'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/lib/i18n/index.js';
import { abrirFora, copiarTexto, linkWhatsApp, urlDaDisponibilidade } from '@/lib/partilha.js';
import { supabase } from '@/lib/supabase/client.js';
import { Dialog, useUI } from '@/lib/ui.jsx';

export function useRespostasConvocatoria(matchId) {
  const [respostas, setRespostas] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    let ativo = true;
    let aPedir = false;
    async function atualizar() {
      if (aPedir || document.visibilityState === 'hidden') return;
      aPedir = true;
      try {
        const sb = supabase();
        const { data, error } = await sb.rpc('disponibilidade_respostas', { p_jogo: matchId });
        if (error || !data) throw error || new Error();
        if (ativo) {
          setRespostas(data);
          setErro(false);
        }
      } catch {
        if (ativo) setErro(true);
      } finally {
        aPedir = false;
      }
    }
    atualizar();
    const intervalo = setInterval(atualizar, 15000);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      ativo = false;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, [matchId]);

  return { respostas, erro };
}

export function RespostaConvocatoria({ resposta }) {
  const t = useT();
  const locale = useLocale();
  if (!resposta) return <span className="pick__pos">{t('disp.semResposta')}</span>;
  return (
    <>
      <span className="pick__pos">{t(`disp.${resposta.estado}`)}</span>
      {resposta.motivo ? <span className="pick__pos">{resposta.motivo}</span> : null}
      <span className="pick__pos">{resposta.nome} · {new Date(resposta.atualizado).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</span>
    </>
  );
}

export function EnviarFormulario({ criar, disabled }) {
  const t = useT();
  const locale = useLocale();
  const ui = useUI();
  const [aCriar, setACriar] = useState(false);

  async function abrir() {
    if (aCriar) return;
    setACriar(true);
    try {
      const form = await criar();
      if (!form) return;
      const url = urlDaDisponibilidade(form.token);
      await ui.open((close) => (
        <Dialog title={t('disp.enviar')} onClose={close}>
          <p className="modal__hint">{t('disp.validade', { data: new Date(form.expira).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
          <input className="input" aria-label={t('disp.link')} readOnly value={url} onFocus={(e) => e.target.select()} />
          <footer className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={async () => {
              const ok = await copiarTexto(url);
              ui.toast(t(ok ? 'disp.copiado' : 'conv.naoCopiou'), ok ? 'ok' : 'error');
            }}>{t('disp.copiar')}</button>
            <button type="button" className="btn btn--primary" onClick={() => abrirFora(linkWhatsApp(`${t('disp.mensagem')}\n${url}`))}>WhatsApp</button>
          </footer>
        </Dialog>
      ));
    } catch {
      ui.toast(t('disp.erroCriar'), 'error');
    } finally {
      setACriar(false);
    }
  }

  return <button type="button" className="btn btn--primary btn--tiny conv__enviar-formulario" disabled={disabled || aCriar} onClick={abrir}>{t(aCriar ? 'comum.aCarregar' : 'disp.enviar')}</button>;
}
