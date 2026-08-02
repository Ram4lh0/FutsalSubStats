'use client';

// components/PlayerForm.jsx — criar e editar jogadores.
//
// A validação é a mesma do domínio (número livre, nome preenchido), para as
// regras não se repetirem em dois sítios e divergirem com o tempo.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { clubs, teams, players } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { validatePlayer } from '@/domain/validation.js';
import {
  POSITIONS_ALL,
  POSITION_LABEL,
  normalizePosition,
  FOOT,
  FOOT_ALL,
  FOOT_LABEL,
} from '@/domain/constants.js';

export default function PlayerForm({ clubId, teamId, playerId }) {
  const router = useRouter();
  const { toast } = useUI();
  const { userId, user } = useAuth();
  const [club, setClub] = useState(null);
  const [team, setTeam] = useState(null);
  const [roster, setRoster] = useState([]);
  const [pronto, setPronto] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [form, setForm] = useState({
    name: '',
    shirtNumber: '',
    preferredPosition: 'UNIVERSAL',
    strongFoot: FOOT.UNKNOWN,
    isActive: true,
  });

  useEffect(() => {
    (async () => {
      setClub(await clubs.get(clubId));
      setTeam(await teams.get(teamId));
      // Os números repetidos são verificados dentro do escalão: o 10 dos Sub-15
      // e o 10 dos séniores são pessoas diferentes.
      setRoster(await players.listByTeam(teamId));
      if (playerId) {
        const p = await players.get(playerId);
        if (p)
          setForm({
            name: p.name,
            shirtNumber: String(p.shirtNumber),
            preferredPosition: normalizePosition(p.preferredPosition),
            strongFoot: p.strongFoot || FOOT.UNKNOWN,
            isActive: p.isActive,
          });
      }
      setPronto(true);
    })();
  }, [clubId, teamId, playerId]);

  const campo = (k) => ({
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function guardar(e) {
    e.preventDefault();
    if (aGuardar) return;
    const erro = validatePlayer(form, roster, playerId || null);
    if (erro) return toast(erro, 'error');
    setAGuardar(true);
    try {
      if (playerId) await players.update(playerId, form);
      else await players.create(teamId, form);
      await sync.saveNow(userId, user?.email);
      toast('Jogador guardado e sincronizado.', 'ok');
      router.push(`/clubs/${clubId}/teams/${teamId}/roster`);
    } catch (err) {
      toast(`Jogador guardado neste dispositivo, mas ainda não subiu: ${err.message}`, 'error');
    } finally {
      setAGuardar(false);
    }
  }

  if (!pronto) return <p className="muted">A carregar…</p>;

  return (
    <>
      <PageHead
        title={playerId ? `Editar ${form.name}` : 'Novo jogador'}
        subtitle={[club?.name, team?.name].filter(Boolean).join(' · ')}
        backTo={`/clubs/${clubId}/teams/${teamId}/roster`}
      />
      <form className="card form" onSubmit={guardar}>
        <div className="form__row">
          <label className="field">
            <span className="field__label">Nome</span>
            <input className="input" placeholder="Nome" {...campo('name')} />
          </label>
          <label className="field field--narrow">
            <span className="field__label">Número</span>
            <input
              className="input"
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              {...campo('shirtNumber')}
            />
          </label>
        </div>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Posição preferencial</span>
            <select className="input" {...campo('preferredPosition')}>
              {POSITIONS_ALL.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Pé forte</span>
            <select className="input" {...campo('strongFoot')}>
              {FOOT_ALL.map((f) => (
                <option key={f} value={f}>
                  {FOOT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field field--check">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          <span>Jogador ativo</span>
        </label>

        <div className="form__actions">
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => router.push(`/clubs/${clubId}/teams/${teamId}/roster`)}
          >
            Cancelar
          </button>
          <button className="btn btn--primary" type="submit" disabled={aGuardar}>
            {aGuardar ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </form>
    </>
  );
}
