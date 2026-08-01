'use client';

// lib/useNow.js — o relógio da interface.
//
// O tempo de jogo nunca é guardado a andar: guarda-se o acumulado e o instante
// em que o cronómetro arrancou, e o ecrã calcula o resto. Este hook é só o
// batimento que obriga a recalcular — quatro vezes por segundo chega para os
// centésimos não saltarem e não custa bateria.

import { useEffect, useState } from 'react';

export default function useNow(intervalMs = 250, ativo = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, ativo]);

  return now;
}
