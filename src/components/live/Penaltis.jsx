'use client';

// components/live/Penaltis.jsx — o desempate por penáltis, no mesmo separador
// do jogo mas com uma interface só para isto (pedido de 07/11/2026).
//
// Dois passos:
//  1. A ordem dos nossos marcadores e quem bate primeiro. Vem já preenchida
//     com todos os que podem bater (regra do futsal: todos os convocados não
//     expulsos), por ordem de quem acabou em campo; o treinador tira, junta e
//     muda a ordem.
//  2. Os penáltis, um a um. Nosso: para onde rematou e se foi golo. Deles: para
//     onde foi a bola, para onde se atirou o nosso guarda-redes e se foi golo.
//     A app diz de quem é a vez e quando está decidido (5 para cada lado, depois
//     morte súbita) — ver domain/prolongamento.js.

import { useMemo, useState } from 'react';
import Baliza from '@/components/penaltis/Baliza.jsx';
import * as A from '@/domain/actions.js';
import {
  resumoPenaltis,
  elegiveisPenaltis,
  guardaRedesDosPenaltis,
  teveProlongamento,
  RESULTADO_PENALTI,
  ZONA_FORA,
  PENALTIS_POR_EQUIPA,
} from '@/domain/prolongamento.js';
import { useT } from '@/lib/i18n/index.js';

export default function Penaltis({ state, ourName, opponentName, commit, desfazer, terminar, historico }) {
  const t = useT();
  const pen = state.penaltis;
  const [aEditarOrdem, setAEditarOrdem] = useState(false);

  if (!pen.iniciados || aEditarOrdem) {
    return (
      <Ordem
        state={state}
        ourName={ourName}
        opponentName={opponentName}
        aEditar={pen.iniciados}
        onCancelar={() => setAEditarOrdem(false)}
        onComecar={async (ordem, primeiro) => {
          await commit(A.startShootout(state, { ordem, primeiro }));
          setAEditarOrdem(false);
        }}
        historico={historico}
        terminar={terminar}
      />
    );
  }

  return (
    <Disputa
      state={state}
      ourName={ourName}
      opponentName={opponentName}
      commit={commit}
      desfazer={desfazer}
      terminar={terminar}
      historico={historico}
      alterarOrdem={() => setAEditarOrdem(true)}
      t={t}
    />
  );
}

/* ----------------------------------------------------------------- ordem */

