'use client';

// Treino → Convocatórias.
//
// Uma convocatória é um jogo com convocados: os próximos jogos em cima (com ou
// sem convocatória feita) e as últimas convocatórias por baixo. "+ Convocatória"
// escolhe um jogo que já exista ou cria-o ali mesmo — o jogo fica preparado e
// só falta o cinco inicial, que se escolhe na hora.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { rotas } from '@/lib/routes.js';
import { Empty, Field } from '@/components/bits.jsx';
import LinhaJogo, { porJogar } from '@/components/treino/LinhaJogo.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { gravarPavilhaoDeCasa, pavilhaoDeCasa } from '@/lib/convocatoria.js';
import { useT } from '@/lib/i18n/index.js';

export default function CallupsPage() {
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
      {(dados) => <Convocatorias clubId={clubId} teamId={teamId} entries={dados.entries} />}
    </TeamShell>
  );
}

function Convocatorias({ clubId, teamId, entries }) {
  const t = useT();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const [casa, setCasa] = useState('');
  useEffect(() => setCasa(pavilhaoDeCasa(teamId)), [teamId]);

  const { proximos, ultimas } = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const quando = (e) => e.match.scheduledAt || e.match.createdAt || 0;
    const proximos = entries
      .filter((e) => porJogar(e) && quando(e) >= hoje.getTime())
      .sort((a, b) => quando(a) - quando(b));
    const ultimas = entries
      .filter((e) => !proximos.includes(e) && Object.keys(e.state?.players || {}).length)
      .sort((a, b) => quando(b) - quando(a))
      .slice(0, 8);
    return { proximos, ultimas };
  }, [entries]);

  const abrir = (matchId) => router.push(rotas.convocatoria(clubId, teamId, matchId));

  async function definirCasa() {
    const novo = await ui.open((close) => <PavilhaoCasa inicial={casa} onFechar={close} />);
    if (novo === null || novo === undefined) return;
    gravarPavilhaoDeCasa(teamId, novo);
    setCasa(novo.trim());
  }

  return (
    <>
      {soLeitura ? null : (
        <div className="area-actions area-actions--compact">
          <button className="btn btn--ghost btn--tiny" onClick={definirCasa}>
            {casa ? t('conv.casaDefinida', { nome: casa }) : t('conv.definirCasa')}
          </button>
          <span className="toolbar__spacer" />
          <button className="btn btn--primary btn--tiny" onClick={() => router.push(rotas.convocatoria(clubId, teamId))}>
            {t('conv.nova')}
          </button>
        </div>
      )}

      <section className="card tprox">
        <h2 className="section section--tight">{t('conv.proximosJogos')}</h2>
        {proximos.length ? (
          proximos.map((e) => <LinhaJogo key={e.match.id} entry={e} onAbrir={() => abrir(e.match.id)} />)
        ) : (
          <p className="muted">{t('conv.semProximos')}</p>
        )}
      </section>

      <section className="card tprox">
        <h2 className="section section--tight">{t('conv.ultimas')}</h2>
        {ultimas.length ? (
          ultimas.map((e) => <LinhaJogo key={e.match.id} entry={e} onAbrir={() => abrir(e.match.id)} />)
        ) : (
          <Empty>{t('conv.semUltimas')}</Empty>
        )}
      </section>
    </>
  );
}

function PavilhaoCasa({ inicial, onFechar }) {
  const t = useT();
  const [v, setV] = useState(inicial);
  return (
    <Dialog title={t('conv.pavilhaoCasa')} onClose={() => onFechar(null)}>
      <p className="modal__hint">{t('conv.pavilhaoCasaHint')}</p>
      <Field label={t('conv.pavilhao')}>
        <input className="input" autoFocus maxLength={100} placeholder={t('treino.localExemplo')} value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={() => onFechar(null)}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" onClick={() => onFechar(v)}>
          {t('comum.guardar')}
        </button>
      </footer>
    </Dialog>
  );
}
