'use client';

// components/treino/FormTreino.jsx — dia, hora, duração e local de um treino.
// Usado para criar um treino extra e para mudar um treino sozinho.

import { useState } from 'react';
import { Field } from '@/components/bits.jsx';
import { useT } from '@/lib/i18n/index.js';

export const DURACOES_TREINO = [45, 60, 75, 90, 105, 120, 150];

export default function FormTreino({ inicial, onGuardar, onCancelar, comData = true }) {
  const t = useT();
  const [v, setV] = useState({
    date: inicial.date,
    startTime: inicial.startTime || '19:00',
    durationMin: Number(inicial.durationMin) || 90,
    location: inicial.location || '',
  });
  const campo = (k) => ({ value: v[k], onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) });

  function submeter(e) {
    e.preventDefault();
    if (!v.date || !/^\d{2}:\d{2}$/.test(v.startTime)) return;
    onGuardar({ ...v, durationMin: Number(v.durationMin) });
  }

  return (
    <form className="form" onSubmit={submeter}>
      <div className="form__row">
        {comData ? (
          <Field label={t('treino.dia')}>
            <input className="input" type="date" required {...campo('date')} />
          </Field>
        ) : null}
        <Field label={t('treino.hora')}>
          <input className="input" type="time" required {...campo('startTime')} />
        </Field>
      </div>
      <div className="form__row">
        <Field label={t('treino.duracao')}>
          <select className="input" {...campo('durationMin')}>
            {DURACOES_TREINO.map((m) => (
              <option key={m} value={m}>
                {t('treino.duracaoMin', { n: m })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('treino.local')}>
          <input className="input" type="text" maxLength={80} placeholder={t('treino.localExemplo')} {...campo('location')} />
        </Field>
      </div>
      <footer className="modal__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancelar}>
          {t('comum.cancelar')}
        </button>
        <button type="submit" className="btn btn--primary">
          {t('comum.guardar')}
        </button>
      </footer>
    </form>
  );
}
