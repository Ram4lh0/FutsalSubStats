'use client';

// As definições: o idioma, o estado da sincronização, os dados e a porta de saída.
//
// Era a página "A minha conta". Passou a "Definições" quando o idioma precisou
// de um sítio para viver, e o endereço ficou `/account` de propósito: mudá-lo
// partia os atalhos de quem já tem a app instalada, e o endereço não é o que as
// pessoas leem.
//
// A eliminação vive aqui e não escondida numas definições quaisquer, porque tem
// de ser encontrável — é o que a Apple exige e é o que está certo. Mas encontrar
// fácil não é carregar por engano: pede-se o email escrito à mão, que é
// deliberadamente chato de fazer sem querer.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Field } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import * as db from '@/lib/data/local.js';
import * as sync from '@/lib/data/sync.js';
import { clubs, dump, restore, markAllPending } from '@/lib/data/repository.js';
import { downloadJson, pickFile } from '@/lib/data/exporter.js';
import { rotas } from '@/lib/routes.js';
import { startGuidedTutorial } from '@/lib/tutorial.js';
import { esquecerDono } from '@/lib/data/owner.js';
import { useT, useIdioma, useLocale, definirIdioma, IDIOMAS } from '@/lib/i18n/index.js';
import { syncLabel } from '@/lib/format.js';
import { versoes } from '@/lib/atualizacoes.js';
import { entitlement as loadEntitlement } from '@/lib/entitlements.js';
import {
  STORE_PRODUCTS,
  nativeStoreAvailable,
  planPrice,
  purchasePlan,
  restorePurchases,
  storeProducts,
} from '@/lib/store.js';

export default function AccountPage() {
  return (
    <Pagina>
      <Definicoes />
    </Pagina>
  );
}

