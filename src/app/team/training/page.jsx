'use client';

// Treino → Calendário.
//
// Em cima, o mês com os treinos; por baixo da grelha, os treinos do dia
// escolhido; e no fundo, as presenças do escalão (época, 30 dias, 7 dias).
//
// Os treinos nascem da rotina semanal (ver /team/training/routine) e cada um
// pode ser mudado sozinho. Ao abrir, a rotina volta a ser aplicada até ao fim
// da época — é o que faz uma época nova aparecer sem ninguém mexer em nada.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { rotas } from '@/lib/routes.js';
import { Badge, Empty } from '@/components/bits.jsx';
import Calendario from '@/components/treino/Calendario.jsx';
import EstatisticasPresencas from '@/components/treino/EstatisticasPresencas.jsx';
import FormTreino from '@/components/treino/FormTreino.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import useDadosTreino from '@/lib/useDadosTreino.js';
import { treinos as repoTreinos } from '@/lib/data/treino.js';
import { PRESENCA, deIsoDia, estadoNoCalendario, isoDia, maiuscula } from '@/domain/treino.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function TrainingPage() {
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
      {(dados) => <Calendarios clubId={clubId} teamId={teamId} roster={dados.roster} />}
    </TeamShell>
  );
}

function Calendarios({ clubId, teamId, roster }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosTreino(teamId, { acertar: !soLeitura });

  const hoje = isoDia(new Date());
  const [selecionado, setSelecionado] = useState(hoje);
  const [vista, setVista] = useState(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });

  const presencasPorTreino = useMemo(() => {
    const m = new Map();
    for (const p of dados?.presencas || []) {
      if (!m.has(p.sessionId)) m.set(p.sessionId, []);
      m.get(p.sessionId).push(p);
    }
    return m;
  }, [dados]);

  const estadosPorDia = useMemo(() => {
    const m = new Map();
    for (const tr of dados?.treinos || []) {
      const e = estadoNoCalendario(tr, presencasPorTreino.has(tr.id), hoje);
      if (!m.has(tr.date)) m.set(tr.date, []);
      m.get(tr.date).push(e);
    }
    return m;
  }, [dados, presencasPorTreino, hoje]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;

  const doDia = dados.treinos.filter((tr) => tr.date === selecionado);
  const proximo = dados.treinos.find((tr) => tr.date > selecionado && tr.status !== 'CANCELADO');
  const ativos = roster.filter((j) => j.isActive !== false);

  async function novoTreino() {
    const dadosNovos = await ui.open((close) => (
      <Dialog title={t('treino.novoTreino')} onClose={() => close(null)}>
        <FormTreino
          inicial={{ date: selecionado, startTime: dados.rotinas[0]?.startTime || '19:00', durationMin: dados.rotinas[0]?.durationMin || 90, location: dados.rotinas[0]?.location || '' }}
          onCancelar={() => close(null)}
          onGuardar={close}
        />
      </Dialog>
    ));
    if (!dadosNovos) return;
    const criado = await repoTreinos.criar(teamId, dadosNovos);
    ui.toast(t('treino.criado'), 'ok');
    router.push(rotas.treino(clubId, teamId, criado.id));
  }

  const rotuloDia = maiuscula(deIsoDia(selecionado).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }));

  return (
    <>
      {soLeitura ? null : (
        <div className="area-actions area-actions--compact">
          <button className="btn btn--ghost btn--tiny" onClick={() => router.push(rotas.rotinaTreino(clubId, teamId))}>
            {t('treino.rotina')}
          </button>
          <span className="toolbar__spacer" />
          <button className="btn btn--primary btn--tiny" onClick={novoTreino}>
            {t('treino.novoTreino')}
          </button>
        </div>
      )}

      {!dados.rotinas.length && !dados.treinos.length ? (
        <Empty
          action={
            soLeitura ? null : (
              <button className="btn btn--primary" onClick={() => router.push(rotas.rotinaTreino(clubId, teamId))}>
                {t('treino.definirRotina')}
              </button>
            )
          }
        >
          {t('treino.semRotina')}
        </Empty>
      ) : null}

      <div className="card tcal__card">
        <Calendario
          ano={vista.ano}
          mes={vista.mes}
          hoje={hoje}
          selecionado={selecionado}
          estadosPorDia={estadosPorDia}
          onDia={setSelecionado}
          onMes={(ano, mes) => setVista({ ano, mes })}
        />

        <div className="tdia">
          <h3 className="tdia__titulo">{rotuloDia}</h3>
          {doDia.length ? (
            doDia.map((tr) => (
              <LinhaTreino
                key={tr.id}
                treino={tr}
                presencas={presencasPorTreino.get(tr.id) || []}
                plantel={ativos.length}
                hoje={hoje}
                onAbrir={() => router.push(rotas.treino(clubId, teamId, tr.id))}
              />
            ))
          ) : (
            <p className="muted">{t('treino.semTreinoNoDia')}</p>
          )}
          {!doDia.length && proximo ? (
            <button
              type="button"
              className="btn btn--ghost btn--tiny tdia__proximo"
              onClick={() => {
                setSelecionado(proximo.date);
                const d = deIsoDia(proximo.date);
                setVista({ ano: d.getFullYear(), mes: d.getMonth() });
              }}
            >
              {t('treino.proximoTreino', {
                dia: deIsoDia(proximo.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
                hora: proximo.startTime,
              })}
            </button>
          ) : null}
        </div>
      </div>

      <EstatisticasPresencas treinos={dados.treinos} presencas={dados.presencas} jogadores={roster} hoje={hoje} />
    </>
  );
}

function LinhaTreino({ treino, presencas, plantel, hoje, onAbrir }) {
  const t = useT();
  const estado = estadoNoCalendario(treino, presencas.length > 0, hoje);
  const presentes = presencas.filter((p) => p.status === PRESENCA.PRESENTE).length;
  const kind = { agendado: 'info', realizado: 'ok', porMarcar: 'warn', cancelado: 'muted' }[estado];
  return (
    <button type="button" className={`tlinha tlinha--${estado}`} onClick={onAbrir}>
      <span className="tlinha__hora">{treino.startTime}</span>
      <span className="tlinha__info">
        <strong>{t('treino.duracaoMin', { n: treino.durationMin })}</strong>
        {treino.location ? <span className="muted"> · {treino.location}</span> : null}
        {presencas.length ? (
          <span className="muted"> · {t('treino.presentesDe', { n: presentes, total: plantel })}</span>
        ) : null}
      </span>
      <Badge kind={kind}>{t(`treino.estado.${estado}`)}</Badge>
      <span className="tlinha__seta" aria-hidden="true">›</span>
    </button>
  );
}
