// data/calendarioCsv.js — o calendário de jogos de um escalão, a partir de uma
// folha de cálculo.
//
// O mesmo princípio do plantel (ver plantelCsv.js): quem tem o calendário da
// associação tem-no no Excel. Cinco colunas, por esta ordem:
//
//   data · hora · adversário · casa/fora · competição
//
// A importação **acrescenta** jogos — não apaga nem muda os que já existem. Um
// jogo que já esteja na lista (mesmo dia, mesmo adversário) é ignorado, para se
// poder importar o mesmo ficheiro duas vezes sem duplicar nada.
//
// A competição tem de estar escrita exatamente como na aba Competições. É de
// propósito: adivinhar ("Camp." ou "Campeonato Distrital"?) metia jogos na
// competição errada sem ninguém dar por isso, e as estatísticas por competição
// ficavam baralhadas. Melhor recusar a linha e dizer porquê.

import { t } from '../i18n/index.js';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';
import es from '../i18n/es.js';
import { toCsv } from './exporter.js';

/** As colunas, sempre por esta ordem. */
const CHAVES_COLUNAS = [
  'calendarioCsv.colData',
  'calendarioCsv.colHora',
  'calendarioCsv.colAdversario',
  'calendarioCsv.colCasaFora',
  'calendarioCsv.colCompeticao',
];

/** Hora por omissão quando a coluna vem em branco. */
export const HORA_POR_OMISSAO = '12:00';

/** Sem acentos, sem maiúsculas, sem espaços a mais — só para comparar textos livres. */
function simples(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* ------------------------------------------------------------- a escrever */

/**
 * O ficheiro de exemplo, com as competições do próprio escalão — assim os
 * nomes já vêm escritos como a app os espera, que é o erro mais provável.
 */
export function calendarioExemploCsv(competicoes = []) {
  const nomes = competicoes.map((c) => c.name).filter(Boolean);
  const a = nomes[0] || 'Campeonato';
  const b = nomes[1] || a;
  const casa = t('local.HOME');
  const fora = t('local.AWAY');
  const rows = [
    CHAVES_COLUNAS.map((k) => t(k)),
    ['14/09/2026', '21:00', 'GD Exemplo', casa, a],
    ['21/09/2026', '18:30', 'Clube Desportivo Modelo', fora, a],
    ['28/09/2026', '20:00', 'Académico FC', casa, b],
    ['05/10/2026', '', 'União Recreativa', fora, a],
  ];
  return toCsv(rows);
}

/* --------------------------------------------------------------- a ler */

/** Divide uma linha de CSV respeitando as aspas (igual ao do plantel). */
function celulas(linha, sep) {
  const out = [];
  let atual = '';
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (dentro && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else dentro = !dentro;
    } else if (ch === sep && !dentro) {
      out.push(atual);
      atual = '';
    } else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

/**
 * Lê uma data escrita por uma pessoa (ou pelo Excel).
 * Aceita `DD/MM/AAAA`, `DD-MM-AAAA`, `DD.MM.AAAA`, `DD/MM/AA` e `AAAA-MM-DD`.
 * @returns {{a:number, m:number, d:number}|null}
 */
export function lerData(txt) {
  const s = String(txt || '').trim();
  let a, m, d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, a, m, d] = r.map(Number);
  else {
    r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!r) return null;
    [, d, m, a] = r.map(Number);
    if (a < 100) a += 2000;
  }
  const data = new Date(a, m - 1, d);
  if (data.getFullYear() !== a || data.getMonth() !== m - 1 || data.getDate() !== d) return null;
  return { a, m, d };
}

/** `21:00`, `21h00`, `21h`, `9:30` → `{h, min}`; em branco → null. */
export function lerHora(txt) {
  const s = String(txt || '').trim().toLowerCase();
  if (!s) return null;
  const r = s.match(/^(\d{1,2})\s*(?::|h)\s*(\d{2})?$/);
  if (!r) return undefined;
  const h = Number(r[1]);
  const min = Number(r[2] || 0);
  if (h > 23 || min > 59) return undefined;
  return { h, min };
}

/** "Casa" / "Fora" nas três línguas, abreviado ou não. */
function indiceCasaFora() {
  const idx = new Map([
    ['c', 'HOME'], ['casa', 'HOME'], ['home', 'HOME'], ['h', 'HOME'], ['local', 'HOME'], ['l', 'HOME'],
    ['f', 'AWAY'], ['fora', 'AWAY'], ['away', 'AWAY'], ['a', 'AWAY'], ['visitante', 'AWAY'], ['v', 'AWAY'],
  ]);
  // O que a app escreve em cada língua (o exemplo sai no idioma do treinador).
  for (const dic of [pt, en, es]) {
    for (const valor of ['HOME', 'AWAY']) {
      const texto = dic[`local.${valor}`];
      if (texto) idx.set(simples(texto), valor);
    }
  }
  return idx;
}

