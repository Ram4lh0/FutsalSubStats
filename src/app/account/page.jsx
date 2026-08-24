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
import { clubs, dump, restore, markAllPending, profile } from '@/lib/data/repository.js';
import { adicionarTreinadorAoClube, listarEquipaTecnica, explicar as explicarAcesso } from '@/lib/data/acessos.js';
import { downloadJson, pickFile } from '@/lib/data/exporter.js';
import { rotas } from '@/lib/routes.js';
import { esquecerDono } from '@/lib/data/owner.js';
import { useT, useIdioma, useLocale, definirIdioma, IDIOMAS } from '@/lib/i18n/index.js';
import { syncLabel } from '@/lib/format.js';
import { versoes } from '@/lib/atualizacoes.js';

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
  const { session, user, userId, deleteAccount, signOut } = useAuth();
  const [confirmacao, setConfirmacao] = useState('');
  const [equipaTecnica, setEquipaTecnica] = useState({
    pronto: false,
    clube: null,
    membros: [],
    erro: null,
  });
  const [emailTecnico, setEmailTecnico] = useState('');
  const [aConvidar, setAConvidar] = useState(false);
  const [mostrarTecnicos, setMostrarTecnicos] = useState(false);

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

  const carregarEquipaTecnica = useCallback(async () => {
    if (!userId) {
      setEquipaTecnica({ pronto: true, clube: null, membros: [], erro: null });
      return;
    }

    const lista = await clubs.list();
    const perfil = await profile.get();
    const clube = lista.find((c) => c.ownerId === userId)
      || lista.find((c) => !c.ownerId)
      || (perfil?.licenca === 'clube' ? lista[0] : null);

    if (!clube) {
      setEquipaTecnica({ pronto: true, clube: null, membros: [], erro: null });
      return;
    }

    try {
      setEquipaTecnica({
        pronto: true,
        clube,
        membros: await listarEquipaTecnica(clube.id),
        erro: null,
      });
    } catch (e) {
      setEquipaTecnica({ pronto: true, clube, membros: [], erro: explicarAcesso(e) });
    }
  }, [userId]);

  useEffect(() => {
    carregarEquipaTecnica();
  }, [carregarEquipaTecnica]);

  /**
   * Reenviar tudo do zero. Resolve os casos em que o servidor tem metade das
   * coisas e o dispositivo julga que já enviou o resto.
   */
  async function reenviarTudo() {
    await markAllPending();
    await sync.flush(userId, user?.email);
    toast(t('sinc.aReenviar'), 'ok');
  }

  async function adicionarTecnico(event) {
    event.preventDefault();
    if (!equipaTecnica.clube || aConvidar) return;
    setAConvidar(true);
    try {
      const r = await adicionarTreinadorAoClube({
        clubId: equipaTecnica.clube.id,
        email: emailTecnico,
        accessToken: session?.access_token,
      });
      setEmailTecnico('');
      await carregarEquipaTecnica();
      setMostrarTecnicos(true);
      toast(
        r.newAccount
          ? t('equipaTecnica.conviteEnviado', { email: r.email })
          : t('equipaTecnica.associado', { email: r.email }),
        'ok'
      );
    } catch (e) {
      toast(explicarAcesso(e), 'error');
    } finally {
      setAConvidar(false);
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
          <button className="btn btn--ghost btn--danger" onClick={sair}>
            {t('barra.logout')}
          </button>
        }
      />

      {equipaTecnica.clube ? (
        <div className="card card--staff">
          <div className="staffcard__head">
            <h2 className="section section--tight">{t('equipaTecnica.titulo')}</h2>
            <span className="staffcard__license">{t('equipaTecnica.licencaClube')}</span>
          </div>
          <p className="muted">{t('equipaTecnica.texto')}</p>

          <form className="form__actions form__actions--left" onSubmit={adicionarTecnico}>
            <input
              className="input"
              type="email"
              value={emailTecnico}
              placeholder={t('equipaTecnica.emailPlaceholder')}
              autoComplete="email"
              onChange={(e) => setEmailTecnico(e.target.value)}
            />
            <button className="btn btn--primary" disabled={aConvidar || !emailTecnico.trim()}>
              {aConvidar ? t('equipaTecnica.aAdicionar') : t('equipaTecnica.adicionar')}
            </button>
          </form>

          {equipaTecnica.erro ? (
            <p className="error">{equipaTecnica.erro}</p>
          ) : equipaTecnica.membros.length ? (
            <div className="stafflist">
              <button
                type="button"
                className="btn btn--ghost stafflist__toggle"
                aria-expanded={mostrarTecnicos}
                onClick={() => setMostrarTecnicos((v) => !v)}
              >
                {mostrarTecnicos
                  ? t('equipaTecnica.esconderLista')
                  : t('equipaTecnica.verLista', { n: equipaTecnica.membros.length })}
              </button>
              {mostrarTecnicos ? (
                <ul className="list stafflist__items">
                  {equipaTecnica.membros.map((m) => (
                    <li key={m.userId} className="list__row">
                      <div>
                        <strong>{m.nome}</strong>
                        {m.email && m.email !== m.nome ? <p className="muted small">{m.email}</p> : null}
                      </div>
                      <span className="pill">{t('equipaTecnica.treinador')}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="muted small">{t('equipaTecnica.semTreinadores')}</p>
          )}
        </div>
      ) : null}

      {/* O idioma fica em primeiro lugar de propósito: quem abre esta página sem
          perceber a língua em que ela está precisa de encontrar isto sem ler
          nada. Os nomes dos idiomas estão sempre no próprio idioma — "English",
          nunca "Inglês" — que é o que permite reconhecê-los a quem está perdido. */}
      <div className="card">
        <h2 className="section section--tight">{t('definicoes.idioma')}</h2>
        <div className="form__actions form__actions--left">
          {IDIOMAS.map((i) => (
            <button
              key={i.codigo}
              className={`btn ${i.codigo === idioma ? 'btn--primary' : 'btn--ghost'}`}
              aria-pressed={i.codigo === idioma}
              onClick={() => definirIdioma(i.codigo)}
            >
              {i.nome}
            </button>
          ))}
        </div>
        <p className="muted small">{t('definicoes.idiomaDica')}</p>
      </div>

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
