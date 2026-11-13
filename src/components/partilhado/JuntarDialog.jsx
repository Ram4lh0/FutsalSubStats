'use client';

// components/partilhado/JuntarDialog.jsx — a janela do "Juntar": procura o
// jogo do outro aparelho, mostra o que cada um tem e pede confirmação.
//
// Só aparecem jogos do mesmo escalão, com o papel contrário, o mesmo
// adversário e o mesmo dia. Um que ainda não esteja terminado ou sincronizado
// aparece na lista com o motivo, mas não se pode escolher.

import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@/lib/ui.jsx';
import * as sync from '@/lib/data/sync.js';
import { hasRemote } from '@/lib/supabase/client.js';
import { juntar, listarParaJuntar, oQueTem, prepararFusao } from '@/lib/partilhado.js';
import { PAPEL } from '@/domain/partilha.js';
import { REGISTOS } from '@/domain/registos.js';
import { fmt } from '@/domain/clock.js';
import { dateLabel } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';

/** A mensagem de um erro, na língua do ecrã quando ele traz a chave. */
export function textoDoErro(t, err) {
  return err?.chave ? t(err.chave) : err?.message || String(err);
}

export default function JuntarDialog({ matchId, userId, email, onClose }) {
  const t = useT();
  const [lista, setLista] = useState(null); // null = a procurar
  const [escolha, setEscolha] = useState(null); // { base, outro, plano }
  const [erro, setErro] = useState(null);
  const [aJuntar, setAJuntar] = useState(false);

  const procurar = useCallback(async () => {
    setLista(null);
    setErro(null);
    // O jogo do outro aparelho só existe aqui depois de uma descarga. Sem rede
    // (ou sem servidor) procura-se no que já cá está.
    if (hasRemote() && userId && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      try {
        await sync.pull(userId);
      } catch {
        /* sem rede a meio: mostra-se o que houver */
      }
    }
    try {
      const { lista: candidatos } = await listarParaJuntar(matchId);
      setLista(candidatos);
    } catch (err) {
      setErro(textoDoErro(t, err));
      setLista([]);
    }
  }, [matchId, userId, t]);

  useEffect(() => {
    procurar();
  }, [procurar]);

  async function escolher(candidato) {
    setErro(null);
    try {
      setEscolha(await prepararFusao(matchId, candidato.match.id));
    } catch (err) {
      setErro(textoDoErro(t, err));
    }
  }

  async function confirmar() {
    if (aJuntar || !escolha) return;
    setAJuntar(true);
    setErro(null);
    try {
      const feito = await juntar(escolha.base.match.id, escolha.outro.match.id);
      // Não se espera pelo envio para fechar: o que conta já está gravado aqui.
      sync.saveNow(userId, email);
      onClose(feito);
    } catch (err) {
      setErro(textoDoErro(t, err));
      setAJuntar(false);
    }
  }

  const linhaDe = (tem) =>
    tem.papel === PAPEL.TEMPOS
      ? t('partilhado.tem.tempos', {
          nos: tem.resultado.nos,
          eles: tem.resultado.eles,
          tempo: fmt(tem.duracaoMs),
          subs: tem.substituicoes,
          golos: tem.golos,
          cartoes: tem.cartoes,
        })
      : t('partilhado.tem.registos', { n: tem.registos });

  return (
    <Dialog title={t('partilhado.juntar.titulo')} onClose={() => onClose(null)} wide>
      {erro ? <p className="juntar__erro" role="alert">{erro}</p> : null}

      {escolha ? (
        <>
          <p className="modal__text">{t('partilhado.juntar.confirmaTexto')}</p>
          <div className="juntar__lados">
            <div className="juntar__lado">
              <h3>{t('partilhado.papel.TEMPOS')}</h3>
              <p>{linhaDe(oQueTem(escolha.base))}</p>
              <p className="muted small">{t('partilhado.tem.convocados', { n: Object.keys(escolha.base.state.players).length })}</p>
              {escolha.plano.registosNaBase ? (
                <p className="muted small">{t('partilhado.aviso.registosNaBase', { n: escolha.plano.registosNaBase })}</p>
              ) : null}
            </div>
            <div className="juntar__lado">
              <h3>{t('partilhado.papel.REGISTOS')}</h3>
              <p>{t('partilhado.tem.registos', { n: escolha.plano.total })}</p>
              <ul className="juntar__tipos">
                {REGISTOS.filter((id) => escolha.plano.porRegisto[id]).map((id) => (
                  <li key={id}>
                    <span>{t(`registos.nome.${id}`)}</span>
                    <strong>{escolha.plano.porRegisto[id]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {escolha.plano.total === 0 ? <p className="juntar__aviso">{t('partilhado.aviso.semRegistos')}</p> : null}
          {escolha.plano.foraDaConvocatoria.length ? (
            <p className="juntar__aviso">
              {t('partilhado.aviso.foraDaConvocatoria', {
                jogadores: escolha.plano.foraDaConvocatoria
                  .map((j) => `#${j.number ?? '?'} ${j.name || ''}`.trim())
                  .join(', '),
              })}
            </p>
          ) : null}
          {escolha.plano.golosSemPar ? (
            <p className="juntar__aviso">{t('partilhado.aviso.golosSemPar', { n: escolha.plano.golosSemPar })}</p>
          ) : null}
          {escolha.plano.semHora ? (
            <p className="juntar__aviso">{t('partilhado.aviso.semHora', { n: escolha.plano.semHora })}</p>
          ) : null}

          <footer className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setEscolha(null)} disabled={aJuntar}>
              {t('comum.voltar')}
            </button>
            <button type="button" className="btn btn--primary" onClick={confirmar} disabled={aJuntar} aria-busy={aJuntar}>
              {aJuntar ? t('partilhado.juntar.aJuntar') : t('partilhado.juntar.confirmar')}
            </button>
          </footer>
        </>
      ) : lista === null ? (
        <p className="muted">{t('partilhado.juntar.aProcurar')}</p>
      ) : (
        <>
          {lista.length ? (
            <>
              <p className="modal__text">{t('partilhado.juntar.escolha')}</p>
              <div className="picklist">
                {lista.map((c) => (
                  <button
                    key={c.match.id}
                    type="button"
                    className="picklist__item juntar__item"
                    disabled={Boolean(c.motivo)}
                    onClick={() => escolher(c)}
                  >
                    <span className="juntar__itemtopo">
                      <strong>{t(`partilhado.papel.${c.partilha.papel}`)}</strong>
                      <span>{c.match.opponentName}</span>
                      <span className="muted">{dateLabel(c.match.scheduledAt)}</span>
                    </span>
                    <span className="muted small">
                      {linhaDe(oQueTem(c))}
                      {c.match.createdAt ? ` · ${t('partilhado.juntar.criadoEm', { quando: dateLabel(c.match.createdAt) })}` : ''}
                    </span>
                    {c.motivo ? <span className="juntar__motivo">{t(`partilhado.motivo.${c.motivo}`)}</span> : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="modal__text">{t('partilhado.juntar.vazio')}</p>
          )}
          <footer className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={procurar}>
              {t('partilhado.juntar.procurarOutraVez')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onClose(null)}>
              {t('comum.fechar')}
            </button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
