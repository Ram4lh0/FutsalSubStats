'use client';

// app/team/access/page.jsx — quem vê e quem edita este escalão.
//
// Só o dono do clube chega aqui. Um treinador associado não tem nada que decidir
// sobre os outros, e a página nem sequer o deixa entrar — mas quem trava a
// sério são as políticas do servidor, não este ecrã.
//
// Ao contrário do resto da app, isto precisa de rede. A razão está no
// `lib/data/acessos.js`: tirar acesso a alguém tem de acontecer agora, não
// quando o telemóvel do gerente voltar a ter ligação.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Empty } from '@/components/bits.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import { useUI } from '@/lib/ui.jsx';
import { teams, clubs } from '@/lib/data/repository.js';
import { listarParaEscalao, darAcesso, tirarAcesso, explicar } from '@/lib/data/acessos.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

export default function AcessosPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, back } = useRouteParams();
  const router = useRouter();
  const t = useT();
  const { toast, confirmar } = useUI();

  const [escalao, setEscalao] = useState(null);
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const carregar = useCallback(async () => {
    if (!clubId || !teamId) return;
    setEscalao(await teams.get(teamId));

    // Quem não é dono do clube não decide sobre os outros. O servidor recusaria
    // à mesma; isto só evita mostrar um ecrã que não ia dar em nada.
    const dono = (await teams.nivel(teamId)) === 'dono' && Boolean(await clubs.get(clubId));
    if (!dono) {
      setErro(t('acessos.semAutorizacao'));
      setLinhas([]);
      return;
    }

    try {
      setLinhas(await listarParaEscalao(clubId, teamId));
      setErro(null);
    } catch (e) {
      setErro(explicar(e));
      setLinhas([]);
    }
  }, [clubId, teamId, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mudar(userId, nivel) {
    setOcupado(userId);
    try {
      await darAcesso(teamId, userId, nivel);
      await carregar();
    } catch (e) {
      toast(explicar(e), 'error');
    } finally {
      setOcupado(null);
    }
  }

  async function retirar(linha) {
    const ok = await confirmar(t('acessos.confirmaRetirar', { nome: linha.nome }), {
      okLabel: t('acessos.retirar'),
    });
    if (!ok) return;
    setOcupado(linha.userId);
    try {
      await tirarAcesso(teamId, linha.userId);
      await carregar();
    } catch (e) {
      toast(explicar(e), 'error');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <PageHead
        title={t('acessos.titulo')}
        subtitle={escalao?.name || ''}
        backTo={back || rotas.escalaoEditar(clubId, teamId)}
      />

      <div className="card">
        <p className="muted">{t('acessos.texto')}</p>
      </div>

      {erro ? (
        <div className="card card--danger">
          <p>{erro}</p>
        </div>
      ) : linhas === null ? (
        <p className="muted">{t('comum.aCarregar')}</p>
      ) : !linhas.length ? (
        // O caso normal no início: o clube ainda não tem treinadores associados.
        // A associação é feita por nós, e não aqui — daí a explicação em vez de
        // um botão que não existe.
        <Empty
          action={
            <button className="btn btn--ghost" onClick={() => router.push(rotas.conta())}>
              {t('acessos.irDefinicoes')}
            </button>
          }
        >
          {t('acessos.semTreinadores')}
        </Empty>
      ) : (
        <div className="card">
          <ul className="list">
            {linhas.map((linha) => (
              <li key={linha.userId} className="list__row">
                <div>
                  <strong>{linha.nome}</strong>
                  {linha.email && linha.email !== linha.nome ? (
                    <p className="muted small">{linha.email}</p>
                  ) : null}
                </div>
                <div className="form__actions form__actions--left">
                  {/* Três estados e não um interruptor: "sem acesso" é tão
                      escolhível como os outros dois, e um interruptor de
                      ver/editar deixava a remoção escondida noutro sítio. */}
                  <button
                    className={`btn btn--tiny ${linha.nivel === 'ver' ? 'btn--primary' : 'btn--ghost'}`}
                    disabled={ocupado === linha.userId}
                    aria-pressed={linha.nivel === 'ver'}
                    onClick={() => mudar(linha.userId, 'ver')}
                  >
                    {t('acessos.ver')}
                  </button>
                  <button
                    className={`btn btn--tiny ${linha.nivel === 'editar' ? 'btn--primary' : 'btn--ghost'}`}
                    disabled={ocupado === linha.userId}
                    aria-pressed={linha.nivel === 'editar'}
                    onClick={() => mudar(linha.userId, 'editar')}
                  >
                    {t('acessos.editar')}
                  </button>
                  {linha.nivel ? (
                    <button
                      className="btn btn--tiny btn--danger btn--ghost"
                      disabled={ocupado === linha.userId}
                      onClick={() => retirar(linha)}
                    >
                      {t('acessos.retirar')}
                    </button>
                  ) : (
                    <span className="muted small">{t('acessos.semAcesso')}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
