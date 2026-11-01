// tests/folhaXlsx.test.js — ler o .xlsx que o Excel grava por cima do exemplo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';

import { xlsxParaCsv, pareceXlsx, pareceXlsAntigo } from '../src/lib/data/folhaXlsx.js';
import { lerCalendarioCsv } from '../src/lib/data/calendarioCsv.js';
import { lerPlantelCsv } from '../src/lib/data/plantelCsv.js';

/** Um .xlsx mínimo, como o Excel o grava: strings partilhadas, estilos e uma folha. */
function xlsx({ linhas, partilhadas = [], numFmts = '', xfs = '<xf numFmtId="0"/>' }) {
  const folha = linhas
    .map((cs, i) => `<row r="${i + 1}">${cs}</row>`)
    .join('');
  return zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="r"><sheets><sheet name="Folha1" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    ),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${folha}</sheetData></worksheet>`),
    'xl/sharedStrings.xml': strToU8(
      `<sst>${partilhadas.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`
    ),
    'xl/styles.xml': strToU8(
      `<styleSheet><numFmts>${numFmts}</numFmts><cellXfs>${xfs}</cellXfs></styleSheet>`
    ),
  });
}

const provas = [{ id: 'k1', name: 'Campeonato Distrital' }];

test('reconhece um .xlsx e o .xls antigo pelos primeiros bytes', () => {
  assert.equal(pareceXlsx(xlsx({ linhas: [] })), true);
  assert.equal(pareceXlsx(strToU8('Data;Hora')), false);
  assert.equal(pareceXlsAntigo(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), true);
});

test('o calendário editado no Excel: datas e horas como números de série', () => {
  // 46279 = 14/09/2026; 0.875 = 21:00. O estilo 1 é data (14), o 2 é hora personalizada.
  const bytes = xlsx({
    partilhadas: ['Data', 'Hora', 'Adversário', 'Casa/Fora', 'Competição', 'GD Exemplo', 'Casa', 'Campeonato Distrital', 'Fora'],
    numFmts: '<numFmt numFmtId="164" formatCode="h:mm;@"/>',
    xfs: '<xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/>',
    linhas: [
      '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c>',
      '<c r="A2" s="1"><v>46279</v></c><c r="B2" s="2"><v>0.875</v></c><c r="C2" t="s"><v>5</v></c><c r="D2" t="s"><v>6</v></c><c r="E2" t="s"><v>7</v></c>',
      // Hora em branco, adversário escrito na hora (inlineStr), data escrita como texto.
      '<c r="A3" t="inlineStr"><is><t>21/09/2026</t></is></c><c r="C3" t="inlineStr"><is><t>CD Modelo &amp; Filhos</t></is></c><c r="D3" t="s"><v>8</v></c><c r="E3" t="s"><v>7</v></c>',
    ],
  });
  const csv = xlsxParaCsv(bytes);
  assert.match(csv, /14\/09\/2026;21:00;GD Exemplo;Casa;Campeonato Distrital/);

  const { jogos, problemas } = lerCalendarioCsv(csv, { competicoes: provas });
  assert.deepEqual(problemas, []);
  assert.equal(jogos.length, 2);
  assert.equal(jogos[1].opponentName, 'CD Modelo & Filhos');
  const d = new Date(jogos[0].scheduledAt);
  assert.deepEqual([d.getDate(), d.getMonth() + 1, d.getHours()], [14, 9, 21]);
});

test('o plantel editado no Excel: números sem casas decimais', () => {
  const bytes = xlsx({
    partilhadas: ['Número', 'Nome', 'Posição', 'João Silva', 'Pivô'],
    linhas: [
      '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>',
      '<c r="A2"><v>7</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c>',
    ],
  });
  const csv = xlsxParaCsv(bytes);
  assert.match(csv, /\r\n7;João Silva;Pivô$/);
});

test('um zip que não é um .xlsx atira', () => {
  assert.throws(() => xlsxParaCsv(zipSync({ 'a.txt': strToU8('olá') })));
});
