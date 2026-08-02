'use client';

// Preparação do jogo (secção 4.7): dados, convocatória e cinco inicial.
//
// A barra do fundo é fixa ao ecrã e opaca: o resumo da convocatória e o botão de
// arranque têm de estar sempre à mão, sem obrigar a percorrer a página.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import PageHead from '@/components/PageHead.jsx';
import CourtPicker, { countFilled } from '@/components/CourtPicker.jsx';
import { Empty, Field, StatusBadge } from '@/components/bits.jsx';
import { confirmarPoucosConvocados } from '@/lib/squad.js';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { clubs, teams, competitions, players, matches, squad, events, loadMatch } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { startFirstHalf } from '@/domain/actions.js';
import { canStartFirstHalf, validateLineup, validateSquadSelection } from '@/domain/validation.js';
import {
  MAX_SQUAD,
  LOCATION,
  MATCH_STATUS,
  HOME_AWAY_LABEL,
  MATCH_TIMING,
  MATCH_TIMING_LABEL,
  timingOf,
} from '@/domain/constants.js';
import { positionLabel } from '@/lib/format.js';

export default function SetupPage() {
  return (
    <Guard>
      <Preparacao />
    </Guard>
  );
}

function Preparacao() {
  const { matchId } = useParams();
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();

  const [dados, setDados] = useState(null);
  const [escolhidos, setEscolhidos] = useState([]);
  const [lineup, setLineup] = useState({});
  const [form, setForm] = useState(null);
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    (async () => {
      const carregado = await loadMatch(matchId);
      if (!carregado) return setDados({ vazio: true });
      const { match, state } = carregado;

      if (state.status !== MATCH_STATUS.DRAFT && state.status !== MATCH_STATUS.READY) {
        return router.replace(
          state.status === MATCH_STATUS.FINISHED
            ? `/matches/${matchId}/summary`
            : `/matches/${matchId}/live`
        );
      }

      const [club, team, roster, provas] = await Promise.all([
        clubs.get(match.clubId),
        teams.get(match.teamId),
        players.listByTeam(match.teamId),
        competitions.listByTeam(match.teamId),
      ]);

      const inicial = {};
      for (const [pos, pid] of Object.entries(state.court)) if (pid) inicial[pos] = pid;

      setEscolhidos(Object.keys(state.players));
      setLineup(inicial);
      setForm({
        opponentName: match.opponentName,
        opponentShortName: match.opponentShortName || '',
        scheduledAt: paraInput(match.scheduledAt),
        homeOrAway: match.homeOrAway,
        competitionId: match.competitionId || '',
        timing: timingOf(match),
        notes: match.notes || '',
      });
      setDados({ match, state, club, team, roster, provas });
    })();
  }, [matchId, router]);

  if (!dados) return <p className="muted">A carregar…</p>;
  if (dados.vazio) return <Empty>Jogo não encontrado.</Empty>;
  if (!form) return <p className="muted">A carregar…</p>;

  const { match, state, club, team, roster, provas } = dados;
  // Um jogador inativo que já esteja convocado continua a aparecer: tirá-lo da
  // lista escondia uma convocatória feita antes de ele ser desativado.
  const elegiveis = roster.filter((p) => p.isActive || escolhidos.includes(p.id));
  const candidatos = elegiveis
    .filter((p) => escolhidos.includes(p.id))
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      number: p.shirtNumber,
      preferredPosition: p.preferredPosition,
    }));

  const campo = (k) => ({
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  function alternar(p) {
    setEscolhidos((atual) => {
      if (atual.includes(p.id)) {
        setLineup((l) => {
          const proximo = { ...l };
          for (const [pos, pid] of Object.entries(proximo)) if (pid === p.id) delete proximo[pos];
          return proximo;
        });
        return atual.filter((x) => x !== p.id);
      }
      if (atual.length >= MAX_SQUAD) {
        toast(`Máximo de ${MAX_SQUAD} convocados.`, 'error');
        return atual;
      }
      return [...atual, p.id];
    });
  }

  async function guardarDados() {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      await matches.update(matchId, {
        opponentName: form.opponentName.trim() || match.opponentName,
        opponentShortName: form.opponentShortName.trim() || null,
        scheduledAt: new Date(form.scheduledAt).getTime(),
        homeOrAway: form.homeOrAway,
        competition: form.competition,
          notes: form.notes,
      });
      await sync.saveNow(userId, user?.email);
      toast('Dados atualizados e sincronizados.', 'ok');
    } catch (err) {
      toast(`Dados guardados neste dispositivo, mas ainda não subiram: ${err.message}`, 'error');
    } finally {
      setAGuardar(false);
    }
  }

  async function persistir({ silencioso = false } = {}) {
    const e1 = validateSquadSelection(escolhidos);
    if (e1) {
      toast(e1, 'error');
      return false;
    }
    if (!(await confirmarPoucosConvocados(confirmar, escolhidos.length))) return false;
    const e2 = validateLineup(lineup, escolhidos);
    if (e2) {
      toast(e2, 'error');
      return false;
    }
    const inverso = {};
    for (const [pos, pid] of Object.entries(lineup)) if (pid) inverso[pid] = pos;
    await squad.replace(
      matchId,
      elegiveis
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
    await sync.saveNow(userId, user?.email);
    if (!silencioso) toast('Preparação guardada e sincronizada.', 'ok');
    return true;
  }

  async function comecar() {
    if (!(await persistir({ silencioso: true }))) return;
    const fresco = await loadMatch(matchId);
    const erro = canStartFirstHalf(fresco.state);
    if (erro) return toast(erro, 'error');
    await events.append(startFirstHalf(fresco.state, Date.now()));
    await sync.saveNow(userId, user?.email);
    router.push(`/matches/${matchId}/live`);
  }

  const emCampo = countFilled(lineup);

  return (
    <>
      <PageHead
        title={`vs ${match.opponentName}`}
        subtitle={`${[club?.name, team?.name].filter(Boolean).join(' · ')} · ${
          HOME_AWAY_LABEL[match.homeOrAway]
        }`}
        backTo={`/clubs/${match.clubId}/teams/${match.teamId}/matches`}
        actions={<StatusBadge status={state.status} />}
      />

      <details className="card collapse">
        <summary>Dados do jogo</summary>
        <div className="form">
          <div className="form__row">
            <Field label="Adversário">
              <input className="input" {...campo('opponentName')} />
            </Field>
            <Field label="Abreviatura (opcional)">
              <input className="input" maxLength={12} {...campo('opponentShortName')} />
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
            <Field label="Competição">
              <select className="input" {...campo('competitionId')}>
                <option value="">Sem competição</option>
                {provas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de jogo" hint="Vem do escalão; pode ser diferente neste jogo.">
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
            <textarea className="input input--area" rows={2} {...campo('notes')} />
          </Field>
          <div className="form__actions form__actions--left">
            <button className="btn btn--ghost" onClick={guardarDados}>
              Guardar dados
            </button>
          </div>
        </div>
      </details>

      <section className="card">
        <div className="toolbar">
          <h2 className="section section--tight">Convocados</h2>
          <span className="toolbar__spacer" />
          <span className={`counter ${escolhidos.length >= MAX_SQUAD ? 'is-full' : ''}`}>
            {escolhidos.length}/{MAX_SQUAD}
          </span>
        </div>
        <div className="pickgrid">
          {elegiveis.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pick ${escolhidos.includes(p.id) ? 'is-on' : ''} ${p.isActive ? '' : 'is-muted'}`}
              onClick={() => alternar(p)}
            >
              <span className="pick__num">{p.shirtNumber}</span>
              <span className="pick__name">{p.name}</span>
              <span className="pick__pos">{positionLabel(p.preferredPosition)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section section--tight">Cinco inicial</h2>
        <CourtPicker candidates={candidatos} lineup={lineup} onChange={setLineup} />
      </section>

      {/* Espaço para o último cartão não ficar debaixo da barra fixa. */}
      <div className="setup__spacer" />
      <div className="setup__footer">
        <span className="setup__hint">
          {escolhidos.length} convocados · {emCampo}/5 em campo · {escolhidos.length - emCampo} no
          banco
        </span>
        <div className="setup__buttons">
          <button className="btn btn--ghost" onClick={() => persistir()}>
            Guardar preparação
          </button>
          <button
            className="btn btn--danger btn--ghost"
            onClick={async () => {
              const ok = await confirmar('Apagar este jogo e todos os seus dados?', {
                okLabel: 'Apagar jogo',
              });
              if (!ok) return;
              await matches.remove(matchId);
              toast('Jogo apagado.', 'ok');
              router.push(`/clubs/${match.clubId}/teams/${match.teamId}/matches`);
            }}
          >
            Apagar jogo
          </button>
          <button className="btn btn--primary btn--big" onClick={comecar}>
            Começar 1.ª parte
          </button>
        </div>
      </div>
    </>
  );
}

function paraInput(ts) {
  const d = new Date(ts || Date.now());
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
