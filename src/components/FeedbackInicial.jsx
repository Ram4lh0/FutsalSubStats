'use client';

// components/FeedbackInicial.jsx — os popups de feedback, cada um uma única vez
// por conta.
//
// Há dois momentos (coluna `momento` em `feedback_inicial`):
//
//   'registo'    — só para contas criadas a partir de CRIADAS_DESDE, logo à
//                  entrada: onde ouviram falar de nós e um email de contacto.
//   'dois_jogos' — quando a conta chega aos dois jogos registados (os mesmos
//                  que o painel conta: não arquivados, dos escalões que a conta
//                  vê): o que está a achar da app. Quem já respondeu no registo
//                  só vê essa pergunta; as contas antigas veem as três.
//
// Respondido ou fechado, cada momento nunca mais aparece: a marca é a linha no
// Supabase (migrações 20261027140000 e 20261027150000), para não voltar noutro
// dispositivo. O localStorage só serve para não perguntar ao servidor a cada
// arranque.
//
// Nunca interrompe nada: não aparece no jogo ao vivo, no tutorial guiado, nos
// ecrãs sem sessão nem por cima de outra janela. Fica para a próxima vez que
// nada disso estiver a acontecer.

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { supabase } from '@/lib/supabase/client.js';
import { noJogoAoVivo } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';
import { Dialog, useUI } from '@/lib/ui.jsx';
import {
  isRecentSignup,
  readGuidedTutorialState,
  wasGuidedTutorialPrompted,
} from '@/lib/tutorial.js';

const CHAVE_VISTO = 'futsal-feedback-inicial';
const CHAVE_PENDENTE = 'futsal-feedback-inicial-pendente';

// Ecrãs onde o popup não faz sentido: sem sessão, a meio do tutorial ou o jogo
// de experiência.
const SEM_POPUP = /^\/(login|password|delete-account|privacy|tutorial|jogo)(\/|$)/;

// O popup do registo é para quem cria conta a partir de agora, não para as
// contas que já existiam quando ele saiu.
const CRIADAS_DESDE = Date.parse('2026-10-27T00:00:00Z');

const JOGOS_MINIMOS = 2;
// Enquanto a conta não chega aos dois jogos, volta-se a contar ao mudar de
// ecrã, mas no máximo uma vez por minuto.
const INTERVALO_ENTRE_CONTAGENS = 60 * 1000;

function ler(chave) {
  try {
    return globalThis.localStorage?.getItem(chave) ?? null;
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    if (valor === null) globalThis.localStorage?.removeItem(chave);
    else globalThis.localStorage?.setItem(chave, valor);
  } catch {
    /* sem storage: o servidor continua a ser a marca que conta */
  }
}

/** Grava a resposta (ou o "fechou sem responder"). Já existir conta como feito. */
async function enviar(sb, linha) {
  const { error } = await sb.from('feedback_inicial').insert(linha);
  return !error || error.code === '23505';
}

