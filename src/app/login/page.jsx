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
import { useT } from '@/lib/i18n/index.js';
import { registoAberto, CONTACTO } from '@/lib/registo.js';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { signIn, signUp, pedirRecuperacao, session, ready, remote } = useAuth();
  const { toast } = useUI();
  // Com o registo por convite não há dois modos: este ecrã é só de entrada.
  const aberto = registoAberto();
  const [modo, setModo] = useState('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [aMontar, setAMontar] = useState(false);
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

  /** Monta a equipa fictícia e abre o jogo. Nada disto sai do dispositivo. */
  async function experimentar() {
    if (aMontar) return;
    setAMontar(true);
    try {
      const { matchId, limpou, perdidas } = await iniciarDemo();
      if (limpou) {
        toast(
          perdidas
            ? t('login.donoTrocouComPerdas', { n: perdidas })
            : t('login.donoTrocou'),
          'ok',
          7000
        );
      }
      router.push(rotas.jogoPreparar(matchId));
    } catch (e) {
      setAMontar(false);
      toast(t('login.demoFalhou', { erro: e.message }), 'error');
    }
  }

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
    setAEnviar(true);
    const { error } =
      modo === 'entrar'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, nome.trim());
    setAEnviar(false);

    if (error) return toast(error, 'error');
    if (modo === 'criar') {
      toast(t('login.contaCriada'), 'ok');
    }
    router.replace(rotas.dashboard());
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
          {aberto ? (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}
            >
              {modo === 'entrar' ? t('login.criarConta') : t('login.jaTenhoConta')}
            </button>
          ) : null}
          <button className="btn btn--primary" type="submit" disabled={aEnviar}>
            {aEnviar
              ? t('login.aLigar')
              : modo === 'entrar'
                ? t('login.entrar')
                : t('login.criarConta')}
          </button>
        </div>

        {/* Com o registo fechado, quem chega aqui sem conta tem de saber o que
            fazer a seguir. Um ecrã de entrada sem saída nenhuma é um beco. */}
        {aberto ? null : (
          <div className="card card--inset">
            <p className="muted small">
              <strong>{t('registo.fechado')}</strong> {t('registo.fechadoTexto')}
            </p>
            <a
              className="btn btn--ghost btn--block"
              href={`mailto:${CONTACTO}?subject=${encodeURIComponent(t('registo.assunto'))}`}
            >
              {t('registo.pedirConta')}
            </a>
          </div>
        )}

        {/* Experimentar antes de decidir. O jogo é o mesmo código do jogo a
            sério — só a equipa é que é inventada. */}
        <div className="auth__demo">
          <span className="auth__ou">{t('login.ou')}</span>
          <button className="btn btn--block" type="button" onClick={experimentar} disabled={aMontar}>
            {aMontar ? t('login.aPreparar') : t('login.experimentar')}
          </button>
          <span className="field__hint">{t('login.experimentarDica')}</span>
        </div>

        {/* A política tem de estar à mão ANTES de alguém criar conta, não
            escondida lá dentro depois de já ter dado os dados. */}
        <p className="muted small">
          {modo === 'criar' && aberto ? t('login.aceitaPolitica') : t('login.consultePolitica')}
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
