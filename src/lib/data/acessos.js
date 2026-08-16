'use client';

// lib/data/acessos.js — quem vê e quem edita cada escalão.
//
// ## Isto não funciona sem rede, e é de propósito
//
// Tudo o resto nesta app escreve primeiro no dispositivo e sincroniza depois.
// Aqui não: fala-se directamente com o servidor.
//
// A razão é que uma permissão não é um dado do treinador, é uma decisão sobre
// **outra pessoa**. Guardada localmente para enviar mais tarde, abria-se um
// buraco desagradável: o gerente tira o acesso a alguém no pavilhão, sem rede,
// fica convencido de que está feito, e o acesso só desaparece quando a app dele
// voltar a ter ligação — que pode ser no dia seguinte.
//
// Com o servidor à frente, ou funciona à primeira ou diz que não conseguiu. É a
// única parte da app onde "guardado, envio depois" seria pior do que um erro.
//
// A segurança é a mesma que protege os dados: as políticas da migração 0011 só
// deixam o dono do clube escrever aqui. Este ficheiro é a interface, não a
// fechadura — quem chamar isto sem ser dono leva um erro do Postgres.

import { supabase } from '../supabase/client.js';
import { t } from '../i18n/index.js';

/** Os dois níveis. `ver` mostra tudo; `editar` deixa registar jogos e mexer no plantel. */
export const NIVEIS = ['ver', 'editar'];

function ligacao() {
  const sb = supabase();
  if (!sb) {
    const erro = new Error('sem servidor');
    erro.chave = 'auth.semServidor';
    throw erro;
  }
  return sb;
}

/**
 * Os treinadores associados ao clube, com o acesso que têm a este escalão.
 *
 * Vem tudo numa lista só — associados sem acesso incluídos — porque é essa a
 * lista que o gerente quer ver: quem já lá está, quem falta pôr. Duas listas
 * separadas obrigavam-no a olhar para dois sítios para responder a "quem é que
 * vê este escalão".
 */
export async function listarParaEscalao(clubId, teamId) {
  const sb = ligacao();

  const { data: membros, error: e1 } = await sb
    .from('club_members')
    .select('user_id, profiles ( id, name, email )')
    .eq('club_id', clubId);
  if (e1) throw e1;

  const { data: acessos, error: e2 } = await sb
    .from('team_access')
    .select('user_id, nivel')
    .eq('team_id', teamId);
  if (e2) throw e2;

  const nivelPor = new Map((acessos || []).map((a) => [a.user_id, a.nivel]));

  return (membros || [])
    .map((m) => ({
      userId: m.user_id,
      // O nome pode não estar preenchido — quem entra por convite só tem email
      // até decidir escrever um. O email é o que nunca falta.
      nome: m.profiles?.name || m.profiles?.email || m.user_id,
      email: m.profiles?.email || '',
      nivel: nivelPor.get(m.user_id) || null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

/** Dar acesso, ou mudar o nível de quem já o tinha. */
export async function darAcesso(teamId, userId, nivel) {
  if (!NIVEIS.includes(nivel)) throw new Error(`nível desconhecido: ${nivel}`);
  const { error } = await ligacao()
    .from('team_access')
    .upsert({ team_id: teamId, user_id: userId, nivel }, { onConflict: 'team_id,user_id' });
  if (error) throw error;
}

export async function tirarAcesso(teamId, userId) {
  const { error } = await ligacao()
    .from('team_access')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** A recusa do servidor, dita em português. */
export function explicar(erro) {
  const m = String(erro?.message || '').toLowerCase();
  if (erro?.chave) return t(erro.chave);
  if (m.includes('row-level security') || m.includes('policy')) return t('acessos.semAutorizacao');
  if (m.includes('failed to fetch') || m.includes('networkerror')) return t('acessos.semRede');
  return erro?.message || t('comum.semDetalhes');
}
