'use client';

// components/AppBar.jsx — barra de topo.
//
// O indicador de sincronização só aparece quando há alguma coisa a dizer: sem
// rede, com coisas por enviar, ou em erro. Nesses casos não é enfeite — é o que
// diz ao treinador que os dados estão guardados no dispositivo e que nada se
// perdeu, e clicar mostra o que o servidor respondeu.
//
// Quando está tudo sincronizado, cala-se. Uma barra que passa o dia a anunciar
// que está tudo bem ensina as pessoas a não olhar para ela — e no dia em que
// tiver alguma coisa a dizer, já ninguém repara. Quem quiser confirmar tem o
// estado na página da conta.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import * as sync from '@/lib/data/sync.js';
import { markAllPending } from '@/lib/data/repository.js';
import { rotas } from '@/lib/routes.js';
import { emDemo, limparDemo } from '@/lib/demo.js';
import { useT } from '@/lib/i18n/index.js';
import { syncLabel } from '@/lib/format.js';
import { registoAberto } from '@/lib/registo.js';

export default function AppBar() {
  const router = useRouter();
  const ui = useUI();
  const t = useT();
  const { user, userId, remote, signOut } = useAuth();
  const [estado, setEstado] = useState({ status: sync.SYNC.LOCAL, pending: 0, online: true });
  // Lido depois de montar: no servidor não há sessionStorage, e o estado tem de
  // ser o mesmo dos dois lados para o React não se queixar.
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(emDemo()), []);

  useEffect(() => sync.subscribe(setEstado), []);

  const falhou = estado.status === sync.SYNC.ERROR;
  const classe =
    estado.status === sync.SYNC.SYNCED
      ? 'sync--ok'
      : estado.status === sync.SYNC.OFFLINE || falhou
        ? 'sync--offline'
        : 'sync--pending';

  function detalhes() {
    if (!falhou) return;
    ui.open((close) => (
      <Dialog title={t('sinc.erroTitulo')} onClose={() => close(null)}>
        <p className="modal__text">{t('sinc.erroTexto')}</p>
        <pre className="error">
          {estado.error?.message || t('comum.semDetalhes')}
          {estado.error?.detalhe ? `\n\n${estado.error.detalhe}` : ''}
          {estado.error?.codigo ? `\n\n${t('comum.codigo', { codigo: estado.error.codigo })}` : ''}
        </pre>
        <footer className="modal__actions">
          <button className="btn btn--ghost" onClick={() => close(null)}>
            {t('comum.fechar')}
          </button>
          <button
            className="btn btn--ghost"
            onClick={async () => {
              close(null);
              // Reenviar tudo do zero: resolve os casos em que o servidor tem
              // metade das coisas e o dispositivo julga que já enviou o resto.
              await markAllPending();
              sync.flush(userId, user?.email);
            }}
          >
            {t('sinc.reenviarTudo')}
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              close(null);
              sync.flush(userId, user?.email);
            }}
          >
            {t('sinc.tentarDeNovo')}
          </button>
        </footer>
      </Dialog>
    ));
  }

  return (
    <header className="appbar">
      <button className="appbar__brand" onClick={() => router.push(rotas.dashboard())}>
        ⚽ <span>{t('barra.marca')}</span>
      </button>
      <span className="appbar__spacer" />
      <div className="appbar__right">
        {demo ? (
          <>
            <span className="sync sync--demo">{t('barra.demonstracao')}</span>
            <button
              className="btn btn--primary btn--tiny"
              onClick={async () => {
                await limparDemo();
                router.replace(rotas.login());
              }}
            >
              {/* Com o registo por convite este botão leva ao ecrã de entrada,
                  onde está explicado como se pede uma conta. O destino é o
                  mesmo; só o rótulo é que muda para não prometer o que não há. */}
              {registoAberto() ? t('barra.criarConta') : t('registo.pedirConta')}
            </button>
          </>
        ) : null}
        {estado.status === sync.SYNC.SYNCED ? null : (
          <button
            className={`sync ${classe}`}
            onClick={detalhes}
            title={falhou ? t('barra.verFalha') : ''}
            style={{ cursor: falhou ? 'pointer' : 'default' }}
          >
            {syncLabel(estado.status)}
            {estado.pending ? ` (${estado.pending})` : ''}
          </button>
        )}
        {/* As definições têm página própria: é onde se escolhe o idioma, se
            transfere uma cópia dos dados e se apaga tudo. O logout fica aqui à
            mão, que é o que se usa todos os dias. */}
        {remote && user ? (
          <>
            <button
              className="btn btn--ghost btn--tiny"
              onClick={() => router.push(rotas.conta())}
              title={user.email || t('barra.definicoes')}
            >
              {t('barra.definicoes')}
            </button>
            <button
              className="btn btn--ghost btn--tiny"
              onClick={async () => {
                await signOut();
                router.push(rotas.login());
              }}
            >
              {t('barra.logout')}
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
