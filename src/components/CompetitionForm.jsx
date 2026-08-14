'use client';

// components/CompetitionForm.jsx — criar e editar uma competição do escalão.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import { SoLeitura, Field } from './bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { teams, competitions } from '@/lib/data/repository.js';
import { rotas } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { useT } from '@/lib/i18n/index.js';

const VAZIO = { name: '', shortName: '' };

export default function CompetitionForm({ clubId, teamId, competitionId }) {
  const router = useRouter();
  const t = useT();
  const soLeitura = useSoLeitura();
  const { toast, confirmar } = useUI();
  const [team, setTeam] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!competitionId);
  const base = rotas.escalao(clubId, teamId);

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
    if (!(form.name || '').trim()) return toast(t('competicao.precisaNome'), 'error');
    const payload = { name: (form.name || '').trim(), shortName: (form.shortName || '').trim() || null };
    if (competitionId) await competitions.update(competitionId, payload);
    else await competitions.create(teamId, payload);
    toast(t('competicao.guardada'), 'ok');
    router.push(rotas.competicoes(clubId, teamId));
  }

  async function eliminar() {
    const ok = await confirmar(t('competicao.confirmaApagar', { nome: form.name }), {
      okLabel: t('competicao.apagarBotao'),
    });
    if (!ok) return;
    await competitions.remove(competitionId);
    toast(t('competicao.apagada'), 'ok');
    router.push(rotas.competicoes(clubId, teamId));
  }

  if (!pronto) return <p className="muted">{t('comum.aCarregar')}</p>;

  if (soLeitura) return <SoLeitura titulo={t('competicao.titulo')} />;

  return (
    <>
      <PageHead
        title={competitionId ? t('competicao.editarTitulo') : t('competicao.criarTitulo')}
        subtitle={team?.name}
        backTo={rotas.competicoes(clubId, teamId)}
      />
      <form className="card form" onSubmit={guardar}>
        <div className="form__row">
          <Field label={t('competicao.nome')} hint={t('competicao.nomeDica')}>
            <input
              className="input"
              placeholder={t('competicao.nomePlaceholder')}
              {...campo('name')}
            />
          </Field>
          <Field label={t('comum.apelido')}>
            <input
              className="input"
              placeholder={t('competicao.apelidoPlaceholder')}
              maxLength={12}
              {...campo('shortName')}
            />
          </Field>
        </div>

        <div className="form__actions">
          {competitionId ? (
            <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
              {t('competicao.eliminar')}
            </button>
          ) : null}
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.back()}>
            {t('comum.cancelar')}
          </button>
          <button className="btn btn--primary" type="submit">
            {t('comum.guardar')}
          </button>
        </div>
      </form>
    </>
  );
}
