// data/plantelCsv.js — o plantel de um escalão, de e para uma folha de cálculo.
//
// Porquê CSV e não JSON: quem tem o plantel escrito tem-no no Excel, não num
// editor de texto. O ficheiro que sai daqui abre com dois cliques, corrige-se
// onde já se corrigia, e volta a entrar. Um JSON obrigaria a app a explicar
// chavetas a alguém que só quer mudar um número de camisola.
//
// A regra que molda o resto: **o que se importa é o que se exportou**. Mesmas
// colunas, mesma ordem, mesmo separador. Assim não há dois formatos a manter, e
// o botão de exportar é, ao mesmo tempo, o modelo de importação.
//
// O que isso obriga a resolver: as colunas e os valores saem traduzidos. Um
// treinador espanhol exporta "Portero" e um português exporta "Guarda-redes" —
// e os dois têm de voltar a entrar. Por isso a leitura aceita as três línguas e,
// se não reconhecer o cabeçalho, cai na ordem das colunas.

import { POSITIONS_ALL, FOOT_ALL } from '../../domain/constants.js';
import { t, IDIOMAS } from '../i18n/index.js';
import { toCsv } from './exporter.js';

/** As cinco colunas, sempre por esta ordem. */
const COLUNAS = ['numero', 'nome', 'posicao', 'pe', 'estado'];

const CHAVE_DA_COLUNA = {
  numero: 'stats.numero',
  nome: 'plantel.nome',
  posicao: 'csv.posicaoPreferencial',
  pe: 'csv.peForte',
  estado: 'csv.estado',
};

/* ------------------------------------------------------------- dicionários */

