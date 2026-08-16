'use client';

// lib/useSouDono.js — este clube é meu?
//
// Quem é dono do clube cria e apaga escalões, muda os dados do clube, e decide
// quem mais lá entra. Um treinador associado não faz nada disso: trabalha
// **dentro** dos escalões que lhe deram.
//
// O servidor já sabe isto — são as políticas `clubs_atualizar` e `teams_criar`
// da migração 0011 — mas saber não chega. Um botão que existe e falha ao ser
// carregado é pior do que um botão que não existe: a pessoa escreve o nome,
// escolhe as cores, carrega em Guardar, e leva um erro de sincronização que não
// tem nada que ver com o que fez.
//
// ## Um clube sem dono é meu
//
// Um clube criado aqui e ainda não sincronizado tem `ownerId` a nulo — quem
// carimba o dono é o envio, que sabe de quem é a sessão. Tratá-lo como alheio
// deixava quem cria um clube sem rede a olhar para ele sem poder mexer.
//
// ## Porque é que a leitura é feita depois de montar
//
// O dono do aparelho vive no `localStorage`, que não existe no servidor. Ler
// durante o primeiro desenho daria uma página diferente dos dois lados e o React
// queixava-se. Começa em `false` — sem botões — e corrige-se logo a seguir.
// Nesta ordem, o pior caso é um botão a aparecer com um instante de atraso; ao
// contrário, seria um botão a desaparecer depois de estar à vista.

import { useEffect, useState } from 'react';
import { clubs } from './data/repository.js';
import { donoAtual } from './data/owner.js';

export default function useSouDono(clubId) {
  const [souDono, setSouDono] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!clubId) {
        if (vivo) setSouDono(false);
        return;
      }
      const clube = await clubs.get(clubId);
      if (!vivo) return;
      setSouDono(Boolean(clube) && (!clube.ownerId || clube.ownerId === donoAtual()));
    })();
    return () => {
      vivo = false;
    };
  }, [clubId]);

  return souDono;
}

/**
 * A mesma pergunta, para uma lista já carregada.
 *
 * O painel mostra vários cartões e não vale a pena ir à base de dados uma vez
 * por cada um — já tem as linhas na mão.
 */
export function souDonoDe(clube) {
  if (!clube) return false;
  return !clube.ownerId || clube.ownerId === donoAtual();
}
