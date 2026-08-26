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
import { MATCH_TIMING, maxSquadOf, timingOf } from '@/domain/constants.js';
import { timingLabel } from '@/lib/format.js';

const VAZIO = { name: '', shortName: '', timing: MATCH_TIMING.UNTIMED, maxSquad: '14' };

export default function CompetitionForm({ clubId, teamId, competitionId }) {
  const router = useRouter();
  const t = useT();
  const soLeitura = useSoLeitura(teamId);
  const { toast, confirmar } = useUI();
  const [team, setTeam] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!competitionId);
  const base = rotas.escalao(clubId, teamId);

  useEffect(() => {
    (async () => {
      const loadedTeam = await teams.get(teamId);
      setTeam(loadedTeam);
      if (competitionId) {
        const c = await competitions.get(competitionId);
        if (c) setForm({ ...VAZIO, ...c, maxSquad: c.maxSquad === null ? '' : String(maxSquadOf(c)) });
        setPronto(true);
      } else {
        setForm((f) => ({ ...f, timing: timingOf(loadedTeam) }));
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
    const payload = {
      name: (form.name || '').trim(),
      shortName: (form.shortName || '').trim() || null,
      timing: form.timing,
      maxSquad: form.maxSquad === '' ? null : Number(form.maxSquad),
    };
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
    // Arquivar, e não apagar: o `remove` só limpava este aparelho, e a
    // competição reaparecia na descarga seguinte.
    await competitions.archive(competitionId);
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

        <div className="form__row">
          <Field label={t('competicao.tipoTempo')} hint={t('competicao.tipoTempoDica')}>
            <select className="input" {...campo('timing')}>
              {Object.values(MATCH_TIMING).map((value) => (
                <option key={value} value={value}>{timingLabel(value)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('competicao.maxConvocados')} hint={t('competicao.maxConvocadosDica')}>
            <select className="input" {...campo('maxSquad')}>
              <option value="">{t('competicao.semLimite')}</option>
              {Array.from({ length: 18 }, (_, index) => index + 5).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
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
