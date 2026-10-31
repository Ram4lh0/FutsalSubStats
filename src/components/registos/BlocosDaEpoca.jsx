'use client';

// components/registos/BlocosDaEpoca.jsx — os registos extra no painel da
// época: remates e eficácia, recuperações, perdas de bola e passes falhados
// por jogador, as bolas paradas e o mapa da época.
//
// Cada bloco só aparece se houver pelo menos um jogo terminado com esse
// registo. Um escalão sem registos não vê nada de novo no painel.
//
// Recebe o `Bloco` da página para os blocos se comportarem como os outros
// (minimizar, mesmo título).

import { useMemo, useState } from 'react';
import { StatCard } from '@/components/bits.jsx';
import { BarrasH } from '@/components/stats/graficos.jsx';
import { CampoSvg } from './CampoToque.jsx';
import { REGISTO } from '@/domain/registos.js';
import {
  REGISTOS_BOLA_PARADA,
  bolasParadas,
  eficacia,
  mapaDaEpoca,
  passesDaEpoca,
  passesPorJogador,
  perdasDaEpoca,
  perdasPorJogador,
  recuperacoesPorJogador,
  registosDaEpoca,
  rematesPorJogo,
  rematesAdvPorJogo,
  rematesAdvDaEpoca,
  rematesAdvSimplesDaEpoca,
} from '@/domain/dashboard.js';
import { useT } from '@/lib/i18n/index.js';

const NO_MAPA = [REGISTO.REMATE, REGISTO.REMATE_ADV, REGISTO.RECUPERACAO, REGISTO.DEFESA_GR, REGISTO.FORA];

