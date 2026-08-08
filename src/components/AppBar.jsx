'use client';

// components/AppBar.jsx — barra de topo com o estado da sincronização.
//
// O indicador não é enfeite: num pavilhão sem rede, o treinador precisa de ver
// que os dados estão guardados no dispositivo e que nada se perdeu. Quando falha,
// clicar mostra o que o servidor respondeu — sem isso, "erro de sincronização"
// não ajuda ninguém a resolver nada.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import * as sync from '@/lib/data/sync.js';
import { markAllPending } from '@/lib/data/repository.js';
import { rotas } from '@/lib/routes.js';

export default function AppBar() {
  const router = useRouter();
  const ui = useUI();
  const { user, userId, remote, signOut } = useAuth();
  const [estado, setEstado] = useState({ status: sync.SYNC.LOCAL, pending: 0, online: true });

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
      <Dialog title="Erro de sincronização" onClose={() => close(null)}>
        <p className="modal__text">
          Os dados estão guardados neste dispositivo — nada se perdeu. O que falhou foi o envio para
          o servidor.
        </p>
        <pre className="error">
          {estado.error?.message || 'Sem detalhes.'}
          {estado.error?.detalhe ? `\n\n${estado.error.detalhe}` : ''}
          {estado.error?.codigo ? `\n\ncódigo ${estado.error.codigo}` : ''}
        </pre>
        <footer className="modal__actions">
          <button className="btn btn--ghost" onClick={() => close(null)}>
            Fechar
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
            Reenviar tudo
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              close(null);
              sync.flush(userId, user?.email);
            }}
          >
            Tentar de novo
          </button>
        </footer>
      </Dialog>
    ));
  }

  return (
    <header className="appbar">
      <button className="appbar__brand" onClick={() => router.push(rotas.dashboard())}>
        ⚽ <span>Futsal ao Vivo</span>
      </button>
      <span className="appbar__spacer" />
      <div className="appbar__right">
        <button
          className={`sync ${classe}`}
          onClick={detalhes}
          title={falhou ? 'Ver o que falhou' : ''}
          style={{ cursor: falhou ? 'pointer' : 'default' }}
        >
          {estado.status}
          {estado.pending ? ` (${estado.pending})` : ''}
        </button>
        {/* A conta tem página própria: é onde se transfere uma cópia dos dados e
            onde se apaga tudo. O "Sair" fica aqui à mão, que é o que se usa
            todos os dias. */}
        {remote && user ? (
          <>
            <button
              className="btn btn--ghost btn--tiny"
              onClick={() => router.push(rotas.conta())}
              title={user.email || 'A minha conta'}
            >
              Conta
            </button>
            <button
              className="btn btn--ghost btn--tiny"
              onClick={async () => {
                await signOut();
                router.push(rotas.login());
              }}
            >
              Sair
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
