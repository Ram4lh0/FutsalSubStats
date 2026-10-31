'use client';

// Um treino, em duas abas: a unidade de treino (UT — o que se vai fazer,
// objetivos e notas) e as presenças.
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
import UnidadeTreino from '@/components/treino/UnidadeTreino.jsx';
import { useUnidadeTreino, utVazia } from '@/lib/data/unidadeTreino.js';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { treinos as repoTreinos, presencas as repoPresencas, jogadas as repoJogadas } from '@/lib/data/treino.js';
import { normalizar } from '@/domain/jogada.js';
import { useAuth } from '@/lib/auth.jsx';
import { saveNow } from '@/lib/data/sync.js';
import { entregarFicheiro, nomeLimpo } from '@/lib/ficheiros.js';
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
      {(dados) => <Treino clubId={clubId} teamId={teamId} trainingId={trainingId} roster={dados.roster} club={dados.club} team={dados.team} />}
    </TeamShell>
  );
}

function Treino({ clubId, teamId, trainingId, roster, club, team }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosTreino(teamId);
  const [notas, setNotas] = useState(null);
  const [aba, setAba] = useState('ut');
  const [ut, guardarUT] = useUnidadeTreino(trainingId);
  const [jogadas, setJogadas] = useState([]);
  const [aExportar, setAExportar] = useState(false);
  const { userId, user } = useAuth();

  useEffect(() => {
    repoJogadas.listByTeam(teamId).then((rows) => setJogadas(rows.map((j) => ({ ...j, data: normalizar(j.data) }))));
  }, [teamId, dados]);

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

  // A UT grava a cada mudança; as notas gravam ao sair do campo. Este botão
  // garante as notas ainda por gravar e volta ao calendário.
  async function guardarEVoltar() {
    if ((notas || '') !== (treino.notes || '')) await repoTreinos.notas(treino.id, notas);
    ui.toast(t('treino.guardado'), 'ok');
    router.push(voltar);
  }

  // O PDF da UT. As jogadas ligadas levam um botão para a animação, que é o
  // link público de 30 dias: as que ainda não o têm, cria-se aqui (com OK).
  async function exportarPdf() {
    if (aExportar) return;
    setAExportar(true);
    try {
      const ligadas = new Set((ut?.exercicios || []).flatMap((e) => e.jogadas || []));
      let lista = jogadas;
      const semLink = jogadas.filter((j) => ligadas.has(j.id) && !(j.shareToken && j.shareExpiresAt > Date.now()));
      if (semLink.length) {
        const ok = await ui.confirmar(t('ut.criarLinks', { n: semLink.length }), { okLabel: t('ut.criarLinksOk') });
        if (ok) {
          const novos = new Map();
          for (const j of semLink) novos.set(j.id, await repoJogadas.novoLink(j.id));
          lista = jogadas.map((j) => (novos.has(j.id) ? { ...j, ...novos.get(j.id), data: j.data } : j));
          await saveNow(userId, user?.email);
        }
      }
      const { gerarPdfUT } = await import('@/lib/pdf/relatorioUT.js');
      const blob = await gerarPdfUT({ treino, ut: ut || utVazia(), club, team, jogadas: new Map(lista.map((j) => [j.id, j])) });
      const nome = `${nomeLimpo(`ut-${team?.name || ''}-${treino.date}`)}.pdf`;
      await entregarFicheiro(blob, nome, 'application/pdf', { titulo: t('ut.aba') });
    } catch (err) {
      ui.toast(t('ut.pdfFalhou', { erro: err?.message || err }), 'error');
    } finally {
      setAExportar(false);
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

      <nav className="tabs ttabs" role="tablist">
        <button type="button" role="tab" className={`tab ${aba === 'ut' ? 'is-active' : ''}`} aria-selected={aba === 'ut'} onClick={() => setAba('ut')}>
          {t('ut.aba')}
        </button>
        <button type="button" role="tab" className={`tab ${aba === 'presencas' ? 'is-active' : ''}`} aria-selected={aba === 'presencas'} onClick={() => setAba('presencas')}>
          {t('treino.presencas')}
          {!cancelado && jogadores.length ? (
            <span className="ttabs__conta">{marcadas.size}/{jogadores.length}</span>
          ) : null}
        </button>
      </nav>

      {aba === 'ut' ? (
        <>
          <div className="ut__barra">
            <span className="muted">{t('ut.gravaSozinha')}</span>
            <span className="toolbar__spacer" />
            <button type="button" className="btn btn--ghost btn--tiny" onClick={exportarPdf} disabled={aExportar}>
              {aExportar ? t('presencasExport.aGerar') : t('ut.exportarPdf')}
            </button>
          </div>
          <UnidadeTreino
            ut={ut}
            onMudar={guardarUT}
            duracaoTreino={Number(treino.durationMin) || 90}
            soLeitura={soLeitura}
            jogadas={jogadas}
            clubId={clubId}
            teamId={teamId}
          />
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
        </>
      ) : cancelado ? (
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

      {soLeitura ? null : (
        <div className="form__actions">
          <button className="btn btn--danger btn--ghost" type="button" onClick={apagar}>
            {t('treino.apagar')}
          </button>
          <button className="btn btn--primary" type="button" onClick={guardarEVoltar}>
            {t('treino.guardarTreino')}
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
