'use client';

// lib/useEnviarAoVivo.js — quem regista um jogo "ao vivo" envia-o durante o
// jogo, e não só no apito final.
//
// O jogo normal fica todo no aparelho até "Terminar jogo" (`sync: 'defer'`),
// e assim continua sem o interruptor. Com ele ligado (e o add-on no escalão),
// cada vez que o ecrã do jogo volta a ler o estado — depois de um golo, de uma
// substituição, de um desfazer, do intervalo — este hook:
//
//   1. grava na linha do jogo a fotografia do estado (status, resultado,
//      parte), só se mudou: é o que diz ao servidor que o jogo está ao vivo;
//   2. pede um envio à fila, **sem esperar por ele**. O `saveNow` nunca lança
//      e a fila junta pedidos seguidos num envio só; sem rede fica para depois
//      e o jogo não dá por nada. Quando a rede volta, envia-se logo.
//
// Nada disto está no caminho do registo: o evento já está gravado no aparelho
// quando isto corre.

import { useEffect } from 'react';
import { matches } from './data/repository.js';
import * as sync from './data/sync.js';
import { fotografiaAoVivo, fotografiaMudou, registadoPorOutro } from '../domain/aoVivo.js';

/**
 * @param {object} p
 * @param {boolean} p.ativo interruptor ligado no jogo e add-on no escalão
 * @param {{match: object, state: object}|null} p.carregado o que `loadMatch` devolveu
 */
export default function useEnviarAoVivo({ ativo, carregado, userId, email }) {
  useEffect(() => {
    if (!ativo || !userId || !carregado?.match || !carregado.state) return;
    // Só quem regista. Um aparelho que acompanha e passe por aqui (o ecrã do
    // jogo, antes de o mandar para o de acompanhar) não reescreve a linha do
    // jogo com o que tem.
    if (registadoPorOutro(carregado.events, userId)) return;
    const { match, state } = carregado;
    (async () => {
      try {
        const foto = fotografiaAoVivo(state);
        if (fotografiaMudou(match, foto)) {
          await matches.gravarCampos(match.id, foto, { sync: 'defer' });
        }
      } catch (err) {
        console.warn('ao vivo: a fotografia do jogo ficou para depois:', err?.message || err);
      }
      sync.saveNow(userId, email);
    })();
  }, [ativo, carregado, userId, email]);

  useEffect(() => {
    if (!ativo || !userId) return;
    const enviar = () => sync.saveNow(userId, email);
    window.addEventListener('online', enviar);
    return () => window.removeEventListener('online', enviar);
  }, [ativo, userId, email]);
}
