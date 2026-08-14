'use client';

// A política de privacidade.
//
// Fica dentro da app, e não num documento à parte, por duas razões: a Apple pede
// um endereço público que esteja sempre a funcionar, e quem está a decidir se
// cria conta deve poder lê-la sem sair daqui.
//
// Não usa `Pagina` de propósito: tem de abrir sem sessão iniciada — é o endereço
// que vai no formulário da App Store, e quem revê não tem conta.
//
// O texto vive nos dicionários como qualquer outro. Uma política de privacidade
// que só existe em português não serve a quem instalou a app em espanhol, e a
// Apple lê a listagem no idioma do revisor.

import { useRouter } from 'next/navigation';
import PageHead from '@/components/PageHead.jsx';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

const CONTACTO = 'review.futsalsubstats@gmail.com';

export default function PrivacyPage() {
  const router = useRouter();
  const t = useT();

  return (
    <>
      <PageHead
        title={t('priv.titulo')}
        subtitle={t('priv.subtitulo', { data: t('priv.data') })}
        actions={
          <button className="btn btn--ghost" onClick={() => router.back()}>
            {t('comum.voltar')}
          </button>
        }
      />

      <div className="card prose">
        <p>{t('priv.intro')}</p>

        <h2 className="section">{t('priv.oQueGuarda')}</h2>
        <p>
          <strong>{t('priv.aTuaConta')}</strong> {t('priv.aTuaContaTexto')}
        </p>
        <p>
          <strong>{t('priv.oQueEscreves')}</strong> {t('priv.oQueEscrevesTexto')}
        </p>
        <p className="muted">{t('priv.naoRecolhe')}</p>

        <h2 className="section">{t('priv.ondeFica')}</h2>
        <p>{t('priv.ondeFicaTexto')}</p>

        <h2 className="section">{t('priv.quemToca')}</h2>
        <p>{t('priv.quemTocaTexto')}</p>
        <p className="muted">
          {t('priv.fornecedoresAntes')}
          <strong>Supabase</strong>
          {t('priv.fornecedoresMeio')}
          <strong>Vercel</strong>
          {t('priv.fornecedoresFim')}
        </p>

        <h2 className="section">{t('priv.duranteQuanto')}</h2>
        <p>{t('priv.duranteQuantoTexto')}</p>

        <h2 className="section">{t('priv.apagarTudo')}</h2>
        <p>
          {t('priv.apagarTudoAntes')}
          <strong>{t('priv.apagarTudoPagina')}</strong>
          {t('priv.apagarTudoDepois')}
        </p>

        <h2 className="section">{t('priv.direitos')}</h2>
        <p>
          {t('priv.direitosTexto')}
          <strong>{CONTACTO}</strong>.
        </p>

        <h2 className="section">{t('priv.criancas')}</h2>
        <p>{t('priv.criancasTexto')}</p>

        <h2 className="section">{t('priv.alteracoes')}</h2>
        <p>{t('priv.alteracoesTexto')}</p>

        <h2 className="section">{t('priv.contacto')}</h2>
        <p>
          {t('priv.contactoTexto')}
          <strong>{CONTACTO}</strong>.
        </p>
      </div>

      <div className="page__actions">
        <button className="btn btn--ghost" onClick={() => router.push(rotas.login())}>
          {t('priv.irParaLogin')}
        </button>
      </div>
    </>
  );
}