export default function FeedbackInicial() {
  const { userId, user } = useAuth();
  const ui = useUI();
  const t = useT();
  const pathname = usePathname() || '';
  const aTratar = useRef(null);
  const ultimaContagem = useRef(0);

  const bloqueado =
    !userId || ui.dialogOpen || noJogoAoVivo(pathname) || SEM_POPUP.test(pathname);

  useEffect(() => {
    if (bloqueado || aTratar.current === userId) return;
    const sb = supabase();
    if (!sb) return;

    // Conta acabada de criar: primeiro o convite do tutorial, depois isto.
    const tutorial = readGuidedTutorialState();
    if (tutorial.active) return;
    if (isRecentSignup(userId, user?.created_at) && !wasGuidedTutorialPrompted(userId)) return;

    const visto = (momento) => `${CHAVE_VISTO}:${momento}:${userId}`;
    const contaNova = Date.parse(user?.created_at || '') >= CRIADAS_DESDE;
    const porVer = [contaNova && 'registo', 'dois_jogos'].filter(
      (m) => m && ler(visto(m)) !== '1'
    );
    if (!porVer.length) return;
    // Só falta o dos dois jogos: a contagem não precisa de correr a cada ecrã.
    if (porVer[0] === 'dois_jogos' && Date.now() - ultimaContagem.current < INTERVALO_ENTRE_CONTAGENS) {
      return;
    }

    let cancelado = false;
    const espera = setTimeout(async () => {
      if (cancelado) return;
      aTratar.current = userId;

      // Uma resposta que ficou por enviar (sem rede) vai agora, sem perguntar
      // outra vez.
      const pendente = ler(`${CHAVE_PENDENTE}:${userId}`);
      if (pendente) {
        try {
          if (await enviar(sb, JSON.parse(pendente))) gravar(`${CHAVE_PENDENTE}:${userId}`, null);
        } catch {
          /* fica para a próxima */
        }
        return;
      }

      const { data, error } = await sb
        .from('feedback_inicial')
        .select('momento, respondido')
        .eq('user_id', userId);
      if (error) {
        // Sem rede ou sem a tabela: tenta-se noutra altura.
        aTratar.current = null;
        return;
      }
      const noServidor = new Map((data || []).map((l) => [l.momento, l]));
      for (const m of noServidor.keys()) gravar(visto(m), '1');

      let momento = porVer.find((m) => !noServidor.has(m));
      if (!momento) return;

      if (momento === 'dois_jogos') {
        // Ainda sem dois jogos: não fica marcado nada, volta-se a ver mais tarde.
        ultimaContagem.current = Date.now();
        const { count, error: erroJogos } = await sb
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .is('archived_at', null);
        if (erroJogos || (count ?? 0) < JOGOS_MINIMOS || cancelado) {
          aTratar.current = null;
          return;
        }
      }

      // No segundo momento, quem já disse onde nos conheceu só vê a opinião.
      const soOpiniao = momento === 'dois_jogos' && Boolean(noServidor.get('registo')?.respondido);
      const perguntas =
        momento === 'registo'
          ? ['origem', 'email']
          : soOpiniao
            ? ['opiniao']
            : ['origem', 'email', 'opiniao'];

      // A marca só fica depois de responder ou fechar: se a app for fechada com
      // o popup aberto, ele volta a aparecer na próxima vez.
      const resposta = await ui.open((close) => (
        <FormFeedback perguntas={perguntas} emailDaConta={user?.email || ''} onClose={close} />
      ));
      gravar(visto(momento), '1');

      const linha = resposta
        ? { user_id: userId, momento, respondido: true, ...resposta }
        : { user_id: userId, momento, respondido: false };
      const enviado = await enviar(sb, linha).catch(() => false);
      if (!enviado) gravar(`${CHAVE_PENDENTE}:${userId}`, JSON.stringify(linha));
      if (resposta) ui.toast(t('feedbackInicial.obrigado'), 'ok');
    }, 1500);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [bloqueado, pathname, userId, user?.created_at, user?.email, ui, t]);

  return null;
}

function FormFeedback({ perguntas, emailDaConta, onClose }) {
  const t = useT();
  const [origem, setOrigem] = useState('');
  const [email, setEmail] = useState(emailDaConta);
  const [opiniao, setOpiniao] = useState('');
  const tem = (p) => perguntas.includes(p);
  const valores = { origem, email, opiniao };
  const vazio = !perguntas.some((p) => valores[p].trim());

  const submeter = (e) => {
    e.preventDefault();
    if (vazio) return;
    onClose({
      origem: (tem('origem') && origem.trim().slice(0, 500)) || null,
      email: (tem('email') && email.trim().slice(0, 320)) || null,
      opiniao: (tem('opiniao') && opiniao.trim().slice(0, 4000)) || null,
    });
  };

  return (
    <Dialog title={t('feedbackInicial.titulo')} onClose={() => onClose(null)}>
      <form className="form" onSubmit={submeter}>
        {tem('origem') ? (
          <label className="field">
            <span className="field__label">{t('feedbackInicial.origem')}</span>
            <input
              className="input"
              value={origem}
              maxLength={500}
              placeholder={t('feedbackInicial.origemPlaceholder')}
              onChange={(e) => setOrigem(e.target.value)}
            />
          </label>
        ) : null}
        {tem('email') ? (
          <label className="field">
            <span className="field__label">{t('feedbackInicial.email')}</span>
            <input
              className="input"
              type="email"
              value={email}
              maxLength={320}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        ) : null}
        {tem('opiniao') ? (
          <label className="field">
            <span className="field__label">{t('feedbackInicial.opiniao')}</span>
            <textarea
              className="input input--area"
              value={opiniao}
              maxLength={4000}
              rows={4}
              onChange={(e) => setOpiniao(e.target.value)}
            />
          </label>
        ) : null}
        <footer className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onClose(null)}>
            {t('feedbackInicial.agoraNao')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={vazio}>
            {t('feedbackInicial.enviar')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
