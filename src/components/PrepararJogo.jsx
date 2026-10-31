'use client';

// components/PrepararJogo.jsx — marcar um jogo sem sair da lista de jogos.
//
// Pergunta só o essencial (adversário, dia e hora, casa/fora, competição) e
// grava o jogo logo, como rascunho: sem convocatória nem cinco inicial. Isso
// faz-se mais tarde — os convocados em Treino → Convocatórias, o cinco na
// preparação, na hora do jogo.

import { useState } from 'react';
import { Field } from '@/components/bits.jsx';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { matches, events } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { matchCreated } from '@/domain/actions.js';
import { timingOf } from '@/domain/constants.js';
import { canCreateMatch } from '@/lib/entitlements.js';
import { useT } from '@/lib/i18n/index.js';

/** Próximo sábado às 15h, no formato do `<input type="datetime-local">`. */
function sabadoPorOmissao() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(15, 0, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Devolve `abrir()`: mostra a janela e, se se guardar, cria o jogo. */
export function usePrepararJogo({ teamId, team, club, competitions = [] }) {
  const t = useT();
  const ui = useUI();
  const { userId, user } = useAuth();

  return async function abrir() {
    const dados = await ui.open((close) => <Formulario provas={competitions} onFechar={close} />);
    if (!dados) return null;
    const permissao = await canCreateMatch();
    if (!permissao.allowed) {
      ui.toast(permissao.reason === 'free_limit_reached' ? t('licencas.limiteJogos') : t('licencas.redeParaCriar'), 'error', 5200);
      return null;
    }
    const prova = competitions.find((c) => c.id === dados.competitionId);
    const jogo = await matches.create(teamId, {
      opponentName: dados.opponentName,
      competitionId: dados.competitionId || null,
      timing: timingOf(prova || team),
      homeOrAway: dados.homeOrAway,
      scheduledAt: new Date(dados.scheduledAt).getTime(),
      season: club?.currentSeason || null,
    });
    await events.append(
      matchCreated({
        matchId: jogo.id,
        currentPeriod: 0,
        timerStatus: 'STOPPED',
        timerStartedAt: null,
        elapsedMatchMs: 0,
        periodElapsedMs: 0,
        teamScore: 0,
        opponentScore: 0,
      })
    );
    sync.saveNow(userId, user?.email);
    ui.toast(t('prepJogo.guardado'), 'ok');
    return jogo;
  };
}

function Formulario({ provas, onFechar }) {
  const t = useT();
  const { toast } = useUI();
  const [v, setV] = useState({
    opponentName: '',
    scheduledAt: sabadoPorOmissao(),
    homeOrAway: 'HOME',
    competitionId: provas.length === 1 ? provas[0].id : '',
  });
  const campo = (k) => ({ value: v[k], onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) });

  function guardar(e) {
    e.preventDefault();
    if (!v.opponentName.trim()) return toast(t('conv.faltaAdversario'), 'error');
    if (!v.scheduledAt) return;
    if (provas.length && !v.competitionId) return toast(t('novo.escolhaCompeticao'), 'error');
    onFechar({ ...v, opponentName: v.opponentName.trim() });
  }

  return (
    <Dialog title={t('conv.prepararJogo')} onClose={() => onFechar(null)}>
      <p className="modal__hint">{t('prepJogo.hint')}</p>
      <form className="form" onSubmit={guardar}>
        <Field label={t('conv.adversario')}>
          <input className="input" autoFocus maxLength={60} placeholder={t('conv.adversarioExemplo')} {...campo('opponentName')} />
        </Field>
        <div className="form__row">
          <Field label={t('prep.dataHora')}>
            <input className="input" type="datetime-local" required {...campo('scheduledAt')} />
          </Field>
          <Field label={t('prep.casaOuFora')}>
            <select className="input" {...campo('homeOrAway')}>
              <option value="HOME">{t('local.HOME')}</option>
              <option value="AWAY">{t('local.AWAY')}</option>
            </select>
          </Field>
        </div>
        {provas.length ? (
          <Field label={t('prep.competicao')}>
            <select className="input" {...campo('competitionId')}>
              <option value="">{t('novo.escolherCompeticao')}</option>
              {provas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onFechar(null)}>
            {t('comum.cancelar')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('comum.guardar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
