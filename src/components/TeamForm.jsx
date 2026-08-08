'use client';

// components/TeamForm.jsx — criar e editar um escalão.
//
// A época não se pergunta aqui: é do clube e vale para todos os escalões. O tipo
// de tempo, esse, pergunta-se — é o que separa os miúdos dos séniores.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHead from './PageHead.jsx';
import { Empty, Field } from './bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { clubs, teams } from '@/lib/data/repository.js';
import { MATCH_TIMING, MATCH_TIMING_LABEL, timingOf } from '@/domain/constants.js';
import { rotas } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';

const VAZIO = { name: '', shortName: '', timing: MATCH_TIMING.UNTIMED };

export default function TeamForm({ clubId, teamId }) {
  const router = useRouter();
  const soLeitura = useSoLeitura();
  const { toast, confirmar } = useUI();
  const [club, setClub] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [pronto, setPronto] = useState(!teamId);

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
    if (!(form.name || '').trim()) return toast('O escalão precisa de um nome.', 'error');
    const payload = {
      name: (form.name || '').trim(),
      shortName: (form.shortName || '').trim() || null,
      timing: form.timing,
    };
    const team = teamId ? await teams.update(teamId, payload) : await teams.create(clubId, payload);
    toast('Escalão guardado.', 'ok');
    router.push(teamId ? rotas.escalao(clubId, team.id) : rotas.clube(clubId));
  }

  async function eliminar() {
    const ok = await confirmar(
      `Apagar o escalão "${form.name}" elimina o plantel, os jogos, as competições e todos os eventos. Esta ação não pode ser anulada.`,
      { okLabel: 'Apagar escalão' }
    );
    if (!ok) return;
    await teams.remove(teamId);
    toast('Escalão apagado.', 'ok');
    router.push(rotas.clube(clubId));
  }

  if (!pronto) return <p className="muted">A carregar…</p>;

  // Esconder o botão não chega: quem escrever o endereço à mão chega aqui à
  // mesma. A experiência é para ver como a app funciona, não para montar uma
  // equipa que se vai perder daqui a cinco minutos.
  if (soLeitura) {
    return (
      <>
        <PageHead title="Escalão" backTo={rotas.dashboard()} />
        <Empty
          action={
            <button className="btn btn--primary" onClick={() => router.push(rotas.login())}>
              Criar conta
            </button>
          }
        >
          Isto faz parte do jogo de experiência, e por isso não se altera. Com conta, a equipa é sua
          e muda-se à vontade.
        </Empty>
      </>
    );
  }



  return (
    <>
      <PageHead
        title={teamId ? 'Editar escalão' : 'Criar escalão'}
        subtitle={club?.name}
        backTo={teamId ? rotas.escalao(clubId, teamId) : rotas.clube(clubId)}
      />
      <form className="card form" onSubmit={guardar}>
        <div className="form__row">
          <Field label="Nome do escalão" hint="À sua maneira: Sub-15, Juniores B, Séniores…">
            <input className="input" placeholder="Ex.: Sub-15" {...campo('name')} />
          </Field>
          <Field label="Apelido (opcional)" hint="Nome curto para listas apertadas.">
            <input className="input" placeholder="Ex.: S15" maxLength={12} {...campo('shortName')} />
          </Field>
        </div>

        <Field
          label="Tipo de jogo"
          hint="No cronometrado o tempo pára a cada interrupção e a sanção por expulsão é de 2 minutos. No corrido são 30 minutos por parte e 3 minutos de sanção. Pode ser mudado jogo a jogo."
        >
          <select className="input" {...campo('timing')}>
            {Object.values(MATCH_TIMING).map((t) => (
              <option key={t} value={t}>
                {MATCH_TIMING_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <div className="form__actions">
          {teamId ? (
            <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
              Eliminar escalão
            </button>
          ) : null}
          <span className="toolbar__spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.back()}>
            Cancelar
          </button>
          <button className="btn btn--primary" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </>
  );
}
