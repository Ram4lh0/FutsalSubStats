'use client';

// Assistente de criação de jogo, em quatro etapas (secção 4.6).

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PageHead from '@/components/PageHead.jsx';
import CourtPicker, { countFilled } from '@/components/CourtPicker.jsx';
import { Empty, Field } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { confirmarPoucosConvocados } from '@/lib/squad.js';
import { clubs, teams, competitions, players, matches, squad, events } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { matchCreated } from '@/domain/actions.js';
import { validateMatchInfo, validateSquadSelection, validateLineup } from '@/domain/validation.js';
import {
  MAX_SQUAD,
  LOCATION,
  POSITION_LABEL,
  HOME_AWAY_LABEL,
  MATCH_TIMING,
  MATCH_TIMING_LABEL,
  timingOf,
  timingConfig,
} from '@/domain/constants.js';
import { dateLabel, positionLabel } from '@/lib/format.js';

const ETAPAS = ['Informação', 'Convocados', 'Cinco inicial', 'Confirmação'];

export default function NovoJogoPage() {
  return (
    <Guard>
      <Assistente />
    </Guard>
  );
}

function Assistente() {
  const { clubId, teamId } = useParams();
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();

  const [club, setClub] = useState(null);
  const [team, setTeam] = useState(null);
  const [provas, setProvas] = useState([]);
  const [roster, setRoster] = useState(null);
  const [etapa, setEtapa] = useState(0);
  const [aGuardar, setAGuardar] = useState(false);
  const [info, setInfo] = useState({
    opponentName: '',
    opponentShortName: '',
    competitionId: '',
    timing: '',
    scheduledAt: dataHoraPorOmissao(),
    homeOrAway: 'HOME',
    notes: '',
  });
  const [escolhidos, setEscolhidos] = useState([]);
  const [lineup, setLineup] = useState({});
  const [procura, setProcura] = useState('');

  useEffect(() => {
    (async () => {
      const t = await teams.get(teamId);
      setTeam(t);
      setClub(await clubs.get(clubId));
      const lista = await competitions.listByTeam(teamId);
      setProvas(lista);
      // O tipo de tempo vem preenchido com o do escalão, mas dá para mudar: um
      // particular pode ser corrido mesmo numa equipa que joga cronometrado.
      setInfo((i) => ({
        ...i,
        timing: i.timing || timingOf(t),
        competitionId: i.competitionId || (lista.length === 1 ? lista[0].id : ''),
      }));
      setRoster((await players.listByTeam(teamId)).filter((p) => p.isActive));
    })();
  }, [clubId, teamId]);

  const candidatos = useMemo(
    () =>
      (roster || [])
        .filter((p) => escolhidos.includes(p.id))
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          number: p.shirtNumber,
          preferredPosition: p.preferredPosition,
        })),
    [roster, escolhidos]
  );

  if (!roster) return <p className="muted">A carregar…</p>;

  if (!roster.length) {
    return (
      <>
        <PageHead title="Novo jogo" backTo={`/clubs/${clubId}/teams/${teamId}`} />
        <Empty
          action={
            <button
              className="btn btn--primary"
              onClick={() => router.push(`/clubs/${clubId}/teams/${teamId}/players/new`)}
            >
              Criar jogador
            </button>
          }
        >
          Não existem jogadores ativos. Crie o plantel antes de marcar um jogo.
        </Empty>
      </>
    );
  }

  const campo = (k) => ({
    value: info[k],
    onChange: (e) => setInfo((i) => ({ ...i, [k]: e.target.value })),
  });

  function alternarConvocado(id) {
    setEscolhidos((atual) => {
      if (atual.includes(id)) {
        // Retira do cinco inicial se foi desconvocado.
        setLineup((l) => {
          const proximo = { ...l };
          for (const [pos, pid] of Object.entries(proximo)) if (pid === id) delete proximo[pos];
          return proximo;
        });
        return atual.filter((x) => x !== id);
      }
      if (atual.length >= MAX_SQUAD) {
        toast(`Máximo de ${MAX_SQUAD} convocados.`, 'error');
        return atual;
      }
      return [...atual, id];
    });
  }

  async function guardar(abrir) {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      const jogo = await matches.create(teamId, {
        opponentName: info.opponentName,
        opponentShortName: info.opponentShortName,
        competitionId: info.competitionId,
        timing: info.timing,
        homeOrAway: info.homeOrAway,
        scheduledAt: new Date(info.scheduledAt).getTime(),
        season: club?.currentSeason || null,
        notes: info.notes,
      });

      const inverso = {};
      for (const [pos, pid] of Object.entries(lineup)) if (pid) inverso[pid] = pos;

      await squad.replace(
        jogo.id,
        roster
          .filter((p) => escolhidos.includes(p.id))
          .map((p) => ({
            playerId: p.id,
            playerNameSnapshot: p.name,
            shirtNumberSnapshot: p.shirtNumber,
            preferredPosition: p.preferredPosition,
            initialPosition: inverso[p.id] || null,
            initialLocation: inverso[p.id] ? LOCATION.COURT : LOCATION.BENCH,
          }))
      );

      await events.append(
        matchCreated({
          matchId: jogo.id,
          currentPeriod: 0,
          timerStatus: 'STOPPED',
          timerStartedAt: null,
          elapsedMatchMs: 0,
          periodElapsedMs: 0,
          teamScore: 0,
          opponentScore: 0,
        })
      );

      await sync.saveNow(userId, user?.email);
      toast('Jogo criado e sincronizado.', 'ok');
      router.push(abrir ? `/matches/${jogo.id}/setup` : `/clubs/${clubId}/teams/${teamId}/matches`);
    } catch (err) {
      toast(`Jogo guardado neste dispositivo, mas ainda não subiu: ${err.message}`, 'error');
    } finally {
      setAGuardar(false);
    }
  }

  const nav = (voltarLabel, seguinteLabel, aoSeguinte) => (
    <div className="wizard__nav">
      <button
        className="btn btn--ghost"
        type="button"
        onClick={() => (etapa === 0 ? router.push(`/clubs/${clubId}/teams/${teamId}/matches`) : setEtapa(etapa - 1))}
      >
        {voltarLabel}
      </button>
      <button className="btn btn--primary" type="button" onClick={aoSeguinte}>
        {seguinteLabel}
      </button>
    </div>
  );

  return (
    <>
      <PageHead title="Novo jogo" subtitle={[club?.name, team?.name].filter(Boolean).join(" · ")} backTo={`/clubs/${clubId}/teams/${teamId}/matches`} />

      <ol className="stepper">
        {ETAPAS.map((label, i) => (
          <li
            key={label}
            className={`stepper__item ${i === etapa ? 'is-active' : ''} ${i < etapa ? 'is-done' : ''}`}
          >
            <span className="stepper__n">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="wizard">
        {etapa === 0 ? (
          <div className="card form">
            <div className="form__row">
              <Field label="Adversário">
                <input className="input" placeholder="Nome do adversário" {...campo('opponentName')} />
              </Field>
              <Field label="Abreviatura (opcional)" hint="Usada no marcador e no resumo.">
                <input className="input" placeholder="Ex.: BEN" maxLength={12} {...campo('opponentShortName')} />
              </Field>
            </div>
            <div className="form__row">
              <Field label="Data e hora">
                <input className="input" type="datetime-local" {...campo('scheduledAt')} />
              </Field>
              <Field label="Casa ou fora">
                <select className="input" {...campo('homeOrAway')}>
                  <option value="HOME">Casa</option>
                  <option value="AWAY">Fora</option>
                </select>
              </Field>
            </div>
            <div className="form__row">
              <Field
                label="Competição"
                hint={provas.length ? 'Todos os jogos pertencem a uma prova.' : 'Crie primeiro uma competição neste escalão.'}
              >
                <select className="input" {...campo('competitionId')}>
                  <option value="">Escolher competição…</option>
                  {provas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de jogo" hint="Vem do escalão; mude se este jogo for diferente.">
                <select className="input" {...campo('timing')}>
                  {Object.values(MATCH_TIMING).map((t) => (
                    <option key={t} value={t}>
                      {MATCH_TIMING_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notas">
              <textarea className="input input--area" rows={3} {...campo('notes')} />
            </Field>
            {nav('Cancelar', 'Continuar', () => {
              const erro = validateMatchInfo({
                opponentName: info.opponentName,
                periodDurationMs: timingConfig({ timing: info.timing }).periodDurationMs,
              });
              if (erro) return toast(erro, 'error');
              if (!info.competitionId)
                return toast('Escolha a competição deste jogo.', 'error');
              setEtapa(1);
            })}
          </div>
        ) : null}

        {etapa === 1 ? (
          <div className="card">
            <div className="toolbar">
              <input
                className="input input--search"
                placeholder="Procurar por nome ou número…"
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
              />
              <span className="toolbar__spacer" />
              <span className={`counter ${escolhidos.length >= MAX_SQUAD ? 'is-full' : ''}`}>
                {escolhidos.length}/{MAX_SQUAD}
              </span>
            </div>

            <div className="pickgrid">
              {roster
                .filter(
                  (p) =>
                    !procura ||
                    p.name.toLowerCase().includes(procura.toLowerCase()) ||
                    String(p.shirtNumber).includes(procura)
                )
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`pick ${escolhidos.includes(p.id) ? 'is-on' : ''}`}
                    onClick={() => alternarConvocado(p.id)}
                  >
                    <span className="pick__num">{p.shirtNumber}</span>
                    <span className="pick__name">{p.name}</span>
                    <span className="pick__pos">{positionLabel(p.preferredPosition)}</span>
                  </button>
                ))}
            </div>

            {nav('Voltar', 'Continuar', async () => {
              const erro = validateSquadSelection(escolhidos);
              if (erro) return toast(erro, 'error');
              if (!(await confirmarPoucosConvocados(confirmar, escolhidos.length))) return;
              setEtapa(2);
            })}
          </div>
        ) : null}

        {etapa === 2 ? (
          <div className="card">
            <CourtPicker candidates={candidatos} lineup={lineup} onChange={setLineup} />
            <p className="muted">
              {countFilled(lineup)} de 5 posições preenchidas. Os restantes{' '}
              {candidatos.length - countFilled(lineup)} convocados começam no banco.
            </p>
            {nav('Voltar', 'Continuar', () => {
              const erro = validateLineup(lineup, escolhidos);
              if (erro) return toast(erro, 'error');
              setEtapa(3);
            })}
          </div>
        ) : null}

        {etapa === 3 ? (
          <Confirmacao
            club={club}
            competicaoNome={provas.find((c) => c.id === info.competitionId)?.name}
            info={info}
            lineup={lineup}
            escolhidos={roster.filter((p) => escolhidos.includes(p.id))}
            aGuardar={aGuardar}
            onVoltar={() => setEtapa(2)}
            onGuardar={guardar}
          />
        ) : null}
      </div>
    </>
  );
}

function Confirmacao({
  club,
  competicaoNome,
  info,
  lineup,
  escolhidos,
  aGuardar,
  onVoltar,
  onGuardar,
}) {
  const emCampo = Object.entries(lineup).filter(([, v]) => v);
  const idsEmCampo = new Set(emCampo.map(([, v]) => v));

  return (
    <div className="card">
      <dl className="review">
        <div>
          <dt>Adversário</dt>
          <dd>{info.opponentName}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{dateLabel(new Date(info.scheduledAt).getTime())}</dd>
        </div>
        <div>
          <dt>Local</dt>
          <dd>{HOME_AWAY_LABEL[info.homeOrAway]}</dd>
        </div>
        <div>
          <dt>Competição</dt>
          <dd>{competicaoNome || '—'}</dd>
        </div>
        <div>
          <dt>Tempo de jogo</dt>
          <dd>{MATCH_TIMING_LABEL[info.timing] || '—'}</dd>
        </div>
        <div>
          <dt>Convocados</dt>
          <dd>{escolhidos.length} jogadores</dd>
        </div>
      </dl>

      <h3 className="section">Em campo</h3>
      <div className="chiprow">
        {emCampo.map(([pos, pid]) => {
          const p = escolhidos.find((c) => c.id === pid);
          return (
            <span key={pos} className="chip chip--static">
              <strong>{p.shirtNumber}</strong> {p.name} · {POSITION_LABEL[pos]}
            </span>
          );
        })}
      </div>

      <h3 className="section">No banco</h3>
      <div className="chiprow">
        {escolhidos
          .filter((p) => !idsEmCampo.has(p.id))
          .map((p) => (
            <span key={p.id} className="chip chip--static">
              <strong>{p.shirtNumber}</strong> {p.name}
            </span>
          ))}
      </div>

      <div className="wizard__nav">
        <button className="btn btn--ghost" type="button" onClick={onVoltar}>
          Voltar
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={aGuardar}
          onClick={() => onGuardar(false)}
        >
          {aGuardar ? 'A guardar…' : 'Guardar jogo'}
        </button>
        <button
          className="btn btn--primary"
          type="button"
          disabled={aGuardar}
          onClick={() => onGuardar(true)}
        >
          {aGuardar ? 'A guardar…' : 'Guardar e abrir'}
        </button>
      </div>
    </div>
  );
}

function dataHoraPorOmissao() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
