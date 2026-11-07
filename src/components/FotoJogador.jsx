'use client';

// components/FotoJogador.jsx — a foto de um atleta (ou o número, sem foto).
//
// As fotos vivem numa store à parte (`player_photos`), e não na linha do
// jogador. `useFotosDoEscalao` lê-as todas de uma vez para as listas, e volta a
// ler quando a app avisa que os dados mudaram (uma foto que chegou de outro
// aparelho, ou uma que se acabou de trocar).
//
// Só se mostra a foto se o jogador tiver a marca `photoUrl`: quando a foto é
// removida noutro aparelho, é a marca que desce primeiro, e a cópia local que
// ficou para trás deixa de aparecer logo.

import { useEffect, useState } from 'react';
import { fotosJogadores } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';

function useAoMudarDados(fn) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(DATA_UPDATED_EVENT, fn);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, fn);
  }, [fn]);
}

/** As fotos de um escalão: Map id do jogador → data URL. */
export function useFotosDoEscalao(teamId) {
  const [fotos, setFotos] = useState(() => new Map());
  const [versao, setVersao] = useState(0);
  const [ler] = useState(() => () => setVersao((v) => v + 1));
  useAoMudarDados(ler);
  useEffect(() => {
    let vivo = true;
    if (teamId) fotosJogadores.doEscalao(teamId).then((m) => vivo && setFotos(m));
    return () => {
      vivo = false;
    };
  }, [teamId, versao]);
  return fotos;
}

/** A foto de um só jogador (ficha). */
export function useFotoDoJogador(playerId) {
  const [foto, setFoto] = useState(null);
  const [versao, setVersao] = useState(0);
  const [ler] = useState(() => () => setVersao((v) => v + 1));
  useAoMudarDados(ler);
  useEffect(() => {
    let vivo = true;
    if (playerId) fotosJogadores.get(playerId).then((f) => vivo && setFoto(f));
    return () => {
      vivo = false;
    };
  }, [playerId, versao]);
  return foto;
}

/**
 * O quadrado do jogador: a foto, com o número num canto; sem foto, o número.
 * `foto` vem de `useFotosDoEscalao` / `useFotoDoJogador`. Com `tamanho={null}`
 * o tamanho fica todo a cargo do CSS (os cartões do plantel mudam no telemóvel).
 */
export default function FotoJogador({ jogador, foto, tamanho = 42, className = '' }) {
  const comFoto = Boolean(foto && jogador?.photoUrl);
  return (
    <span
      className={`fotojog ${comFoto ? 'fotojog--foto' : ''} ${className}`.trim()}
      style={tamanho ? { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.42) } : undefined}
    >
      {comFoto ? (
        <>
          <img src={foto} alt={jogador?.name || ''} />
          <span className="fotojog__num mono">{jogador?.shirtNumber}</span>
        </>
      ) : (
        <span className="mono">{jogador?.shirtNumber}</span>
      )}
    </span>
  );
}
