'use client';

// lib/auth.jsx — sessão do treinador, partilhada por toda a app.
//
// Regra que atravessa o ficheiro: perder a ligação não pode expulsar ninguém.
// A sessão do Supabase é guardada no dispositivo e renovada sozinha; enquanto o
// token durar, um jogo inteiro decorre sem rede.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, hasRemote } from './supabase/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!hasRemote());

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

  const value = useMemo(
    () => ({
      session,
      ready,
      remote: hasRemote(),
      user: session?.user || null,
      userId: session?.user?.id || null,

      async signIn(email, password) {
        const sb = supabase();
        if (!sb) return { error: 'A app não está ligada a nenhum servidor.' };
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return { error: error ? traduzir(error.message) : null };
      },

      async signUp(email, password, name) {
        const sb = supabase();
        if (!sb) return { error: 'A app não está ligada a nenhum servidor.' };
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        return { error: error ? traduzir(error.message) : null };
      },

      async signOut() {
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
        if (!sb) return { error: 'A app não está ligada a nenhum servidor.' };
        const { error } = await sb.rpc('delete_my_account');
        if (error) return { error: traduzir(error.message) };
        await sb.auth.signOut().catch(() => {});
        setSession(null);
        return { error: null };
      },
    }),
    [session, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

/** As mensagens do Supabase vêm em inglês; as que se vêem mais ficam em português. */
function traduzir(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Email ou palavra-passe errados.';
  if (m.includes('already registered')) return 'Já existe uma conta com esse email.';
  if (m.includes('password should be')) return 'A palavra-passe tem de ter pelo menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Confirme o email antes de entrar.';
  if (m.includes('failed to fetch')) return 'Sem ligação ao servidor.';
  return msg;
}
