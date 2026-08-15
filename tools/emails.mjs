// tools/emails.mjs — gera os seis emails que o Supabase envia.
//
//   node tools/emails.mjs        (ou: npm run emails)
//
// Escreve `supabase/emails/*.html`. Cada ficheiro é para copiar inteiro e colar
// no painel do Supabase, em Authentication → Emails → Templates. O assunto de
// cada um está no `supabase/emails/README.md`.
//
// ## Porquê um gerador e não seis ficheiros à mão
//
// Os seis emails têm o mesmo cabeçalho, o mesmo botão, o mesmo rodapé e a mesma
// paleta. Escritos à mão, divergem: muda-se a cor num e esquecem-se cinco. Aqui
// há um `molde()` e seis corpos, e a marca vive num sítio só.
//
// ## Porque é que o HTML é feio de propósito
//
// Emails não são páginas. O Outlook para Windows desenha HTML com o motor do
// Word, o Gmail deita fora quase tudo o que estiver numa folha de estilos, e
// nenhum dos dois sabe o que é `flex`, `grid` ou uma variável de CSS. Por isso:
//
//   · tabelas em vez de `div`, com `role="presentation"` para os leitores de ecrã
//     as ignorarem;
//   · estilos escritos à mão em cada elemento, nunca numa folha à parte;
//   · cores em hexadecimal literal — o `var(--primary)` do `globals.css` não
//     existe aqui, e é por isso que a paleta está repetida em baixo.
//
// ## Sem imagens
//
// Não há logótipo nenhum nestes emails, e é de propósito. A maioria dos clientes
// bloqueia imagens até a pessoa carregar em "mostrar imagens", e um email cuja
// identidade depende de uma imagem bloqueada chega vazio. A marca aqui é feita
// de texto e de uma linha verde — aparece sempre, em todo o lado, à primeira.
//
// Havia ainda um problema prático: um logótipo teria de estar alojado num
// endereço fixo e público, e o domínio de produção ainda não está decidido.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DESTINO = join(RAIZ, 'supabase', 'emails');

/* ---------------------------------------------------------------- a paleta */

// Os mesmos valores do `src/app/globals.css`. Repetidos porque um email não
// consegue ler o CSS da app — se um dia a app mudar de cor, muda-se aqui também.
const C = {
  fundo: '#0b1220',
  cartao: '#16233b',
  cartao2: '#1d2d49',
  linha: '#2a3d5f',
  texto: '#eaf1ff',
  suave: '#91a4c4',
  verde: '#22c55e',
  tinta: '#05240f', // texto por cima do verde
};

const LETRA = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace";

const CONTACTO = 'review.futsalsubstats@gmail.com';
const MARCA = 'FutsalSubStats';
const LEMA = 'Quem entra, quem sai, quem já jogou quanto tempo.';

/* ----------------------------------------------------------------- pedaços */

/**
 * A linha que os clientes de email mostram a seguir ao assunto, na lista.
 *
 * Sem isto, o Gmail vai buscar as primeiras palavras do corpo — que costumam ser
 * "Ver este email no browser" ou o próprio título outra vez. Os `&nbsp;` no fim
 * empurram para fora o texto que viria a seguir.
 */
const preheader = (texto) =>
  `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.fundo};opacity:0">` +
  `${texto}${'&nbsp;&zwnj;'.repeat(60)}</div>`;

const paragrafo = (html, cor = C.texto) =>
  `<p style="margin:0 0 16px;font-family:${LETRA};font-size:16px;line-height:1.55;color:${cor}">${html}</p>`;

/**
 * O botão. Uma tabela de uma célula, porque é a única coisa que o Outlook
 * desenha com fundo colorido e tamanho previsível.
 *
 * Os cantos ficam quadrados no Outlook para Windows — ele ignora o
 * `border-radius`. É feio e não é grave; a alternativa era VML, que é muito mais
 * código para arredondar um canto.
 */
