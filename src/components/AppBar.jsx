'use client';

// components/AppBar.jsx — barra de topo.
//
// ## Porque é que aqui não há nenhum aviso de sincronização
//
// Havia: um selo que aparecia sem rede, com coisas por enviar ou em erro. A
// intenção era boa e o efeito era o contrário do pretendido.
//
// Num pavilhão sem rede — que é metade deles — aquele selo estava aceso o jogo
// inteiro. Um aviso permanente não é um aviso: é um enfeite que ensina as
// pessoas a não olhar para o canto do ecrã. E o que ele anunciava não era
// sequer um problema: os dados estavam gravados no aparelho, e o envio é uma
// consequência que acontece sozinha mal haja rede.
//
// Quem quiser confirmar tem tudo nas Definições — estado, quantas coisas
// faltam, quando foi a última vez e um botão para forçar. É uma pergunta que se
// faz de vez em quando, não a toda a hora.
//
// O sair da conta também saiu daqui, pela mesma família de razões: é uma acção
// rara e destrutiva, encostada ao canto onde o polegar bate sem querer, num
// ecrã que se usa com o jogo a decorrer.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { rotas } from '@/lib/routes.js';
import { emDemo, limparDemo } from '@/lib/demo.js';
import { useT } from '@/lib/i18n/index.js';
import { registoAberto, ligacaoPedirConta } from '@/lib/registo.js';

export default function AppBar() {
  const router = useRouter();
  const t = useT();
  const { user, remote } = useAuth();
  // Lido depois de montar: no servidor não há sessionStorage, e o estado tem de
  // ser o mesmo dos dois lados para o React não se queixar.
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(emDemo()), []);

  return (
    <header className="appbar">
      <button className="appbar__brand" onClick={() => router.push(rotas.dashboard())}>
        <span>{t('barra.marca')}</span>
      </button>
      <span className="appbar__spacer" />
      <div className="appbar__right">
        {demo ? (
          <>
            <span className="sync sync--demo">{t('barra.demonstracao')}</span>
            {/* Com o registo aberto vai-se ao ecrã de entrada criar a conta.
                Fechado não há lá nada para fazer: abre-se o email. E não se
                limpa a demonstração — quem vai escrever um email volta, e voltar
                a um ecrã vazio é o pior que lhe podia acontecer. */}
            {registoAberto() ? (
              <button
                className="btn btn--primary btn--tiny"
                onClick={async () => {
                  await limparDemo();
                  router.replace(rotas.login());
                }}
              >
                {t('barra.criarConta')}
              </button>
            ) : (
              <a
                className="btn btn--primary btn--tiny"
                href={ligacaoPedirConta(t('registo.assunto'))}
              >
                {t('registo.pedirConta')}
              </a>
            )}
          </>
        ) : null}
        {/* Um botão só. Lá dentro está o idioma, o estado da sincronização, a
            cópia dos dados, o sair da conta e a eliminação. */}
        {user || !remote ? (
          <button
            className="btn btn--ghost btn--tiny"
            onClick={() => router.push(rotas.conta())}
            title={user.email || t('barra.definicoes')}
          >
            {t('barra.definicoes')}
          </button>
        ) : remote ? (
          <button
            className="btn btn--primary btn--tiny"
            onClick={() => router.push(rotas.login())}
          >
            {t('login.entrar')}
          </button>
        ) : null}
      </div>
    </header>
  );
}
