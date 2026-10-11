'use client';

// components/treino/Calendario.jsx — o mês, com os treinos marcados.
//
// Uma grelha de segunda a domingo. Cada dia com treino leva um ponto com a cor
// do estado: agendado, realizado (já tem presenças), por marcar (passou e
// ninguém marcou presenças) ou cancelado. Tocar num dia escolhe-o; a lista
// por baixo da grelha é de quem chama.

import { useMemo } from 'react';
import { grelhaDoMes, deIsoDia, maiuscula } from '@/domain/treino.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function Calendario({ ano, mes, hoje, selecionado, estadosPorDia, onDia, onMes }) {
  const t = useT();
  const locale = useLocale();
  const semanas = useMemo(() => grelhaDoMes(ano, mes), [ano, mes]);

  const titulo = maiuscula(new Date(ano, mes, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }));
  // Os nomes curtos dos dias, a começar à segunda (5 de janeiro de 2026 é segunda).
  const diasSemana = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 5 + i).toLocaleDateString(locale, { weekday: 'narrow' })
  );

  function mudar(delta) {
    const d = new Date(ano, mes + delta, 1);
    onMes(d.getFullYear(), d.getMonth());
  }

  return (
    <div className="tcal">
      <div className="tcal__head">
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => mudar(-1)} aria-label={t('treino.mesAnterior')}>
          ‹
        </button>
        <strong className="tcal__titulo">{titulo}</strong>
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => mudar(1)} aria-label={t('treino.mesSeguinte')}>
          ›
        </button>
      </div>
      <div className="tcal__grelha" role="grid">
        {diasSemana.map((d, i) => (
          <span key={`h${i}`} className="tcal__semana">
            {d}
          </span>
        ))}
        {semanas.flat().map((dia) => {
          const foraDoMes = deIsoDia(dia).getMonth() !== mes;
          const estados = estadosPorDia.get(dia) || [];
          const classe = [
            'tcal__dia',
            foraDoMes ? 'is-fora' : '',
            dia === hoje ? 'is-hoje' : '',
            dia === selecionado ? 'is-sel' : '',
            estados.length ? 'tem-treino' : '',
          ].join(' ');
          return (
            <button key={dia} type="button" className={classe} onClick={() => onDia(dia)}>
              <span className="tcal__num">{deIsoDia(dia).getDate()}</span>
              <span className="tcal__pontos">
                {estados.slice(0, 3).map((e, i) => (
                  <i key={i} className={`tcal__ponto tcal__ponto--${e}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="tcal__legenda">
        {['agendado', 'realizado', 'porMarcar', 'cancelado'].map((e) => (
          <span key={e}>
            <i className={`tcal__ponto tcal__ponto--${e}`} /> {t(`treino.estado.${e}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