// Os dicionários são carregados uma vez e usados ao contrário: de "Portero"
// para GOALKEEPER. É a única maneira de ler um ficheiro que saiu de uma app
// noutra língua.
/** Sem acentos, sem maiúsculas, sem espaços a mais. */
function simples(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Um índice de "texto escrito por uma pessoa" → valor do domínio.
 *
 * Entram as três traduções, as abreviaturas (GR, GK, POR) e o próprio valor
 * cru — alguém que escreva `GOALKEEPER` na folha também tem de ser entendido.
 */
function indiceDe(valores, chaves) {
  const idx = new Map();
  for (const valor of valores) {
    idx.set(simples(valor), valor);
    for (const prefixo of chaves) {
      for (const { codigo } of IDIOMAS) {
        const texto = traduzirEm(codigo, `${prefixo}.${valor}`);
        if (texto) idx.set(simples(texto), valor);
      }
    }
  }
  return idx;
}

// Traduzir numa língua que não é a escolhida: é preciso para construir os
// índices sem mudar o idioma da app a meio de uma importação.
let porIdioma = null;
async function carregarDicionarios() {
  if (porIdioma) return porIdioma;
  const [pt, en, es] = await Promise.all([
    import('../i18n/pt.js'),
    import('../i18n/en.js'),
    import('../i18n/es.js'),
  ]);
  porIdioma = { pt: pt.default, en: en.default, es: es.default };
  return porIdioma;
}
function traduzirEm(codigo, chave) {
  return porIdioma?.[codigo]?.[chave] || null;
}

/* ------------------------------------------------------------- a escrever */

/** O CSV do plantel: é este ficheiro que se volta a importar. */
export function plantelCsv(jogadores) {
  const rows = [COLUNAS.map((c) => t(CHAVE_DA_COLUNA[c]))];
  for (const p of jogadores) {
    rows.push([
      p.shirtNumber,
      p.name,
      t(`posicao.${p.preferredPosition || 'UNIVERSAL'}`),
      t(`pe.${p.strongFoot || 'UNKNOWN'}`),
      p.isActive ? t('plantel.etiquetaAtivo') : t('plantel.etiquetaInativo'),
    ]);
  }
  return toCsv(rows);
}

/**
 * O ficheiro de exemplo.
 *
 * Existe para responder à pergunta que trava toda a gente na primeira vez: "que
 * formato é que isto quer?". Mostrar é mais rápido do que explicar — abre-se no
 * Excel, trocam-se os nomes, importa-se.
 *
 * Tem uma linha por posição, para se ver como cada uma se escreve, e um jogador
 * inativo, para se perceber que a coluna existe.
 */
export function plantelExemploCsv() {
  const exemplo = [
    { shirtNumber: 1, name: 'Rui Almeida', preferredPosition: 'GOALKEEPER', strongFoot: 'RIGHT', isActive: true },
    { shirtNumber: 4, name: 'Tiago Nunes', preferredPosition: 'FIXO', strongFoot: 'RIGHT', isActive: true },
    { shirtNumber: 7, name: 'Miguel Faria', preferredPosition: 'LEFT_WINGER', strongFoot: 'LEFT', isActive: true },
    { shirtNumber: 8, name: 'André Costa', preferredPosition: 'RIGHT_WINGER', strongFoot: 'RIGHT', isActive: true },
    { shirtNumber: 9, name: 'Pedro Lima', preferredPosition: 'PIVOT', strongFoot: 'BOTH', isActive: true },
    { shirtNumber: 10, name: 'João Marques', preferredPosition: 'UNIVERSAL', strongFoot: 'RIGHT', isActive: true },
    { shirtNumber: 12, name: 'Hugo Barros', preferredPosition: 'GOALKEEPER', strongFoot: 'RIGHT', isActive: false },
  ];
  return plantelCsv(exemplo);
}

/* --------------------------------------------------------------- a ler */

/**
 * Divide uma linha de CSV respeitando as aspas.
 *
 * Escrito à mão de propósito: um nome com ponto e vírgula — "Sousa; Jr." — é
 * raro mas acontece, e um `split(';')` partia-o ao meio sem dizer nada.
 */
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
 * Lê o CSV e devolve o que dele se percebeu.
 *
 * Nunca atira: devolve as linhas boas e a lista de problemas, com o número da
 * linha do ficheiro. Um erro de escrita na linha 12 não pode impedir alguém de
 * ver que as outras 19 estão bem.
 *
 * @returns {{ jogadores: Array, problemas: Array<{linha:number, chave:string, valores?:object}> }}
 */
export async function lerPlantelCsv(texto) {
  await carregarDicionarios();

  const posicoes = indiceDe(POSITIONS_ALL, ['posicao', 'posicaoCurta']);
  const pes = indiceDe(FOOT_ALL, ['pe']);
  const ativos = new Set();
  const inativos = new Set();
  for (const { codigo } of IDIOMAS) {
    ativos.add(simples(traduzirEm(codigo, 'plantel.etiquetaAtivo')));
    inativos.add(simples(traduzirEm(codigo, 'plantel.etiquetaInativo')));
  }

  const limpo = String(texto || '').replace(/^\uFEFF/, '');
  const linhas = limpo.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { jogadores: [], problemas: [{ linha: 0, chave: 'plantelCsv.vazio' }] };

  // Ponto e vírgula é o que a app escreve (e o que o Excel português espera),
  // mas quem tiver o Excel em inglês grava com vírgula. Ganha o que aparecer
  // mais vezes no cabeçalho.
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';

  // O cabeçalho é opcional: se a primeira linha já for um jogador, lê-se pela
  // ordem das colunas. Ninguém deve ser obrigado a escrever um cabeçalho certo
  // para conseguir importar cinco nomes.
  const primeira = celulas(linhas[0], sep);
  const pareceCabecalho = !/^\d+$/.test(primeira[0] || '');
  const corpo = pareceCabecalho ? linhas.slice(1) : linhas;
  const offset = pareceCabecalho ? 2 : 1;

  const jogadores = [];
  const problemas = [];
  const numerosVistos = new Map();

  corpo.forEach((linha, i) => {
    const nLinha = i + offset;
    const c = celulas(linha, sep);
    const [numeroBruto, nome, posicaoBruta, peBruto, estadoBruto] = c;

    if (!nome || !nome.trim()) {
      problemas.push({ linha: nLinha, chave: 'plantelCsv.semNome' });
      return;
    }

    // A célula tem de ter mesmo um algarismo. Sem esta condição, `Number('')`
    // dá 0 — e o zero é um número de camisola legítimo, usado por guarda-redes.
    // Uma linha com a coluna em branco entrava como "o jogador número 0" e
    // ainda roubava o lugar a quem tivesse mesmo o 0.
    const temAlgarismo = /\d/.test(String(numeroBruto ?? ''));
    const numero = Number(String(numeroBruto).replace(/[^\d-]/g, ''));
    if (!temAlgarismo || !Number.isInteger(numero) || numero < 0 || numero > 99) {
      problemas.push({ linha: nLinha, chave: 'plantelCsv.numeroInvalido', valores: { valor: numeroBruto } });
      return;
    }
    if (numerosVistos.has(numero)) {
      problemas.push({
        linha: nLinha,
        chave: 'plantelCsv.numeroRepetido',
        valores: { n: numero, linha: numerosVistos.get(numero) },
      });
      return;
    }
    numerosVistos.set(numero, nLinha);

    // Posição e pé são opcionais: em branco vale o valor por omissão. Recusar um
    // plantel inteiro por causa de uma coluna que o treinador não preencheu era
    // castigar quem só quer os nomes lá dentro.
    const posicao = posicaoBruta ? posicoes.get(simples(posicaoBruta)) : 'UNIVERSAL';
    if (posicaoBruta && !posicao) {
      problemas.push({
        linha: nLinha,
        chave: 'plantelCsv.posicaoDesconhecida',
        valores: { valor: posicaoBruta },
      });
      return;
    }

    const pe = peBruto ? pes.get(simples(peBruto)) : 'UNKNOWN';
    if (peBruto && !pe) {
      problemas.push({ linha: nLinha, chave: 'plantelCsv.peDesconhecido', valores: { valor: peBruto } });
      return;
    }

    const estado = simples(estadoBruto);
    const isActive = !estado ? true : !inativos.has(estado);

    jogadores.push({
      shirtNumber: numero,
      name: nome.trim(),
      preferredPosition: posicao || 'UNIVERSAL',
      strongFoot: pe || 'UNKNOWN',
      isActive,
    });
  });

  if (!jogadores.length && !problemas.length) {
    problemas.push({ linha: 0, chave: 'plantelCsv.vazio' });
  }
  return { jogadores, problemas };
}
