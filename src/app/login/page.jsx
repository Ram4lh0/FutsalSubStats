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
import { startGuidedTutorial } from '@/lib/tutorial.js';
import { useT } from '@/lib/i18n/index.js';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { signIn, signUp, signInWithProvider, pedirRecuperacao, session, ready, remote } = useAuth();
  const { toast } = useUI();
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
    if (!remote || session) router.replace(rotas.dashboard());
  }, [ready, remote, session, router]);

  // Chegar a este ecrã encerra qualquer experiência a meio. Se ficasse por
  // limpar, uma conta nova nascia com o FC Demonstração lá dentro.
  useEffect(() => {
    limparDemo();
  }, []);

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
      startGuidedTutorial(router);
      return;
    }
    router.replace(rotas.dashboard());
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
        <p className="page__sub">{t('login.subtitulo')}</p>

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

        <div className="auth__divider"><span>{t('login.ou')}</span></div>
        <div className="auth__providers">
          <button className="btn btn--provider" type="button" onClick={() => entrarCom('google')} disabled={aEnviar}>
            <span className="auth__provider-icon" aria-hidden="true">G</span>
            {t('login.google')}
          </button>
          <button className="btn btn--provider" type="button" onClick={() => entrarCom('apple')} disabled={aEnviar}>
            <span className="auth__provider-icon auth__provider-icon--apple" aria-hidden="true">Apple</span>
            {t('login.apple')}
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
