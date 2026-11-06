'use client';

// components/treino/UnidadeTreino.jsx — a UT de um treino: tema, objetivos,
// exercícios por parte (aquecimento, parte principal, retorno à calma) e
// material. Grava a cada mudança; não há botão "Guardar" para esquecer.
//
// Cada exercício pode levar jogadas do quadro tático do escalão: ficam como
// etiquetas (tocar abre a jogada) e entram no PDF da UT com imagem e link.

import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/bits.jsx';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { rotas } from '@/lib/routes.js';
import { PARTES_UT, exercicioNovo, minutosUT, utVazia } from '@/lib/data/unidadeTreino.js';
import { useT } from '@/lib/i18n/index.js';

const DURACOES_EX = [5, 10, 15, 20, 25, 30, 40, 45];

export default function UnidadeTreino({ ut, onMudar, duracaoTreino, soLeitura, jogadas = [], clubId, teamId }) {
  const t = useT();
  const ui = useUI();
  const router = useRouter();
  const porId = new Map(jogadas.map((j) => [j.id, j]));

  async function escolherJogadas(ex) {
    const ids = await ui.open((close) => (
      <EscolherJogadas jogadas={jogadas} inicial={ex.jogadas || []} onFechar={close} />
    ));
    if (ids) mudarEx(ex.id, { jogadas: ids });
  }
  const v = ut || utVazia();
  const mudar = (patch) => onMudar({ ...v, ...patch });
  const mudarEx = (id, patch) => mudar({ exercicios: v.exercicios.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const tirarEx = (id) => mudar({ exercicios: v.exercicios.filter((e) => e.id !== id) });
  const moverEx = (id, passo) => {
    const lista = [...v.exercicios];
    const i = lista.findIndex((e) => e.id === id);
    const parte = lista[i].parte;
    // Troca com o vizinho da mesma parte, saltando os das outras.
    let j = i + passo;
    while (j >= 0 && j < lista.length && lista[j].parte !== parte) j += passo;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    mudar({ exercicios: lista });
  };

  const total = minutosUT(v);
  const folga = duracaoTreino - total;

  return (
    <div className="ut">
      <section className="card">
        <div className="form">
          <Field label={t('ut.tema')}>
            <input
              className="input"
              type="text"
              maxLength={120}
              placeholder={t('ut.temaExemplo')}
              value={v.tema}
              disabled={soLeitura}
              onChange={(e) => mudar({ tema: e.target.value })}
            />
          </Field>
          <Field label={t('ut.objetivos')}>
            <textarea
              className="input tnotas"
              rows={3}
              maxLength={1500}
              placeholder={t('ut.objetivosExemplo')}
              value={v.objetivos}
              disabled={soLeitura}
              onChange={(e) => mudar({ objetivos: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="card">
        <div className="tpresh">
          <h2 className="section section--tight">{t('ut.exercicios')}</h2>
          <span className="toolbar__spacer" />
          <span className={`ut__tempo ${folga < 0 ? 'is-acima' : folga === 0 ? 'is-certo' : ''}`}>
            {t('ut.tempo', { n: total, total: duracaoTreino })}
          </span>
        </div>

        {PARTES_UT.map((parte) => {
          const daParte = v.exercicios.filter((e) => e.parte === parte);
          if (soLeitura && !daParte.length) return null;
          const min = daParte.reduce((s, e) => s + (Number(e.duracao) || 0), 0);
          return (
            <div key={parte} className={`ut__parte ut__parte--${parte}`}>
              <div className="ut__partehead">
                <h3>{t(`ut.parte.${parte}`)}</h3>
                {daParte.length ? <span className="muted">{t('treino.duracaoMin', { n: min })}</span> : null}
              </div>
              {daParte.map((ex, i) => (
                <div key={ex.id} className="ut__ex">
                  <div className="ut__exhead">
                    <span className="ut__exnum">{i + 1}</span>
                    <input
                      className="input input--tiny ut__exnome"
                      type="text"
                      maxLength={100}
                      placeholder={t('ut.exNomeExemplo')}
                      value={ex.nome}
                      disabled={soLeitura}
                      onChange={(e) => mudarEx(ex.id, { nome: e.target.value })}
                    />
                    <div className="ut__exctl">
                      <select
                        className="input input--tiny ut__exmin"
                        value={ex.duracao}
                        disabled={soLeitura}
                        aria-label={t('treino.duracao')}
                        onChange={(e) => mudarEx(ex.id, { duracao: Number(e.target.value) })}
                      >
                        {[...new Set([...DURACOES_EX, Number(ex.duracao) || 10])].sort((a, b) => a - b).map((m) => (
                          <option key={m} value={m}>
                            {t('treino.duracaoMin', { n: m })}
                          </option>
                        ))}
                      </select>
                      {soLeitura ? null : (
                        <div className="ut__exacoes">
                          <button type="button" className="tpbtn" aria-label={t('ut.subir')} onClick={() => moverEx(ex.id, -1)}>↑</button>
                          <button type="button" className="tpbtn" aria-label={t('ut.descer')} onClick={() => moverEx(ex.id, 1)}>↓</button>
                          <button type="button" className="tpbtn ut__tirar" aria-label={t('ut.tirar')} onClick={() => tirarEx(ex.id)}>×</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ut__excorpo">
                    <TextoQueCresce
                      className="input ut__exdesc"
                      maxLength={1500}
                      placeholder={t('ut.exDescExemplo')}
                      value={ex.descricao}
                      disabled={soLeitura}
                      onChange={(e) => mudarEx(ex.id, { descricao: e.target.value })}
                    />
                    {(ex.jogadas || []).length || !soLeitura ? (
                      <div className="ut__jogadas">
                        {(ex.jogadas || []).map((id) => {
                          const jg = porId.get(id);
                          return (
                            <span key={id} className={`ut__jogada ${jg ? '' : 'is-falta'}`}>
                              <button
                                type="button"
                                className="ut__jogadanome"
                                disabled={!jg}
                                onClick={() => router.push(rotas.jogada(clubId, teamId, id))}
                              >
                                ▶ {jg ? jg.title : t('ut.jogadaApagada')}
                              </button>
                              {soLeitura ? null : (
                                <button
                                  type="button"
                                  className="ut__jogadatirar"
                                  aria-label={t('ut.tirarJogada')}
                                  onClick={() => mudarEx(ex.id, { jogadas: ex.jogadas.filter((x) => x !== id) })}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {soLeitura ? null : (
                          <button type="button" className="btn btn--ghost btn--tiny" onClick={() => escolherJogadas(ex)}>
                            {t('ut.ligarJogada')}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {soLeitura ? null : (
                <button
                  type="button"
                  className="btn btn--ghost btn--tiny ut__mais"
                  onClick={() => mudar({ exercicios: [...v.exercicios, exercicioNovo(parte)] })}
                >
                  {t('ut.acrescentar')}
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section className="card">
        <Field label={t('ut.material')}>
          <input
            className="input"
            type="text"
            maxLength={200}
            placeholder={t('ut.materialExemplo')}
            value={v.material}
            disabled={soLeitura}
            onChange={(e) => mudar({ material: e.target.value })}
          />
        </Field>
      </section>
    </div>
  );
}

function EscolherJogadas({ jogadas, inicial, onFechar }) {
  const t = useT();
  const [sel, setSel] = useState(inicial);
  const alternar = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <Dialog title={t('ut.jogadasDoQuadro')} onClose={() => onFechar(null)}>
      {jogadas.length ? (
        <ul className="ut__lista">
          {jogadas.map((j) => (
            <li key={j.id}>
              <label className="ut__opcao">
                <input type="checkbox" checked={sel.includes(j.id)} onChange={() => alternar(j.id)} />
                <span>
                  <strong>{j.title}</strong>
                  <small className="muted">{t(`tatica.categoria.${j.category}`)}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('ut.semJogadas')}</p>
      )}
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={() => onFechar(null)}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" onClick={() => onFechar(sel)}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}

/**
 * Uma caixa de texto que cresce com o que lá está escrito: no telemóvel a
 * descrição do exercício via-se cortada a meio, com duas linhas fixas.
 */
function TextoQueCresce({ value, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const acertar = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    acertar();
    // Rodar o telemóvel muda a largura e, com ela, o número de linhas.
    window.addEventListener('resize', acertar);
    return () => window.removeEventListener('resize', acertar);
  }, [value]);
  return <textarea ref={ref} rows={2} value={value} {...props} />;
}
