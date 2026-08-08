'use client';

// A conta: quem está a usar a app, e a porta de saída.
//
// A eliminação vive aqui e não escondida numas definições quaisquer, porque tem
// de ser encontrável — é o que a Apple exige e é o que está certo. Mas encontrar
// fácil não é carregar por engano: pede-se o email escrito à mão, que é
// deliberadamente chato de fazer sem querer.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Field } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import * as db from '@/lib/data/local.js';
import * as sync from '@/lib/data/sync.js';
import { clubs, dump, markAllPending } from '@/lib/data/repository.js';
import { downloadJson } from '@/lib/data/exporter.js';
import { rotas } from '@/lib/routes.js';

export default function AccountPage() {
  return (
    <Pagina>
      <Conta />
    </Pagina>
  );
}

function Conta() {
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const { user, userId, deleteAccount, signOut } = useAuth();
  const [confirmacao, setConfirmacao] = useState('');
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
    toast('A reenviar tudo.', 'ok');
  }

  const email = user?.email || '';
  const podeApagar = confirmacao.trim().toLowerCase() === email.toLowerCase();

  async function guardarCopia() {
    downloadJson(`backup-futsal-${new Date().toISOString().slice(0, 10)}.json`, await dump());
    toast('Cópia transferida.', 'ok');
  }

  async function apagar() {
    if (!podeApagar || aApagar) return;

    const lista = await clubs.list();
    const ok = await confirmar(
      lista.length
        ? `Vai apagar ${lista.length} ${lista.length === 1 ? 'clube' : 'clubes'} com tudo o que têm dentro: escalões, planteis, jogos e o histórico de cada um. Não há como recuperar.`
        : 'Vai apagar a conta e tudo o que lhe pertence. Não há como recuperar.',
      { okLabel: 'Apagar definitivamente' }
    );
    if (!ok) return;

    setAApagar(true);
    try {
      const { error } = await deleteAccount();
      if (error) {
        toast(error, 'error');
        return;
      }
      // A conta deixou de existir: o que está guardado aqui não pode ficar.
      await db.clearAll();
      toast('Conta apagada.', 'ok');
      router.replace(rotas.login());
    } catch (e) {
      toast(`Não foi possível apagar: ${e.message}`, 'error');
    } finally {
      setAApagar(false);
    }
  }

  return (
    <>
      <PageHead
        title="A minha conta"
        subtitle={email}
        backTo={rotas.dashboard()}
        actions={
          <button
            className="btn btn--ghost"
            onClick={async () => {
              await signOut();
              router.push(rotas.login());
            }}
          >
            Sair
          </button>
        }
      />

      {/* O estado da sincronização vive aqui, e não na barra de topo: lá em cima
          só aparece quando corre mal. Quem quiser confirmar que está tudo em
          ordem vem cá ver — é uma pergunta que se faz de vez em quando, não a
          toda a hora. */}
      <div className="card">
        <h2 className="section section--tight">Sincronização</h2>
        <dl className="club-card__stats">
          <div>
            <dt>Estado</dt>
            <dd className="small">{estado.status}</dd>
          </div>
          <div>
            <dt>Por enviar</dt>
            <dd>{estado.pending || 0}</dd>
          </div>
          <div>
            <dt>Última vez</dt>
            <dd className="small">
              {estado.lastSyncAt
                ? new Date(estado.lastSyncAt).toLocaleTimeString('pt-PT', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
        {estado.error ? (
          <pre className="error">
            {estado.error.message}
            {estado.error.codigo ? `\n\ncódigo ${estado.error.codigo}` : ''}
          </pre>
        ) : null}
        <div className="form__actions">
          <button className="btn btn--ghost" onClick={reenviarTudo}>
            Reenviar tudo
          </button>
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" onClick={() => sync.flush(userId, user?.email)}>
            Sincronizar agora
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">Os teus dados</h2>
        <p className="muted">
          Os jogos, os planteis e as estatísticas ficam guardados neste aparelho e sincronizados com
          a tua conta. Podes levá-los contigo a qualquer momento.
        </p>
        <div className="form__actions">
          <button className="btn btn--ghost" onClick={guardarCopia}>
            Transferir uma cópia
          </button>
          <button className="btn btn--ghost" onClick={() => router.push(rotas.privacidade())}>
            Política de privacidade
          </button>
        </div>
      </div>

      <h2 className="section">Apagar a conta</h2>
      <div className="card card--danger">
        <p>
          Apagar a conta remove <strong>tudo</strong>: os clubes, os escalões, os planteis, os jogos
          e o histórico de cada um, aqui e no servidor. Não fica nenhuma cópia e não há forma de
          recuperar.
        </p>
        <p className="muted">
          Se houver alguma coisa que queiras guardar, transfere primeiro uma cópia com o botão aqui
          em cima.
        </p>

        <Field
          label="Para confirmar, escreve o teu email"
          hint="É de propósito: não se apaga uma época inteira por engano."
        >
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
          <button
            className="btn btn--danger"
            disabled={!podeApagar || aApagar}
            onClick={apagar}
          >
            {aApagar ? 'A apagar…' : 'Apagar a conta e tudo o que tem'}
          </button>
        </div>
      </div>
    </>
  );
}
