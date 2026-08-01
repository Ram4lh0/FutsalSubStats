'use client';

// Aba Plantel: filtros, ordenação e a lista de jogadores.

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ClubShell from '@/components/ClubShell.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Badge, Empty } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { players } from '@/lib/data/repository.js';
import { rosterCsv, download, slug } from '@/lib/data/exporter.js';
import { clubAggregate } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';
import {
  POSITIONS_ALL,
  POSITION_LABEL,
  normalizePosition,
  FOOT,
  FOOT_LABEL,
} from '@/domain/constants.js';
import { positionLabel } from '@/lib/format.js';

export default function RosterPage() {
  const { clubId } = useParams();
  return <ClubShell clubId={clubId}>{(dados) => <Roster {...dados} />}</ClubShell>;
}

function Roster({ club, entries, roster }) {
  const router = useRouter();
  const { toast } = useUI();
  const [filtros, setFiltros] = useState({
    sort: 'number',
    position: 'ALL',
    active: 'ALL',
    search: '',
  });
  const [versao, setVersao] = useState(0);

  const agg = useMemo(() => clubAggregate(entries), [entries]);

  const linhas = useMemo(() => {
    const t = (p) => agg.perPlayer[p.id]?.courtMs || 0;
    // Por posição segue a ordem do campo: GR, fixo, alas, pivot e universais.
    const posIdx = (p) => POSITIONS_ALL.indexOf(normalizePosition(p.preferredPosition));
    const procura = filtros.search.toLowerCase();

    return roster
      .filter((p) => {
        if (filtros.active === 'ACTIVE' && !p.isActive) return false;
        if (filtros.active === 'INACTIVE' && p.isActive) return false;
        if (filtros.position !== 'ALL' && normalizePosition(p.preferredPosition) !== filtros.position)
          return false;
        if (
          procura &&
          !p.name.toLowerCase().includes(procura) &&
          !String(p.shirtNumber).includes(procura)
        )
          return false;
        return true;
      })
      .sort((a, b) =>
        filtros.sort === 'name'
          ? a.name.localeCompare(b.name, 'pt')
          : filtros.sort === 'time'
            ? t(b) - t(a)
            : filtros.sort === 'position'
              ? posIdx(a) - posIdx(b) || a.shirtNumber - b.shirtNumber
              : a.shirtNumber - b.shirtNumber
      );
    // `versao` força o recálculo depois de ativar/desativar um jogador.
  }, [roster, filtros, agg, versao]);

  async function alternarAtivo(p) {
    await players.setActive(p.id, !p.isActive);
    p.isActive = !p.isActive;
    setVersao((v) => v + 1);
    toast(p.isActive ? 'Jogador reativado.' : 'Jogador desativado.', 'ok');
  }

  const campo = (k) => ({
    value: filtros[k],
    onChange: (e) => setFiltros((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <>
      <div className="toolbar">
        <input
          className="input input--search"
          placeholder="Procurar por nome ou número…"
          {...campo('search')}
        />
        <select className="input" {...campo('position')}>
          <option value="ALL">Todas as posições</option>
          {POSITIONS_ALL.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p]}
            </option>
          ))}
        </select>
        <select className="input" {...campo('active')}>
          <option value="ALL">Ativos e inativos</option>
          <option value="ACTIVE">Só ativos</option>
          <option value="INACTIVE">Só inativos</option>
        </select>
        <select className="input" {...campo('sort')}>
          <option value="number">Ordenar por número</option>
          <option value="name">Ordenar por nome</option>
          <option value="position">Ordenar por posição</option>
          <option value="time">Ordenar por tempo de jogo</option>
        </select>
        <span className="toolbar__spacer" />
        <button
          className="btn btn--ghost"
          onClick={() =>
            download(
              `plantel-${slug(club.name)}.csv`,
              rosterCsv(club, roster),
              'text/csv;charset=utf-8'
            )
          }
        >
          Exportar CSV
        </button>
        <button
          className="btn btn--primary"
          onClick={() => router.push(`/clubs/${club.id}/players/new`)}
        >
          Criar jogador
        </button>
      </div>

      {!linhas.length ? (
        <Empty
          action={
            roster.length ? null : (
              <button
                className="btn btn--primary"
                onClick={() => router.push(`/clubs/${club.id}/players/new`)}
              >
                Criar jogador
              </button>
            )
          }
        >
          {roster.length ? 'Nenhum jogador corresponde aos filtros.' : 'O plantel está vazio.'}
        </Empty>
      ) : (
        <DataTable players>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Nome</th>
              <th>Posição</th>
              <th>Pé</th>
              <th>Estado</th>
              <th className="num">Jogos</th>
              <th className="num">Tempo total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => {
              const a = agg.perPlayer[p.id];
              return (
                <tr key={p.id} className={p.isActive ? '' : 'is-muted'}>
                  <td className="num mono">{p.shirtNumber}</td>
                  <td>
                    <a
                      className="link"
                      onClick={() => router.push(`/clubs/${club.id}/players/${p.id}`)}
                    >
                      {p.name}
                    </a>
                  </td>
                  <td>{positionLabel(p.preferredPosition)}</td>
                  <td className="muted">{FOOT_LABEL[p.strongFoot || FOOT.UNKNOWN]}</td>
                  <td>
                    {p.isActive ? <Badge kind="ok">Ativo</Badge> : <Badge kind="muted">Inativo</Badge>}
                  </td>
                  <td className="num">{a?.matches || 0}</td>
                  <td className="num mono">{fmt(a?.courtMs || 0)}</td>
                  <td className="right">
                    <button
                      className="btn btn--tiny btn--ghost"
                      onClick={() => router.push(`/clubs/${club.id}/players/${p.id}`)}
                    >
                      Abrir
                    </button>
                    <button className="btn btn--tiny btn--ghost" onClick={() => alternarAtivo(p)}>
                      {p.isActive ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
