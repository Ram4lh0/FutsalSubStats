// tools/painel/guardas.mjs — o que separa o painel do resto do browser.
//
// Está fora do `servidor.mjs` por uma razão prática: esse ficheiro vai buscar a
// chave de serviço mal é importado, e termina o processo se não a encontrar.
// Aqui não há nada disso, portanto os testes podem apertar estas três funções
// sem chave nenhuma no ambiente — e são precisamente estas que não podem estar
// erradas.
//
// ## De que é que isto nos defende
//
// O painel ouve em `127.0.0.1`, o que muita gente confunde com "ninguém lhe
// chega". Chega: qualquer página aberta noutro separador do teu browser pode
// mandar-lhe pedidos. Um serviço privilegiado e sem autenticação no localhost é
// uma classe de ataque com nome próprio.

/**
 * O `Host` tem de ser este computador, nesta porta.
 *
 * Aceitar qualquer um deixaria alguém apontar um domínio seu para 127.0.0.1 —
 * "DNS rebinding" — e falar com o painel a partir de uma página que controla.
 * Para o browser, a origem passaria a ser a dele, e a política de origens
 * deixava de nos proteger.
 */
export function hostAceite(host, porta) {
  return host === `127.0.0.1:${porta}` || host === `localhost:${porta}`;
}

/**
 * A chave da sessão, tirada do cabeçalho ou da barra de endereço.
 *
 * No endereço só para a primeira visita: a página guarda-a, limpa-a do endereço
 * e daí em diante manda-a no cabeçalho. Assim não fica no histórico nem numa
 * captura de ecrã.
 */
export function chaveDoPedido(url, cabecalhos = {}) {
  return cabecalhos['x-painel'] || new URL(url, 'http://x').searchParams.get('chave') || null;
}

/**
 * Compara sem deixar o tempo da comparação dizer quantos caracteres estavam
 * certos. É barato, e a alternativa é uma comparação que responde mais depressa
 * quando erra no primeiro caracter do que quando erra no último.
 */
export function chaveCorrecta(recebida, esperada) {
  if (typeof recebida !== 'string' || typeof esperada !== 'string') return false;
  if (recebida.length !== esperada.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperada.length; i += 1) {
    diferenca |= recebida.charCodeAt(i) ^ esperada.charCodeAt(i);
  }
  return diferenca === 0;
}
