'use client';

// components/ClubForm.jsx — dados do clube, na criação e na edição.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { clubs } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';


const VAZIO = {
  name: '',
  shortName: '',
  currentSeason: '',
  primaryColor: '#22c55e',
  secondaryColor: '#0f172a',
};

export default function ClubForm({ clubId }) {
  const router = useRouter();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!clubId);
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    clubs.get(clubId).then((c) => {
      if (c) setForm({ ...VAZIO, ...c });
      setPronto(true);
    });
  }, [clubId]);

  const campo = (k) => ({
    value: form[k] ?? '',
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function guardar(e) {
    e.preventDefault();
    if (aGuardar) return;
    if (!(form.name || '').trim()) return toast('O nome do clube é obrigatório.', 'error');
    setAGuardar(true);
    const payload = {
      name: (form.name || '').trim(),
      shortName: (form.shortName || '').trim() || null,
      currentSeason: (form.currentSeason || '').trim() || null,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
    };
    try {
      const club = clubId ? await clubs.update(clubId, payload) : await clubs.create(payload);
      await sync.saveNow(userId, user?.email);
      toast('Clube guardado e sincronizado.', 'ok');
      router.push(clubId ? `/clubs/${club.id}` : `/clubs/${club.id}/roster`);
    } catch (err) {
      toast(`Clube guardado neste dispositivo, mas ainda não subiu: ${err.message}`, 'error');
    } finally {
      setAGuardar(false);
    }
  }

  async function eliminar() {
    const ok = await confirmar(
      `Apagar "${form.name}" elimina os escalões, os planteis, os jogos e todos os eventos. Esta ação não pode ser anulada.`,
      { okLabel: 'Apagar clube' }
    );
    if (!ok) return;
    await clubs.archive(clubId);
    toast('Clube apagado.', 'ok');
    router.push('/dashboard');
  }

  if (!pronto) return <p className="muted">A carregar…</p>;

  return (
    <>
      <PageHead
        title={clubId ? 'Editar clube' : 'Criar clube'}
        backTo={clubId ? `/clubs/${clubId}` : '/dashboard'}
      />
      <form className="card form" onSubmit={guardar}>
        <div className="form__row">
          <label className="field">
            <span className="field__label">Nome do clube</span>
            <input className="input" placeholder="Nome do clube" {...campo('name')} />
          </label>
          <label className="field">
            <span className="field__label">Apelido (opcional)</span>
            <input className="input" placeholder="Ex.: JUN" maxLength={12} {...campo('shortName')} />
            <span className="field__hint">
              Nome curto usado no marcador durante o jogo e nos resumos.
            </span>
          </label>
        </div>

        <label className="field">
          <span className="field__label">Época atual (opcional)</span>
          <input className="input" placeholder="2025/26" {...campo('currentSeason')} />
          <span className="field__hint">Vale para todos os escalões deste clube.</span>
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Cor principal</span>
            <input className="input input--color" type="color" {...campo('primaryColor')} />
          </label>
          <label className="field">
            <span className="field__label">Cor secundária</span>
            <input className="input input--color" type="color" {...campo('secondaryColor')} />
          </label>
        </div>

        <div className="form__actions">
          {clubId ? (
            <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
              Eliminar clube
            </button>
          ) : null}
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.back()}>
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
