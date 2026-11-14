'use client';

// components/partilhado/FaixaPartilhado.jsx — a faixa no topo do resumo de um
// jogo com registo partilhado (add-on 'jogo-partilhado'): que papel tem este
// jogo, se já chegou ao servidor, e o "Juntar" (ou o "Desfazer", depois de
// juntado). Aparece nos dois papéis: qualquer um dos dois treinadores junta.

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import * as sync from '@/lib/data/sync.js';
import { hasRemote } from '@/lib/supabase/client.js';
import { desfazerFusao, jogoSincronizado } from '@/lib/partilhado.js';
import { lerPartilha, partilhaTerminada } from '@/domain/partilha.js';
import { useT } from '@/lib/i18n/index.js';
import JuntarDialog, { textoDoErro } from './JuntarDialog.jsx';

/**
 * @param {string}   matchId
 * @param {Array}    events    os eventos do jogo (todos)
 * @param {object}   state     o estado do jogo
 * @param {Function} aoMudar   chamado depois de juntar ou desfazer, com
 *   `{ baseId, outroId, juntou }`: quem mostra a faixa recarrega ou muda de ecrã
 */
export default function FaixaPartilhado({ matchId, events, state, aoMudar }) {
  const t = useT();
  const ui = useUI();
  const { userId, user } = useAuth();
  const partilha = lerPartilha(events);
  const terminado = partilhaTerminada(partilha, state);
  const [sincronizado, setSincronizado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const verificar = useCallback(async () => {
    setSincronizado(await jogoSincronizado(matchId));
  }, [matchId]);

  // Volta a ver sempre que a fila de sincronização muda de estado (acabou de
  // enviar, ficou sem rede, voltou a ter) e quando os eventos mudam.
  useEffect(() => {
    verificar();
    return sync.subscribe(() => verificar());
  }, [verificar, events]);

  if (!partilha.papel) return null;

  async function sincronizar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      // Envia o que este aparelho tem e descarrega o resto: é assim que o jogo
      // do outro aparelho (Tempos ou Registos) chega cá para se poder juntar.
      const r = await sync.saveNow(userId, user?.email);
      if (r.status !== sync.SYNC.OFFLINE && userId) {
        try {
          await sync.pull(userId);
        } catch {
          /* sem rede a meio: fica o que já subiu */
        }
      }
      await verificar();
      if (!(await jogoSincronizado(matchId))) {
        ui.toast(r.status === sync.SYNC.OFFLINE ? t('partilhado.semRede') : t('partilhado.naoSincronizou'), 'error', 5000);
      } else {
        ui.toast(t('partilhado.sincronizou'), 'ok');
      }
    } finally {
      setOcupado(false);
    }
  }

  async function abrirJuntar() {
    const feito = await ui.open((close) => (
      <JuntarDialog matchId={matchId} userId={userId} email={user?.email} onClose={close} />
    ));
    if (!feito) return;
    ui.toast(t('partilhado.juntar.feito', { n: feito.plano.total }), 'ok', 4000);
    aoMudar?.({ baseId: feito.baseId, outroId: feito.outroId, juntou: true });
  }

  async function desfazer() {
    if (ocupado) return;
    if (!(await ui.confirmar(t('partilhado.desfazer.pergunta'), { okLabel: t('partilhado.desfazer.botao') }))) {
      return;
    }
    setOcupado(true);
    try {
      const r = await desfazerFusao(matchId, userId);
      sync.saveNow(userId, user?.email);
      ui.toast(t('partilhado.desfazer.feito'), 'ok', 4000);
      aoMudar?.({ baseId: r.baseId, outroId: r.outroId, juntou: false });
    } catch (err) {
      ui.toast(textoDoErro(t, err), 'error', 5000);
    } finally {
      setOcupado(false);
    }
  }

  const porSubir = terminado && sincronizado === false;
  let texto;
  if (partilha.fusao) texto = t('partilhado.faixa.juntado', { n: partilha.fusao.registos });
  else if (!terminado) texto = t('partilhado.faixa.porTerminar');
  else if (porSubir) texto = t('partilhado.faixa.porSincronizar');
  else texto = t(`partilhado.faixa.pronto.${partilha.papel}`);

  return (
    <section className={`faixa-partilha ${porSubir ? 'faixa-partilha--aviso' : ''}`} aria-label={t('partilhado.botao')}>
      <div className="faixa-partilha__info">
        <Badge kind="partilha">
          {partilha.fusao ? t('partilhado.juntado') : t(`partilhado.papel.${partilha.papel}`)}
        </Badge>
        <span>{texto}</span>
      </div>
      <div className="faixa-partilha__acoes">
        {partilha.fusao ? (
          <button type="button" className="btn btn--ghost" onClick={desfazer} disabled={ocupado}>
            {t('partilhado.desfazer.botao')}
          </button>
        ) : terminado ? (
          <>
            {hasRemote() ? (
              <button
                type="button"
                className={`btn ${porSubir ? 'btn--primary' : 'btn--ghost'}`}
                onClick={sincronizar}
                disabled={ocupado}
                aria-busy={ocupado}
              >
                {ocupado ? t('partilhado.aSincronizar') : t('partilhado.sincronizarAgora')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--primary"
              onClick={abrirJuntar}
              disabled={sincronizado !== true}
              title={porSubir ? t('partilhado.faixa.porSincronizar') : undefined}
            >
              {t('partilhado.juntar.botao')}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