/**
 * Lê o CSV do calendário.
 *
 * Nunca atira: devolve os jogos que se perceberam e a lista de problemas, com o
 * número da linha. Os jogos que já existem são contados à parte.
 *
 * @param {string} texto
 * @param {object} p
 * @param {Array<{id, name}>} p.competicoes as competições do escalão
 * @param {Array<{opponentName, scheduledAt}>} [p.existentes] jogos que já existem
 * @returns {{ jogos: Array, repetidos: number, problemas: Array<{linha, chave, valores?}> }}
 */
export function lerCalendarioCsv(texto, { competicoes = [], existentes = [] } = {}) {
  const limpo = String(texto || '').replace(/^﻿/, '');
  const linhas = limpo.split(/\r?\n/).filter((l) => l.replace(/[;,\s]/g, ''));
  if (!linhas.length) return { jogos: [], repetidos: 0, problemas: [{ linha: 0, chave: 'calendarioCsv.vazio' }] };

  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const primeira = celulas(linhas[0], sep);
  const pareceCabecalho = !lerData(primeira[0]);
  const corpo = pareceCabecalho ? linhas.slice(1) : linhas;
  const offset = pareceCabecalho ? 2 : 1;

  // Exatamente como está na aba Competições: só se tiram os espaços das pontas
  // (que o Excel às vezes acrescenta e ninguém vê).
  const porNome = new Map(competicoes.filter((c) => c?.name).map((c) => [c.name.trim(), c]));
  const casaFora = indiceCasaFora();
  const chaveJogo = (ms, adversario) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${simples(adversario)}`;
  };
  const jaExiste = new Set(existentes.map((m) => chaveJogo(m.scheduledAt, m.opponentName)));

  const jogos = [];
  const problemas = [];
  let repetidos = 0;

  corpo.forEach((linha, i) => {
    const nLinha = i + offset;
    const [dataBruta, horaBruta, adversario, casaForaBruto, competicaoBruta] = celulas(linha, sep);

    const data = lerData(dataBruta);
    if (!data) {
      problemas.push({ linha: nLinha, chave: 'calendarioCsv.dataInvalida', valores: { valor: dataBruta || '—' } });
      return;
    }
    const hora = lerHora(horaBruta);
    if (hora === undefined) {
      problemas.push({ linha: nLinha, chave: 'calendarioCsv.horaInvalida', valores: { valor: horaBruta } });
      return;
    }
    if (!adversario) {
      problemas.push({ linha: nLinha, chave: 'calendarioCsv.semAdversario' });
      return;
    }
    const lado = casaForaBruto ? casaFora.get(simples(casaForaBruto)) : 'HOME';
    if (!lado) {
      problemas.push({ linha: nLinha, chave: 'calendarioCsv.casaForaInvalido', valores: { valor: casaForaBruto } });
      return;
    }
    const nomeProva = String(competicaoBruta || '').trim();
    if (!nomeProva) {
      problemas.push({ linha: nLinha, chave: 'calendarioCsv.semCompeticao' });
      return;
    }
    const prova = porNome.get(nomeProva);
    if (!prova) {
      // Quase igual? Diz-se qual era, para a pessoa ver a diferença.
      const parecida = competicoes.find((c) => simples(c.name) === simples(nomeProva));
      problemas.push({
        linha: nLinha,
        chave: parecida ? 'calendarioCsv.competicaoQuase' : 'calendarioCsv.competicaoDesconhecida',
        valores: { valor: nomeProva, certo: parecida?.name || '' },
      });
      return;
    }

    const { h, min } = hora || { h: 12, min: 0 };
    const scheduledAt = new Date(data.a, data.m - 1, data.d, h, min).getTime();
    const chave = chaveJogo(scheduledAt, adversario);
    if (jaExiste.has(chave)) {
      repetidos += 1;
      return;
    }
    jaExiste.add(chave);
    jogos.push({
      scheduledAt,
      opponentName: adversario,
      homeOrAway: lado,
      competitionId: prova.id,
      competitionName: prova.name,
    });
  });

  if (!jogos.length && !problemas.length && !repetidos) {
    problemas.push({ linha: 0, chave: 'calendarioCsv.vazio' });
  }
  return { jogos, repetidos, problemas };
}
