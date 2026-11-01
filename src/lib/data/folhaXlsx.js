// data/folhaXlsx.js — ler um ficheiro do Excel (.xlsx) como se fosse um CSV.
//
// O plantel e o calendário importam-se de um CSV, mas quem abre o exemplo no
// Excel (sobretudo no tablet) e carrega em guardar fica com um .xlsx — e o
// seletor de ficheiros nem o deixava escolher. Em vez de ensinar toda a gente
// a "Guardar como CSV", a app lê o .xlsx e transforma a primeira folha no mesmo
// texto que o CSV daria. Os leitores (plantelCsv.js, calendarioCsv.js) não
// sabem a diferença.
//
// Um .xlsx é um zip com XML lá dentro. Chega-nos o essencial: as strings
// partilhadas, os estilos (para saber que células são datas ou horas) e a
// primeira folha. Nada de fórmulas — o Excel guarda sempre o último valor.

import { unzipSync, strFromU8 } from 'fflate';
import { toCsv } from './exporter.js';

/** Formatos de número do Excel que já vêm definidos (sem `<numFmt>`). */
const FORMATOS_DATA = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
const FORMATOS_HORA = new Set([18, 19, 20, 21, 45, 46, 47]);

/** O ficheiro é um zip (`PK`)? É assim que começa qualquer .xlsx. */
export function pareceXlsx(bytes) {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** O formato antigo do Excel (.xls, 97-2003) — não o lemos. */
export function pareceXlsAntigo(bytes) {
  return bytes.length > 7 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

function desescapar(s) {
  return s
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function atributo(attrs, nome) {
  const r = attrs.match(new RegExp(`(?:^|\\s)${nome}="([^"]*)"`));
  return r ? r[1] : null;
}

/** O texto de um `<si>` ou `<is>`, juntando os pedaços com formatação (`<r>`). */
function textoRico(xml) {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of semFonetica.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return desescapar(out);
}

/** "AB12" → 27 (colunas a contar do zero). */
function indiceColuna(ref) {
  const letras = (ref.match(/^[A-Z]+/) || [''])[0];
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Que tipo de formato é: 'data', 'hora' ou null. */
function tipoFormato(id, personalizados) {
  if (FORMATOS_DATA.has(id)) return 'data';
  if (FORMATOS_HORA.has(id)) return 'hora';
  const codigo = personalizados.get(id);
  if (!codigo) return null;
  // Tira o texto entre aspas e os [blocos] (cores, locale) antes de olhar.
  const limpo = codigo.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').toLowerCase();
  if (/[dy]/.test(limpo)) return 'data';
  if (/[hs]/.test(limpo)) return 'hora';
  return null;
}

const dois = (n) => String(n).padStart(2, '0');

/** Número de série do Excel → `DD/MM/AAAA` (ou `HH:MM` para horas). */
function serieParaTexto(valor, tipo, data1904) {
  if (tipo === 'hora' || (tipo === 'data' && valor < 1)) {
    const minutos = Math.round((valor - Math.floor(valor)) * 24 * 60) % (24 * 60);
    return `${dois(Math.floor(minutos / 60))}:${dois(minutos % 60)}`;
  }
  // Dias desde 30/12/1899 (o Excel finge que 1900 foi bissexto; esta origem já
  // conta com isso para qualquer data depois de março de 1900).
  const base = data1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + Math.floor(valor) * 86400000);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Um número sem os restos de vírgula flutuante (`7.000000001` → `7`). */
function numeroParaTexto(valor) {
  if (Number.isInteger(valor)) return String(valor);
  return String(Number(valor.toPrecision(12)));
}

/**
 * Transforma a primeira folha de um .xlsx no texto de um CSV (com `;`, como os
 * exemplos que a app descarrega). Atira se o zip não for um .xlsx.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function xlsxParaCsv(bytes) {
  const zip = unzipSync(bytes);
  const ler = (nome) => (zip[nome] ? strFromU8(zip[nome]) : null);

  const livro = ler('xl/workbook.xml');
  if (!livro) throw new Error('não é um .xlsx');
  const data1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(livro);

  // A primeira folha pela ordem das abas — não necessariamente sheet1.xml.
  let caminhoFolha = 'xl/worksheets/sheet1.xml';
  const primeiraAba = livro.match(/<sheet\b([^>]*)\/?>/);
  const rels = ler('xl/_rels/workbook.xml.rels');
  if (primeiraAba && rels) {
    const rid = atributo(primeiraAba[1], 'r:id');
    for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (atributo(m[1], 'Id') !== rid) continue;
      const alvo = atributo(m[1], 'Target') || '';
      caminhoFolha = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`;
    }
  }
  const folha = ler(caminhoFolha);
  if (!folha) throw new Error('folha em falta');

  const partilhadas = [];
  for (const m of (ler('xl/sharedStrings.xml') || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    partilhadas.push(textoRico(m[1]));
  }

  // Estilo de cada célula (o `s="3"`) → formato de número → é data/hora?
  const tiposEstilo = [];
  const estilos = ler('xl/styles.xml') || '';
  const personalizados = new Map();
  for (const m of estilos.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    personalizados.set(Number(atributo(m[1], 'numFmtId')), desescapar(atributo(m[1], 'formatCode') || ''));
  }
  const xfs = estilos.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (xfs) {
    for (const m of xfs[1].matchAll(/<xf\b([^>]*?)\/?>/g)) {
      tiposEstilo.push(tipoFormato(Number(atributo(m[1], 'numFmtId') || 0), personalizados));
    }
  }

  const linhas = [];
  for (const mr of folha.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const nLinha = Number(atributo(mr[1], 'r')) || linhas.length + 1;
    const celulas = [];
    let proxima = 0;
    for (const mc of (mr[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mc[1];
      const dentro = mc[2] || '';
      const ref = atributo(attrs, 'r');
      const col = ref ? indiceColuna(ref) : proxima;
      proxima = col + 1;

      const tipo = atributo(attrs, 't');
      const v = dentro.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      let texto = '';
      if (tipo === 'inlineStr') {
        const is = dentro.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
        texto = is ? textoRico(is[1]) : '';
      } else if (!v) {
        texto = '';
      } else if (tipo === 's') {
        texto = partilhadas[Number(v[1])] ?? '';
      } else if (tipo === 'str' || tipo === 'e' || tipo === 'd') {
        texto = desescapar(v[1]);
      } else if (tipo === 'b') {
        texto = v[1] === '1' ? 'TRUE' : 'FALSE';
      } else {
        const numero = Number(v[1]);
        const formato = tiposEstilo[Number(atributo(attrs, 's') || 0)];
        texto = Number.isNaN(numero)
          ? desescapar(v[1])
          : formato
            ? serieParaTexto(numero, formato, data1904)
            : numeroParaTexto(numero);
      }
      celulas[col] = texto;
    }
    // Linhas em branco no meio ficam em branco: os leitores ignoram-nas.
    while (linhas.length < nLinha - 1) linhas.push([]);
    linhas.push(Array.from(celulas, (c) => c ?? ''));
  }

  return toCsv(linhas);
}