export default function BlocosDaEpoca({ entries, Bloco }) {
  const t = useT();
  const tipos = useMemo(() => registosDaEpoca(entries), [entries]);
  const remates = useMemo(() => rematesPorJogo(entries), [entries]);
  const efi = useMemo(() => eficacia(entries), [entries]);
  const recup = useMemo(() => recuperacoesPorJogador(entries), [entries]);
  const perdas = useMemo(() => perdasPorJogador(entries), [entries]);
  const perdasEquipa = useMemo(() => perdasDaEpoca(entries), [entries]);
  const rematesAdv = useMemo(() => rematesAdvPorJogo(entries), [entries]);
  const adv = useMemo(() => rematesAdvDaEpoca(entries), [entries]);
  const advSimples = useMemo(() => rematesAdvSimplesDaEpoca(entries), [entries]);
  const passes = useMemo(() => passesPorJogador(entries), [entries]);
  const passesEquipa = useMemo(() => passesDaEpoca(entries), [entries]);
  const bp = useMemo(() => bolasParadas(entries), [entries]);
  const temBolaParada = REGISTOS_BOLA_PARADA.some((id) => tipos.has(id));
  const golosEm = (x) => t('registos.golosEm', { golos: x.golos, total: x.total });
  // Só os registos com pontos no campo: sem zona (opção do escalão) não há mapa.
  const filtros = useMemo(
    () => NO_MAPA.filter((id) => tipos.has(id) && mapaDaEpoca(entries, id).length),
    [entries, tipos]
  );
  const [escolhido, setFiltro] = useState(null);
  const filtro = filtros.includes(escolhido) ? escolhido : filtros[0] || null;
  const pontos = useMemo(() => (filtro ? mapaDaEpoca(entries, filtro) : []), [entries, filtro]);

  if (!tipos.size) return null;

  return (
    <>
      {tipos.has(REGISTO.REMATE) ? (
        <Bloco titulo={t('registos.epoca.remates')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.epoca.rematesPorJogo')}
              value={efi.rematesPorJogo.toFixed(1)}
              hint={t('painelv.emJogos', { n: efi.jogos })}
            />
            {/* Com remates só contados (sem resultado), "à baliza" e a
                eficácia não querem dizer nada: ficam de fora. */}
            {efi.semResultado ? null : (
              <>
                <StatCard
                  label={t('registos.col.aBaliza')}
                  value={efi.aBaliza}
                  hint={t('registos.aBalizaDe', { n: efi.aBaliza, total: efi.remates })}
                />
                <StatCard
                  label={t('registos.epoca.eficacia')}
                  value={efi.percentagem == null ? '—' : `${efi.percentagem}%`}
                  hint={t('registos.epoca.eficaciaDetalhe', { golos: efi.golos, aBaliza: efi.aBaliza })}
                />
              </>
            )}
          </div>
          <BarrasH
            linhas={remates.map((j) => ({
              rotulo: j.adversario,
              valor: j.remates,
              texto: j.semResultado
                ? String(j.remates)
                : t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
            }))}
          />
        </Bloco>
      ) : null}

      {tipos.has(REGISTO.REMATE_ADV) ? (
        <Bloco titulo={t('registos.epoca.rematesAdv')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.epoca.rematesAdvPorJogo')}
              value={adv.rematesPorJogo.toFixed(1)}
              hint={t('painelv.emJogos', { n: adv.jogos })}
            />
            {adv.semResultado ? null : (
              <>
                <StatCard
                  label={t('registos.col.aBaliza')}
                  value={adv.aBaliza}
                  hint={t('registos.aBalizaDe', { n: adv.aBaliza, total: adv.remates })}
                />
                <StatCard
                  label={t('registos.epoca.defesaGR')}
                  value={adv.percentagemDefesa == null ? '—' : `${adv.percentagemDefesa}%`}
                  hint={t('registos.epoca.defesaGRDetalhe', { defendidos: adv.defendidos, aBaliza: adv.aBaliza })}
                />
              </>
            )}
          </div>
          <BarrasH
            linhas={rematesAdv.map((j) => ({
              rotulo: j.adversario,
              valor: j.remates,
              texto: j.semResultado
                ? String(j.remates)
                : t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
            }))}
          />
        </Bloco>
      ) : null}

      {tipos.has(REGISTO.REMATE_ADV_SIMPLES) ? (
        <Bloco titulo={t('registos.epoca.rematesAdv')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.epoca.rematesAdvPorJogo')}
              value={advSimples.rematesPorJogo.toFixed(1)}
              hint={t('painelv.emJogos', { n: advSimples.jogos })}
            />
            <StatCard label={t('registos.total.remate_adv_simples')} value={advSimples.remates} />
          </div>
          <BarrasH
            linhas={advSimples.porJogo.map((j) => ({
              rotulo: j.adversario,
              valor: j.remates,
              texto: String(j.remates),
            }))}
          />
        </Bloco>
      ) : null}

      {tipos.has(REGISTO.RECUPERACAO) ? (
        <Bloco titulo={t('registos.epoca.recuperacoes')}>
          <BarrasH
            linhas={recup.map((j) => ({
              rotulo: `${j.number} ${j.name}`,
              valor: j.recuperacoes,
              texto:
                j.por10 == null
                  ? String(j.recuperacoes)
                  : t('registos.epoca.recupDetalhe', { n: j.recuperacoes, por10: j.por10.toFixed(1) }),
            }))}
          />
          <p className="muted small">{t('registos.epoca.recupNota')}</p>
        </Bloco>
      ) : null}

      {tipos.has(REGISTO.PERDA_BOLA) ? (
        <Bloco titulo={t('registos.epoca.perdas')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.epoca.perdasPorJogo')}
              value={perdasEquipa.perdasPorJogo.toFixed(1)}
              hint={t('painelv.emJogos', { n: perdasEquipa.jogos })}
            />
            <StatCard label={t('registos.total.perda_bola')} value={perdasEquipa.perdas} />
          </div>
          <BarrasH
            linhas={perdas.map((j) => ({
              rotulo: `${j.number} ${j.name}`,
              valor: j.perdas,
              texto: t('registos.epoca.perdasDetalhe', { n: j.perdas, porJogo: j.porJogo.toFixed(1) }),
            }))}
          />
          <p className="muted small">{t('registos.epoca.perdasNota')}</p>
        </Bloco>
      ) : null}

      {tipos.has(REGISTO.PASSE_FALHADO) ? (
        <Bloco titulo={t('registos.epoca.passes')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.epoca.passesPorJogo')}
              value={passesEquipa.passesPorJogo.toFixed(1)}
              hint={t('painelv.emJogos', { n: passesEquipa.jogos })}
            />
            <StatCard label={t('registos.total.passe_falhado')} value={passesEquipa.passes} />
          </div>
          <BarrasH
            linhas={passes.map((j) => ({
              rotulo: `${j.number} ${j.name}`,
              valor: j.passes,
              texto: t('registos.epoca.perdasDetalhe', { n: j.passes, porJogo: j.porJogo.toFixed(1) }),
            }))}
          />
        </Bloco>
      ) : null}

      {temBolaParada ? (
        <Bloco titulo={t('registos.epoca.bolasParadas')}>
          <div className="grid grid--stats">
            {tipos.has(REGISTO.CANTO) ? (
              <StatCard
                label={t('registos.bp.cantos')}
                value={bp.cantos.percentagem == null ? '—' : `${bp.cantos.percentagem}%`}
                hint={t('registos.bp.cantosDetalhe', { golos: bp.cantos.golos, cantos: bp.cantos.cantos })}
              />
            ) : null}
            {tipos.has(REGISTO.PENALTI) ? (
              <StatCard label={t('registos.total.penalti')} value={`${bp.penaltis.golos}/${bp.penaltis.total}`} hint={golosEm(bp.penaltis)} />
            ) : null}
            {tipos.has(REGISTO.PENALTI_ADV) ? (
              <StatCard
                label={t('registos.total.penalti_adv')}
                value={`${bp.penaltisAdv.golos}/${bp.penaltisAdv.total}`}
                hint={golosEm(bp.penaltisAdv)}
              />
            ) : null}
            {tipos.has(REGISTO.LIVRE_10M) ? (
              <>
                <StatCard
                  label={t('registos.bp.livres10Nos')}
                  value={`${bp.livres10.US.golos}/${bp.livres10.US.total}`}
                  hint={golosEm(bp.livres10.US)}
                />
                <StatCard
                  label={t('registos.bp.livres10Eles')}
                  value={`${bp.livres10.THEM.golos}/${bp.livres10.THEM.total}`}
                  hint={golosEm(bp.livres10.THEM)}
                />
              </>
            ) : null}
          </div>
          <BarrasH
            linhas={[
              ['bp.golosCanto', 'CANTO'],
              ['bp.golosLivre', 'LIVRE'],
              ['bp.golosPenalti', 'PENALTI'],
              ['bp.golos10m', 'LIVRE_10M'],
            ].map(([chave, tipo]) => ({
              rotulo: t(`registos.${chave}`),
              valor: bp.golos.US[tipo],
              texto: `${bp.golos.US[tipo]} ${t('registos.bp.marcados')} · ${bp.golos.THEM[tipo]} ${t('registos.bp.sofridos')}`,
            }))}
          />
          <p className="muted small">{t('registos.bp.nota')}</p>
        </Bloco>
      ) : null}

      {filtros.length ? (
        <Bloco titulo={t('registos.epoca.mapa')}>
          <div className="regpainel__filtros">
            {filtros.map((f) => (
              <button
                key={f}
                type="button"
                className={`regzona__opcao ${filtro === f ? 'is-on' : ''}`}
                onClick={() => setFiltro(f)}
              >
                {t(`registos.total.${f}`)}
              </button>
            ))}
          </div>
          <div className="regpainel__mapa">
            <CampoSvg markers={pontos} />
          </div>
          <p className="muted small">{t('registos.epoca.pontos', { n: pontos.length })}</p>
        </Bloco>
      ) : null}
    </>
  );
}
