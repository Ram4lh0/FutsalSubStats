'use client';

// lib/demoEstado.js — se a demonstração está a correr nesta sessão.
//
// Vive à parte de `lib/demo.js` porque a sincronização também precisa de o
// saber, e o `demo.js` já importa o repositório (que importa a sincronização):
// pô-lo lá fazia um círculo.
//
// Desde que a demo passou a correr com sessão iniciada (depois do login, para
// quem ainda não tem equipa), a sincronização fica parada enquanto isto for
// verdade: o FC Demonstração não pode subir para a conta de ninguém.

const FLAG = 'futsal-demo';

export function emDemo() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export function marcarDemo(ligado) {
  if (typeof window === 'undefined') return;
  try {
    if (ligado) window.sessionStorage.setItem(FLAG, '1');
    else window.sessionStorage.removeItem(FLAG);
  } catch {
    /* sem sessionStorage — a demonstração corre à mesma nesta sessão */
  }
}
