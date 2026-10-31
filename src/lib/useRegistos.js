'use client';

// lib/useRegistos.js — que registos extra (remates, recuperações, …) estão
// ligados para o escalão de um jogo.
//
// Lê da cópia local, por isso funciona sem rede. Um aparelho que nunca
// sincronizou não tem config e não mostra botões extra — é o mesmo que um
// escalão sem nada ligado, e é aceitável.
//
// Volta a ler quando a sincronização traz dados novos: ligar um registo no
// painel chega a um jogo já aberto sem ser preciso sair dele.

import { useEffect, useState } from 'react';
import { statConfig } from './data/repository.js';
import { DATA_UPDATED_EVENT } from './data/sync.js';
import { opcoesDosRegistos, registosLigados } from '../domain/registos.js';

const NENHUM = new Set();

/**
 * @returns {Set<string>} os ids dos registos ligados (vazio se nenhum). Traz
 * também `opcoes`: as opções de cada registo neste escalão, já com as
 * omissões (`ligados.opcoes.remate.zona`, …).
 */
export default function useRegistos(teamId) {
  const [ligados, setLigados] = useState(() => comOpcoes(NENHUM, null));

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      const config = teamId ? await statConfig.get(teamId).catch(() => null) : null;
      if (!vivo) return;
      const novos = comOpcoes(registosLigados(config?.registos), config?.opcoes);
      // Mantém a mesma referência quando nada mudou: quem depende dela não
      // volta a desenhar por causa de uma sincronização que não trouxe nada.
      setLigados((atuais) =>
        atuais.size === novos.size &&
        [...novos].every((id) => atuais.has(id)) &&
        JSON.stringify(atuais.opcoes) === JSON.stringify(novos.opcoes)
          ? atuais
          : novos
      );
    }
    carregar();
    window.addEventListener(DATA_UPDATED_EVENT, carregar);
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, carregar);
    };
  }, [teamId]);

  return ligados;
}

function comOpcoes(lista, opcoes) {
  const s = new Set(lista);
  s.opcoes = opcoesDosRegistos(opcoes);
  return s;
}
