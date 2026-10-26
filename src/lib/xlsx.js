// lib/xlsx.js — um livro de Excel (.xlsx) escrito à mão.
//
// Um .xlsx é um zip com meia dúzia de ficheiros XML. Para o que aqui se
// precisa — texto, números, negrito, cores de fundo, larguras de coluna e um
// painel congelado — escrever esse XML são duzentas linhas, contra o meio
// megabyte de uma biblioteca de Excel completa. O zip é do `fflate` (pequeno,
// sem dependências, e que o jsPDF já traz).
//
// Abre no Excel, no Numbers do iPhone/Mac, no Google Sheets e no LibreOffice.
// Não é um CSV disfarçado: as cores e os números (percentagens) vão a sério.

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Os caracteres de controlo partem o XML (um nome colado de outro lado
    // pode trazer um).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** "A", "B", …, "Z", "AA"… para o índice de coluna (0 = A). */
export function letraColuna(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const hex = (c) => (Array.isArray(c) ? c.map((v) => v.toString(16).padStart(2, '0')).join('') : String(c).replace('#', '')).toUpperCase();

/**
 * Os estilos de célula: cada combinação diferente de negrito, cor da letra,
 * fundo, alinhamento e formato ganha um índice, uma vez só.
 */
class Estilos {
  constructor() {
    this.fontes = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    // Os dois primeiros preenchimentos são obrigatórios e fixos.
    this.fundos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.bordas = [
      '<border><left/><right/><top/><bottom/><diagonal/></border>',
      '<border><left style="thin"><color rgb="FFD0D7E2"/></left><right style="thin"><color rgb="FFD0D7E2"/></right><top style="thin"><color rgb="FFD0D7E2"/></top><bottom style="thin"><color rgb="FFD0D7E2"/></bottom><diagonal/></border>',
    ];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = new Map();
  }

  indice(lista, xml) {
    const i = lista.indexOf(xml);
    if (i >= 0) return i;
    lista.push(xml);
    return lista.length - 1;
  }

  /**
   * @param {{negrito?: boolean, cor?: string|number[], fundo?: string|number[],
   *          alinhar?: 'left'|'center'|'right', formato?: 'pct'|'int', borda?: boolean}} e
   */
  de(e = {}) {
    const chave = JSON.stringify(e);
    if (this.cache.has(chave)) return this.cache.get(chave);
    const fonte = this.indice(
      this.fontes,
      `<font>${e.negrito ? '<b/>' : ''}<sz val="11"/>${e.cor ? `<color rgb="FF${hex(e.cor)}"/>` : ''}<name val="Calibri"/></font>`
    );
    const fundo = e.fundo
      ? this.indice(this.fundos, `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex(e.fundo)}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const borda = e.borda ? 1 : 0;
    // 9 = "0%" e 1 = "0", dos formatos que o Excel já traz.
    const fmt = e.formato === 'pct' ? 9 : e.formato === 'int' ? 1 : 0;
    const alinhar = e.alinhar ? `<alignment horizontal="${e.alinhar}" vertical="center"/>` : '';
    const xf =
      `<xf numFmtId="${fmt}" fontId="${fonte}" fillId="${fundo}" borderId="${borda}" xfId="0"` +
      `${fmt ? ' applyNumberFormat="1"' : ''}${fonte ? ' applyFont="1"' : ''}${fundo ? ' applyFill="1"' : ''}` +
      `${borda ? ' applyBorder="1"' : ''}${alinhar ? ` applyAlignment="1">${alinhar}</xf>` : '/>'}`;
    const i = this.indice(this.xfs, xf);
    this.cache.set(chave, i);
    return i;
  }

  xml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<fonts count="${this.fontes.length}">${this.fontes.join('')}</fonts>` +
      `<fills count="${this.fundos.length}">${this.fundos.join('')}</fills>` +
      `<borders count="${this.bordas.length}">${this.bordas.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

/** Um nome de folha que o Excel aceita: até 31 caracteres, sem []:*?/\ . */
function nomeDeFolha(nome, usados) {
  let base = String(nome || 'Folha').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Folha';
  let n = 2;
  let final = base;
  while (usados.has(final.toLowerCase())) final = `${base.slice(0, 28)} ${n++}`;
  usados.add(final.toLowerCase());
  return final;
}

/**
 * Gera o .xlsx.
 *
 * @param {Array<{
 *   nome: string,
 *   larguras?: number[],                     largura de cada coluna (em caracteres)
 *   congelar?: {linhas?: number, colunas?: number},
 *   linhas: Array<Array<null|string|number|{v: any, estilo?: object}>>,
 * }>} folhas
 * @returns {Promise<Blob>}
 */
export async function gerarXlsx(folhas) {
  const { zipSync, strToU8 } = await import('fflate');
  const estilos = new Estilos();
  const textos = [];
  const indiceTexto = new Map();
  const texto = (s) => {
    if (!indiceTexto.has(s)) {
      indiceTexto.set(s, textos.length);
      textos.push(s);
    }
    return indiceTexto.get(s);
  };

  const usados = new Set();
  const nomes = folhas.map((f) => nomeDeFolha(f.nome, usados));
  const ficheiros = {};

  folhas.forEach((folha, fi) => {
    const linhasXml = folha.linhas
      .map((linha, li) => {
        const celulas = (linha || [])
          .map((c, ci) => {
            if (c == null || c === '') return '';
            const obj = typeof c === 'object' ? c : { v: c };
            const ref = `${letraColuna(ci)}${li + 1}`;
            const s = obj.estilo ? ` s="${estilos.de(obj.estilo)}"` : '';
            if (obj.v == null || obj.v === '') return obj.estilo ? `<c r="${ref}"${s}/>` : '';
            if (typeof obj.v === 'number' && Number.isFinite(obj.v)) return `<c r="${ref}"${s}><v>${obj.v}</v></c>`;
            return `<c r="${ref}"${s} t="s"><v>${texto(String(obj.v))}</v></c>`;
          })
          .join('');
        return `<row r="${li + 1}">${celulas}</row>`;
      })
      .join('');

    const cols = (folha.larguras || []).length
      ? `<cols>${folha.larguras
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join('')}</cols>`
      : '';

    const { linhas: cl = 0, colunas: cc = 0 } = folha.congelar || {};
    let vista = '<sheetView workbookViewId="0"/>';
    if (cl || cc) {
      const canto = `${letraColuna(cc)}${cl + 1}`;
      const painel = cl && cc ? 'bottomRight' : cl ? 'bottomLeft' : 'topRight';
      vista =
        `<sheetView workbookViewId="0"><pane${cc ? ` xSplit="${cc}"` : ''}${cl ? ` ySplit="${cl}"` : ''}` +
        ` topLeftCell="${canto}" activePane="${painel}" state="frozen"/>` +
        `<selection pane="${painel}" activeCell="${canto}" sqref="${canto}"/></sheetView>`;
    }

    ficheiros[`xl/worksheets/sheet${fi + 1}.xml`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheetViews>${vista}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}` +
        `<sheetData>${linhasXml}</sheetData></worksheet>`
    );
  });

  ficheiros['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      folhas
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '</Types>'
  );
  ficheiros['_rels/.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  );
  ficheiros['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
      '</workbook>'
  );
  ficheiros['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      folhas
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('') +
      `<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${folhas.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
      '</Relationships>'
  );
  // Os estilos e os textos só no fim: é a escrever as folhas que se ficam a
  // conhecer todos.
  ficheiros['xl/styles.xml'] = strToU8(estilos.xml());
  ficheiros['xl/sharedStrings.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">` +
      textos.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') +
      '</sst>'
  );

  const zip = zipSync(ficheiros, { level: 6 });
  return new Blob([zip], { type: MIME_XLSX });
}

