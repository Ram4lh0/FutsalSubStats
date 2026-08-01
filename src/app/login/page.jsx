'use client';

// app/login/page.jsx — entrada e registo no mesmo ecrã.
//
// Um treinador que já entrou uma vez não volta aqui: a sessão fica guardada no
// dispositivo e renova-se sozinha.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, session, ready, remote } = useAuth();
  const { toast } = useUI();
  const [modo, setModo] = useState('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aEnviar, setAEnviar] = useState(false);

  // Já com sessão (ou sem servidor configurado), não há nada a fazer aqui.
  useEffect(() => {
    if (!ready) return;
    if (!remote || session) router.replace('/dashboard');
  }, [ready, remote, session, router]);

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
    router.replace('/dashboard');
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
      </form>
    </div>
  );
}
