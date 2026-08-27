'use client';

import { useState } from 'react';
import { Dialog } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useT } from '@/lib/i18n/index.js';
import { LICENSE_PRICES, nativeStoreAvailable, purchasePlan } from '@/lib/store.js';

function Price({ plan }) {
  const price = LICENSE_PRICES[plan];
  return (
    <div className="license-price">
      <span className="license-price__old">{price.old}</span>
      <strong>{price.current}</strong>
    </div>
  );
}

export default function LicenseLimitDialog({ close }) {
  const t = useT();
  const { userId } = useAuth();
  const { toast } = useUI();
  const [aComprar, setAComprar] = useState(null);
  const planos = [
    {
      id: 'treinador',
      destaque: false,
      bullets: ['umaConta', 'umEscalao', 'todasCompeticoes', 'estatisticasEscalao'],
    },
    {
      id: 'clube',
      destaque: true,
      bullets: ['variosTreinadores', 'cincoEscaloes', 'todasCompeticoes', 'todasEstatisticas'],
    },
  ];

  async function comprar(plano) {
    if (!nativeStoreAvailable()) return close('account');
    if (aComprar) return;
    setAComprar(plano);
    try {
      await purchasePlan(plano, userId);
      toast(t('licencas.compraConfirmada'), 'ok', 5000);
      close('purchased');
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) toast(t('licencas.compraFalhou', { erro: e.message }), 'error', 5200);
    } finally {
      setAComprar(null);
    }
  }

  return (
    <Dialog title={t('licencas.titulo')} onClose={() => close(false)} wide>
      <section className="license-limit">
        <p className="license-limit__eyebrow">{t('licencas.fimGratis')}</p>
        <h3>{t('licencas.continuaEpoca')}</h3>
        <p className="modal__text">{t('licencas.limiteJogos')}</p>
      </section>
      <div className="license-limit-grid">
        {planos.map((plano) => (
          <article
            key={plano.id}
            className={`license-limit-plan ${plano.destaque ? 'license-limit-plan--club' : ''}`}
          >
            {plano.destaque ? <span className="license-limit-plan__badge">{t('licencas.paraClubes')}</span> : null}
            <div className="license-limit-plan__head">
              <h3>{t(`licencas.${plano.id}`)}</h3>
              <Price plan={plano.id} />
            </div>
            <p className="license-trial">{t('licencas.testeGratisCurto')}</p>
            <ul>
              {plano.bullets.map((key) => (
                <li key={key}>{t(`licencas.${key}`)}</li>
              ))}
            </ul>
            {plano.id === 'clube' ? <p className="muted small">{t('licencas.maisCinco')}</p> : null}
            <button
              className="btn btn--primary btn--block"
              type="button"
              disabled={Boolean(aComprar)}
              onClick={() => comprar(plano.id)}
            >
              {aComprar === plano.id ? t('licencas.aComprar') : t('licencas.comprar')}
            </button>
          </article>
        ))}
      </div>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={() => close(false)}>{t('comum.cancelar')}</button>
        <button className="btn btn--ghost" onClick={() => close('account')}>{t('licencas.verOpcoes')}</button>
      </footer>
    </Dialog>
  );
}
