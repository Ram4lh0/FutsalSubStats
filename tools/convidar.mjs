// tools/convidar.mjs — autorizar um email e, se for de um clube, associá-lo.
//
//   npm run convidar -- --clubes
//   npm run convidar -- treinador@clube.pt --licenca treinador
//   npm run convidar -- ze@clube.pt rui@clube.pt --clube <id-do-clube>
//
// É este comando que abre a porta a alguém. O registo está fechado no Supabase,
// por isso ninguém entra sozinho: o gerente do clube manda-nos a lista de emails
// dos treinadores, e isto trata do resto.
//
// ## O que acontece a cada email
//
//   1. A conta é criada **já convidada e sem palavra-passe definida**.
//   2. Sai o email de convite — o que está em `supabase/emails/2-convite.html` —
//      que leva ao ecrã onde a pessoa escolhe a sua palavra-passe.
//   3. A licença fica gravada no perfil.
//   4. Com `--clube`, entra também a associação ao clube.
//
// ## Porque é que não criamos uma palavra-passe temporária
//
// Era a ideia inicial, e a razão dela era boa: o gerente quer distribuir os
// escalões **antes** de os treinadores instalarem a app, e para isso a conta tem
// de existir. Mas para existir não é preciso ter palavra-passe — um convite já
// cria o utilizador, com identificador e tudo.
//
// Assim ganha-se o mesmo e evitam-se duas coisas más: nós sabermos as
// palavras-passe dos nossos clientes, e essas palavras-passe viajarem pelo
// WhatsApp do gerente até ao treinador.
//
// ## Porque é que isto é um comando e não um botão na app
//
// Precisa da chave de serviço, que ignora toda a segurança por linha. Um
// endereço na web capaz de criar contas tem de se defender de quem o descobrir;
// um comando que corre nesta máquina não tem esse problema. Enquanto formos nós
// a autorizar, o botão não compensa o risco.

import { clienteAdmin } from './chave-de-servico.mjs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LICENCAS = ['treinador', 'clube'];

/* ------------------------------------------------------------ argumentos */

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : null;
};
const tem = (nome) => args.includes(`--${nome}`);

const emails = args.filter((a) => a.includes('@') && !a.startsWith('--'));
const clube = opcao('clube');
const licenca = opcao('licenca') || 'treinador';

const sb = clienteAdmin(RAIZ);

/* ------------------------------------------------- listar clubes e sair */

if (tem('clubes')) {
  const { data, error } = await sb
    .from('clubs')
    .select('id, name, owner_id, profiles!clubs_owner_id_fkey ( email, licenca )')
    .is('archived_at', null)
    .order('name');
  if (error) {
    console.error(`Não foi possível listar: ${error.message}`);
    process.exit(1);
  }
  if (!data?.length) console.log('Ainda não há clubes.');
  for (const c of data || []) {
    console.log(`${c.id}  ${c.name}`);
    console.log(`${' '.repeat(38)}${c.profiles?.email || '?'} · licença ${c.profiles?.licenca || '?'}`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------ validações */

if (!emails.length) {
  console.error(
    'Falta o email. Exemplos:\n' +
      '  npm run convidar -- --clubes                        (ver os clubes e os seus ids)\n' +
      '  npm run convidar -- treinador@clube.pt              (conta sozinha, licença treinador)\n' +
      '  npm run convidar -- gerente@clube.pt --licenca clube\n' +
      '  npm run convidar -- ze@clube.pt rui@clube.pt --clube <id>\n\n' +
      'Opções: --licenca treinador|clube · --clube <id>'
  );
  process.exit(1);
}

if (!LICENCAS.includes(licenca)) {
  console.error(`Licença desconhecida: ${licenca}. Só há ${LICENCAS.join(' e ')}.`);
  process.exit(1);
}

// Um `--clube` mal copiado — meio id, o nome do clube em vez do id — falharia
// mais tarde com uma violação de chave estrangeira, já depois de os convites
// terem saído. Confirma-se antes de mandar seja o que for.
let clubeNome = null;
if (clube) {
  const { data, error } = await sb.from('clubs').select('name').eq('id', clube).maybeSingle();
  if (error || !data) {
    console.error(`Não há clube nenhum com o id ${clube}. Corre com --clubes para os veres.`);
    process.exit(1);
  }
  clubeNome = data.name;
}

/* ------------------------------------------------------------ o trabalho */

console.log(
  `A convidar ${emails.length} ${emails.length === 1 ? 'pessoa' : 'pessoas'}` +
    (clubeNome ? `, associadas a "${clubeNome}"` : '') +
    `, com licença ${licenca}.\n`
);

let falhas = 0;

for (const email of emails) {
  // O Supabase guarda os emails em minúsculas. Sem isto, "Ze@Clube.pt" criava
  // uma conta que depois não voltava a ser encontrada por este mesmo comando.
  const endereco = email.trim().toLowerCase();
  let userId = null;

  const { data, error } = await sb.auth.admin.inviteUserByEmail(endereco);

  if (error) {
    // Já existir não é falha: é o caso de quem foi convidado para um clube e
    // agora entra noutro, ou de quem já testava a app antes disto existir. O
    // convite não se repete, a associação faz-se na mesma.
    const jaExiste = /already been registered|already exists|email_exists/i.test(error.message);
    if (!jaExiste) {
      console.log(`  ✗ ${endereco} — ${error.message}`);
      falhas++;
      continue;
    }
    const { data: perfil } = await sb
      .from('profiles')
      .select('id')
      .eq('email', endereco)
      .maybeSingle();
    if (!perfil) {
      console.log(`  ✗ ${endereco} — já existe mas não tem perfil. Ver no painel.`);
      falhas++;
      continue;
    }
    userId = perfil.id;
    console.log(`  · ${endereco} — já tinha conta, convite não repetido`);
  } else {
    userId = data.user.id;
    console.log(`  ✓ ${endereco} — convite enviado`);
  }

  const { error: erroLicenca } = await sb.from('profiles').update({ licenca }).eq('id', userId);
  if (erroLicenca) {
    console.log(`      licença não gravada: ${erroLicenca.message}`);
    falhas++;
  }

  if (clube) {
    const { error: erroMembro } = await sb
      .from('club_members')
      .upsert({ club_id: clube, user_id: userId }, { onConflict: 'club_id,user_id' });
    if (erroMembro) {
      console.log(`      associação falhou: ${erroMembro.message}`);
      falhas++;
    } else {
      console.log(`      associado a "${clubeNome}"`);
    }
  }
}

console.log(
  falhas
    ? `\n${falhas} problema(s). O que passou está feito; repetir este comando não duplica nada.`
    : clube
      ? '\nFeito. O gerente já pode distribuir os escalões — as contas existem, mesmo antes de alguém instalar a app.'
      : '\nFeito.'
);
process.exit(falhas ? 1 : 0);