const botao = (texto, url) => `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 20px">
          <tr>
            <td align="center" bgcolor="${C.verde}" style="border-radius:14px">
              <a href="${url}" style="display:inline-block;padding:16px 30px;font-family:${LETRA};font-size:16px;font-weight:700;color:${C.tinta};text-decoration:none;border-radius:14px">${texto}</a>
            </td>
          </tr>
        </table>`;

/**
 * O código de seis dígitos.
 *
 * Está em todos os emails, mesmo nos que já têm botão, e não é redundância. Os
 * filtros de segurança de algumas empresas abrem os links das mensagens antes de
 * as entregar, para os verificar. Como estes links só servem uma vez, quando a
 * pessoa carrega o link já foi gasto e a app diz que expirou — sem nada no email
 * a explicar porquê. O código não se gasta a ser lido, por isso é a saída para
 * quando isso acontece.
 */
const codigo = (rotulo) => `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 22px">
          <tr>
            <td style="background-color:${C.cartao2};border:1px solid ${C.linha};border-radius:14px;padding:18px 20px" align="center">
              <div style="font-family:${LETRA};font-size:13px;color:${C.suave};margin-bottom:8px">${rotulo}</div>
              <div style="font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:6px;color:${C.texto}">{{ .Token }}</div>
            </td>
          </tr>
        </table>`;

const aviso = (html) =>
  `<p style="margin:0;font-family:${LETRA};font-size:14px;line-height:1.55;color:${C.suave}">${html}</p>`;

/* -------------------------------------------------------------------- molde */

function molde({ resumo, titulo, corpo }) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.fundo};">
${preheader(resumo)}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${C.fundo}">
  <tr>
    <td align="center" style="padding:32px 16px">

      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px">

        <!-- marca -->
        <tr>
          <td style="padding:0 4px 18px">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:9px;font-size:0;line-height:0">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                    <tr><td width="10" height="10" bgcolor="${C.verde}" style="border-radius:5px;font-size:0;line-height:0">&nbsp;</td></tr>
                  </table>
                </td>
                <td style="font-family:${LETRA};font-size:13px;font-weight:700;letter-spacing:0.4px;color:${C.texto}">${MARCA}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- cartão -->
        <tr>
          <td style="background-color:${C.cartao};border:1px solid ${C.linha};border-radius:14px;padding:32px 28px">
            <h1 style="margin:0 0 18px;font-family:${LETRA};font-size:23px;line-height:1.3;font-weight:700;color:${C.texto}">${titulo}</h1>
${corpo}
          </td>
        </tr>

        <!-- rodapé -->
        <tr>
          <td style="padding:22px 6px 0">
            <p style="margin:0 0 6px;font-family:${LETRA};font-size:13px;line-height:1.6;color:${C.suave}">${LEMA}</p>
            <p style="margin:0;font-family:${LETRA};font-size:13px;line-height:1.6;color:${C.suave}">Alguma dúvida? Responde a este email ou escreve para <a href="mailto:${CONTACTO}" style="color:${C.verde};text-decoration:none">${CONTACTO}</a>.</p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>
`;
}

/* ------------------------------------------------------------- os seis ---- */

/**
 * O endereço do ecrã da palavra-passe, com o símbolo do email agarrado.
 *
 * Não usa o `{{ .ConfirmationURL }}`, e a razão é do lado da app: o cliente do
 * Supabase é criado com `detectSessionInUrl: false` (ver
 * `src/lib/supabase/client.js`). Com essa definição, uma sessão que chegue no
 * fim do endereço é pura e simplesmente ignorada — e o `ConfirmationURL` é
 * exactamente isso. O convite abria a app e não acontecia nada.
 *
 * Assim o email entrega um símbolo, e é a página `/password` que o troca por
 * uma sessão, no código, à vista. É também o que lhe permite saber se veio de
 * um convite ou de uma recuperação, e não pedir a palavra-passe antiga a quem
 * nunca teve nenhuma.
 *
 * O `{{ .SiteURL }}` é o endereço do projeto (Authentication → URL
 * Configuration → Site URL) e **não pode acabar em barra**, senão sai `//`.
 *
 * O `&amp;` no meio não é engano: dentro de um atributo HTML, um `&` solto é o
 * princípio de uma entidade. Quem lê o email desfá-lo outra vez em `&` antes de
 * abrir o endereço, e assim o link é válido nos dois sítios.
 */
