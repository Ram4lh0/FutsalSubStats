'use client';

// Aba Plantel do escalão: filtros, ordenação e a lista de jogadores.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import DataTable from '@/components/DataTable.jsx';
import { Badge, Empty } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { players } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { download, pickFile, slug } from '@/lib/data/exporter.js';
import { plantelCsv, plantelExemploCsv, lerPlantelCsv } from '@/lib/data/plantelCsv.js';
import ImportarPlantel from '@/components/ImportarPlantel.jsx';
import { clubAggregate } from '@/domain/stats.js';
import { fmt } from '@/domain/clock.js';
import { POSITIONS_ALL, normalizePosition, FOOT } from '@/domain/constants.js';
import { positionLabel, footLabel } from '@/lib/format.js';
import { rotas } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { useT, useIdioma } from '@/lib/i18n/index.js';

export default function RosterPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => <Roster {...dados} clubId={clubId} teamId={teamId} />}
    </TeamShell>
  );
}

function Roster({ team, entries, roster, clubId, teamId }) {
  const router = useRouter();
  const t = useT();
  const idioma = useIdioma();
  const soLeitura = useSoLeitura(teamId);
  const ui = useUI();
  const { toast, confirmar } = ui;
  const { userId, user } = useAuth();
  const [filtros, setFiltros] = useState({
    sort: 'number',
    position: 'ALL',
    active: 'ALL',
    search: '',
  });
  const [versao, setVersao] = useState(0);

  const agg = useMemo(() => clubAggregate(entries), [entries]);
  // `versao` entra na conta para os totais acompanharem ativar/desativar.
  const ativos = useMemo(() => roster.filter((p) => p.isActive).length, [roster, versao]);
  const inativos = roster.length - ativos;

  const linhas = useMemo(() => {
    // Chamava-se `t` e passou a `tempo` quando o `t` da tradução entrou nesta
    // função. Duas letras iguais a significar coisas diferentes no mesmo sítio
    // é como se perde uma tarde.
    const tempo = (p) => agg.perPlayer[p.id]?.courtMs || 0;
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
          ? // A ordem alfabética muda com a língua — em espanhol o "ñ" vem
            // depois do "n", e não onde o português o punha.
            a.name.localeCompare(b.name, idioma)
          : filtros.sort === 'time'
            ? tempo(b) - tempo(a)
            : filtros.sort === 'position'
              ? posIdx(a) - posIdx(b) || a.shirtNumber - b.shirtNumber
              : a.shirtNumber - b.shirtNumber
      );
    // `versao` força o recálculo depois de ativar/desativar um jogador.
  }, [roster, filtros, agg, versao, idioma]);

  async function alternarAtivo(p) {
    await players.setActive(p.id, !p.isActive);
    p.isActive = !p.isActive;
    setVersao((v) => v + 1);
    toast(p.isActive ? t('plantel.reativado') : t('plantel.desativado'), 'ok');
  }

  const campo = (k) => ({
    value: filtros[k],
    onChange: (e) => setFiltros((f) => ({ ...f, [k]: e.target.value })),
  });

  /**
   * Importar o plantel de um CSV.
   *
   * Três paragens, todas com saída: explicar o formato, ler o ficheiro e mostrar
   * o que se percebeu dele, e só então confirmar a substituição. Uma importação
   * que apaga metade do plantel não pode acontecer a um toque de distância.
   */
  async function importar() {
    const querFicheiro = await ui.open((close) => (
      <ImportarPlantel onEscolher={() => close(true)} onClose={() => close(false)} />
    ));
    if (!querFicheiro) return;

    const bruto = await pickFile('.csv,text/csv');
    if (!bruto) return;

    try {
      const { jogadores, problemas } = await lerPlantelCsv(bruto);

      // As linhas más são mostradas antes de qualquer coisa acontecer: quem
      // escreveu "Guarda-rede" em vez de "Guarda-redes" quer saber o número da
      // linha, não descobrir um jogador a menos daqui a três semanas.
      const listaProblemas = problemas.length
        ? '\n\n' +
          t('plantelCsv.problemasTitulo', { n: problemas.length }) +
          '\n' +
          problemas
            .map(
              (p) =>
                `${p.linha ? t('plantelCsv.linhaN', { linha: p.linha }) + ' ' : ''}${t(
                  p.chave,
                  p.valores
                )}`
            )
            .join('\n')
        : '';

      if (!jogadores.length) {
        return toast(t('plantelCsv.nadaAImportar') + listaProblemas, 'error', 9000);
      }

      const ok = await confirmar(
        t('plantelCsv.lidos', { n: jogadores.length }) +
          ' ' +
          (roster.length
            ? t('plantelCsv.vaiSubstituir', { n: roster.length })
            : t('plantelCsv.vaiCriar', { n: jogadores.length })) +
          listaProblemas,
        { okLabel: t('plantelCsv.importar'), title: t('plantelCsv.confirmarTitulo') }
      );
      if (!ok) return;

      const r = await players.replaceRoster(teamId, jogadores);
      sync.saveNow(userId, user?.email);
      setVersao((v) => v + 1);
      toast(t('plantelCsv.feito', r), 'ok', 8000);
    } catch (e) {
      toast(t('plantelCsv.falhou', { erro: e.message }), 'error');
    }
  }

  return (
    <>
      <div className="toolbar">
        {/* Quantos são ao todo e quantos contam para os jogos. A diferença
            interessa: um plantel de 20 com 12 ativos não é um plantel de 20. */}
        <span className="toolbar__count">
          <strong>{roster.length}</strong>{' '}
          {roster.length === 1 ? t('plantel.jogador') : t('plantel.jogadores')}
          <span className="muted">
            {' '}
            · {ativos} {ativos === 1 ? t('plantel.ativo') : t('plantel.ativos')}
          </span>
          {inativos ? (
            <span className="muted"> · {t('plantel.inativos', { n: inativos })}</span>
          ) : null}
        </span>
        <input
          className="input input--search"
          placeholder={t('plantel.procurar')}
          {...campo('search')}
        />
        <select className="input" {...campo('position')}>
          <option value="ALL">{t('plantel.todasPosicoes')}</option>
          {POSITIONS_ALL.map((p) => (
            <option key={p} value={p}>
              {positionLabel(p)}
            </option>
          ))}
        </select>
        <select className="input" {...campo('active')}>
          <option value="ALL">{t('plantel.ativosEInativos')}</option>
          <option value="ACTIVE">{t('plantel.soAtivos')}</option>
          <option value="INACTIVE">{t('plantel.soInativos')}</option>
        </select>
        <select className="input" {...campo('sort')}>
          <option value="number">{t('plantel.ordenarNumero')}</option>
          <option value="name">{t('plantel.ordenarNome')}</option>
          <option value="position">{t('plantel.ordenarPosicao')}</option>
          <option value="time">{t('plantel.ordenarTempo')}</option>
        </select>
        <span className="toolbar__spacer" />
        <button
          className="btn btn--ghost"
          onClick={() =>
            download(
              `plantel-${slug(team.name)}.csv`,
              plantelCsv(roster),
              'text/csv;charset=utf-8'
            )
          }
        >
          {t('plantel.exportarCsv')}
        </button>
        {soLeitura ? null : (
          <>
            {/* Importar vive aqui, dentro do escalão, e não no menu dos clubes:
                um plantel pertence a um escalão em concreto, e no menu dos
                clubes não há forma de dizer a qual. */}
            <button className="btn btn--ghost" onClick={importar}>
              {t('plantelCsv.importar')}
            </button>
            <button
              className="btn btn--primary"
              data-tour="create-player"
              onClick={() => router.push(rotas.jogadorNovo(clubId, teamId))}
            >
              {t('plantel.criarJogador')}
            </button>
          </>
        )}
      </div>

      {!linhas.length ? (
        <Empty
          action={
            roster.length || soLeitura ? null : (
              <button
                className="btn btn--primary"
                data-tour="create-player"
                onClick={() => router.push(rotas.jogadorNovo(clubId, teamId))}
              >
                {t('plantel.criarJogador')}
              </button>
            )
          }
        >
          {roster.length ? t('plantel.semCorrespondencia') : t('plantel.vazio')}
        </Empty>
      ) : (
        <DataTable players>
          <thead>
            <tr>
              <th>{t('plantel.numero')}</th>
              <th>{t('plantel.nome')}</th>
              <th>{t('plantel.posicao')}</th>
              <th>{t('plantel.pe')}</th>
              <th>{t('plantel.estado')}</th>
              <th className="num">{t('plantel.jogos')}</th>
              <th className="num">{t('plantel.tempoTotal')}</th>
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
                    <a className="link" onClick={() => router.push(rotas.jogador(clubId, teamId, p.id))}>
                      {p.name}
                    </a>
                  </td>
                  <td>{positionLabel(p.preferredPosition)}</td>
                  <td className="muted">{footLabel(p.strongFoot || FOOT.UNKNOWN)}</td>
                  <td>
                    {p.isActive ? (
                      <Badge kind="ok">{t('plantel.etiquetaAtivo')}</Badge>
                    ) : (
                      <Badge kind="muted">{t('plantel.etiquetaInativo')}</Badge>
                    )}
                  </td>
                  <td className="num">{a?.matches || 0}</td>
                  <td className="num mono">{fmt(a?.courtMs || 0)}</td>
                  <td className="right">
                    <button
                      className="btn btn--tiny btn--ghost"
                      onClick={() => router.push(rotas.jogador(clubId, teamId, p.id))}
                    >
                      {t('plantel.abrir')}
                    </button>
                    {soLeitura ? null : (
                      <button className="btn btn--tiny btn--ghost" onClick={() => alternarAtivo(p)}>
                        {p.isActive ? t('plantel.desativar') : t('plantel.ativar')}
                      </button>
                    )}
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