function Ordem({ state, ourName, opponentName, aEditar, onCancelar, onComecar, historico, terminar }) {
  const t = useT();
  const elegiveis = useMemo(() => elegiveisPenaltis(state), [state]);
  const porId = Object.fromEntries(elegiveis.map((p) => [p.playerId, p]));
  const [ordem, setOrdem] = useState(() => {
    const ja = (state.penaltis.ordem || []).filter((id) => porId[id]);
    return ja.length ? ja : elegiveis.map((p) => p.playerId);
  });
  const [primeiro, setPrimeiro] = useState(state.penaltis.primeiro || 'US');
  const fora = elegiveis.filter((p) => !ordem.includes(p.playerId));

  const mover = (i, d) =>
    setOrdem((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const n = o.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <div className="live live--pause pen">
      <header className="live__head pen__head">
        <div className="pen__titulo">
          <span className="clockbox__period">{t('penaltis.titulo')}</span>
          <span className="pen__jogo">
            {t('penaltis.resultadoJogo', {
              nos: ourName,
              golosNos: state.teamScore,
              golosEles: state.opponentScore,
              eles: opponentName,
            })}
            {teveProlongamento(state) ? ` ${t('prolong.ap')}` : ''}
          </span>
        </div>
      </header>

      <section className="halftime">
        <div className="halftime__bloco">
          <h2 className="section section--tight">{t('penaltis.ordemTitulo')}</h2>
          <p className="muted small">{t('penaltis.ordemDica')}</p>
          <ol className="pen__ordem">
            {ordem.map((id, i) => {
              const p = porId[id];
              if (!p) return null;
              return (
                <li key={id} className="pen__ordemlinha">
                  <span className="pen__ordemnum">{i + 1}.</span>
                  <span className="pen__ordemnome">
                    #{p.number} {p.name}
                  </span>
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={t('penaltis.subir')}>
                    ↑
                  </button>
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={() => mover(i, 1)} disabled={i === ordem.length - 1} aria-label={t('penaltis.descer')}>
                    ↓
                  </button>
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setOrdem((o) => o.filter((x) => x !== id))} aria-label={t('penaltis.tirar')}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
          {fora.length ? (
            <div className="pen__fora">
              <span className="muted small">{t('penaltis.juntar')}</span>
              {fora.map((p) => (
                <button key={p.playerId} type="button" className="btn btn--ghost btn--tiny" onClick={() => setOrdem((o) => [...o, p.playerId])}>
                  + #{p.number} {p.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="halftime__bloco">
          <h2 className="section section--tight">{t('penaltis.quemComeca')}</h2>
          <div className="pen__seg">
            <button type="button" className={`btn ${primeiro === 'US' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setPrimeiro('US')}>
              {ourName}
            </button>
            <button type="button" className={`btn ${primeiro === 'THEM' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setPrimeiro('THEM')}>
              {opponentName}
            </button>
          </div>
          <p className="muted small">{t('penaltis.regras')}</p>
        </div>

        <div className="halftime__bloco pen__acoes">
          {aEditar ? (
            <button type="button" className="btn btn--ghost" onClick={onCancelar}>
              {t('comum.cancelar')}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--tiny" onClick={() => terminar(false)}>
              {t('acao.terminarJogo')}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--tiny" onClick={historico}>
            {t('acao.historico')}
          </button>
          <span className="live__spacer" />
          <button
            type="button"
            className="btn btn--primary btn--big"
            disabled={!ordem.length}
            onClick={() => onComecar(ordem, primeiro)}
          >
            {aEditar ? t('penaltis.guardarOrdem') : t('penaltis.comecar')}
          </button>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- disputa */

function Disputa({ state, ourName, opponentName, commit, desfazer, terminar, historico, alterarOrdem, t }) {
  const pen = state.penaltis;
  const r = resumoPenaltis(pen);
  const nome = (id) => {
    const p = state.players[id];
    return p ? `#${p.number} ${p.name}` : '—';
  };
  const ultimo = pen.kicks[pen.kicks.length - 1] || null;

  return (
    <div className="live live--pause pen">
      <header className="live__head pen__head">
        <div className="pen__titulo">
          <span className="clockbox__period">{t('penaltis.titulo')}</span>
          <span className="pen__jogo">
            {t('penaltis.resultadoJogo', {
              nos: ourName,
              golosNos: state.teamScore,
              golosEles: state.opponentScore,
              eles: opponentName,
            })}
            {teveProlongamento(state) ? ` ${t('prolong.ap')}` : ''}
          </span>
        </div>
        <div className="pen__placar">
          <span className="pen__equipa">{ourName}</span>
          <span className="pen__golos">{r.nos}</span>
          <span className="pen__traco">—</span>
          <span className="pen__golos">{r.eles}</span>
          <span className="pen__equipa">{opponentName}</span>
        </div>
        <div className="pen__sequencias">
          <Sequencia rotulo={ourName} kicks={r.seqNos} />
          <Sequencia rotulo={opponentName} kicks={r.seqEles} />
          {r.morteSubita && !r.decidido ? <span className="pill pill--paused">{t('penaltis.morteSubita')}</span> : null}
        </div>
      </header>

      <section className="halftime">
        {r.decidido ? (
          <div className={`halftime__bloco pen__decidido ${r.vencedor === 'US' ? 'is-win' : 'is-loss'}`}>
            <h2 className="section section--tight">
              {r.vencedor === 'US'
                ? t('penaltis.ganhamos', { nos: r.nos, eles: r.eles })
                : t('penaltis.perdemos', { nos: r.nos, eles: r.eles })}
            </h2>
            <button type="button" className="btn btn--primary btn--big" onClick={() => terminar(true)}>
              {t('acao.terminarJogo')}
            </button>
          </div>
        ) : (
          <Proximo
            key={pen.kicks.length}
            state={state}
            r={r}
            ourName={ourName}
            opponentName={opponentName}
            commit={commit}
            t={t}
          />
        )}

        <div className="halftime__bloco">
          <div className="halftime__title">
            <h3 className="section section--tight">{t('penaltis.lista')}</h3>
            <span className="live__spacer" />
            {ultimo ? (
              <button type="button" className="btn btn--ghost btn--tiny" onClick={() => desfazer(ultimo)}>
                {t('penaltis.desfazerUltimo')}
              </button>
            ) : null}
          </div>
          {pen.kicks.length ? (
            <ol className="pen__lista">
              {pen.kicks.map((k, i) => (
                <li key={k.eventId || i} className={`pen__linha pen__linha--${(k.resultado || '').toLowerCase()}`}>
                  <span className="pen__linhanum">{i + 1}.</span>
                  <span className="pen__linhaquem">
                    {k.team === 'US'
                      ? `${ourName} · ${nome(k.playerId)}`
                      : `${opponentName}${k.number ? ` · #${k.number}` : ''}${k.goalkeeperId ? ` · ${t('penaltis.gr')} ${nome(k.goalkeeperId)}` : ''}`}
                  </span>
                  <span className="pen__linhazona muted">
                    {k.zona ? t(`penaltis.zona.${k.zona}`) : ''}
                    {k.team === 'THEM' && k.mergulho ? ` · ${t('penaltis.grFoi', { zona: t(`penaltis.zona.${k.mergulho}`) })}` : ''}
                  </span>
                  <span className="pen__linhares">{k.resultado ? t(`penaltis.res.${k.resultado}`) : ''}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t('penaltis.nenhum')}</p>
          )}
        </div>

        <div className="halftime__bloco pen__acoes">
          <button type="button" className="btn btn--ghost btn--tiny" onClick={alterarOrdem}>
            {t('penaltis.alterarOrdem')}
          </button>
          <button type="button" className="btn btn--ghost btn--tiny" onClick={historico}>
            {t('acao.historico')}
          </button>
          <span className="live__spacer" />
          {r.decidido ? null : (
            <button type="button" className="btn btn--ghost btn--tiny" onClick={() => terminar(false)}>
              {t('acao.terminarJogo')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Sequencia({ rotulo, kicks }) {
  const n = Math.max(PENALTIS_POR_EQUIPA, kicks.length);
  return (
    <div className="pen__seq">
      <span className="pen__seqnome">{rotulo}</span>
      {Array.from({ length: n }, (_, i) => {
        const k = kicks[i];
        const cls = !k ? 'vazio' : k.resultado === RESULTADO_PENALTI.GOLO ? 'golo' : 'falhou';
        return (
          <span key={i} className={`pen__bola pen__bola--${cls}`}>
            {!k ? '' : k.resultado === RESULTADO_PENALTI.GOLO ? '✓' : '✕'}
          </span>
        );
      })}
    </div>
  );
}

/** O penálti a registar. Remonta a cada penálti (key), por isso parte limpo. */
function Proximo({ state, r, ourName, opponentName, commit, t }) {
  const [equipa, setEquipa] = useState(r.proximaEquipa || 'US');
  const [marcador, setMarcador] = useState(r.proximoMarcador || '');
  const [gr, setGr] = useState(guardaRedesDosPenaltis(state) || '');
  const [numero, setNumero] = useState('');
  const [zona, setZona] = useState(null);
  const [mergulho, setMergulho] = useState(null);
  const [aGravar, setAGravar] = useState(false);
  const elegiveis = elegiveisPenaltis(state);
  const nosso = equipa === 'US';

  async function registar(resultado) {
    if (aGravar) return;
    setAGravar(true);
    try {
      await commit(
        A.shootoutKick(state, {
          team: equipa,
          playerId: nosso ? marcador || null : null,
          goalkeeperId: nosso ? null : gr || null,
          number: !nosso && numero.trim() ? numero.trim() : null,
          zona,
          mergulho: nosso ? null : mergulho,
          resultado,
        })
      );
    } finally {
      setAGravar(false);
    }
  }

  const foraEscolhido = zona === ZONA_FORA;

  return (
    <div className="halftime__bloco pen__proximo">
      <div className="halftime__title">
        <h2 className="section section--tight">
          {t('penaltis.proximo', { n: (nosso ? r.batidosNos : r.batidosEles) + 1 })}
        </h2>
        <span className="live__spacer" />
        <div className="pen__seg pen__seg--peq">
          <button type="button" className={`btn btn--tiny ${nosso ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setEquipa('US')}>
            {ourName}
          </button>
          <button type="button" className={`btn btn--tiny ${!nosso ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setEquipa('THEM')}>
            {opponentName}
          </button>
        </div>
      </div>

      {nosso ? (
        <label className="pen__campo">
          <span>{t('penaltis.marcador')}</span>
          <select className="input" value={marcador} onChange={(e) => setMarcador(e.target.value)}>
            <option value="">{t('penaltis.semMarcador')}</option>
            {elegiveis.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="pen__campos">
          <label className="pen__campo">
            <span>{t('penaltis.nossoGr')}</span>
            <select className="input" value={gr} onChange={(e) => setGr(e.target.value)}>
              <option value="">—</option>
              {elegiveis.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pen__campo pen__campo--num">
            <span>{t('penaltis.numeroDeles')}</span>
            <input className="input" inputMode="numeric" maxLength={3} value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} placeholder="—" />
          </label>
        </div>
      )}

      <div className="pen__balizas">
        <Baliza
          titulo={nosso ? t('penaltis.ondeRematou') : t('penaltis.ondeFoiBola')}
          escolhida={zona}
          onEscolher={setZona}
          modo="bola"
        />
        {nosso ? null : (
          <Baliza
            titulo={t('penaltis.ondeGr')}
            escolhida={mergulho}
            onEscolher={setMergulho}
            comFora={false}
            modo="gr"
          />
        )}
      </div>
      <p className="muted small">{t('penaltis.vistaDeQuemRemata')}</p>

      <div className="pen__resultado">
        <button type="button" className="btn btn--big pen__btn pen__btn--golo" disabled={aGravar || foraEscolhido} onClick={() => registar(RESULTADO_PENALTI.GOLO)}>
          {t('penaltis.res.GOLO')}
        </button>
        <button type="button" className="btn btn--big pen__btn pen__btn--defendido" disabled={aGravar || foraEscolhido} onClick={() => registar(RESULTADO_PENALTI.DEFENDIDO)}>
          {t('penaltis.res.DEFENDIDO')}
        </button>
        <button type="button" className="btn btn--big pen__btn pen__btn--fora" disabled={aGravar} onClick={() => registar(RESULTADO_PENALTI.FORA)}>
          {t('penaltis.res.FORA')}
        </button>
      </div>
    </div>
  );
}