const ecraPalavraPasse = (tipo) => `{{ .SiteURL }}/password/?th={{ .TokenHash }}&amp;tipo=${tipo}`;

// Nota sobre a validade: os links e os códigos expiram, mas o prazo é uma
// definição do projeto (Authentication → Emails → Email OTP Expiration) e muda
// sem que ninguém se lembre de vir aqui corrigir o texto. Por isso nenhum destes
// emails diz um número de horas: diz que expira e como pedir outro. Um email que
// promete "1 hora" quando a definição diz outra coisa é pior do que um que não
// promete nada.

const emails = {
  '1-confirmar-registo': {
    assunto: 'Confirma o teu email — FutsalSubStats',
    resumo: 'Falta um passo para a tua conta ficar pronta.',
    titulo: 'Confirma o teu email',
    corpo: [
      paragrafo(
        `Criaste uma conta no <strong>FutsalSubStats</strong> com o endereço <strong>{{ .Email }}</strong>. Falta só confirmares que este email é mesmo teu.`
      ),
      botao('Confirmar email', '{{ .ConfirmationURL }}'),
      codigo('Ou escreve este código na app'),
      aviso(
        `Se não foste tu a criar esta conta, ignora este email — sem esta confirmação, nada é criado.`
      ),
    ].join('\n'),
  },

  '2-convite': {
    assunto: 'Estás convocado — a tua conta no FutsalSubStats',
    resumo: 'Carrega no botão e escolhe a tua palavra-passe.',
    titulo: 'Estás convocado.',
    corpo: [
      paragrafo(
        `Abrimos-te uma conta no <strong>FutsalSubStats</strong> para o endereço <strong>{{ .Email }}</strong> — a app que segue os teus jogos ao minuto: quem está em campo, quem está no banco e quanto tempo cada jogador já levou.`
      ),
      paragrafo(
        `Carrega no botão para escolheres a tua palavra-passe. Feito isso, instalas a app no telemóvel e entras com este email e a palavra-passe que escolheste.`
      ),
      botao('Escolher a minha palavra-passe', ecraPalavraPasse('invite')),
      codigo('Ou escreve este código na app'),
      aviso(
        `Se este convite expirar, responde a este email e enviamos outro. Se não estavas à espera dele, podes ignorá-lo.`
      ),
    ].join('\n'),
  },

  '3-link-magico': {
    assunto: 'A tua entrada no FutsalSubStats',
    resumo: 'Entra sem escrever a palavra-passe.',
    titulo: 'Entrar sem palavra-passe',
    corpo: [
      paragrafo(
        `Pediste para entrar no <strong>FutsalSubStats</strong> como <strong>{{ .Email }}</strong>, sem escrever a palavra-passe. Este botão trata disso.`
      ),
      botao('Entrar na app', '{{ .ConfirmationURL }}'),
      codigo('Ou escreve este código na app'),
      aviso(
        `Serve uma vez e depois expira. Se não foste tu a pedir, ignora este email — sem carregar aqui, ninguém entra na tua conta.`
      ),
    ].join('\n'),
  },

  '4-mudar-email': {
    assunto: 'Confirma o teu email novo — FutsalSubStats',
    resumo: 'Confirma o endereço novo para a mudança ficar feita.',
    titulo: 'Confirma o teu email novo',
    corpo: [
      paragrafo(
        `Pediste para mudar o email da tua conta do <strong>FutsalSubStats</strong> de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>.`
      ),
      paragrafo(
        `Até confirmares, continua tudo como estava: entras com o endereço antigo e não se perde nada.`
      ),
      botao('Confirmar a mudança', '{{ .ConfirmationURL }}'),
      codigo('Ou escreve este código na app'),
      aviso(
        `Se não foste tu a pedir esta mudança, <strong>não carregues no botão</strong> e escreve-nos já para <a href="mailto:${CONTACTO}" style="color:${C.verde};text-decoration:none">${CONTACTO}</a>.`
      ),
    ].join('\n'),
  },

  '5-recuperar-palavra-passe': {
    assunto: 'Repor a palavra-passe — FutsalSubStats',
    resumo: 'Escolhe uma palavra-passe nova.',
    titulo: 'Repor a palavra-passe',
    corpo: [
      paragrafo(
        `Alguém pediu para repor a palavra-passe da conta <strong>{{ .Email }}</strong> no <strong>FutsalSubStats</strong>. Se foste tu, carrega no botão e escolhe uma nova.`
      ),
      botao('Escolher palavra-passe nova', ecraPalavraPasse('recovery')),
      codigo('Ou escreve este código na app'),
      aviso(
        `Se não foste tu, ignora este email: a palavra-passe atual continua a funcionar e ninguém a consegue mudar sem abrir este link.`
      ),
    ].join('\n'),
  },

  // Este é o único sem `{{ .ConfirmationURL }}` — o Supabase não gera link
  // nenhum para a reautenticação, só o código. Um botão aqui apontaria para
  // lado nenhum.
  '6-reautenticacao': {
    assunto: 'O teu código de confirmação — FutsalSubStats',
    resumo: 'Um código para confirmares que és tu.',
    titulo: 'Confirma que és tu',
    corpo: [
      paragrafo(
        `Estás a fazer uma alteração importante na tua conta do <strong>FutsalSubStats</strong>. Antes de a app a executar, escreve este código:`
      ),
      codigo('O teu código'),
      aviso(
        `Se não estás a mexer na tua conta neste momento, <strong>não uses este código</strong> e escreve-nos para <a href="mailto:${CONTACTO}" style="color:${C.verde};text-decoration:none">${CONTACTO}</a>.`
      ),
    ].join('\n'),
  },
};

