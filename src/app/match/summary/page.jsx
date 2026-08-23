'use client';

// Resumo do jogo (secção 4.10).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import DataTable from '@/components/DataTable.jsx';
import { GoalsByHalf } from '@/components/Goals.jsx';
import { Badge, Empty, StatCard, StatusBadge } from '@/components/bits.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import * as GE from '@/lib/goalEditing.jsx';
import { clubs, teams, competitions, matches, loadMatch } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { matchSummaryCsv, download, slug } from '@/lib/data/exporter.js';
import { matchStatsTable, matchResult, powerPlayTotals } from '@/domain/stats.js';
import { foulsTotal, foulsInPeriod } from '@/domain/reducer.js';
import { fmt } from '@/domain/clock.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import {
  clubShort,
  opponentShort,
  dateLabel,
  positionLabel,
  homeAwayLabel,
} from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { emDemo, limparDemo, iniciarDemo } from '@/lib/demo.js';
import { registoAberto, ligacaoPedirConta } from '@/lib/registo.js';

export default function SummaryPage() {
  return (
    <Pagina>
        <Resumo />
    </Pagina>
  );
}

function Resumo() {
  const { matchId, back } = useRouteParams();
  const router = useRouter();
  const t = useT();
  const ui = useUI();
  const { userId, user } = useAuth();
  const [dados, setDados] = useState(null);
  const [aRepetir, setARepetir] = useState(false);

  // De onde se veio. Só quando não há origem — ou seja, quando se chega aqui por
  // ter acabado o jogo — é que a saída passa a ser a casa dos clubes.

  const carregar = useCallback(async () => {
    const carregado = await loadMatch(matchId);
    if (!carregado) return setDados({ vazio: true });
    const [club, team, prova] = await Promise.all([
      clubs.get(carregado.match.clubId),
      teams.get(carregado.match.teamId),
      carregado.match.competitionId ? competitions.get(carregado.match.competitionId) : null,
    ]);
    setDados({ ...carregado, club, team, competition: prova });
  }, [matchId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (dados.vazio) return <Empty>{t('jogo.naoEncontrado')}</Empty>;

  const { match, state, club, team, competition } = dados;
  const pp = powerPlayTotals(state, state.elapsedMatchMs);
  // O convite a criar conta só aparece no fim do jogo de experiência, e só
  // depois de ele ter mesmo acabado: a meio ainda não há nada para mostrar.
  const demo = emDemo() && state.status === MATCH_STATUS.FINISHED;

  /** Quando é que se jogou com guarda-redes avançado, e por quanto tempo. */
  function verPowerPlays() {
    ui.open((close) => (
      <Dialog title={t('resumo.periodos5v4')} onClose={() => close(null)}>
        <ul className="stintlist">
          {pp.periodos.map((x) => (
            <li key={x.numero}>
              <strong>{t('resumo.periodoNumero', { n: x.numero })}</strong>
              {t('resumo.linha5v4', {
                parte: x.startPeriod,
                inicio: fmt(x.startMatchMs),
                fim: x.open ? t('resumo.fimDoJogo') : fmt(x.endMatchMs),
              })}
              <span className="mono">{fmt(x.durationMs)}</span>
              {x.manual ? <span className="muted"> · {t('resumo.marcadoAMao')}</span> : null}
            </li>
          ))}
        </ul>
        <p className="muted">
          {t('resumo.total5v4', {
            tempo: fmt(pp.totalMs),
            n: pp.count,
            periodos: pp.count === 1 ? t('resumo.periodo') : t('resumo.periodos'),
          })}
        </p>
      </Dialog>
    ));
  }
  const tabela = matchStatsTable(state, Date.now());
  const r = matchResult(state);
  const totalConvocados = Object.keys(state.players).length;

  async function corrigirResultado() {
    if (
      await GE.correctScore(ui, {
        matchId,
        ourName: clubShort(club),
        opponentName: opponentShort(match),
        syncUser: { userId, email: user?.email },
      })
    )
      carregar();
  }

  async function editarGolo(goal) {
    if (await GE.editGoal(ui, { matchId, goal, syncUser: { userId, email: user?.email } })) carregar();
  }

  async function editarNotas() {
    const valor = await ui.open((close) => (
      <NotasDialog notas={match.notes || ''} onClose={() => close(null)} onSave={(v) => close(v)} />
    ));
    if (valor == null) return;
    await matches.update(matchId, { notes: valor });
    sync.saveNow(userId, user?.email);
    ui.toast(t('resumo.notasGuardadas'), 'ok');
    carregar();
  }

  /**
   * Apagar o jogo a partir do resumo.
   *
   * Aqui o aviso é mais forte do que o da preparação, e de propósito: um jogo
   * por começar não tem nada lá dentro, este tem os quarenta minutos todos —
   * golos, substituições, tempos de cada jogador. E não desaparece só deste
   * ecrã: sai das estatísticas do escalão e da prova, e da ficha de cada um dos
   * jogadores que jogaram.
   *
   * Arquivar, e não apagar: o `remove` limpava só este aparelho e o jogo
   * reaparecia na descarga seguinte.
   */
  async function apagarJogo() {
    const ok = await ui.confirmar(t('resumo.confirmaApagar'), {
      okLabel: t('prep.apagarJogo'),
      title: t('prep.apagarJogo'),
    });
    if (!ok) return;
    await matches.archive(matchId);
    sync.saveNow(userId, user?.email);
    ui.toast(t('prep.jogoApagado'), 'ok');
    router.push(back || rotas.jogos(match.clubId, match.teamId));
  }

  /** Sair da experiência: os dados fictícios não ficam no aparelho. */
  async function sairDaDemo() {
    await limparDemo();
    router.replace(rotas.login());
  }

  const criarConta = sairDaDemo;

  /**
   * Outra vez do princípio, com o jogo por jogar.
   *
   * Quem chega aqui viu o que a app produz, mas quase de certeza não
   * experimentou metade — as substituições, as faltas, o cronómetro. Sem isto, a
   * única forma de tentar de novo era sair para o ecrã de entrada e voltar a
   * carregar em "experimentar", que é longe de mais para uma segunda tentativa.
   */
  async function repetirDemo() {
    if (aRepetir) return;
    setARepetir(true);
    try {
      const { matchId: novo } = await iniciarDemo();
      router.replace(rotas.jogoPreparar(novo));
    } catch (e) {
      setARepetir(false);
      ui.toast(t('login.demoFalhou', { erro: e.message }), 'error');
    }
  }

  function verPeriodos(s) {
    ui.open((close) => (
      <Dialog title={`#${s.number} ${s.name}`} onClose={() => close(null)}>
        {s.stints.length ? (
          <ul className="stintlist">
            {s.stints.map((x) => (
              <li key={x.stintNumber}>
                <strong>Entrada {x.stintNumber}</strong>
                {` — ${x.startPeriod}.ª parte — ${fmt(x.startMatchMs)} a ${
                  x.open ? 'em curso' : fmt(x.endMatchMs)
                } — `}
                <span className="mono">{fmt(x.durationMs)}</span>
                {x.startingPosition ? (
                  <span className="muted"> · {positionLabel(x.startingPosition)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('resumo.naoEntrou')}</p>
        )}
      </Dialog>
    ));
  }

  return (
    <>
      {/* Fim do jogo de experiência: é aqui que se vê o que a app produz, e
          portanto é aqui que faz sentido convidar a criar conta. Com uma saída
          ao lado — prender alguém num ecrã é a melhor forma de o perder. */}
      {demo ? (
        <div className="card demo-cta">
          <h2 className="page__title">{t('resumo.demoTitulo')}</h2>
          <p>{t('resumo.demoTexto')}</p>
          <p className="muted">{t('resumo.demoTexto2')}</p>
          <div className="demo-cta__actions">
            {/* Com o registo aberto, o botão leva ao ecrã de entrada, que é
                onde se cria a conta. Fechado, não há nada para fazer lá: abre-se
                o email, com o assunto já escrito. Antes disto ia sempre parar ao
                ecrã de entrada e a pessoa tinha de procurar sozinha para onde
                escrever — e ainda perdia a demonstração pelo caminho. */}
            {registoAberto() ? (
              <button className="btn btn--primary btn--big" onClick={criarConta}>
                {t('resumo.demoCriarConta')}
              </button>
            ) : (
              <a
                className="btn btn--primary btn--big"
                href={ligacaoPedirConta(t('registo.assunto'))}
              >
                {t('registo.pedirConta')}
              </a>
            )}
            <button className="btn btn--ghost" onClick={repetirDemo} disabled={aRepetir}>
              {t('resumo.demoRepetir')}
            </button>
            <button className="btn btn--ghost" onClick={sairDaDemo}>
              {t('resumo.demoAgoraNao')}
            </button>
          </div>
        </div>
      ) : null}

      <PageHead
        title={`${clubShort(club)} ${state.teamScore} — ${state.opponentScore} ${opponentShort(match)}`}
        subtitle={[
          t('jogo.vs', { adversario: match.opponentName }),
          dateLabel(match.scheduledAt),
          homeAwayLabel(match.homeOrAway),
          team?.name,
          competition?.name,
        ]
          .filter(Boolean)
          .join(' · ')}
        {...(back
          ? { backTo: back }
          : state.status === MATCH_STATUS.FINISHED
            ? { homeTo: rotas.clube(match.clubId) }
            : { backTo: rotas.jogos(match.clubId, match.teamId) })}
        actions={
          <>
            <StatusBadge status={state.status} />
            <button
              className="btn btn--ghost"
              onClick={() =>
                download(
                  `jogo-${slug(match.opponentName)}.csv`,
                  matchSummaryCsv({ club, match, state, team, competition }),
                  'text/csv;charset=utf-8'
                )
              }
            >
              {t('prep.exportarCsv')}
            </button>
            <button className="btn btn--ghost" onClick={corrigirResultado}>
              {t('resumo.corrigirResultado')}
            </button>
            <button className="btn btn--ghost" onClick={editarNotas}>
              {t('resumo.notas')}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() =>
                router.push(
                  comOrigem(rotas.jogoHistorico(matchId), { de: 'summary', atras: back })
                )
              }
            >
              {t('resumo.historico')}
            </button>
            {state.status !== MATCH_STATUS.FINISHED ? (
              <button
                className="btn btn--primary"
                onClick={() => router.push(rotas.jogoAoVivo(matchId))}
              >
                {t('resumo.voltarAoJogo')}
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid grid--stats">
        <StatCard
          label={t('resumo.resultado')}
          value={`${state.teamScore} — ${state.opponentScore}`}
          hint={
            r === 'W'
              ? t('resultado.vitoria')
              : r === 'L'
                ? t('resultado.derrota')
                : r === 'D'
                  ? t('resultado.empate')
                  : t('resumo.emCurso')
          }
          kind={r === 'W' ? 'win' : r === 'L' ? 'loss' : r === 'D' ? 'draw' : null}
        />
        <StatCard
          label={t('resumo.aoIntervalo')}
          value={
            state.halftimeTeamScore == null
              ? '—'
              : `${state.halftimeTeamScore} — ${state.halftimeOpponentScore}`
          }
        />
        <StatCard label={t('resumo.duracaoEfetiva')} value={fmt(state.elapsedMatchMs)} />
        <StatCard
          label={t('resumo.faltas')}
          value={foulsTotal(state, 'US')}
          hint={t('resumo.faltasDetalhe', {
            p1: foulsInPeriod(state, 'US', 1),
            p2: foulsInPeriod(state, 'US', 2),
          })}
        />
        {totalConvocados < 12 ? (
          <StatCard label={t('resumo.convocados')} value={totalConvocados} kind="loss" />
        ) : null}
        {/* 5v4: só aparece se tiver havido. Num jogo em que nunca se jogou com
            guarda-redes avançado, um cartão a zeros era ruído. */}
        {pp.count ? (
          <StatCard
            label={t('resumo.tempo5v4')}
            value={fmt(pp.totalMs)}
            hint={
              pp.count === 1
                ? t('resumo.umPeriodoVer')
                : t('resumo.variosPeriodosVer', { n: pp.count })
            }
            onClick={verPowerPlays}
          />
        ) : null}
      </div>

      <h2 className="section">{t('resumo.golos')}</h2>
      <div className="card">
        <GoalsByHalf
          state={state}
          ourName={clubShort(club)}
          opponentName={opponentShort(match)}
          onEdit={editarGolo}
          emptyText={
            state.status === MATCH_STATUS.FINISHED ? t('resumo.semGolos') : t('golos.semGolos')
          }
        />
      </div>

      <h2 className="section">{t('resumo.jogadores')}</h2>
      <DataTable players>
        <thead>
          <tr>
            <th>{t('stats.numero')}</th>
            <th>{t('stats.jogador')}</th>
            <th className="num" title={t('stats.golos')}>{t('ficha.golosCurto')}</th>
            <th className="num" title={t('ficha.assistencias')}>{t('ficha.assistCurto')}</th>
            <th className="num" title={t('stats.sofridosTitulo')}>{t('ficha.sofridosCurto')}</th>
            <th className="num" title={t('intervalo.faltasCometidas')}>{t('intervalo.faltasCurto')}</th>
            <th className="num" title={t('intervalo.faltasSofridas')}>{t('intervalo.faltasSofridasCurto')}</th>
            <th className="num" title={t('ficha.cartoesAmarelos')}>{t('ficha.amarelosCurto')}</th>
            <th className="num" title={t('ficha.cartoesVermelhos')}>{t('ficha.vermelhosCurto')}</th>
            <th className="num">{t('ficha.emCampo')}</th>
            <th className="num">{t('intervalo.entradas')}</th>
            <th className="num" title={t('stats.partGTitulo')}>{t('stats.partG')}</th>
            <th className="num" title={t('stats.partGSTitulo')}>{t('stats.partGS')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tabela.map((s) => (
            <tr key={s.playerId} className={s.expelled ? 'is-danger' : ''}>
              <td className="num mono">{s.number}</td>
              <td>
                {s.name}
                {s.expelled ? <Badge kind="danger">{t('resumo.expulso')}</Badge> : null}
              </td>
              <td className="num mono">{s.goals}</td>
              <td className="num mono">{s.assists}</td>
              <td className="num mono">{s.conceded}</td>
              <td className="num mono">{s.fouls}</td>
              <td className="num mono">{s.foulsSuffered}</td>
              <td className="num mono">{s.yellows}</td>
              <td className="num mono">{s.reds}</td>
              <td className="num mono">{fmt(s.courtMs)}</td>
              <td className="num">{s.entries}</td>
              <td className="num mono">{s.goalShare}</td>
              <td className="num mono">{s.concededShare}</td>
              <td className="right">
                <button className="btn btn--tiny btn--ghost" onClick={() => verPeriodos(s)}>
                  {t('resumo.verPeriodos')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {match.notes ? (
        <>
          <h2 className="section">{t('resumo.notas')}</h2>
          <p className="card notes">{match.notes}</p>
        </>
      ) : null}

      {/* Apagar fica aqui em baixo, e não na fila de botões do topo.
          Lá em cima ficava encostado ao "Notas" e ao "Corrigir resultado", que
          se usam a seguir a um jogo com o telemóvel na mão — e o único botão da
          página que não tem volta a dar não pode estar à distância de um dedo
          mal assente. Quem o vem procurar desce até ao fim; quem não o procura
          nunca lá tropeça. */}
      {emDemo() ? null : (
        <div className="resumo__apagar">
          <button className="btn btn--tiny btn--ghost btn--danger" onClick={apagarJogo}>
            {t('prep.apagarJogo')}
          </button>
        </div>
      )}
    </>
  );
}

function NotasDialog({ notas, onClose, onSave }) {
  const t = useT();
  const [valor, setValor] = useState(notas);
  return (
    <Dialog title={t('resumo.notasDoJogo')} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="field__label">{t('resumo.notas')}</span>
          <textarea
            className="input input--area"
            rows={5}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" onClick={() => onSave(valor)}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}
