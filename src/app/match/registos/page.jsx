'use client';

// O ecrã do papel "Registos" de um jogo com registo partilhado (add-on
// 'jogo-partilhado', ver domain/partilha.js).
//
// Quem está neste aparelho só regista estatísticas: não há campo, banco,
// substituições nem relógio. Os convocados aparecem todos, em cartões com o
// número, e cada cartão tem os registos de jogador que o escalão tem ligados.
// Os registos de equipa e do adversário ficam na barra de cima, a mesma do jogo
// ao vivo. Golos, cartões e substituições são do papel "Tempos".
//
// Cada registo guarda a hora real em que foi tocado; é por ela que a fusão o
// põe no minuto certo do jogo dos Tempos.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import { Badge, Empty } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import useEcraAceso from '@/lib/ecraAceso.js';
import useRegistos from '@/lib/useRegistos.js';
import useAcoesRegistos from '@/components/registos/useAcoesRegistos.js';
import BarraRegistos from '@/components/registos/BarraRegistos.jsx';
import PainelRegistos from '@/components/registos/PainelRegistos.jsx';
import FaixaPartilhado from '@/components/partilhado/FaixaPartilhado.jsx';
import { clubs, events, loadMatch } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { jogoSincronizado, reabrirRegistos, terminarRegistos } from '@/lib/partilhado.js';
import * as A from '@/domain/actions.js';
import { EVENT, PLAYER_MATCH_STATUS } from '@/domain/constants.js';
import { PAPEL, lerPartilha } from '@/domain/partilha.js';
import { REGISTO, RESULTADO_ACAO, contagemPorJogador, registosDoJogo } from '@/domain/registos.js';
import { clubShort, dateLabel, eventLabel, opponentShort } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function RegistosPage() {
  return (
    <Pagina>
      <Registos />
    </Pagina>
  );
}

/**
 * O estado com todos os convocados "em campo". Neste papel não há campo, mas
 * as perguntas "quem rematou?" e "quem bateu o penálti?" escolhem entre quem
 * está em campo: assim escolhem entre todos.
 */
function comTodosDisponiveis(state) {
  if (!state) return state;
  const players = {};
  for (const [id, p] of Object.entries(state.players || {})) {
    players[id] = { ...p, status: PLAYER_MATCH_STATUS.ON_COURT };
  }
  return { ...state, players };
}

