'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';
import { clubs, profile } from '@/lib/data/repository.js';
import { localClubLicenseActive } from '@/lib/license.js';
import {
  adicionarTreinadorAoClube,
  listarEquipaTecnica,
  removerTreinadorDoClube,
  explicar as explicarAcesso,
} from '@/lib/data/acessos.js';
import { useT } from '@/lib/i18n/index.js';

export default function StaffManagement() {
  const t = useT();
  const { toast, confirmar } = useUI();
  const { session, userId } = useAuth();
  const [equipaTecnica, setEquipaTecnica] = useState({
    pronto: false,
    clube: null,
    membros: [],
    erro: null,
  });
  const [emailTecnico, setEmailTecnico] = useState('');
  const [aConvidar, setAConvidar] = useState(false);
  const [aRemoverTecnico, setARemoverTecnico] = useState(null);

  const carregarEquipaTecnica = useCallback(async () => {
    if (!userId) {
      setEquipaTecnica({ pronto: true, clube: null, membros: [], erro: null });
      return;
    }

    const perfil = await profile.get();
    if (!localClubLicenseActive(perfil)) {
      setEquipaTecnica({ pronto: true, clube: null, membros: [], erro: null });
      return;
    }

    const lista = await clubs.list();
    const clube = lista.find((c) => c.ownerId === userId)
      || lista.find((c) => !c.ownerId && c.dirty);

    if (!clube) {
      setEquipaTecnica({ pronto: true, clube: null, membros: [], erro: null });
      return;
    }

    try {
      setEquipaTecnica({
        pronto: true,
        clube,
        membros: await listarEquipaTecnica(clube.id),
        erro: null,
      });
    } catch (e) {
      setEquipaTecnica({ pronto: true, clube, membros: [], erro: explicarAcesso(e) });
    }
  }, [userId]);

  useEffect(() => {
    carregarEquipaTecnica();
  }, [carregarEquipaTecnica]);

  async function adicionarTecnico(event) {
    event.preventDefault();
    if (!equipaTecnica.clube || aConvidar) return;
    setAConvidar(true);
    try {
      const r = await adicionarTreinadorAoClube({
        clubId: equipaTecnica.clube.id,
        email: emailTecnico,
        accessToken: session?.access_token,
      });
      setEmailTecnico('');
      await carregarEquipaTecnica();
      toast(
        r.newAccount
          ? t('equipaTecnica.conviteEnviado', { email: r.email })
          : t('equipaTecnica.associado', { email: r.email }),
        'ok'
      );
    } catch (e) {
      toast(explicarAcesso(e), 'error');
    } finally {
      setAConvidar(false);
    }
  }

  async function removerTecnico(membro) {
    if (!equipaTecnica.clube || aRemoverTecnico) return;
    const emailOuNome = membro.email || membro.nome;
    const ok = await confirmar(t('equipaTecnica.confirmaRemover', { email: emailOuNome }), {
      okLabel: t('equipaTecnica.remover'),
      title: t('equipaTecnica.titulo'),
    });
    if (!ok) return;

    setARemoverTecnico(membro.userId);
    try {
      await removerTreinadorDoClube({
        clubId: equipaTecnica.clube.id,
        userId: membro.userId,
        accessToken: session?.access_token,
      });
      await carregarEquipaTecnica();
      toast(t('equipaTecnica.removido', { email: emailOuNome }), 'ok');
    } catch (e) {
      toast(explicarAcesso(e), 'error');
    } finally {
      setARemoverTecnico(null);
    }
  }

  if (!equipaTecnica.pronto) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!equipaTecnica.clube) return <p className="muted">{t('equipaTecnica.soLicencaClube')}</p>;

  return (
    <div className="card card--staff">
      <div className="staffcard__head">
        <h2 className="section section--tight">{t('equipaTecnica.titulo')}</h2>
        <span className="staffcard__license">{t('equipaTecnica.licencaClube')}</span>
      </div>
      <p className="muted">{t('equipaTecnica.texto')}</p>

      <form className="form__actions form__actions--left" onSubmit={adicionarTecnico}>
        <input
          className="input"
          type="email"
          value={emailTecnico}
          placeholder={t('equipaTecnica.emailPlaceholder')}
          autoComplete="email"
          onChange={(e) => setEmailTecnico(e.target.value)}
        />
        <button className="btn btn--primary" disabled={aConvidar || !emailTecnico.trim()}>
          {aConvidar ? t('equipaTecnica.aAdicionar') : t('equipaTecnica.adicionar')}
        </button>
      </form>

      {equipaTecnica.erro ? (
        <p className="error">{equipaTecnica.erro}</p>
      ) : equipaTecnica.membros.length ? (
        <div className="stafflist">
          <h3 className="stafflist__title">{t('equipaTecnica.associados')}</h3>
          <ul className="stafflist__items">
            {equipaTecnica.membros.map((m) => (
              <li key={m.userId} className="staffmember">
                <div className="staffmember__main">
                  <div className="staffmember__identity">
                    <strong>{m.nome}</strong>
                    {m.email && m.email !== m.nome ? <p className="muted small">{m.email}</p> : null}
                  </div>
                  <div className="staffmember__meta">
                    <span className="pill">{t('equipaTecnica.treinador')}</span>
                    <span className="pill pill--subtle">
                      {m.contaPorConvite ? t('equipaTecnica.contaPorConvite') : t('equipaTecnica.contaPropria')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--danger stafflist__remove"
                  disabled={aRemoverTecnico === m.userId}
                  onClick={() => removerTecnico(m)}
                >
                  {aRemoverTecnico === m.userId ? t('equipaTecnica.aRemover') : t('equipaTecnica.remover')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted small">{t('equipaTecnica.semTreinadores')}</p>
      )}
    </div>
  );
}
