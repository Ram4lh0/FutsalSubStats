'use client';

// components/TeamForm.jsx — criar e editar um escalão.
//
// A época não se pergunta aqui: é do clube e vale para todos os escalões. O tipo
// de tempo, esse, pergunta-se — é o que separa os miúdos dos séniores.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import EscolherFoto from './EscolherFoto.jsx';
import { SoLeitura, Field } from './bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { clubs, teams } from '@/lib/data/repository.js';
import { MATCH_TIMING, timingOf } from '@/domain/constants.js';
import { timingLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useSouDono from '@/lib/useSouDono.js';
import { useT } from '@/lib/i18n/index.js';

const VAZIO = { name: '', shortName: '', logoUrl: null, timing: MATCH_TIMING.UNTIMED };

export default function TeamForm({ clubId, teamId }) {
  const router = useRouter();
  const t = useT();
  const soLeitura = useSoLeitura(teamId);
  const { toast, confirmar } = useUI();
  const [club, setClub] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!teamId);
  // Ser dono do clube, e não o nível do escalão.
  //
  // O `teams.nivel()` responde `dono` quando não sabe — e não saber é o caso de
  // um escalão criado sem rede, que é mesmo de quem o criou. Mas essa mesma
  // omissão fazia aparecer o botão de apagar a um treinador associado enquanto a
  // descarga não escrevesse o nível. A pergunta certa aqui é outra e não depende
  // de sincronização nenhuma: este clube é meu?
  const souDono = useSouDono(clubId);
  // De onde se veio. Sem isto, quem editava um escalão a partir da lista de
  // escalões do clube era despejado **dentro** do escalão ao voltar — perdia a
  // lista onde estava e tinha de navegar para trás outra vez.
  const { back } = useRouteParams();
  const voltarPara = back || (teamId ? rotas.escalao(clubId, teamId) : rotas.clube(clubId));

  useEffect(() => {
    (async () => {
      setClub(await clubs.get(clubId));
      if (teamId) {
        const t = await teams.get(teamId);
        if (t) setForm({ ...VAZIO, ...t, timing: timingOf(t) });
        setPronto(true);
      }
    })();
  }, [clubId, teamId]);

  const campo = (k) => ({
    value: form[k] ?? '',
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function guardar(e) {
    e.preventDefault();
    if (!(form.name || '').trim()) return toast(t('escalao.precisaNome'), 'error');
    const payload = {
      name: (form.name || '').trim(),
      shortName: (form.shortName || '').trim() || null,
      logoUrl: form.logoUrl || null,
      timing: form.timing,
    };
    // Sem isto, a recusa da licença — que é uma exceção — não chegava a lado
    // nenhum: o formulário ficava calado, a página ficava na mesma, e a pessoa
    // carregava outra vez a pensar que não tinha carregado bem.
    let team;
    try {
      team = teamId ? await teams.update(teamId, payload) : await teams.create(clubId, payload);
    } catch (err) {
      return toast(err.chave ? t(err.chave) : t('escalao.guardarFalhou', { erro: err.message }), 'error');
    }
    toast(t('escalao.guardado'), 'ok');
    router.push(teamId ? voltarPara : rotas.clube(clubId));
  }

  async function eliminar() {
    const ok = await confirmar(t('escalao.confirmaApagar', { nome: form.name }), {
      okLabel: t('escalao.apagarBotao'),
    });
    if (!ok) return;
    // Arquivar, e não apagar: o `remove` só limpava este aparelho, e o escalão
    // reaparecia na descarga seguinte porque no servidor continuava lá.
    await teams.archive(teamId);
    toast(t('escalao.apagado'), 'ok');
    router.push(rotas.clube(clubId));
  }

  if (!pronto) return <p className="muted">{t('comum.aCarregar')}</p>;

  if (soLeitura) return <SoLeitura titulo={t('escalao.titulo')} />;

  return (
    <>
      <PageHead
        title={teamId ? t('escalao.editarTitulo') : t('escalao.criarTitulo')}
        subtitle={club?.name}
        backTo={teamId ? voltarPara : rotas.clube(clubId)}
      />
      <form className="card form form--safe-actions" onSubmit={guardar}>
        {/* O escalão herda a cor do clube quando não tem foto: é do clube que
            ele é, e duas cores diferentes no mesmo ecrã só confundiam. */}
        <EscolherFoto
          nome={form.name}
          cor={club?.primaryColor}
          valor={form.logoUrl}
          onChange={(logoUrl) => setForm((f) => ({ ...f, logoUrl }))}
        />
        <div className="form__row">
          <Field label={t('escalao.nome')} hint={t('escalao.nomeDica')}>
            <input className="input" placeholder={t('escalao.nomePlaceholder')} {...campo('name')} />
          </Field>
          <Field label={t('comum.apelido')} hint={t('escalao.apelidoDica')}>
            <input
              className="input"
              placeholder={t('escalao.apelidoPlaceholder')}
              maxLength={12}
              {...campo('shortName')}
            />
          </Field>
        </div>

        <Field label={t('escalao.tipoJogo')} hint={t('escalao.tipoJogoDica')}>
          <select className="input" {...campo('timing')}>
            {Object.values(MATCH_TIMING).map((v) => (
              <option key={v} value={v}>
                {timingLabel(v)}
              </option>
            ))}
          </select>
        </Field>

        {/* Só ao editar, e só a quem é dono do clube: um treinador associado vê
            este ecrã do escalão mas não decide quem mais lá entra. */}
        {teamId && souDono ? (
          <div className="form__actions form__actions--left">
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() =>
                router.push(
                  // A origem viaja também para aqui: sem isto, quem chegasse à
                  // lista de acessos vindo da página do clube voltava para o
                  // formulário do escalão e ficava a meio caminho.
                  comOrigem(rotas.acessos(clubId, teamId), {
                    atras: comOrigem(rotas.escalaoEditar(clubId, teamId), { atras: back }),
                  })
                )
              }
            >
              {t('acessos.titulo')}
            </button>
          </div>
        ) : null}

        <div className="form__actions">
          {/* Apagar um escalão é mexer na estrutura do clube, e continua a ser
              só do dono. Quem tem "Ver e editar" muda o nome e a foto — o
              gatilho `teams_so_o_dono_arquiva` garante o resto do lado do
              servidor, para o botão escondido não ser a única defesa. */}
          {teamId && souDono ? (
            <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
              {t('escalao.eliminar')}
            </button>
          ) : null}
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.push(voltarPara)}>
            {t('comum.cancelar')}
          </button>
          <button className="btn btn--primary" type="submit" data-tour="team-save">
            {t('comum.guardar')}
          </button>
        </div>
      </form>
    </>
  );
}