function Definicoes() {
  const router = useRouter();
  const t = useT();
  const idioma = useIdioma();
  const locale = useLocale();
  const { toast, confirmar } = useUI();
  const { user, userId, deleteAccount, signOut } = useAuth();
  const [confirmacao, setConfirmacao] = useState('');
  const [licencas, setLicencas] = useState({ status: null, products: [], loading: true });
  const [aComprar, setAComprar] = useState(null);

  const carregarLicencas = useCallback(async () => {
    const [status, products] = await Promise.all([
      loadEntitlement(),
      storeProducts().catch(() => []),
    ]);
    setLicencas({ status: status.error ? null : status, products, loading: false });
  }, []);

  useEffect(() => {
    if (userId) carregarLicencas();
  }, [userId, carregarLicencas]);

  // As versões do plugin de atualizações. `null` fora do invólucro nativo — no
  // browser não há casca nem pacote, e a secção não chega a aparecer.
  const [vs, setVs] = useState(null);
  useEffect(() => {
    let vivo = true;
    versoes().then((r) => vivo && setVs(r));
    return () => {
      vivo = false;
    };
  }, []);
  const [aApagar, setAApagar] = useState(false);
  const [estado, setEstado] = useState({ status: sync.SYNC.LOCAL, pending: 0 });

  useEffect(() => sync.subscribe(setEstado), []);

  /**
   * Reenviar tudo do zero. Resolve os casos em que o servidor tem metade das
   * coisas e o dispositivo julga que já enviou o resto.
   */
  async function reenviarTudo() {
    await markAllPending();
    await sync.flush(userId, user?.email);
    toast(t('sinc.aReenviar'), 'ok');
  }

  async function comprarLicenca(plano) {
    if (aComprar || !userId) return;
    setAComprar(plano);
    try {
      await purchasePlan(plano, userId);
      await sync.pull(userId);
      await carregarLicencas();
      toast(t('licencas.compraConfirmada'), 'ok', 5000);
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) toast(t('licencas.compraFalhou', { erro: e.message }), 'error', 5200);
    } finally {
      setAComprar(null);
    }
  }

  async function restaurarLicencas() {
    if (aComprar || !userId) return;
    setAComprar('restore');
    try {
      const n = await restorePurchases(userId);
      await sync.pull(userId);
      await carregarLicencas();
      toast(n ? t('licencas.restauradas') : t('licencas.nadaParaRestaurar'), n ? 'ok' : 'info');
    } catch (e) {
      toast(t('licencas.restauroFalhou', { erro: e.message }), 'error');
    } finally {
      setAComprar(null);
    }
  }

  /**
   * Sair da conta, com uma paragem pelo meio se houver coisas por enviar.
   *
   * Sair não apaga nada — mas a base deste aparelho é de um dono de cada vez, e
   * quem entrar a seguir com outra conta encontra-a a ser limpa. O que já subiu
   * volta do servidor; o que estava na fila é que não volta de lado nenhum.
   *
   * Por isso tenta-se enviar primeiro, em silêncio. Só se não der é que se
   * pergunta — e a pergunta diz o número, que é o que permite decidir entre
   * "são duas correções, deixa lá" e "é o jogo inteiro de ontem".
   */
  async function sair() {
    const r = await sync.saveNow(userId, user?.email);
    if (!r.guardado && r.pendentes > 0) {
      const ok = await confirmar(t('definicoes.sairComFila', { n: r.pendentes }), {
        okLabel: t('definicoes.sairMesmo'),
        title: t('barra.logout'),
      });
      if (!ok) return;
    }
    await signOut();
    router.push(rotas.login());
  }

  const email = user?.email || '';
  const podeApagar = confirmacao.trim().toLowerCase() === email.toLowerCase();

  async function guardarCopia() {
    downloadJson(`backup-futsal-${new Date().toISOString().slice(0, 10)}.json`, await dump());
    toast(t('definicoes.copiaTransferida'), 'ok');
  }

  /**
   * Trazer para esta conta um ficheiro exportado noutra (ou noutro aparelho).
   *
   * É o caminho oficial para mudar de conta: a base deste aparelho pertence a
   * quem está lá dentro, por isso passar dados de uma conta para outra faz-se
   * por ficheiro. Vive aqui, ao lado do "transferir", porque as duas metades da
   * mesma operação separadas por três ecrãs não se encontram.
   *
   * Não confundir com o CSV do plantel, que é outra coisa e vive dentro do
   * escalão: este leva os jogos e o histórico, aquele leva só os nomes.
   */
  async function restaurarCopia() {
    const raw = await pickFile('application/json');
    if (!raw) return;
    const ok = await confirmar(t('copia.confirmaRestaurar'), { okLabel: t('copia.restaurar') });
    if (!ok) return;
    try {
      await restore(JSON.parse(raw));
      await sync.pendingCount();
      const enviados = await sync.flush(userId, user?.email);
      toast(enviados ? t('copia.restaurada') : t('copia.restauradaPorSincronizar'), 'ok');
    } catch (e) {
      toast(t('copia.falhou', { erro: e.message }), 'error');
    }
  }

  async function apagar() {
    if (!podeApagar || aApagar) return;

    const lista = await clubs.list();
    const ok = await confirmar(
      lista.length
        ? t('definicoes.confirmaComClubes', {
            n: lista.length,
            clubes: lista.length === 1 ? t('definicoes.clube') : t('definicoes.clubes'),
          })
        : t('definicoes.confirmaSemClubes'),
      { okLabel: t('definicoes.apagarDefinitivamente') }
    );
    if (!ok) return;

    setAApagar(true);
    try {
      const { error } = await deleteAccount();
      if (error) {
        toast(error, 'error');
        return;
      }
      // A conta deixou de existir: o que está guardado aqui não pode ficar, e o
      // aparelho deixa de ter dono — o próximo a entrar começa do zero.
      await db.clearAll();
      esquecerDono();
      sync.esquecerMarca(userId);
      toast(t('definicoes.contaApagada'), 'ok');
      router.replace(rotas.login());
    } catch (e) {
      toast(t('definicoes.apagarFalhou', { erro: e.message }), 'error');
    } finally {
      setAApagar(false);
    }
  }

  return (
    <>
      <PageHead
        title={t('definicoes.titulo')}
        subtitle={email}
        backTo={rotas.dashboard()}
        actions={
          <div className="profile-actions">
            <button className="btn btn--ghost btn--danger" onClick={sair}>
              {t('barra.logout')}
            </button>
            <div className="profile-lang" aria-label={t('definicoes.idioma')}>
              {IDIOMAS.map((i) => (
                <button
                  key={i.codigo}
                  className={`btn btn--tiny ${i.codigo === idioma ? 'btn--primary' : 'btn--ghost'}`}
                  aria-pressed={i.codigo === idioma}
                  onClick={() => definirIdioma(i.codigo)}
                >
                  {i.codigo.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <section className="card tutorial-settings">
        <div>
          <h2 className="section section--tight">{t('tutorial.titulo')}</h2>
          <p className="muted">{t('tutorial.definicoesTexto')}</p>
        </div>
        <button className="btn btn--ghost" onClick={() => startGuidedTutorial(router)}>
          {t('tutorial.repetir')}
        </button>
      </section>

      <section id="licencas" className="card licenses-card">
        <div className="licenses-card__head">
          <div>
            <h2 className="section section--tight">{t('licencas.titulo')}</h2>
            <p className="muted">{t('licencas.texto')}</p>
          </div>
          {licencas.status?.licenseActive ? (
            <span className="pill pill--active">
              {t('licencas.ativa', { plano: t(`licencas.${licencas.status.plan}`) })}
            </span>
          ) : (
            <span className="pill">
              {t('licencas.gratisRestantes', { n: licencas.status?.freeGamesRemaining ?? 4 })}
            </span>
          )}
        </div>

        <div className="license-grid">
          {['treinador', 'clube'].map((plano) => {
            const productId = STORE_PRODUCTS[plano];
            const product = licencas.products.find((p) => p.id === productId);
            const isClub = plano === 'clube';
            return (
              <article key={plano} className={`license-option ${isClub ? 'license-option--club' : ''}`}>
                <div className="license-option__title">
                  <h3>{t(`licencas.${plano}`)}</h3>
                  {licencas.loading ? <strong>…</strong> : <LicensePrice plano={plano} product={product} />}
                </div>
                <p className="license-trial">{t('licencas.testeGratisCurto')}</p>
                <ul className="license-option__features">
                  {(isClub
                    ? ['variosTreinadores', 'cincoEscaloes', 'todasCompeticoes', 'todasEstatisticas']
                    : ['umaConta', 'umEscalao', 'todasCompeticoes', 'estatisticasEscalao']
                  ).map((chave) => <li key={chave}>{t(`licencas.${chave}`)}</li>)}
                </ul>
                {isClub ? <p className="muted small">{t('licencas.maisCinco')}</p> : null}
                <button
                  className="btn btn--primary"
                  disabled={!nativeStoreAvailable() || !product || Boolean(aComprar)}
                  onClick={() => comprarLicenca(plano)}
                >
                  {aComprar === plano ? t('licencas.aComprar') : t('licencas.comprar')}
                </button>
              </article>
            );
          })}
        </div>
        {!nativeStoreAvailable() ? <p className="muted small">{t('licencas.comprasNaApp')}</p> : null}
        <div className="form__actions form__actions--left">
          <button className="btn btn--ghost" disabled={Boolean(aComprar)} onClick={restaurarLicencas}>
            {aComprar === 'restore' ? t('licencas.aRestaurar') : t('licencas.restaurar')}
          </button>
        </div>
      </section>

      {/* O estado da sincronização vive aqui, e não na barra de topo: lá em cima
          só aparece quando corre mal. Quem quiser confirmar que está tudo em
          ordem vem cá ver — é uma pergunta que se faz de vez em quando, não a
          toda a hora. */}
      <div className="card">
        <h2 className="section section--tight">{t('definicoes.sincronizacao')}</h2>
        <dl className="club-card__stats">
          <div>
            <dt>{t('definicoes.estado')}</dt>
            <dd className="small">{syncLabel(estado.status)}</dd>
          </div>
          <div>
            <dt>{t('definicoes.porEnviar')}</dt>
            <dd>{estado.pending || 0}</dd>
          </div>
          <div>
            <dt>{t('definicoes.ultimaVez')}</dt>
            <dd className="small">
              {estado.lastSyncAt
                ? new Date(estado.lastSyncAt).toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
        {estado.error ? (
          <>
            {/* Antes da linha técnica, a frase que interessa a quem não a vai
                perceber: os dados estão cá, o que falhou foi o envio. */}
            <p className="muted small">{t('sinc.erroTexto')}</p>
            <pre className="error">
              {estado.error.message}
              {estado.error.codigo
                ? `\n\n${t('comum.codigo', { codigo: estado.error.codigo })}`
                : ''}
            </pre>
          </>
        ) : null}
        <div className="form__actions">
          <button className="btn btn--ghost" onClick={reenviarTudo}>
            {t('sinc.reenviarTudo')}
          </button>
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" onClick={() => sync.flush(userId, user?.email)}>
            {t('sinc.agora')}
          </button>
        </div>
      </div>

      {/* Fica antes das cópias e depois da sincronização de propósito: é a única
          coisa desta página que uma pessoa vem cá fazer com pressa. */}
      <div className="card">
        <h2 className="section section--tight">{t('definicoes.palavraPasse')}</h2>
        <p className="muted">{t('definicoes.palavraPasseTexto')}</p>
        <div className="form__actions form__actions--left">
          <button className="btn btn--ghost" onClick={() => router.push(rotas.palavraPasse())}>
            {t('definicoes.mudarPalavraPasse')}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t('copia.titulo')}</h2>
        <p className="muted">{t('copia.texto')}</p>
        <div className="form__actions form__actions--left">
          <button className="btn btn--ghost" onClick={guardarCopia}>
            {t('copia.transferir')}
          </button>
          <button className="btn btn--ghost" onClick={restaurarCopia}>
            {t('copia.restaurar')}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t('definicoes.osTeusDados')}</h2>
        <p className="muted">{t('definicoes.osTeusDadosTexto')}</p>
        <div className="form__actions form__actions--left">
          <button className="btn btn--ghost" onClick={() => router.push(rotas.privacidade())}>
            {t('definicoes.politica')}
          </button>
        </div>
      </div>

      {/* A versão, para quem tiver de reportar um problema.
          Aparece só no telemóvel: no browser não há casca nem pacote, e uma
          secção vazia é pior do que secção nenhuma. */}
      {vs ? (
        <div className="card">
          <h2 className="section">{t('definicoes.versao')}</h2>
          <p className="mono">
            {t('definicoes.versaoApp', { v: vs.casca || '?' })}
            {' · '}
            {t('definicoes.versaoPacote', {
              v: !vs.pacote || vs.pacote === 'builtin' ? t('definicoes.versaoOriginal') : vs.pacote,
            })}
          </p>
          <p className="muted small">{t('definicoes.versaoTexto')}</p>
        </div>
      ) : null}

      <h2 className="section">{t('definicoes.apagarConta')}</h2>
      <div className="card card--danger">
        <p>{t('definicoes.apagarContaTexto')}</p>
        <p className="muted">{t('definicoes.apagarContaAviso')}</p>

        <Field label={t('definicoes.escreveEmail')} hint={t('definicoes.escreveEmailDica')}>
          <input
            className="input"
            value={confirmacao}
            placeholder={email}
            autoComplete="off"
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </Field>

        <div className="form__actions">
          <span className="toolbar__spacer" />
          <button className="btn btn--danger" disabled={!podeApagar || aApagar} onClick={apagar}>
            {aApagar ? t('definicoes.aApagar') : t('definicoes.apagarBotao')}
          </button>
        </div>
      </div>
    </>
  );
}

function LicensePrice({ plano, product }) {
  const price = planPrice(plano, product);
  return (
    <div className="license-price">
      <span className="license-price__old">{price.old}</span>
      <strong>{price.current}</strong>
    </div>
  );
}
