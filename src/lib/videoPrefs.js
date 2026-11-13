'use client';

// lib/videoPrefs.js — as preferências da Análise de vídeo neste aparelho.
//
// Por agora só as margens do clipe de um toque (quanto corta para trás e para
// a frente). Ficam no aparelho e não na conta: são um hábito de quem marca,
// e no telemóvel pode querer-se outra folga do que no computador.

import { OMISSAO_CLIPE, normalizarMargens } from '../domain/analiseVideo.js';

const CHAVE = 'futsal-video-margens';

export function lerMargens() {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (bruto) return normalizarMargens(JSON.parse(bruto));
  } catch {
    /* sem localStorage, ou lixo: valem as de omissão */
  }
  return { ...OMISSAO_CLIPE };
}

export function guardarMargens(margens) {
  const certas = normalizarMargens(margens);
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(certas));
  } catch {
    /* fica só para esta sessão */
  }
  return certas;
}

/**
 * O título de um vídeo do YouTube, para poupar a escrita ao criar a análise.
 * Pergunta ao oEmbed do YouTube; sem rede, com o vídeo privado ou com o
 * browser a não deixar, devolve null e o treinador escreve o título à mão.
 */
export async function tituloDoYouTube(id) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`
    )}`;
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    return typeof dados?.title === 'string' ? dados.title.slice(0, 200) : null;
  } catch {
    return null;
  }
}
