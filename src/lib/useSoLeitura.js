'use client';

// lib/useSoLeitura.js — olha-se mas não se mexe.
//
// Duas situações diferentes acabam no mesmo sítio, e é por isso que partilham
// um hook:
//
// **O jogo de experiência.** Deixa percorrer a app toda — o plantel, os
// escalões, as competições, as estatísticas — e não deixa alterar nada da
// estrutura. Não faz sentido: tudo isto desaparece quando a experiência acabar,
// e ninguém quer perder cinco minutos a escrever um plantel que se vai perder.
// E deixa clara a fronteira: quem quiser a sua equipa a sério vê exactamente o
// que ganha ao criar conta.
//
// **Um escalão em que só se tem `ver`.** O gerente do clube deu acesso de
// leitura a um treinador — o adjunto, o coordenador — e essa pessoa acompanha
// os jogos e as estatísticas sem poder mexer em nada.
//
// Esconder os botões não chega, nem num caso nem no outro: o endereço do
// formulário escreve-se à mão e chega-se lá à mesma. Este hook é a cortesia;
// quem trava a sério é o `repository.js` e, no fim da linha, as políticas do
// servidor.
//
// A leitura é feita depois de montar, e não durante: no servidor não há
// `sessionStorage` nem base local, e o primeiro desenho tem de ser igual dos
// dois lados para o React não se queixar da diferença.

import { useEffect, useState } from 'react';
import { emDemo } from './demo.js';
import { teams } from './data/repository.js';

/**
 * @param {string} [teamId] O escalão em que se está. Sem ele, só se pergunta
 *   pela experiência — que é o que basta nos ecrãs que não pertencem a nenhum
 *   escalão, como o painel ou o formulário do clube.
 */
export default function useSoLeitura(teamId) {
  const [soLeitura, setSoLeitura] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (emDemo()) {
        if (vivo) setSoLeitura(true);
        return;
      }
      if (!teamId) {
        if (vivo) setSoLeitura(false);
        return;
      }
      // `dono` e `editar` mexem; `ver` não. Um escalão sem nível anotado foi
      // criado aqui e ainda não sincronizou — é de quem o criou.
      const nivel = await teams.nivel(teamId);
      if (vivo) setSoLeitura(nivel === 'ver');
    })();
    return () => {
      vivo = false;
    };
  }, [teamId]);

  return soLeitura;
}
