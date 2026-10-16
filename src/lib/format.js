// lib/format.js — apresentação: datas, nomes e etiquetas.
//
// São as funções que estavam em ui/shared.js e não dependem do DOM. Ficam aqui
// para os componentes React as usarem sem arrastar nada de interface.
//
// Desde os idiomas, estas funções leem a escolha do utilizador em vez de terem
// o português escrito lá dentro. As etiquetas dos enums passaram para os
// dicionários: a chave é o valor guardado na base de dados (`GOALKEEPER`), o
// texto é o que muda de língua. Assim os dados no servidor não sabem — nem
// precisam de saber — em que idioma alguém está a olhar para eles.

import { t, localeAtual } from './i18n/index.js';
import { CATALOGO, eRegistoConhecido } from '../domain/registos.js';

// O ano não entra nas datas: cada clube tem uma época associada e todos os jogos
// que se vêem no ecrã são dessa época.
export function dateLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(localeAtual(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dayLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(localeAtual(), { day: '2-digit', month: '2-digit' });
}

/**
 * Nome a mostrar no marcador e nos resumos: o apelido, se existir.
 *
 * "Sporting Clube de Portugal" não cabe num marcador de iPhone; "SCP" cabe. O
 * nome completo continua a ser o que aparece nas listas e nos títulos.
 */
export function clubShort(club) {
  return (club?.shortName || '').trim() || club?.name || t('nome.nos');
}

export function opponentShort(match) {
  return (match?.opponentShortName || '').trim() || match?.opponentName || t('nome.adversario');
}

export function positionLabel(p) {
  return p ? t(`posicao.${p}`) : '—';
}

export function positionShort(p) {
  return p ? t(`posicaoCurta.${p}`) : '—';
}

export function statusLabel(status) {
  return status ? t(`estado.${status}`) : '';
}

export function statusKind(status) {
  if (status === 'FINISHED') return 'muted';
  if (status === 'HALFTIME') return 'warn';
  if (String(status).includes('RUNNING')) return 'live';
  if (String(status).includes('PAUSED')) return 'warn';
  return 'info';
}

export function homeAwayLabel(v) {
  return v ? t(`local.${v}`) : '';
}

/* Estas quatro substituem os acessos diretos aos mapas de constantes. Passar
   sempre por uma função é o que permite trocar o idioma sem tocar em quem as
   chama. */

/**
 * O nome de um tipo de evento. Com o próprio evento à mão, um registo extra
 * diz qual é: "Remate · #7 · Defendido" em vez de só "Registo". `jogadores` é
 * o `state.players` do jogo, para pôr o número.
 */
export function eventLabel(tipo, evento = null, jogadores = null) {
  if (tipo === 'STAT_RECORDED' && evento?.metadata?.registo) {
    return registoLabel(
      { ...evento.metadata, playerId: evento.playerId || evento.metadata.playerId || null },
      jogadores
    );
  }
  return tipo ? t(`evento.${tipo}`) : '';
}

/**
 * Um registo extra numa linha: o que foi, de quem (ou a favor de quem) e o
 * resultado. Um registo que esta versão não conhece fica com o nome genérico.
 */
export function registoLabel(r, jogadores = null) {
  if (!r?.registo || !eRegistoConhecido(r.registo)) return t('evento.STAT_RECORDED');
  const partes = [
    r.registo === 'acao' && r.resultado
      ? t(`registos.resultado.${r.resultado}`)
      : t(`registos.nome.${r.registo}`),
  ];
  const jogador = r.playerId ? jogadores?.[r.playerId] : null;
  if (jogador) partes.push(`#${jogador.number}`);
  else if (CATALOGO[r.registo].por === 'equipa') partes.push(t(`registos.aFavor.${r.equipa === 'THEM' ? 'THEM' : 'US'}`));
  if (r.resultado && r.registo !== 'acao') partes.push(t(`registos.resultado.${r.resultado}`));
  return partes.join(' · ');
}

export function footLabel(f) {
  return t(`pe.${f || 'UNKNOWN'}`);
}

export function cardLabel(c) {
  return c ? t(`cartao.${c}`) : '';
}

export function timingLabel(v) {
  return v ? t(`duracao.${v}`) : '';
}

export function timingShort(v) {
  return v ? t(`duracaoCurta.${v}`) : '';
}

/**
 * A frase de um erro de validação do domínio.
 *
 * O domínio devolve `{ chave, valores }` ou `null`. Esta função é a única
 * ponte entre as duas metades: o domínio decide o que está errado, isto decide
 * como se diz. Aceita `null` para quem quiser escrever `mensagemErro(validar())`
 * sem testar antes.
 */
export function mensagemErro(erro) {
  if (!erro) return '';
  return t(erro.chave, erro.valores);
}

/**
 * "Vitória 4–2 · 02/08" para o cartão do clube e do escalão.
 *
 * Estava escrito duas vezes, uma no painel dos clubes e outra na página do
 * clube, com o português colado no meio. Traduzir o mesmo em dois sítios é a
 * receita para ficarem diferentes.
 */
export function ultimoJogoLabel(entrada, resultado) {
  if (!entrada) return t('resultado.semJogos');
  const palavra =
    resultado === 'W'
      ? t('resultado.vitoria')
      : resultado === 'L'
        ? t('resultado.derrota')
        : t('resultado.empate');
  const placar = `${entrada.state.teamScore}–${entrada.state.opponentScore}`;
  return `${palavra} ${placar} · ${dayLabel(entrada.match.scheduledAt)}`;
}

/** O estado da sincronização por extenso. Recebe um código de `sync.SYNC`. */
export function syncLabel(status) {
  const chaves = {
    SYNCED: 'sinc.sincronizado',
    PENDING: 'sinc.porSincronizar',
    OFFLINE: 'sinc.semLigacao',
    ERROR: 'sinc.erro',
    LOCAL: 'sinc.local',
  };
  return chaves[status] ? t(chaves[status]) : String(status || '');
}
