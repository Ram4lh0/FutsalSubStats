'use client';

// A página pública de eliminação de conta.
//
// Existe por exigência da Google Play: uma app que deixa criar conta tem de ter
// um caminho para a apagar **dentro** da app *e* um endereço na web onde se
// possa pedir o mesmo. A regra é dela, mas a razão é boa — quem desinstalou a
// app não tem por onde pedir, e ficava preso.
//
// As condições que o endereço tem de cumprir, e que moldam esta página:
//
//   · Acessível **sem sessão iniciada**. Por isso não usa `Pagina` nem `Guard`.
//   · Ligação direta ao pedido, não uma página inicial com o assunto escondido
//     lá no fundo.
//   · Tem de dizer **o que é apagado**, **o que fica e porquê**, e **quanto
//     tempo demora**. Cada uma dessas três tem aqui a sua secção.
//
// O endereço é `/delete-account` em inglês de propósito: é o que se cola no
// formulário da Play Console, e um endereço em português num campo lido por
// quem revê em inglês é uma dúvida escusada.

import { useRouter } from 'next/navigation';
import PageHead from '@/components/PageHead.jsx';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

const CONTACTO = 'review.futsalsubstats@gmail.com';

export default function DeleteAccountPage() {
  const router = useRouter();
  const t = useT();

  const assunto = encodeURIComponent(t('apagar.assunto'));

  return (
    <>
      <PageHead
        title={t('apagar.titulo')}
        subtitle={t('apagar.subtitulo')}
        actions={
          <button className="btn btn--ghost" onClick={() => router.back()}>
            {t('comum.voltar')}
          </button>
        }
      />

      <div className="card prose">
        <p>{t('apagar.intro')}</p>

        <h2 className="section">{t('apagar.naApp')}</h2>
        <p>{t('apagar.naAppTexto')}</p>

        <h2 className="section">{t('apagar.porEmail')}</h2>
        <p>{t('apagar.porEmailTexto')}</p>

        {/* O pedido a um clique de distância. A Google recusa endereços onde a
            forma de pedir não seja evidente à primeira vista. */}
        <div className="card card--inset">
          <p className="muted small">{t('apagar.contacto')}</p>
          <a className="btn btn--primary" href={`mailto:${CONTACTO}?subject=${assunto}`}>
            {CONTACTO}
          </a>
        </div>

        <p className="muted">{t('apagar.prazo')}</p>

        <h2 className="section">{t('apagar.oQueApaga')}</h2>
        <p>{t('apagar.oQueApagaTexto')}</p>

        <h2 className="section">{t('apagar.oQueFica')}</h2>
        <p>{t('apagar.oQueFicaTexto')}</p>
      </div>

      <div className="card card--danger">
        <p>{t('apagar.aviso')}</p>
      </div>

      <div className="page__actions">
        <button className="btn btn--ghost" onClick={() => router.push(rotas.privacidade())}>
          {t('definicoes.politica')}
        </button>
      </div>
    </>
  );
}
