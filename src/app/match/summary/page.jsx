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
import { MATCH_STATUS, POSITION_LABEL, HOME_AWAY_LABEL } from '@/domain/constants.js';
import { clubShort, opponentShort, dateLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { emDemo, limparDemo } from '@/lib/demo.js';

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
  const ui = useUI();
  const { userId, user } = useAuth();
  const [dados, setDados] = useState(null);

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

  if (!dados) return <p className="muted">A carregar…</p>;
  if (dados.vazio) return <Empty>Jogo não encontrado.</Empty>;

  const { match, state, club, team, competition } = dados;
  const pp = powerPlayTotals(state, state.elapsedMatchMs);
  // O convite a criar conta só aparece no fim do jogo de experiência, e só
  // depois de ele ter mesmo acabado: a meio ainda não há nada para mostrar.
  const demo = emDemo() && state.status === MATCH_STATUS.FINISHED;

  /** Quando é que se jogou com guarda-redes avançado, e por quanto tempo. */
  function verPowerPlays() {
    ui.open((close) => (
      <Dialog title="Períodos em 5v4" onClose={() => close(null)}>
        <ul className="stintlist">
          {pp.periodos.map((x) => (
            <li key={x.numero}>
              <strong>{x.numero}.º período</strong>
              {` — ${x.startPeriod}.ª parte — ${fmt(x.startMatchMs)} a ${
                x.open ? 'fim do jogo' : fmt(x.endMatchMs)
              } — `}
              <span className="mono">{fmt(x.durationMs)}</span>
              {x.manual ? <span className="muted"> · marcado à mão</span> : null}
            </li>
          ))}
        </ul>
        <p className="muted">
          Total {fmt(pp.totalMs)} em {pp.count} {pp.count === 1 ? 'período' : 'períodos'}.
        </p>
      </Dialog>
    ));
  }
  const tabela = matchStatsTable(state, Date.now());
  const r = matchResult(state);

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
    await sync.saveNow(userId, user?.email);
    ui.toast('Notas guardadas e sincronizadas.', 'ok');
    carregar();
  }

  /** Sair da experiência: os dados fictícios não ficam no aparelho. */
  async function sairDaDemo() {
    await limparDemo();
    router.replace(rotas.login());
  }

  const criarConta = sairDaDemo;

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
                  <span className="muted"> · {POSITION_LABEL[x.startingPosition]}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Não entrou em campo.</p>
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
          <h2 className="page__title">Foi isto que a app fez</h2>
          <p>
            Todos estes números saíram do jogo que acabou de apontar: quanto tempo cada jogador
            esteve em campo, quantas vezes entrou, quem marcou e quando. Numa época inteira, é este
            histórico que responde a quem jogou a menos.
          </p>
          <p className="muted">
            Este jogo era de treino, com uma equipa inventada, e desaparece quando sair. Com conta,
            fica guardado e aparece no iPad e no telemóvel.
          </p>
          <div className="demo-cta__actions">
            <button className="btn btn--primary btn--big" onClick={criarConta}>
              Criar conta e guardar os meus jogos
            </button>
            <button className="btn btn--ghost" onClick={sairDaDemo}>
              Agora não
            </button>
          </div>
        </div>
      ) : null}

      <PageHead
        title={`${clubShort(club)} ${state.teamScore} — ${state.opponentScore} ${opponentShort(match)}`}
        subtitle={[
          `vs ${match.opponentName}`,
          dateLabel(match.scheduledAt),
          HOME_AWAY_LABEL[match.homeOrAway],
          team?.name,
          competition?.name,
        ]
          .filter(Boolean)
          .join(' · ')}
        {...(back
          ? { backTo: back }
          : state.status === MATCH_STATUS.FINISHED
            ? { homeTo: rotas.dashboard() }
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
              Exportar CSV
            </button>
            <button className="btn btn--ghost" onClick={corrigirResultado}>
              Corrigir resultado
            </button>
            <button className="btn btn--ghost" onClick={editarNotas}>
              Notas
            </button>
            <button
              className="btn btn--ghost"
              onClick={() =>
                router.push(
                  comOrigem(rotas.jogoHistorico(matchId), { de: 'summary', atras: back })
                )
              }
            >
              Histórico
            </button>
            {state.status !== MATCH_STATUS.FINISHED ? (
              <button
                className="btn btn--primary"
                onClick={() => router.push(rotas.jogoAoVivo(matchId))}
              >
                Voltar ao jogo
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid grid--stats">
        <StatCard
          label="Resultado"
          value={`${state.teamScore} — ${state.opponentScore}`}
          hint={r === 'W' ? 'Vitória' : r === 'L' ? 'Derrota' : r === 'D' ? 'Empate' : 'Em curso'}
          kind={r === 'W' ? 'win' : r === 'L' ? 'loss' : r === 'D' ? 'draw' : null}
        />
        <StatCard
          label="Ao intervalo"
          value={
            state.halftimeTeamScore == null
              ? '—'
              : `${state.halftimeTeamScore} — ${state.halftimeOpponentScore}`
          }
        />
        <StatCard label="Duração efetiva" value={fmt(state.elapsedMatchMs)} />
        <StatCard
          label="Faltas"
          value={foulsTotal(state, 'US')}
          hint={`${foulsInPeriod(state, 'US', 1)} na 1.ª · ${foulsInPeriod(state, 'US', 2)} na 2.ª`}
        />
        <StatCard label="Convocados" value={Object.keys(state.players).length} />
        {/* 5v4: só aparece se tiver havido. Num jogo em que nunca se jogou com
            guarda-redes avançado, um cartão a zeros era ruído. */}
        {pp.count ? (
          <StatCard
            label="Tempo em 5v4"
            value={fmt(pp.totalMs)}
            hint={pp.count === 1 ? '1 período · ver quando' : `${pp.count} períodos · ver quando`}
            onClick={verPowerPlays}
          />
        ) : null}
      </div>

      <h2 className="section">Golos</h2>
      <div className="card">
        <GoalsByHalf
          state={state}
          ourName={clubShort(club)}
          opponentName={opponentShort(match)}
          onEdit={editarGolo}
          emptyText={
            state.status === MATCH_STATUS.FINISHED ? 'Não houve golos.' : 'Ainda não houve golos.'
          }
        />
      </div>

      <h2 className="section">Jogadores</h2>
      <DataTable players>
        <thead>
          <tr>
            <th>Nº</th>
            <th>Jogador</th>
            <th className="num" title="Golos">G</th>
            <th className="num" title="Assistências">A</th>
            <th className="num" title="Golos sofridos à baliza">GS</th>
            <th className="num" title="Faltas cometidas">F</th>
            <th className="num" title="Faltas sofridas">FS</th>
            <th className="num" title="Cartões amarelos">Am</th>
            <th className="num" title="Cartões vermelhos">Vm</th>
            <th className="num">Em campo</th>
            <th className="num">Entradas</th>
            <th className="num" title="Golos da equipa com este jogador em campo">Part. G</th>
            <th className="num" title="Golos sofridos com este jogador em campo">Part. GS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tabela.map((s) => (
            <tr key={s.playerId} className={s.expelled ? 'is-danger' : ''}>
              <td className="num mono">{s.number}</td>
              <td>
                {s.name}
                {s.expelled ? <Badge kind="danger">Expulso</Badge> : null}
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
                  Períodos
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {match.notes ? (
        <>
          <h2 className="section">Notas</h2>
          <p className="card notes">{match.notes}</p>
        </>
      ) : null}
    </>
  );
}

function NotasDialog({ notas, onClose, onSave }) {
  const [valor, setValor] = useState(notas);
  return (
    <Dialog title="Notas do jogo" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="field__label">Notas</span>
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
          Cancelar
        </button>
        <button className="btn btn--primary" onClick={() => onSave(valor)}>
          Guardar
        </button>
      </footer>
    </Dialog>
  );
}
