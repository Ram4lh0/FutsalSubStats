'use client';

// lib/atualizacoes.js — dizer ao invólucro nativo que a app arrancou bem.
//
// Parece pouco código para uma funcionalidade grande, e é: com `autoUpdate`
// ligado no `capacitor.config.json`, quem pergunta ao servidor, descarrega e
// aplica é o lado nativo. Do JavaScript só se espera **uma** coisa, e é a mais
// importante de todas.
//
// ## A rede de segurança
//
// Depois de aplicar um pacote novo, o plugin fica à espera de `notifyAppReady()`
// durante 20 segundos. Se não chegar, assume que o pacote está avariado e volta
// sozinho ao anterior.
//
// É esta chamada que separa "posso publicar uma atualização" de "posso deixar
// toda a gente com a app partida e sem forma de a arranjar". Sem revisão da loja
// pelo meio, um erro meu chega a todos os telemóveis ao mesmo tempo — o regresso
// automático é o único travão que existe.
//
// Por isso:
//
//   · É chamada **cedo**, no arranque, antes de qualquer dado ser lido.
//   · É chamada **sempre**, sem condições. Um `if` mal posto aqui transforma-se
//     numa app que reverte sozinha sem ninguém perceber porquê.
//   · **Nunca atira.** Na web, ou sem o plugin instalado, não faz nada.
//
// A tentação de a chamar só depois de os dados carregarem é forte e é errada:
// um treinador sem rede, com a sincronização a falhar, teria a app dada como
// avariada e revertida — quando na verdade estava a funcionar perfeitamente.

let jaAvisou = false;

/**
 * Confirma ao plugin que este pacote arranca. Idempotente e silenciosa.
 */
export async function marcarArranqueBemSucedido() {
  if (jaAvisou) return;
  jaAvisou = true;
  try {
    const mod = await import('@capgo/capacitor-updater');
    await mod.CapacitorUpdater?.notifyAppReady?.();
  } catch {
    // Sem plugin (browser, `npm run dev`) ou versão sem esta função. Não há
    // nada a fazer nem nada a dizer: a app corre na mesma.
  }
}
