'use client';

// app/login/page.jsx — entrada e registo no mesmo ecrã.
//
// Um treinador que já entrou uma vez não volta aqui: a sessão fica guardada no
// dispositivo e renova-se sozinha.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';
import { iniciarDemo, limparDemo } from '@/lib/demo.js';
import { rotas } from '@/lib/routes.js';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, session, ready, remote } = useAuth();
  const { toast } = useUI();
  const [modo, setModo] = useState('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [aMontar, setAMontar] = useState(false);

  // Já com sessão (ou sem servidor configurado), não há nada a fazer aqui.
  useEffect(() => {
    if (!ready) return;
    if (!remote || session) router.replace(rotas.dashboard());
  }, [ready, remote, session, router]);

  // Chegar a este ecrã encerra qualquer experiência a meio. Se ficasse por
  // limpar, uma conta nova nascia com o FC Demonstração lá dentro.
  useEffect(() => {
    limparDemo();
  }, []);

  /** Monta a equipa fictícia e abre o jogo. Nada disto sai do dispositivo. */
  async function experimentar() {
    if (aMontar) return;
    setAMontar(true);
    try {
      const { matchId, limpou, perdidas } = await iniciarDemo();
      if (limpou) {
        toast(
          perdidas
            ? `Os dados da conta anterior saíram deste aparelho — ${perdidas} por enviar ficaram para trás. Estão na conta se já tinham subido.`
            : 'Os dados da conta anterior saíram deste aparelho. Continuam guardados na conta.',
          'ok',
          7000
        );
      }
      router.push(rotas.jogoPreparar(matchId));
    } catch (e) {
      setAMontar(false);
      toast(`Não foi possível preparar o jogo de experiência: ${e.message}`, 'error');
    }
  }

  async function submeter(e) {
    e.preventDefault();
    if (!email.trim() || !password) return toast('Preencha o email e a palavra-passe.', 'error');
    setAEnviar(true);
    const { error } =
      modo === 'entrar'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, nome.trim());
    setAEnviar(false);

    if (error) return toast(error, 'error');
    if (modo === 'criar') {
      toast('Conta criada. Confirme o email se lhe for pedido.', 'ok');
    }
    router.replace(rotas.dashboard());
  }

  return (
    <div className="auth">
      <form className="auth__card card" onSubmit={submeter}>
        <h1 className="page__title">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="page__sub">
          Os jogos ficam guardados na sua conta e aparecem em qualquer dispositivo.
        </p>

        {modo === 'criar' ? (
          <label className="field">
            <span className="field__label">Nome</span>
            <input
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como quer ser tratado"
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </label>

        <label className="field">
          <span className="field__label">Palavra-passe</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
          {modo === 'criar' ? (
            <span className="field__hint">Pelo menos 6 caracteres.</span>
          ) : null}
        </label>

        <div className="form__actions">
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}
          >
            {modo === 'entrar' ? 'Criar conta' : 'Já tenho conta'}
          </button>
          <button className="btn btn--primary" type="submit" disabled={aEnviar}>
            {aEnviar ? 'A ligar…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>

        {/* Experimentar antes de decidir. O jogo é o mesmo código do jogo a
            sério — só a equipa é que é inventada. */}
        <div className="auth__demo">
          <span className="auth__ou">ou</span>
          <button className="btn btn--block" type="button" onClick={experimentar} disabled={aMontar}>
            {aMontar ? 'A preparar…' : 'Experimentar sem criar conta'}
          </button>
          <span className="field__hint">
            Um jogo completo com uma equipa fictícia, para ver como funciona.
          </span>
        </div>

        {/* A política tem de estar à mão ANTES de alguém criar conta, não
            escondida lá dentro depois de já ter dado os dados. */}
        <p className="muted small">
          {modo === 'criar' ? 'Ao criar conta aceita a ' : 'Consulte a '}
          <a
            className="link"
            onClick={() => router.push(rotas.privacidade())}
            style={{ cursor: 'pointer' }}
          >
            política de privacidade
          </a>
          .
        </p>
      </form>
    </div>
  );
}
