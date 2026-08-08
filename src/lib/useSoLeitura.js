'use client';

// lib/useSoLeitura.js — durante a experiência, olha-se mas não se mexe.
//
// O jogo de experiência deixa percorrer a app toda: o plantel, os escalões, as
// competições, as estatísticas. O que não deixa é alterar nada da estrutura —
// mudar o nome da equipa, criar um jogador, apagar um escalão. Duas razões:
//
// 1. Não faz sentido. Tudo isto desaparece quando a experiência acabar, e
//    ninguém quer perder cinco minutos a escrever um plantel que se vai perder.
// 2. Deixa claro onde está a fronteira. Quem quiser a sua equipa a sério vê
//    exatamente o que ganha ao criar conta.
//
// A leitura é feita depois de montar, e não durante: no servidor não há
// `sessionStorage`, e o primeiro desenho tem de ser igual dos dois lados para o
// React não se queixar da diferença.

import { useEffect, useState } from 'react';
import { emDemo } from './demo.js';

export default function useSoLeitura() {
  const [soLeitura, setSoLeitura] = useState(false);
  useEffect(() => setSoLeitura(emDemo()), []);
  return soLeitura;
}
