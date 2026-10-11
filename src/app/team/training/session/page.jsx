'use client';

// Um treino: as presenças e as notas.
//
// Cada jogador tem quatro botões — Presente, Falta injustificada, Falta
// justificada, Lesão. "Todos presentes" marca de uma vez quem ainda não está
// marcado, que é o caso normal; depois só se tocam as exceções.
//
// Mudar a hora ou o dia daqui muda só este treino: a rotina deixa-o em paz a
// partir desse momento.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useDadosTreino from '@/lib/useDadosTreino.js';
import { rotas } from '@/lib/routes.js';
import { Badge, Empty } from '@/components/bits.jsx';
import FormTreino from '@/components/treino/FormTreino.jsx';
import LegendaPresencas from '@/components/treino/LegendaPresencas.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { treinos as repoTreinos, presencas as repoPresencas } from '@/lib/data/treino.js';
import { ESTADOS_PRESENCA, PRESENCA, ESTADO_TREINO, deIsoDia, estadoNoCalendario, isoDia, maiuscula } from '@/domain/treino.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function TrainingSessionPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, trainingId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => <Treino clubId={clubId} teamId={teamId} trainingId={trainingId} roster={dados.roster} />}
    </TeamShell>
  );
}

function Treino({ clubId, teamId, trainingId, roster }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosTreino(teamId);
  const [notas, setNotas] = useState(null);

  const treino = dados?.treinos.find((x) => x.id === trainingId) || null;
  const marcadas = useMemo(() => {
    const m = new Map();
    for (const p of dados?.presencas || []) if (p.sessionId === trainingId) m.set(p.playerId, p);
    return m;
  }, [dados, trainingId]);

  useEffect(() => {
    if (treino && notas === null) setNotas(treino.notes || '');
  }, [treino, notas]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  const voltar = rotas.treinos(clubId, teamId);
  if (!treino) {
    return (
      <>
        <PageHead title={t('treino.titulo')} backTo={voltar} />
        <Empty>{t('treino.naoEncontrado')}</Empty>
      </>
    );
  }

  const hoje = isoDia(new Date());
  const cancelado = treino.status === ESTADO_TREINO.CANCELADO;
  const estado = estadoNoCalendario(treino, marcadas.size > 0, hoje);
  // Quem está no plantel, mais quem já foi marcado e entretanto saiu — um
  // registo antigo não desaparece por o jogador ter sido desativado.
  const jogadores = roster
    .filter((j) => j.isActive !== false || marcadas.has(j.id))
    .sort((a, b) => (Number(a.shirtNumber) || 999) - (Number(b.shirtNumber) || 999));
  const porMarcar = jogadores.filter((j) => !marcadas.has(j.id));
  const contagem = Object.fromEntries(ESTADOS_PRESENCA.map((e) => [e, 0]));
  for (const p of marcadas.values()) contagem[p.status] = (contagem[p.status] || 0) + 1;

  const titulo = maiuscula(deIsoDia(treino.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));

  async function editar() {
    const novo = await ui.open((close) => (
      <Dialog title={t('treino.editarEste')} onClose={() => close(null)}>
        <p className="modal__hint">{t('treino.editarEsteHint')}</p>
        <FormTreino inicial={treino} onCancelar={() => close(null)} onGuardar={close} />
      </Dialog>
    ));
    if (!novo) return;
    await repoTreinos.editar(treino.id, {
      date: novo.date,
      startTime: novo.startTime,
      durationMin: novo.durationMin,
      location: (novo.location || '').trim() || null,
    });
    ui.toast(t('treino.guardado'), 'ok');
  }

  async function alternarCancelado() {
    if (!cancelado) {
      const ok = await ui.confirmar(t('treino.cancelarPergunta'), { okLabel: t('treino.cancelarTreino') });
      if (!ok) return;
      await repoTreinos.cancelar(treino.id);
    } else {
      await repoTreinos.repor(treino.id);
    }
  }

  async function apagar() {
    const ok = await ui.confirmar(t('treino.apagarPergunta'), { okLabel: t('treino.apagar') });
    if (!ok) return;
    await repoTreinos.apagar(treino.id);
    router.push(voltar);
  }

  async function nota(jogador) {
    const atual = marcadas.get(jogador.id);
    const texto = await ui.open((close) => (
      <NotaJogador jogador={jogador} inicial={atual?.note || ''} onFechar={close} />
    ));
    if (texto === null || texto === undefined) return;
    await repoPresencas.marcar(treino.id, jogador.id, atual?.status || PRESENCA.PRESENTE, texto);
  }

  return (
    <>
      <PageHead
        title={titulo}
        subtitle={`${treino.startTime} · ${t('treino.duracaoMin', { n: treino.durationMin })}${treino.location ? ` · ${treino.location}` : ''}`}
        backTo={voltar}
      />

      <div className="tinfo">
        <Badge kind={{ agendado: 'info', realizado: 'ok', porMarcar: 'warn', cancelado: 'muted' }[estado]}>
          {t(`treino.estado.${estado}`)}
        </Badge>
        {treino.routineId && !treino.edited ? (
          <span className="muted">{t('treino.daRotina')}</span>
        ) : (
          <span className="muted">{t('treino.foraDaRotina')}</span>
        )}
        <span className="toolbar__spacer" />
        {soLeitura ? null : (
          <>
            <button className="btn btn--ghost btn--tiny" onClick={editar}>
              {t('comum.editar')}
            </button>
            <button className="btn btn--ghost btn--tiny" onClick={alternarCancelado}>
              {cancelado ? t('treino.reporTreino') : t('treino.cancelarTreino')}
            </button>
          </>
        )}
      </div>

      {cancelado ? (
        <Empty>{t('treino.estaCancelado')}</Empty>
      ) : (
        <section className="card">
          <div className="tpresh">
            <h2 className="section section--tight">{t('treino.presencas')}</h2>
            <span className="toolbar__spacer" />
            {!soLeitura && porMarcar.length ? (
              <button
                className="btn btn--soft btn--tiny"
                onClick={() => repoPresencas.marcarVarios(treino.id, porMarcar.map((j) => j.id), PRESENCA.PRESENTE)}
              >
                {t('treino.todosPresentes', { n: porMarcar.length })}
              </button>
            ) : null}
          </div>
          <p className="muted tpresh__resumo">
            {ESTADOS_PRESENCA.map((e) => `${t(`treino.curto.${e}`)} ${contagem[e]}`).join(' · ')}
            {porMarcar.length ? ` · ${t('treino.porMarcarN', { n: porMarcar.length })}` : ''}
          </p>
          <LegendaPresencas />

          {jogadores.length === 0 ? (
            <Empty>{t('treino.semPlantel')}</Empty>
          ) : (
            <ul className="tlista">
              {jogadores.map((j) => {
                const p = marcadas.get(j.id);
                return (
                  <li key={j.id} className={`tjog ${p ? `tjog--${p.status}` : ''}`}>
                    <span className="tjog__num">{j.shirtNumber ?? ''}</span>
                    <span className="tjog__nome">
                      {j.name}
                      {p?.note ? <small className="tjog__nota">{p.note}</small> : null}
                    </span>
                    <span className="tjog__estados" role="group" aria-label={j.name}>
                      {ESTADOS_PRESENCA.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={`tpbtn tpbtn--${e} ${p?.status === e ? 'is-on' : ''}`}
                          title={t(`treino.presenca.${e}`)}
                          aria-pressed={p?.status === e}
                          disabled={soLeitura}
                          onClick={() => repoPresencas.marcar(treino.id, j.id, e)}
                        >
                          {t(`treino.curto.${e}`)}
                        </button>
                      ))}
                      {soLeitura ? null : (
                        <button
                          type="button"
                          className={`tpbtn tpbtn--nota ${p?.note ? 'is-on' : ''}`}
                          title={t('treino.notaJogador')}
                          aria-label={t('treino.notaJogador')}
                          onClick={() => nota(j)}
                        >
                          ✎
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="section section--tight">{t('treino.notas')}</h2>
        <textarea
          className="input tnotas"
          rows={4}
          maxLength={4000}
          placeholder={t('treino.notasExemplo')}
          value={notas ?? ''}
          disabled={soLeitura}
          onChange={(e) => setNotas(e.target.value)}
          onBlur={() => {
            if ((notas || '') !== (treino.notes || '')) repoTreinos.notas(treino.id, notas);
          }}
        />
      </section>

      {soLeitura ? null : (
        <div className="form__actions">
          <button className="btn btn--danger btn--ghost" type="button" onClick={apagar}>
            {t('treino.apagar')}
          </button>
        </div>
      )}
    </>
  );
}

function NotaJogador({ jogador, inicial, onFechar }) {
  const t = useT();
  const [texto, setTexto] = useState(inicial);
  return (
    <Dialog title={t('treino.notaDe', { nome: jogador.name })} onClose={() => onFechar(null)}>
      <textarea
        className="input tnotas"
        rows={3}
        maxLength={500}
        autoFocus
        placeholder={t('treino.notaJogadorExemplo')}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={() => onFechar(null)}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" onClick={() => onFechar(texto.trim())}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}
