'use client';

// lib/registo.js — estado do registo.
//
// Há duas fechaduras, e é importante não as confundir:
//
//   1. **A do servidor.** No Supabase, em Authentication → Sign In / Providers,
//      a opção "Allow new users to sign up". Desligada, o servidor recusa
//      qualquer registo, venha da app ou de um pedido feito à mão. **É esta a
//      fechadura a sério.**
//
//   2. **A daqui.** Esconde o botão de criar conta para ninguém carregar e
//      levar com um erro. É cortesia, não segurança — um botão escondido
//      continua a ter uma API por trás.
//
// A ordem importa: fechar só aqui não fecha nada.
//
// Porque é que isto é uma variável de ambiente e não uma opção no ecrã: o Next
// lê-a no build e a app vai empacotada dentro do telemóvel. Mudá-la obriga a uma
// versão nova nas lojas — o que é lento. Por isso o `auth.jsx` também sabe
// reconhecer a recusa do servidor e explicá-la em português: quem já tiver a app
// instalada quando o registo fechar vê uma frase decente em vez de um erro em
// inglês. As duas coisas juntas cobrem os dois momentos.

/**
 * Por omissão **aberto**.
 *
 * Assim quem clonar o projeto, ou correr `npm run dev` sem configurar nada, tem
 * a app a funcionar como sempre. Fecha-se pondo `NEXT_PUBLIC_REGISTO_ABERTO=0`
 * (ou `false`) no ambiente e voltando a compilar.
 */
export function registoAberto() {
  // Desde a versão com quatro jogos gratuitos, qualquer pessoa pode criar
  // conta. A variável antiga pode continuar configurada em builds já montados,
  // mas deixou de fechar a interface e de contradizer a política do servidor.
  return true;
}

/** Contacto administrativo usado por builds antigas e mensagens de suporte. */
export const CONTACTO = 'review.futsalsubstats@gmail.com';

/**
 * Ligação antiga para contacto.
 * Ficou para compatibilidade com builds antigas e pontos de contacto
 * administrativos. A interface atual mantém o registo aberto.
 */
export function ligacaoPedirConta(assunto) {
  return `mailto:${CONTACTO}?subject=${encodeURIComponent(assunto || '')}`;
}
