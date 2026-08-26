'use client';

// lib/auth.jsx — sessão do treinador, partilhada por toda a app.
//
// Regra que atravessa o ficheiro: perder a ligação não pode expulsar ninguém.
// A sessão do Supabase é guardada no dispositivo e renovada sozinha; enquanto o
// token durar, um jogo inteiro decorre sem rede.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, hasRemote } from './supabase/client.js';
import * as sync from './data/sync.js';
import { t } from '@/lib/i18n/index.js';
import { CONTACTO } from '@/lib/registo.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!hasRemote());
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return; // modo só-dispositivo

    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next || null);
      setReady(true);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sb = supabase();
    if (!sb || typeof window === 'undefined') return;

    const resposta = lerRespostaOAuth();
    if (!resposta.code && !resposta.error && !resposta.errorCode && !resposta.errorDescription) return;

    let alive = true;
    (async () => {
      try {
        if (resposta.error || resposta.errorCode || resposta.errorDescription) {
          setAuthError(traduzir(resposta.errorDescription || resposta.errorCode || resposta.error));
          return;
        }
        const { data, error } = await sb.auth.exchangeCodeForSession(resposta.code);
        if (!alive) return;
        if (error) setAuthError(traduzir(error.message));
        else {
          setSession(data?.session || null);
          setAuthError(null);
        }
      } finally {
        limparRespostaOAuth();
        if (alive) setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sb = supabase();
    const cap = globalThis?.Capacitor;
    const app = cap?.Plugins?.App;
    const browser = cap?.Plugins?.Browser;
    if (!sb || !dentroDoInvolucro(cap) || !app) return;

    let listener;
    let alive = true;
    const finishOAuth = async (url) => {
      if (!url?.startsWith('com.futsalsubstats.app://auth/callback')) return;
      const parsed = new URL(url);
      const error = parsed.searchParams.get('error_description')
        || parsed.searchParams.get('error_code')
        || parsed.searchParams.get('error');
      if (error) setAuthError(traduzir(error));
      const code = parsed.searchParams.get('code');
      if (code) {
        const { error: trocaErro } = await sb.auth.exchangeCodeForSession(code);
        if (trocaErro) setAuthError(traduzir(trocaErro.message));
        else setAuthError(null);
      }
      await browser?.close?.().catch(() => {});
    };

    app.addListener('appUrlOpen', ({ url }) => finishOAuth(url)).then((handle) => {
      if (alive) listener = handle;
      else handle.remove();
    });
    app.getLaunchUrl().then((launch) => finishOAuth(launch?.url)).catch(() => {});

    return () => {
      alive = false;
      listener?.remove();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      ready,
      authError,
      remote: hasRemote(),
      user: session?.user || null,
      userId: session?.user?.id || null,

      clearAuthError() {
        setAuthError(null);
      },

      async signIn(email, password) {
        setAuthError(null);
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return { error: error ? traduzir(error.message) : null };
      },

      async signUp(email, password, name) {
        setAuthError(null);
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        return {
          error: error ? traduzir(error.message) : null,
          needsConfirmation: !error && !data?.session,
        };
      },

      async signInWithProvider(provider) {
        setAuthError(null);
        limparRespostaOAuth();
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const cap = globalThis?.Capacitor;
        const native = dentroDoInvolucro(cap);
        const redirectTo = native
          ? 'com.futsalsubstats.app://auth/callback'
          : `${window.location.origin}/login`;
        const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined;
        const { data, error } = await sb.auth.signInWithOAuth({
          provider,
          options: { redirectTo, skipBrowserRedirect: native, queryParams },
        });
        if (error) return { error: traduzir(error.message) };
        if (native && data?.url) {
          const browser = cap?.Plugins?.Browser;
          if (!browser?.open) return { error: t('auth.semNavegador') };
          await browser.open({ url: data.url });
        }
        return { error: null };
      },

      /**
       * Trocar o `token_hash` que vem no link do email por uma sessão.
       *
       * É o que faz os convites e as recuperações funcionarem. A alternativa
       * seria deixar o Supabase pôr a sessão no fim do endereço e a app apanhá-la
       * de lá — mas o `client.js` tem `detectSessionInUrl: false` de propósito, e
       * não é para mudar: com ele ligado, qualquer endereço que chegue à app com
       * um `#access_token=` lá atrás inicia sessão sozinho, sem nada no código a
       * decidir isso.
       *
       * Aqui a app é que pega no símbolo, o entrega e recebe a sessão de volta.
       */
      async trocarLinkPorSessao(tokenHash, tipo) {
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
        return { error: error ? traduzir(error.message) : null };
      },

      /**
       * O mesmo, mas com o código de seis dígitos em vez do link.
       *
       * Existe porque os links dos emails só servem uma vez e há quem os gaste
       * sem querer: os filtros de segurança de algumas empresas abrem as ligações
       * das mensagens antes de as entregar, para as verificar. Quando a pessoa
       * carrega, o link já foi usado. O código não se gasta a ser lido, e é por
       * isso que vai em todos os emails.
       */
      async trocarCodigoPorSessao(email, codigo, tipo) {
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.auth.verifyOtp({
          email: String(email || '').trim(),
          token: String(codigo || '').trim(),
          type: tipo,
        });
        return { error: error ? traduzir(error.message) : null };
      },

      /**
       * Confirmar que quem está a mexer sabe mesmo a palavra-passe atual.
       *
       * O `updateUser` não a pede: basta ter sessão. E a sessão vive meses no
       * telemóvel — quem apanhasse o aparelho destrancado mudava a palavra-passe
       * e ficava com a conta. Isto fecha essa porta.
       *
       * Falhar aqui não expulsa ninguém: um `signInWithPassword` recusado deixa
       * a sessão que já existia exactamente como estava.
       */
      async confirmarPalavraPasse(email, atual) {
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.auth.signInWithPassword({ email, password: atual });
        return { error: error ? traduzir(error.message) : null };
      },

      /** Escrever a palavra-passe nova. Serve para a definir e para a mudar. */
      async definirPalavraPasse(nova) {
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.auth.updateUser({ password: nova });
        return { error: error ? traduzir(error.message) : null };
      },

      /**
       * Pedir o email de recuperação.
       *
       * Sem `redirectTo`: o endereço de destino é construído dentro do próprio
       * modelo do email, a partir do `Site URL` do projeto (ver
       * `supabase/emails/`). Um `redirectTo` que não estivesse na lista de
       * permitidos era recusado pelo servidor — assim não há lista para manter.
       */
      async pedirRecuperacao(email) {
        setAuthError(null);
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.auth.resetPasswordForEmail(String(email || '').trim());
        return { error: error ? traduzir(error.message) : null };
      },

      async signOut() {
        // A fila pára ANTES de a sessão morrer: um reenvio agendado sem sessão
        // não tem nada que fazer, e o erro que produzia aparecia ao utilizador
        // já no ecrã de entrada.
        sync.stop();
        const sb = supabase();
        if (sb) await sb.auth.signOut();
        setSession(null);
      },

      /**
       * Apagar a conta e tudo o que lhe pertence. Não há volta a dar.
       *
       * O servidor é que apaga: a app pede-o à função `delete_my_account`, que
       * só sabe apagar quem a chamou. Feito isso, a sessão deixa de valer e o
       * que está guardado no aparelho tem de ir também — senão ficava aqui uma
       * cópia de dados de uma conta que já não existe.
       */
      async deleteAccount() {
        const sb = supabase();
        if (!sb) return { error: t('auth.semServidor') };
        const { error } = await sb.rpc('delete_my_account');
        if (error) return { error: traduzir(error.message) };
        await sb.auth.signOut().catch(() => {});
        setSession(null);
        return { error: null };
      },
    }),
    [session, ready, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

function dentroDoInvolucro(cap) {
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return Boolean(cap.isNativePlatform());
  if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web';
  return Boolean(cap.isNative);
}

const OAUTH_PARAMS = ['code', 'error', 'error_code', 'error_description'];

function lerRespostaOAuth() {
  if (typeof window === 'undefined') return {};
  const url = new URL(window.location.href);
  const hash = new URLSearchParams((url.hash || '').replace(/^#/, ''));
  const get = (nome) => url.searchParams.get(nome) || hash.get(nome) || '';
  return {
    code: get('code'),
    error: get('error'),
    errorCode: get('error_code'),
    errorDescription: get('error_description'),
  };
}

function limparRespostaOAuth() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let mudou = false;

  for (const param of OAUTH_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      mudou = true;
    }
  }

  const hash = new URLSearchParams((url.hash || '').replace(/^#/, ''));
  for (const param of OAUTH_PARAMS) {
    if (hash.has(param)) {
      hash.delete(param);
      mudou = true;
    }
  }

  if (!mudou) return;
  const nextHash = hash.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`
  );
}

/** As mensagens do Supabase vêm em inglês; as que se vêem mais ficam em português. */
function traduzir(msg = '') {
  const m = msg.toLowerCase();
  // O registo por convite é a recusa mais importante de traduzir bem.
  //
  // Quando se desligar o registo no Supabase, quem já tiver a app instalada
  // continua a ver o botão de criar conta — a app vai empacotada no telemóvel e
  // só muda com uma versão nova nas lojas. Sem esta linha, essa pessoa levava
  // com "Signups not allowed for this instance" e não fazia ideia do que fazer
  // a seguir. Com ela, fica a saber que basta escrever um email.
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return t('registo.recusado', { email: CONTACTO });
  if (m.includes('invalid login')) return t('auth.credenciaisErradas');
  if (m.includes('already registered')) return t('auth.jaExisteConta');
  // Esta tem de vir antes da `password should be`, senão apanha-a primeiro: o
  // Supabase escreve "New password should be different from the old password."
  if (m.includes('should be different')) return t('auth.passwordIgual');
  if (m.includes('password should be')) return t('auth.passwordCurta');
  if (m.includes('email not confirmed')) return t('auth.confirmeEmail');
  // O link e o código gastos são a recusa que mais gente vai ver, e a mensagem
  // do Supabase ("Email link is invalid or has expired") não diz o que fazer.
  if (m.includes('expired') || m.includes('otp_expired') || m.includes('invalid or has expired'))
    return t('auth.linkExpirado');
  if (m.includes('token has invalid') || m.includes('invalid token')) return t('auth.codigoInvalido');
  // Limite de envios. O texto do Supabase começa por "For security purposes, you
  // can only request this after N seconds".
  if (m.includes('for security purposes') || m.includes('rate limit'))
    return t('auth.demasiadosPedidos');
  if (m.includes('failed to fetch')) return t('auth.semLigacao');
  return msg;
}