/* ------------------------------------------------------------- verificação */

// Duas coisas que dão erros difíceis de ver a olho e fáceis de ver a contar.

/** As etiquetas abrem e fecham todas? Um `</td>` a menos desalinha o email todo. */
function etiquetasEquilibradas(html) {
  const vazias = new Set(['meta', 'br', 'img', 'hr', 'input', 'link']);
  const pilha = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const [, fecho, nome, autofecho] = m;
    const t = nome.toLowerCase();
    if (t === '!doctype' || vazias.has(t) || autofecho) continue;
    if (fecho) {
      if (pilha.pop() !== t) return `</${t}> a fechar a etiqueta errada`;
    } else pilha.push(t);
  }
  return pilha.length ? `ficou por fechar: <${pilha.join('>, <')}>` : null;
}

/**
 * As variáveis do Supabase estão bem escritas?
 *
 * O molde do GoTrue é rigoroso com o espaço: `{{.Email}}` e `{{ .email }}` não
 * dão erro nenhum — passam por texto literal e o email sai com `{{.Email}}` lá
 * escrito, à frente da pessoa. Só se descobre depois de enviado.
 */
const CONHECIDAS = ['ConfirmationURL', 'Token', 'TokenHash', 'SiteURL', 'Email', 'NewEmail', 'RedirectTo', 'Data'];

function variaveisValidas(html) {
  const erros = [];
  for (const m of html.matchAll(/\{\{([^}]*)\}\}/g)) {
    const bruto = m[1];
    const nome = bruto.trim().replace(/^\./, '');
    if (!/^ \.[A-Za-z]+ $/.test(bruto)) erros.push(`{{${bruto}}} — falta o ponto ou os espaços`);
    else if (!CONHECIDAS.includes(nome)) erros.push(`{{${bruto}}} — variável desconhecida`);
  }
  return erros;
}

