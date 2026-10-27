// lib/feedbackRapido.js — as decisões do ícone de feedback da barra de topo,
// separadas do componente para se poderem testar sem React.
//
// O ícone deixa mandar feedback a qualquer momento (tabela `feedback_app`,
// migração 20261028100000). Não aparece sem sessão, na demonstração (não há
// conta a quem atribuir a mensagem) nem no jogo ao vivo, onde o canto de cima
// é onde o polegar bate sem querer.

import { noJogoAoVivo } from './routes.js';

export const MAX_TEXTO = 4000;

export function mostrarFeedbackRapido({ userId, demo, pathname }) {
  return Boolean(userId) && !demo && !noJogoAoVivo(pathname);
}

/** A plataforma no formato que a tabela aceita; tudo o que não é nativo é web. */
export function plataformaDe(cap = globalThis?.Capacitor) {
  const p = cap?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** A linha a inserir, ou `null` se não houver nada escrito. */
export function linhaFeedback({ texto, pathname, versao, plataforma }) {
  const limpo = String(texto || '').trim().slice(0, MAX_TEXTO);
  if (!limpo) return null;
  return {
    texto: limpo,
    ecra: String(pathname || '').slice(0, 200) || null,
    versao: versao ? String(versao).slice(0, 40) : null,
    plataforma,
  };
}
