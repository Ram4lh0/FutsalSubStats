// src/domain/escaloes.js — a ordem em que os escalões aparecem.
//
// Por ordem alfabética, "Seniores" calha antes de "Sub-11", mas "Sub-11" vem
// antes de "Sub-13" — ao contrário de como um clube pensa nos escalões, que é
// do mais velho para o mais novo. Aqui cada nome ganha uma idade aproximada e
// a lista desce por ela. O nome é texto livre, por isso o que não se reconhece
// vai para o fim, por ordem alfabética, em vez de adivinhar.

const NOMES = [
  [/veteran/, 40],
  [/s[eé]nior/, 30],
  [/junior|júnior/, 19],
  [/juvenis|juvenil/, 17],
  [/cadete/, 16],
  [/iniciad/, 15],
  [/infantil|infantis/, 13],
  [/alev[ií]n/, 12],
  [/pre-?benjam/, 9],
  [/benjam/, 11],
  [/traquina/, 9],
  [/petiz/, 7],
];

/** Idade de referência do escalão, ou `null` se o nome não disser nada. */
export function idadeDoEscalao(nome) {
  const n = String(nome || '').toLowerCase();
  // "Sub-11", "Sub 11", "U11", "U-11", "Under 11".
  const sub = n.match(/\b(?:sub|u|under)[\s-]?(\d{1,2})\b/);
  if (sub) return Number(sub[1]);
  for (const [padrao, idade] of NOMES) if (padrao.test(n)) return idade;
  return null;
}

/** Do mais velho para o mais novo; empates e desconhecidos por nome. */
export function compararEscaloes(a, b) {
  const ia = idadeDoEscalao(a.name);
  const ib = idadeDoEscalao(b.name);
  if (ia !== ib) {
    if (ia == null) return 1;
    if (ib == null) return -1;
    return ib - ia;
  }
  return a.name.localeCompare(b.name, 'pt', { numeric: true });
}