function Registos() {
  const t = useT();
  const { matchId } = useRouteParams();
  const router = useRouter();
  const ui = useUI();
  const { userId, user } = useAuth();

  const [carregado, setCarregado] = useState(null);
  const [club, setClub] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    const novo = await loadMatch(matchId);
    setCarregado(novo || { vazio: true });
    return novo;
  }, [matchId]);

  useEffect(() => {
    (async () => {
      const novo = await recarregar();
      if (novo) setClub(await clubs.get(novo.match.clubId));
    })();
  }, [recarregar]);

  const match = carregado?.match || null;
  const state = useMemo(() => comTodosDisponiveis(carregado?.state || null), [carregado]);
  const partilha = useMemo(() => lerPartilha(carregado?.events), [carregado]);
  const terminado = partilha.terminadoEm != null;

  const ligados = useRegistos(match?.teamId);
  const ourName = clubShort(club);
  const rivalName = match ? opponentShort(match) : '';

  async function commit(ev) {
    await events.append(ev, { sync: 'defer' });
    const novo = await recarregar();
    return comTodosDisponiveis(novo?.state);
  }

  // Um remate (ou penálti) com GOLO: aqui não há golo para gravar — o resultado
  // é do papel Tempos. Fica o registo, sem golo preso; a fusão liga-o ao golo
  // dos Tempos.
  const semGolo = async (opcoes) => {
    if (opcoes?.comRemate) await commit(opcoes.comRemate(opcoes.base || state, null));
  };
  const registos = useAcoesRegistos({
    state,
    ligados,
    commit,
    marcarGolo: (p, opcoes) => semGolo(opcoes),
    marcarGoloAdversario: (opcoes) => semGolo(opcoes),
    nomes: () => ({ nos: ourName, eles: rivalName }),
  });
  const on = registos.on;

  // Enquanto se regista, o ecrã não adormece.
  useEcraAceso(Boolean(state) && partilha.papel === PAPEL.REGISTOS && !terminado);

  // Um jogo que não é deste papel tem os seus ecrãs de sempre.
  useEffect(() => {
    if (!carregado || carregado.vazio) return;
    if (partilha.papel !== PAPEL.REGISTOS) router.replace(rotas.jogoPreparar(matchId));
  }, [carregado, partilha.papel, matchId, router]);

  if (!carregado) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (carregado.vazio) return <Empty>{t('jogo.naoEncontrado')}</Empty>;
  if (partilha.papel !== PAPEL.REGISTOS) return null;

  const jogadores = Object.values(state.players).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const contagem = contagemPorJogador(state);
  const lista = registosDoJogo(state);
  const ultimo = [...(state.events || [])].reverse().find((e) => e.eventType === EVENT.STAT_RECORDED) || null;
  // Os registos do guarda-redes vão para quem é guarda-redes no plantel; se
  // ninguém o for, para todos, para não ficarem sem botão.
  const haGR = jogadores.some((p) => p.preferredPosition === 'GOALKEEPER');
  const eGR = (p) => !haGR || p.preferredPosition === 'GOALKEEPER';

  /** Os botões de um cartão: os registos de jogador que o escalão tem ligados. */
  function botoesDe(p) {
    const c = contagem.get(p.playerId) || {};
    const b = [];
    if (ligados.has(REGISTO.REMATE)) b.push(['remate', t('registos.nome.remate'), c.remate, () => on.registarRemate(p)]);
    if (ligados.has(REGISTO.RECUPERACAO)) {
      b.push(['recup', t('registos.nome.recuperacao'), c.recuperacao, () => on.registarRecuperacao(p)]);
    }
    if (ligados.has(REGISTO.PERDA_BOLA)) {
      b.push(['perda', t('registos.nome.perda_bola'), c.perda_bola, () => on.registarPerda(p)]);
    }
    if (ligados.has(REGISTO.PASSE_FALHADO)) {
      b.push(['passe', t('registos.nome.passe_falhado'), c.passe_falhado, () => on.registarPasse(p)]);
    }
    if (eGR(p) && ligados.has(REGISTO.DEFESA_GR)) {
      b.push(['defesa', t('registos.nome.defesa_gr'), c.defesa_gr, () => on.registarDefesa(p)]);
    }
    if (eGR(p) && ligados.has(REGISTO.LANCAMENTO_GR)) {
      b.push(['lanc', t('registos.nome.lancamento_gr'), c.lancamento_gr, () => on.registarLancamentoGR(p)]);
    }
    if (ligados.has(REGISTO.ACAO)) {
      b.push(['positiva', t('registos.acaoPositiva'), c.positivas, () => on.registarAcao(p, RESULTADO_ACAO.POSITIVA)]);
      b.push(['negativa', t('registos.acaoNegativa'), c.negativas, () => on.registarAcao(p, RESULTADO_ACAO.NEGATIVA)]);
    }
    return b;
  }

  async function desfazerUltimo() {
    if (!ultimo || ocupado) return;
    setOcupado(true);
    try {
      await events.markUndone(ultimo.id, null, { sync: 'defer' });
      await commit(A.undoEvent(state, ultimo));
      ui.toast(t('partilhado.registos.desfeito', { registo: eventLabel(ultimo.eventType, ultimo, state.players) }), 'ok');
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Terminar: marca o jogo como terminado e manda-o já para o servidor. Sem
   * rede fica guardado aqui e avisa-se: só se pode juntar depois de subir.
   */
  async function terminar() {
    if (ocupado) return;
    const ok = await ui.confirmar(t('partilhado.registos.terminarPergunta', { n: lista.length }), {
      okLabel: t('partilhado.registos.terminar'),
      danger: false,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await terminarRegistos(matchId);
      await recarregar();
      await sync.saveNow(userId, user?.email);
      if (!(await jogoSincronizado(matchId))) ui.toast(t('partilhado.faixa.porSincronizar'), 'error', 6000);
      else ui.toast(t('partilhado.sincronizou'), 'ok');
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  async function reabrir() {
    if (ocupado) return;
    setOcupado(true);
    try {
      await reabrirRegistos(matchId);
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  /** Depois de juntar, o jogo que fica é o dos Tempos: abre-se o resumo dele. */
  function depoisDeJuntar({ baseId, juntou }) {
    if (juntou && baseId && baseId !== matchId) {
      router.push(comOrigem(rotas.jogoResumo(baseId), { atras: rotas.jogos(match.clubId, match.teamId) }));
      return;
    }
    recarregar();
  }

  const cabecalho = (
    <PageHead
      title={`${ourName} — ${rivalName}`}
      subtitle={[t('jogo.vs', { adversario: match.opponentName }), dateLabel(match.scheduledAt)].join(' · ')}
      backTo={rotas.jogos(match.clubId, match.teamId)}
      actions={
        <div className="summary-actions">
          <Badge kind="partilha">{t('partilhado.papel.REGISTOS')}</Badge>
          <Badge kind={terminado ? 'ok' : 'live'}>
            {terminado ? t('estado.FINISHED') : t('partilhado.aRegistar')}
          </Badge>
          {terminado ? (
            partilha.fundidoEm ? null : (
              <button type="button" className="btn btn--ghost" onClick={reabrir} disabled={ocupado}>
                {t('partilhado.registos.voltarARegistar')}
              </button>
            )
          ) : (
            <button type="button" className="btn btn--primary" onClick={terminar} disabled={ocupado}>
              {t('partilhado.registos.terminar')}
            </button>
          )}
        </div>
      }
    />
  );

  // Fundido: o jogo que conta é o dos Tempos. Este fica guardado, só para ver.
  if (partilha.fundidoEm) {
    return (
      <>
        {cabecalho}
        <section className="faixa-partilha">
          <div className="faixa-partilha__info">
            <Badge kind="partilha">{t('partilhado.juntado')}</Badge>
            <span>{t('partilhado.registos.fundido')}</span>
          </div>
          <div className="faixa-partilha__acoes">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => router.push(rotas.jogoResumo(partilha.fundidoEm.jogo))}
            >
              {t('partilhado.registos.abrirJogo')}
            </button>
          </div>
        </section>
        <div className="card">
          <PainelRegistos state={state} ourName={ourName} opponentName={rivalName} />
        </div>
      </>
    );
  }

  if (terminado) {
    return (
      <>
        {cabecalho}
        <FaixaPartilhado matchId={matchId} events={carregado.events} state={carregado.state} aoMudar={depoisDeJuntar} />
        <div className="card">
          {lista.length ? (
            <PainelRegistos state={state} ourName={ourName} opponentName={rivalName} />
          ) : (
            <p className="muted">{t('partilhado.registos.nenhum')}</p>
          )}
        </div>
      </>
    );
  }

  const temBotoes = jogadores.some((p) => botoesDe(p).length);

  return (
    <>
      {cabecalho}

      {!ligados.size ? (
        <Empty>{t('partilhado.registos.semRegistosLigados')}</Empty>
      ) : (
        <>
          <BarraRegistos state={state} ligados={ligados} ourName={ourName} opponentName={rivalName} on={on} />

          <div className="regultimo">
            <span className="regultimo__texto">
              <strong>{t('partilhado.registos.total', { n: lista.length })}</strong>
              {ultimo ? (
                <span className="muted">
                  {' · '}
                  {t('partilhado.registos.ultimo', { registo: eventLabel(ultimo.eventType, ultimo, state.players) })}
                </span>
              ) : null}
            </span>
            <button type="button" className="btn btn--ghost" onClick={desfazerUltimo} disabled={!ultimo || ocupado}>
              {t('partilhado.registos.desfazer')}
            </button>
          </div>

          {temBotoes ? (
            <div className="regcards">
              {jogadores.map((p) => (
                <article key={p.playerId} className="regcard">
                  <header className="regcard__quem">
                    <span className="regcard__num">{p.number}</span>
                    <span className="regcard__nome">{p.name}</span>
                  </header>
                  <div className="regcard__botoes">
                    {botoesDe(p).map(([classe, rotulo, quantos, fazer]) => (
                      <button
                        key={classe}
                        type="button"
                        className={`regcard__btn regcard__btn--${classe}`}
                        onClick={fazer}
                      >
                        <span>{rotulo}</span>
                        <b>{quantos || 0}</b>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t('partilhado.registos.soDeEquipa')}</p>
          )}
        </>
      )}
    </>
  );
}
