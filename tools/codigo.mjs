// tools/codigo.mjs — o código e o link de uma pessoa, sem lhe enviar email.
//
//   node tools/codigo.mjs pessoa@exemplo.com            (recuperar palavra-passe)
//   node tools/codigo.mjs pessoa@exemplo.com convite     (primeiro acesso)
//
// ## Para que serve
//
// Alguém que perdeu o email, ou a quem o link chegou já gasto, fica sem forma de
// entrar. Isto gera um código e um link novos e escreve-os aqui — para lhos
// dizeres ao telefone ou lhos mandares por onde for mais prático.
//
// **Não envia email nenhum.** É de propósito: o email é precisamente o caminho
// que não está a funcionar quando se vem aqui parar.
//
// ## Porque é que isto não é SQL
//
// O código é gerado pelo servidor de autenticação do Supabase, não pela base de
// dados. Na base ele nem sequer existe em claro — o que lá está é um resumo
// (`auth.one_time_tokens.token_hash`), e de um resumo não se volta atrás. Por
// isso um código **já enviado** não se descobre de maneira nenhuma; o que se faz
// é pedir um novo, e é isso que esta chamada faz.
//
// ## O código antigo deixa de servir
//
// Gerar um novo invalida o anterior. Se a pessoa entretanto encontrar o email
// antigo, o que lá está já não funciona — diz-lhe para usar só o que lhe deres
// agora.

import { clienteAdmin } from './chave-de-servico.mjs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** O que a pessoa precisa, traduzido para o que o Supabase chama a isso. */
const TIPOS = {
  recuperar: 'recovery',
  convite: 'invite',
};

const [email, quePedido = 'recuperar'] = process.argv.slice(2);

if (!email || !email.includes('@')) {
  console.error('\nFalta o email.\n');
  console.error('  node tools/codigo.mjs pessoa@exemplo.com            (recuperar)');
  console.error('  node tools/codigo.mjs pessoa@exemplo.com convite    (primeiro acesso)\n');
  process.exit(1);
}

const tipo = TIPOS[quePedido];
if (!tipo) {
  console.error(`\nNão sei o que é "${quePedido}". Só há "recuperar" e "convite".\n`);
  process.exit(1);
}

const sb = clienteAdmin(RAIZ);

const { data, error } = await sb.auth.admin.generateLink({ type: tipo, email });

if (error) {
  // O erro mais provável, de longe: um convite para quem já tem conta, ou uma
  // recuperação para quem ainda não tem. Vale a pena dizê-lo por palavras.
  console.error(`\nNão deu: ${error.message}`);
  if (/already registered/i.test(error.message)) {
    console.error('\nEsta conta já existe. Usa "recuperar" em vez de "convite".');
  }
  if (/not found|does not exist/i.test(error.message)) {
    console.error('\nNão há conta com este email. Cria-a primeiro no painel (`npm run painel`).');
  }
  console.error();
  process.exit(1);
}

const p = data.properties;

console.log(`\n  ${email} — ${quePedido}\n`);
console.log(`  Código:  ${p.email_otp}`);
console.log(`  Link:    ${p.action_link}\n`);
console.log('  O código escreve-se no ecrã da palavra-passe, depois de pedir');
console.log('  "Esqueci-me da palavra-passe" com este mesmo email.');
console.log('  Qualquer código anterior deixou de servir.\n');
