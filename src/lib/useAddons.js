'use client';

// lib/useAddons.js — que add-ons estão activos num escalão.
//
// É a pergunta que cada feature nova faz antes de aparecer:
//
//   const addons = useAddons(match?.teamId);
//   if (addons.has('mapa-baliza')) …
//
// Inclui os registos extra ligados (remates, …), os add-ons ligados com as
// dependências satisfeitas e os que são para todos (domain/addons.js).
//
// Lê da cópia local, por isso funciona sem rede, e volta a ler quando a
// sincronização traz dados novos: ligar um add-on no painel chega a um ecrã
// já aberto sem ser preciso sair dele.

import { useEffect, useState } from 'react';
import { statConfig } from './data/repository.js';
import { DATA_UPDATED_EVENT } from './data/sync.js';
import { addonsAtivos } from '../domain/addons.js';

const NENHUM = new Set();

/** @returns {Set<string>} os ids dos add-ons activos (vazio se nenhum). */
export default function useAddons(teamId) {
  const [ativos, setAtivos] = useState(NENHUM);

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      const config = teamId ? await statConfig.get(teamId).catch(() => null) : null;
      if (!vivo) return;
      const novos = addonsAtivos(config);
      // Mantém a mesma referência quando nada mudou: quem depende dela não
      // volta a desenhar por causa de uma sincronização que não trouxe nada.
      setAtivos((atuais) =>
        atuais.size === novos.size && [...novos].every((id) => atuais.has(id))
          ? atuais
          : novos.size
            ? novos
            : NENHUM
      );
    }
    carregar();
    window.addEventListener(DATA_UPDATED_EVENT, carregar);
    return () => {
      vivo = false;
      window.removeEventListener(DATA_UPDATED_EVENT, carregar);
    };
  }, [teamId]);

  return ativos;
}
