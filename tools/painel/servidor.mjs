// tools/painel/servidor.mjs — o painel de administração, só nesta máquina.
//
//   npm run painel
//
// Abre um endereço em `127.0.0.1` com a lista de contas, licenças, clubes,
// escalões e jogos, e com duas acções: criar uma conta já com a licença
// escolhida, e mudar a licença de uma conta que já existe.
//
// ## Porque é que isto é local e não um site
//
// O painel precisa da `SUPABASE_SERVICE_ROLE_KEY`, que ignora **toda** a
// segurança por linha: com ela lê-se e apaga-se a base de dados inteira, de
// qualquer cliente. Num comando nesta consola, a chave nunca sai daqui. Num
// site, teria de viver num servidor, atrás de um endereço que qualquer pessoa
// pode encontrar — e esse endereço passava a ser o alvo mais valioso de todo o
// sistema.
//
// Isto dá a interface sem dar o alvo. O preço é só funcionar à secretária, o
// que, sendo tu o único utilizador, não é preço nenhum.
//
// ## Contra o que é que se defende, já que só corre aqui
//
// Contra o browser. Uma página aberta noutro separador — um anúncio, um fórum,
// qualquer coisa — pode mandar pedidos para `http://127.0.0.1:4321` sem tu
// saberes. Não é hipotético: é uma classe de ataque com nome, e o que a torna
// possível é exactamente isto, um serviço privilegiado sem autenticação a ouvir
// no localhost.
//
// Três coisas travam isso:
//
//   1. Uma chave aleatória gerada a cada arranque, que vai no endereço que se
//      abre e é exigida em **todos** os pedidos. Uma página estranha não a sabe.
//   2. O cabeçalho `Host` tem de ser `127.0.0.1` ou `localhost` com esta porta.
//      É o que trava o "DNS rebinding", em que um nome que o atacante controla
//      passa a apontar para o teu computador.
//   3. Escreve-se por `POST` com `content-type: application/json`, que um
//      formulário de outro site não consegue enviar sem passar primeiro pela
//      autorização do browser.
//
// Nada disto substitui a primeira regra, que é a chave nunca sair da consola.

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { clienteAdmin } from '../chave-de-servico.mjs';
import { estado, convidar, mudarLicenca } from './api.mjs';
import { hostAceite, chaveDoPedido, chaveCorrecta } from './guardas.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const PORTA = Number(process.env.PORTA_DO_PAINEL) || 4321;

const sb = clienteAdmin(RAIZ);
const CHAVE = randomBytes(24).toString('hex');

/* -------------------------------------------------------------- o servidor */

function responder(res, codigo, corpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(codigo, {
    'content-type': tipo,
    // O painel não é para ser embebido, guardado nem indexado por nada.
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
}

async function corpoJson(req) {
  if (!/^application\/json/.test(req.headers['content-type'] || '')) {
    throw new Error('Só se escreve por JSON.');
  }
  const pedacos = [];
  let bytes = 0;
  for await (const p of req) {
    bytes += p.length;
    if (bytes > 64 * 1024) throw new Error('Pedido grande demais.');
    pedacos.push(p);
  }
  return JSON.parse(Buffer.concat(pedacos).toString('utf8') || '{}');
}

const servidor = createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname;

  if (!hostAceite(req.headers.host, PORTA)) return responder(res, 400, { erro: 'Host inesperado.' });
  if (!chaveCorrecta(chaveDoPedido(req.url, req.headers), CHAVE)) {
    return responder(res, 403, { erro: 'Chave da sessão errada. Abre o endereço que o comando escreveu.' });
  }

  try {
    if (req.method === 'GET' && caminho === '/') {
      return responder(res, 200, readFileSync(join(AQUI, 'pagina.html'), 'utf8'), 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && caminho === '/api/estado') {
      return responder(res, 200, await estado(sb));
    }

    if (req.method === 'POST' && caminho === '/api/convidar') {
      const { email, licenca, clubeId } = await corpoJson(req);
      return responder(res, 200, await convidar(sb, { email, licenca, clubeId: clubeId || null }));
    }

    if (req.method === 'POST' && caminho === '/api/licenca') {
      const { userId, licenca } = await corpoJson(req);
      return responder(res, 200, await mudarLicenca(sb, { userId, licenca }));
    }

    return responder(res, 404, { erro: 'Não há nada aqui.' });
  } catch (e) {
    // A mensagem vai inteira para o ecrã: quem está a ler é o dono da app, e um
    // "erro interno" obrigava-o a vir à consola ver o que já está aqui escrito.
    return responder(res, 400, { erro: e.message });
  }
});

// `127.0.0.1` e não a omissão do endereço: sem isto, o Node ouve em todas as
// interfaces e o painel fica à vista de quem estiver na mesma rede — no wi-fi de
// um café, isso é toda a gente.
if (process.argv[1] && process.argv[1].includes('servidor.mjs')) {
  servidor.listen(PORTA, '127.0.0.1', () => {
    const endereco = `http://127.0.0.1:${PORTA}/?chave=${CHAVE}`;
    console.log('\nPainel do FutsalSubStats — só nesta máquina.\n');
    console.log(`  ${endereco}\n`);
    console.log('A chave muda a cada arranque. Ctrl+C para fechar.\n');
  });
}

export { servidor };
