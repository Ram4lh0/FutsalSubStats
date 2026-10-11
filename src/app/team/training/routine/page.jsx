'use client';

// A rotina semanal de treinos: "N treinos por semana, nestes dias, a estas
// horas". Gravar gera os treinos daqui até ao fim da época (30 de junho).
//
// Mudar a rotina só mexe nos treinos futuros que não foram editados à mão e
// que ainda não têm presenças. O passado fica como está.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { rotas } from '@/lib/routes.js';
import { Empty } from '@/components/bits.jsx';
import { DURACOES_TREINO } from '@/components/treino/FormTreino.jsx';
import { useUI } from '@/lib/ui.jsx';
import { rotinas } from '@/lib/data/treino.js';
import { fimDaEpoca, isoDia, deIsoDia, maiuscula } from '@/domain/treino.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function TrainingRoutinePage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {() => <Rotina clubId={clubId} teamId={teamId} />}
    </TeamShell>
  );
}

// Segunda a domingo; o valor é o do `getDay()` (0 = domingo).
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

function Rotina({ clubId, teamId }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const [linhas, setLinhas] = useState(null);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    rotinas.listByTeam(teamId).then((r) =>
      setLinhas(
        r.map((x) => ({
          id: x.id,
          weekday: x.weekday,
          startTime: x.startTime,
          durationMin: x.durationMin,
          location: x.location || '',
        }))
      )
    );
  }, [teamId]);

  const voltar = rotas.treinos(clubId, teamId);
  if (soLeitura) {
    return (
      <>
        <PageHead title={t('treino.rotina')} backTo={voltar} />
        <Empty>{t('treino.soLeitura')}</Empty>
      </>
    );
  }
  if (!linhas) return <p className="muted">{t('comum.aCarregar')}</p>;

  // 5 de janeiro de 2026 é segunda; daí tiram-se os nomes dos dias no idioma certo.
  const nomeDia = (wd) =>
    maiuscula(new Date(2026, 0, 4 + (wd === 0 ? 7 : wd)).toLocaleDateString(locale, { weekday: 'long' }));

  const mudar = (i, k, v) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  function acrescentar() {
    const ultima = linhas[linhas.length - 1];
    const usados = new Set(linhas.map((l) => Number(l.weekday)));
    const livre = ORDEM_DIAS.find((d) => !usados.has(d)) ?? 1;
    setLinhas((ls) => [
      ...ls,
      {
        weekday: livre,
        startTime: ultima?.startTime || '19:00',
        durationMin: ultima?.durationMin || 90,
        location: ultima?.location || '',
      },
    ]);
  }

  async function gravar() {
    if (linhas.some((l) => !/^\d{2}:\d{2}$/.test(l.startTime))) {
      ui.toast(t('treino.horaInvalida'), 'error');
      return;
    }
    setAGravar(true);
    try {
      await rotinas.guardar(teamId, linhas);
      ui.toast(t('treino.rotinaGuardada'), 'ok');
      router.push(voltar);
    } finally {
      setAGravar(false);
    }
  }

  const fim = deIsoDia(fimDaEpoca(isoDia(new Date()))).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <PageHead title={t('treino.rotina')} subtitle={t(linhas.length === 1 ? 'treino.rotinaSubUm' : 'treino.rotinaSub', { n: linhas.length })} backTo={voltar} />

      <div className="card">
        {linhas.length === 0 ? <p className="muted">{t('treino.rotinaVazia')}</p> : null}
        <ul className="trotina">
          {linhas.map((l, i) => (
            <li key={l.id || `n${i}`} className="trotina__linha">
              <select
                className="input"
                value={l.weekday}
                onChange={(e) => mudar(i, 'weekday', Number(e.target.value))}
                aria-label={t('treino.diaSemana')}
              >
                {ORDEM_DIAS.map((d) => (
                  <option key={d} value={d}>
                    {nomeDia(d)}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="time"
                value={l.startTime}
                onChange={(e) => mudar(i, 'startTime', e.target.value)}
                aria-label={t('treino.hora')}
              />
              <select
                className="input"
                value={l.durationMin}
                onChange={(e) => mudar(i, 'durationMin', Number(e.target.value))}
                aria-label={t('treino.duracao')}
              >
                {DURACOES_TREINO.map((m) => (
                  <option key={m} value={m}>
                    {t('treino.duracaoMin', { n: m })}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="text"
                maxLength={80}
                value={l.location}
                placeholder={t('treino.local')}
                onChange={(e) => mudar(i, 'location', e.target.value)}
                aria-label={t('treino.local')}
              />
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label={t('treino.tirarDia')}
                onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--soft btn--tiny" onClick={acrescentar}>
          {t('treino.acrescentarDia')}
        </button>
        <p className="muted tpres__nota">{t('treino.rotinaExplica', { fim })}</p>
      </div>

      <div className="form__actions">
        <span className="toolbar__spacer" />
        <button className="btn btn--ghost" type="button" onClick={() => router.push(voltar)}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" type="button" disabled={aGravar} onClick={gravar}>
          {t('comum.guardar')}
        </button>
      </div>
    </>
  );
}
