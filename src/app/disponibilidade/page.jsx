'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Field } from '@/components/bits.jsx';
import { useLocale, useT } from '@/lib/i18n/index.js';
import { PARAM } from '@/lib/routes.js';
import { supabase } from '@/lib/supabase/client.js';

const ESTADOS = ['vai', 'nao', 'pendente'];
const TOKEN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export default function DisponibilidadePage() {
  return <Suspense fallback={null}><FormularioPorLink /></Suspense>;
}

function FormularioPorLink() {
  const token = useSearchParams().get(PARAM.share);
  return <Formulario key={token} token={token} />;
}

function Formulario({ token }) {
  const t = useT();
  const locale = useLocale();
  const [jogo, setJogo] = useState(null);
  const [atleta, setAtleta] = useState('');
  const [estado, setEstado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [nome, setNome] = useState('');
  const [pedirNome, setPedirNome] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState('');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!token || !TOKEN.test(token)) return setJogo({ estado: 'indisponivel' });
      const sb = supabase();
      if (!sb) return setJogo({ estado: 'erro' });
      const { data, error } = await sb.rpc('disponibilidade_publica', { p_token: token });
      if (ativo) setJogo(error || !data ? { estado: 'erro' } : data);
    }
    carregar();
    return () => { ativo = false; };
  }, [token]);

  async function confirmar(event) {
    event.preventDefault();
    if (aGuardar || !atleta || !ESTADOS.includes(estado)) return;
    setErro('');
    setGuardado(false);
    if (!pedirNome) {
      setNome('');
      setPedirNome(true);
      return;
    }
    if (!nome.trim()) return setErro('nomeObrigatorio');
    setAGuardar(true);
    try {
      const sb = supabase();
      const { data, error } = await sb.rpc('disponibilidade_responder', {
        p_token: token, p_atleta: atleta, p_estado: estado,
        p_motivo: estado === 'vai' ? null : motivo.trim(), p_nome: nome.trim(),
      });
      if (error) throw error;
      if (data === 'expirado' || data === 'indisponivel') return setJogo({ estado: data });
      if (data !== 'ok') return setErro('erro');
      setPedirNome(false);
      setNome('');
      setAtleta('');
      setEstado('');
      setMotivo('');
      setGuardado(true);
    } catch {
      setErro('erro');
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <div className="publica">
      <header className="publica__marca">Futsal SubStats</header>
      <h1 className="publica__titulo">{t('disp.titulo')}</h1>
      {!jogo ? <p role="status">{t('comum.aCarregar')}</p> : jogo.estado !== 'ok' ? (
        <p role="status">{t(`disp.${jogo.estado}`)}</p>
      ) : (
        <>
          <section className="card">
            <h2 className="section">{jogo.equipa} vs {jogo.adversario}</h2>
            <p>{[jogo.data && new Date(jogo.data).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }), t(`local.${jogo.local}`), jogo.competicao].filter(Boolean).join(' · ')}</p>
            {jogo.pavilhao ? <p>{jogo.pavilhao}</p> : null}
            {/^https?:\/\//i.test(jogo.link || '') ? (
              <a href={jogo.link} target="_blank" rel="noopener noreferrer">{t('conv.localizacao')}</a>
            ) : null}
          </section>
          <section className="card">
            <form className="form" onSubmit={confirmar}>
              <Field label={t('disp.atleta')}>
                <select className="input" value={atleta} required disabled={pedirNome} onChange={(e) => {
                  setAtleta(e.target.value);
                  setGuardado(false);
                }}>
                  <option value="">{t('disp.escolherAtleta')}</option>
                  {jogo.atletas.map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.nome}</option>)}
                </select>
              </Field>
              <Field label={t('disp.titulo')}>
                <select className="input" value={estado} required disabled={pedirNome} onChange={(e) => setEstado(e.target.value)}>
                  <option value="">{t('disp.escolherEstado')}</option>
                  {ESTADOS.map((valor) => <option key={valor} value={valor}>{t(`disp.${valor}`)}</option>)}
                </select>
              </Field>
              {estado === 'nao' || estado === 'pendente' ? (
                <Field label={t('disp.motivoOpcional')}>
                  <textarea className="input" maxLength={500} value={motivo} disabled={pedirNome} onChange={(e) => setMotivo(e.target.value)} />
                </Field>
              ) : null}
              {pedirNome ? (
                <Field label={t('disp.nome')}>
                  <input className="input" autoFocus required maxLength={100} value={nome} disabled={aGuardar} onChange={(e) => setNome(e.target.value)} />
                </Field>
              ) : null}
              {erro ? <p role="alert">{t(`disp.${erro}`)}</p> : null}
              {guardado ? <p role="status">{t('disp.guardado')}</p> : null}
              <div className="form__actions">
                {pedirNome ? (
                  <button type="button" className="btn btn--ghost" disabled={aGuardar} onClick={() => {
                    setPedirNome(false);
                    setNome('');
                    setErro('');
                  }}>{t('comum.cancelar')}</button>
                ) : null}
                <button type="submit" className="btn btn--primary" disabled={aGuardar || !atleta || !estado}>
                  {aGuardar ? t('comum.aCarregar') : t(pedirNome ? 'comum.guardar' : 'disp.confirmar')}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
