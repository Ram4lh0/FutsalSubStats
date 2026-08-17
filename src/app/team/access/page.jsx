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
  const [aGuardar, setAGuardar] = useState(false);

  // O que foi escolhido neste ecrã e ainda não subiu: `userId` → `'ver'`,
  // `'editar'` ou `null` (sem acesso).
  //
  // Antes cada toque ia ao servidor de imediato. Funcionava, mas dava um ecrã
  // sem fim: distribuir acessos por cinco treinadores eram cinco viagens, cada
  // uma podendo falhar por si, e nada que dissesse "está feito". Agora escolhe-se
  // tudo e guarda-se de uma vez.
  const [pendentes, setPendentes] = useState({});

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

  /** O nível que este ecrã mostra: o escolhido agora, ou o que veio do servidor. */
  const nivelDe = (linha) =>
    Object.hasOwn(pendentes, linha.userId) ? pendentes[linha.userId] : linha.nivel;

  /**
   * Escolher um nível — ou tirar o acesso, com `null`.
   *
   * Voltar ao que o servidor já tinha apaga a escolha em vez de a guardar como
   * "alteração". Sem isto, carregar em "Só ver" e outra vez em "Só ver" deixava
   * o botão de guardar aceso com nada para fazer.
   */
  function escolher(linha, nivel) {
    setPendentes((antes) => {
      const proximo = { ...antes };
      if (nivel === linha.nivel) delete proximo[linha.userId];
      else proximo[linha.userId] = nivel;
      return proximo;
    });
  }

  const porGuardar = Object.keys(pendentes).length;

  /**
   * Manda as alterações, uma a uma, e volta para as definições do escalão.
   *
   * Uma a uma porque não há forma de as mandar juntas: cada acesso é uma linha
   * sua em `team_access`. Se alguma falhar, pára ali e não navega — o que já
   * subiu fica feito, o resto continua por guardar no ecrã, e a mensagem diz o
   * que aconteceu. Fingir sucesso e sair era o pior desfecho possível.
   */
  async function guardar() {
    if (!porGuardar || aGuardar) return;
    setAGuardar(true);
    const feitos = [];
    try {
      for (const [userId, nivel] of Object.entries(pendentes)) {
        if (nivel) await darAcesso(teamId, userId, nivel);
        else await tirarAcesso(teamId, userId);
        feitos.push(userId);
      }
      toast(t('acessos.guardado'), 'ok');
      router.push(back || rotas.escalaoEditar(clubId, teamId));
    } catch (e) {
      setPendentes((antes) => {
        const resto = { ...antes };
        for (const id of feitos) delete resto[id];
        return resto;
      });
      await carregar();
      toast(explicar(e), 'error');
    } finally {
      setAGuardar(false);
    }
  }

  /** Sair com alterações por guardar avisa primeiro. */
  async function sair() {
    const destino = back || rotas.escalaoEditar(clubId, teamId);
    if (porGuardar && !(await confirmar(t('acessos.descartar')))) return;
    router.push(destino);
  }

  return (
    <>
      <PageHead
        title={t('acessos.titulo')}
        subtitle={escalao?.name || ''}
        backTo={back || rotas.escalaoEditar(clubId, teamId)}
        onBack={sair}
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
                      ver/editar deixava a remoção escondida noutro sítio.

                      Nenhum destes botões fala com o servidor: escrevem no
                      rascunho, e quem o manda é o "Guardar alterações". */}
                  <button
                    className={`btn btn--tiny ${nivelDe(linha) === 'ver' ? 'btn--primary' : 'btn--ghost'}`}
                    disabled={aGuardar}
                    aria-pressed={nivelDe(linha) === 'ver'}
                    onClick={() => escolher(linha, 'ver')}
                  >
                    {t('acessos.ver')}
                  </button>
                  <button
                    className={`btn btn--tiny ${nivelDe(linha) === 'editar' ? 'btn--primary' : 'btn--ghost'}`}
                    disabled={aGuardar}
                    aria-pressed={nivelDe(linha) === 'editar'}
                    onClick={() => escolher(linha, 'editar')}
                  >
                    {t('acessos.editar')}
                  </button>
                  {nivelDe(linha) ? (
                    <button
                      className="btn btn--tiny btn--danger btn--ghost"
                      disabled={aGuardar}
                      onClick={() => escolher(linha, null)}
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

          {/* O botão vive dentro do cartão, a seguir à última pessoa: é o fim da
              tarefa, e é onde o polegar já está depois de escolher. */}
          <div className="form__actions">
            <button
              className="btn btn--primary"
              disabled={!porGuardar || aGuardar}
              onClick={guardar}
            >
              {t('acessos.guardar')}
            </button>
            {porGuardar ? (
              <span className="muted small">
                {t(porGuardar === 1 ? 'acessos.porGuardar' : 'acessos.porGuardarPlural', {
                  n: porGuardar,
                })}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