/* ---------------------------------------------------------------- escrever */

mkdirSync(DESTINO, { recursive: true });

// Valores de mentira para a pré-visualização. O código tem seis dígitos porque
// é o que o Supabase envia; o link não vai a lado nenhum de propósito.
const EXEMPLO = {
  '{{ .ConfirmationURL }}': '#',
  '{{ .Token }}': '284913',
  '{{ .Email }}': 'treinador@exemplo.pt',
  '{{ .NewEmail }}': 'novo@exemplo.pt',
  '{{ .SiteURL }}': 'https://exemplo.pt',
};

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let problemas = 0;
const cartoes = [];

for (const [nome, email] of Object.entries(emails)) {
  const html = molde(email);

  const desequilibrio = etiquetasEquilibradas(html);
  if (desequilibrio) {
    console.log(`  ✗ ${nome}: ${desequilibrio}`);
    problemas++;
  }
  for (const erro of variaveisValidas(html)) {
    console.log(`  ✗ ${nome}: ${erro}`);
    problemas++;
  }

  writeFileSync(join(DESTINO, `${nome}.html`), html, 'utf8');
  console.log(`  supabase/emails/${nome}.html`);

  let demo = html;
  for (const [chave, valor] of Object.entries(EXEMPLO)) demo = demo.split(chave).join(valor);
  cartoes.push(
    `<section>\n<h2>${nome}</h2>\n<p class="assunto"><span>Assunto</span> ${email.assunto}</p>\n` +
      `<iframe srcdoc="${escapar(demo)}" onload="this.style.height=this.contentDocument.body.scrollHeight+'px'"></iframe>\n</section>`
  );
}

/* --------------------------------------------------------- pré-visualização */

// Ver os seis antes de os colar no Supabase. Não substitui um teste a sério
// (só o Outlook mostra o que o Outlook faz), mas apanha o essencial: texto
// cortado, botão sem cor, um `{{ .Email }}` esquecido no meio da frase.
writeFileSync(
  join(DESTINO, 'pre-visualizar.html'),
  `<!doctype html>
<meta charset="utf-8">
<title>Emails do FutsalSubStats</title>
<style>
  body { margin:0; padding:32px; background:#f4f5f7; font-family:${LETRA}; color:#1a2233 }
  h1 { font-size:20px; margin:0 0 6px }
  .nota { margin:0 0 28px; font-size:14px; color:#5b6779; max-width:620px; line-height:1.55 }
  section { max-width:620px; margin:0 auto 36px }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:1.2px; color:#5b6779; margin:0 0 8px }
  .assunto { margin:0 0 10px; font-size:15px; font-weight:600 }
  .assunto span { display:inline-block; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase;
    color:#5b6779; background:#e2e5ea; border-radius:5px; padding:3px 7px; margin-right:8px; vertical-align:2px }
  iframe { width:100%; border:1px solid #d6dae1; border-radius:12px; background:#0b1220; display:block }
</style>
<h1>Os seis emails, com valores de exemplo</h1>
<p class="nota">Gerado por <code>tools/emails.mjs</code>. O código <strong>284913</strong> e os endereços são inventados —
no email a sério o Supabase substitui-os. Isto é o browser a desenhar; o Outlook para Windows vai mostrar os cantos
dos botões quadrados, o que é normal.</p>
${cartoes.join('\n')}
`,
  'utf8'
);
console.log('  supabase/emails/pre-visualizar.html');

console.log(
  problemas
    ? `\n${problemas} problema(s) — os ficheiros foram escritos na mesma, mas confere antes de colar.`
    : `\n${Object.keys(emails).length} emails escritos e verificados. Os assuntos estão no README.md ao lado.`
);
process.exit(problemas ? 1 : 0);
