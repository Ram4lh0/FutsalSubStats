'use client';

// components/CompetitionForm.jsx — criar e editar uma competição do escalão.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import { Field } from './bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { teams, competitions } from '@/lib/data/repository.js';

const VAZIO = { name: '', shortName: '' };

export default function CompetitionForm({ clubId, teamId, competitionId }) {
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const [team, setTeam] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!competitionId);
  const base = `/clubs/${clubId}/teams/${teamId}`;

  useEffect(() => {
    (async () => {
      setTeam(await teams.get(teamId));
      if (competitionId) {
        const c = await competitions.get(competitionId);
        if (c) setForm({ ...VAZIO, ...c });
        setPronto(true);
      }
    })();
  }, [teamId, competitionId]);

  const campo = (k) => ({
    value: form[k] ?? '',
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function guardar(e) {
    e.preventDefault();
    if (!(form.name || '').trim()) return toast('A competição precisa de um nome.', 'error');
    const payload = { name: (form.name || '').trim(), shortName: (form.shortName || '').trim() || null };
    if (competitionId) await competitions.update(competitionId, payload);
    else await competitions.create(teamId, payload);
    toast('Competição guardada.', 'ok');
    router.push(`${base}/competitions`);
  }

  async function eliminar() {
    const ok = await confirmar(
      `Apagar a competição "${form.name}"? Os jogos não se perdem — ficam sem competição associada.`,
      { okLabel: 'Apagar competição' }
    );
    if (!ok) return;
    await competitions.remove(competitionId);
    toast('Competição apagada.', 'ok');
    router.push(`${base}/competitions`);
  }

  if (!pronto) return <p className="muted">A carregar…</p>;

  return (
    <>
      <PageHead
        title={competitionId ? 'Editar competição' : 'Criar competição'}
        subtitle={team?.name}
        backTo={`${base}/competitions`}
      />
      <form className="card form" onSubmit={guardar}>
        <div className="form__row">
          <Field label="Nome" hint="Campeonato distrital, Taça, Particulares…">
            <input className="input" placeholder="Ex.: Campeonato" {...campo('name')} />
          </Field>
          <Field label="Apelido (opcional)">
            <input className="input" placeholder="Ex.: CAMP" maxLength={12} {...campo('shortName')} />
          </Field>
        </div>

        <div className="form__actions">
          {competitionId ? (
            <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
              Eliminar competição
            </button>
          ) : null}
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.back()}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </>
  );
}
