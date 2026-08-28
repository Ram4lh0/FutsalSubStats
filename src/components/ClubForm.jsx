'use client';

// components/ClubForm.jsx — dados do clube, na criação e na edição.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import { SoLeitura } from './bits.jsx';
import EscolherFoto from './EscolherFoto.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { clubs } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { rotas } from '@/lib/routes.js';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { useT } from '@/lib/i18n/index.js';


const VAZIO = {
  name: '',
  shortName: '',
  logoUrl: null,
  currentSeason: '',
  primaryColor: '#22c55e',
  secondaryColor: '#0f172a',
};

export default function ClubForm({ clubId }) {
  const router = useRouter();
  const t = useT();
  const soLeitura = useSoLeitura();
  const { toast, confirmar } = useUI();
  const { userId, user } = useAuth();
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!clubId);
  const [aGuardar, setAGuardar] = useState(false);
  // Ver o comentário igual no `TeamForm`: quem edita o clube a partir do painel
  // quer voltar ao painel, não entrar no clube.
  const { back } = useRouteParams();
  const voltarPara = back || (clubId ? rotas.clube(clubId) : rotas.dashboard());

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
    if (!(form.name || '').trim()) return toast(t('clube.precisaNome'), 'error');
    setAGuardar(true);
    const payload = {
      name: (form.name || '').trim(),
      shortName: (form.shortName || '').trim() || null,
      logoUrl: form.logoUrl || null,
      currentSeason: (form.currentSeason || '').trim() || null,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
    };
    try {
      const club = clubId ? await clubs.update(clubId, payload) : await clubs.create(payload);
      sync.saveNow(userId, user?.email);
      toast(t('clube.guardado'), 'ok');
      router.push(clubId ? voltarPara : rotas.clube(club.id));
    } catch (err) {
      // Uma recusa nossa não é uma falha de gravação, e não pode usar a mesma
      // frase: "guardado só neste dispositivo" a quem tentou criar um segundo
      // clube seria mentira e ainda por cima tranquilizadora.
      toast(err.chave ? t(err.chave) : t('clube.naoGuardou', { erro: err.message }), 'error');
    } finally {
      setAGuardar(false);
    }
  }

  async function eliminar() {
    const ok = await confirmar(t('clube.confirmaApagar', { nome: form.name }), {
      okLabel: t('clube.apagarBotao'),
    });
    if (!ok) return;
    await clubs.archive(clubId);
    toast(t('clube.apagado'), 'ok');
    router.push(rotas.dashboard());
  }

  if (!pronto) return <p className="muted">{t('comum.aCarregar')}</p>;

  if (soLeitura) return <SoLeitura titulo={t('clube.titulo')} />;

  return (
    <>
      <PageHead
        title={clubId ? t('clube.editarTitulo') : t('clube.criarTitulo')}
        backTo={voltarPara}
      />
      <form className="card form form--safe-actions" onSubmit={guardar}>
        <EscolherFoto
          nome={form.name}
          cor={form.primaryColor}
          valor={form.logoUrl}
          onChange={(logoUrl) => setForm((f) => ({ ...f, logoUrl }))}
        />
        <div className="form__row">
          <label className="field">
            <span className="field__label">{t('clube.nome')}</span>
            <input className="input" placeholder={t('clube.nome')} {...campo('name')} />
          </label>
          <label className="field">
            <span className="field__label">{t('clube.apelido')}</span>
            <input
              className="input"
              placeholder={t('clube.apelidoPlaceholder')}
              maxLength={12}
              {...campo('shortName')}
            />
            <span className="field__hint">{t('clube.apelidoDica')}</span>
          </label>
        </div>

        <label className="field">
          <span className="field__label">{t('clube.epocaAtual')}</span>
          <input className="input" placeholder="2025/26" {...campo('currentSeason')} />
          <span className="field__hint">{t('clube.epocaDica')}</span>
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">{t('clube.corPrincipal')}</span>
            <input className="input input--color" type="color" {...campo('primaryColor')} />
          </label>
          <label className="field">
            <span className="field__label">{t('clube.corSecundaria')}</span>
            <input className="input input--color" type="color" {...campo('secondaryColor')} />
          </label>
        </div>

        <div className="form__actions">
          {clubId ? (
            <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
              {t('clube.eliminar')}
            </button>
          ) : null}
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.push(voltarPara)}>
            {t('comum.cancelar')}
          </button>
          <button className="btn btn--primary" type="submit" disabled={aGuardar} data-tour="club-save">
            {aGuardar ? t('comum.aGuardar') : t('comum.guardar')}
          </button>
        </div>
      </form>
    </>
  );
}
