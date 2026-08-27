'use client';

// app/login/page.jsx — entrada e registo no mesmo ecrã.
//
// Um treinador que já entrou uma vez não volta aqui: a sessão fica guardada no
// dispositivo e renova-se sozinha.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';
import { limparDemo } from '@/lib/demo.js';
import { rotas } from '@/lib/routes.js';
import { markGuidedTutorialPrompted, startGuidedTutorial } from '@/lib/tutorial.js';
import { useT } from '@/lib/i18n/index.js';

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.5 13.1c0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.7-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.8-2.7-.7-1.4 0-2.7.8-3.4 2-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4 0-.1-2.8-1.1-2.8-3.3ZM14.5 6.9c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1 1.6-.9 2.6.9.1 1.9-.5 2.5-1.2Z"
      />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.3-2 3v2.4h3.2c1.8-1.7 3-4.1 3-7.1Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.5-2.4l-3.2-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.5-4H3.3v2.5C4.9 19.8 8.2 22 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14.1c-.2-.6-.3-1.3-.3-2.1s.1-1.4.3-2.1V7.4H3.3C2.7 8.8 2.3 10.3 2.3 12s.4 3.2 1 4.6l3.2-2.5Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.2 2 4.9 4.2 3.3 7.4l3.2 2.5c.8-2.3 3-4 5.5-4Z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const {
    signIn,
    signUp,
    signInWithProvider,
    pedirRecuperacao,
    session,
    ready,
    remote,
    authError,
    clearAuthError,
  } = useAuth();
  const { toast, confirmar } = useUI();
  const [modo, setModo] = useState('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [aRecuperar, setARecuperar] = useState(false);

  // Já com sessão (ou sem servidor configurado), não há nada a fazer aqui.
  useEffect(() => {
    if (!ready) return;
    if (!remote || session) router.replace(rotas.jogo());
  }, [ready, remote, session, router]);

  // Chegar a este ecrã encerra qualquer experiência a meio. Se ficasse por
  // limpar, uma conta nova nascia com o FC Demonstração lá dentro.
  useEffect(() => {
    limparDemo();
  }, []);

  useEffect(() => {
    if (!authError) return;
    toast(authError, 'error', 8000);
    clearAuthError?.();
  }, [authError, clearAuthError, toast]);

  /**
   * Pedir o email para escolher uma palavra-passe nova.
   *
   * A resposta é sempre a mesma, haja conta ou não. Se dissesse "não existe
   * conta com esse email", este botão passava a servir para descobrir quem tem
   * conta na app — e isso não é da conta de quem pergunta.
   */
  async function recuperar() {
    if (!email.trim()) return toast(t('login.esqueciFaltaEmail'), 'error');
    if (aRecuperar) return;
    setARecuperar(true);
    const { error } = await pedirRecuperacao(email.trim());
    setARecuperar(false);
    // O erro que passa é o de rede ou o de limite de envios — esses interessam
    // mesmo, porque a pessoa fica à espera de um email que não vem.
    if (error) return toast(error, 'error');
    toast(t('login.esqueciEnviado'), 'ok', 8000);
  }

  async function submeter(e) {
    e.preventDefault();
    if (!email.trim() || !password) return toast(t('login.faltaPreencher'), 'error');
    if (modo === 'criar' && password !== passwordConfirm)
      return toast(t('login.passwordNaoCoincide'), 'error');
    setAEnviar(true);
    const result =
      modo === 'entrar'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, nome.trim());
    setAEnviar(false);

    if (result.error) return toast(result.error, 'error');
    if (modo === 'criar') {
      toast(t('login.contaCriada'), 'ok');
      if (result.needsConfirmation) {
        setModo('entrar');
        return;
      }
      const querTutorial = await confirmar(t('tutorial.perguntaNovoTexto'), {
        title: t('tutorial.perguntaTitulo'),
        okLabel: t('tutorial.perguntaSim'),
        cancelLabel: t('tutorial.perguntaNao'),
        danger: false,
      });
      markGuidedTutorialPrompted();
      if (querTutorial) startGuidedTutorial(router);
      else router.replace(rotas.jogo());
      return;
    }
    router.replace(rotas.jogo());
  }

  async function entrarCom(provider) {
    if (aEnviar) return;
    setAEnviar(true);
    const { error } = await signInWithProvider(provider);
    setAEnviar(false);
    if (error) toast(error, 'error');
  }

  return (
    <div className="auth">
      <form className="auth__card card" onSubmit={submeter}>
        <h1 className="page__title">
          {modo === 'entrar' ? t('login.entrar') : t('login.criarConta')}
        </h1>

        <div className="auth__providers">
          <button className="btn btn--provider" type="button" onClick={() => entrarCom('apple')} disabled={aEnviar}>
            <span className="auth__provider-icon" aria-hidden="true"><AppleLogo /></span>
            {t('login.apple')}
          </button>
          <button className="btn btn--provider" type="button" onClick={() => entrarCom('google')} disabled={aEnviar}>
            <span className="auth__provider-icon" aria-hidden="true"><GoogleLogo /></span>
            {t('login.google')}
          </button>
        </div>

        <div className="auth__divider"><span>{t('login.ou')}</span></div>

        {modo === 'criar' ? (
          <label className="field">
            <span className="field__label">{t('login.nome')}</span>
            <input
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t('login.nomePlaceholder')}
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">{t('login.email')}</span>
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
          <span className="field__label">{t('login.password')}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
          {modo === 'criar' ? (
            <span className="field__hint">{t('login.passwordDica')}</span>
          ) : null}
        </label>

        {modo === 'criar' ? (
          <label className="field">
            <span className="field__label">{t('login.passwordConfirm')}</span>
            <input
              className="input"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        ) : null}

        {/* Só a entrar: a quem está a criar conta não faz sentido nenhum. */}
        {modo === 'entrar' && remote ? (
          <button
            className="btn btn--ghost btn--tiny"
            type="button"
            onClick={recuperar}
            disabled={aRecuperar}
          >
            {aRecuperar ? t('login.esqueciAEnviar') : t('login.esqueci')}
          </button>
        ) : null}

        <div className="form__actions">
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}
          >
            {modo === 'entrar' ? t('login.criarConta') : t('login.jaTenhoConta')}
          </button>
          <button className="btn btn--primary" type="submit" disabled={aEnviar}>
            {aEnviar
              ? t('login.aLigar')
              : modo === 'entrar'
                ? t('login.entrar')
                : t('login.criarConta')}
          </button>
        </div>

        {/* A política tem de estar à mão ANTES de alguém criar conta, não
            escondida lá dentro depois de já ter dado os dados. */}
        <p className="muted small">
          {modo === 'criar' ? t('login.aceitaPolitica') : t('login.consultePolitica')}
          <a
            className="link"
            onClick={() => router.push(rotas.privacidade())}
            style={{ cursor: 'pointer' }}
          >
            {t('login.politica')}
          </a>
          .
        </p>
      </form>
    </div>
  );
}
