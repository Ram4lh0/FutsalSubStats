'use client';

// components/registos/BlocosDaEpoca.jsx — os registos extra no painel da
// época: remates e eficácia, recuperações por jogador e o mapa da época.
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
  eficacia,
  mapaDaEpoca,
  recuperacoesPorJogador,
  registosDaEpoca,
  rematesPorJogo,
  rematesAdvPorJogo,
  rematesAdvDaEpoca,
} from '@/domain/dashboard.js';
import { useT } from '@/lib/i18n/index.js';

const NO_MAPA = [REGISTO.REMATE, REGISTO.REMATE_ADV, REGISTO.RECUPERACAO, REGISTO.DEFESA_GR, REGISTO.FORA];

export default function BlocosDaEpoca({ entries, Bloco }) {
  const t = useT();
  const tipos = useMemo(() => registosDaEpoca(entries), [entries]);
  const remates = useMemo(() => rematesPorJogo(entries), [entries]);
  const efi = useMemo(() => eficacia(entries), [entries]);
  const recup = useMemo(() => recuperacoesPorJogador(entries), [entries]);
  const rematesAdv = useMemo(() => rematesAdvPorJogo(entries), [entries]);
  const adv = useMemo(() => rematesAdvDaEpoca(entries), [entries]);
  const filtros = NO_MAPA.filter((id) => tipos.has(id));
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
          </div>
          <BarrasH
            linhas={remates.map((j) => ({
              rotulo: j.adversario,
              valor: j.remates,
              texto: t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
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
          </div>
          <BarrasH
            linhas={rematesAdv.map((j) => ({
              rotulo: j.adversario,
              valor: j.remates,
              texto: t('registos.epoca.rematesDoJogo', { n: j.remates, baliza: j.aBaliza }),
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
