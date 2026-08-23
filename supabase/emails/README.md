# Os emails que o Supabase envia

Seis emails, com a cara da app: fundo escuro, verde do botão principal, a mesma
letra. Gerados por `tools/emails.mjs` — **não se editam à mão**, edita-se o
gerador e corre-se outra vez:

```powershell
npm run emails
```

Antes de colar seja o que for, abre `pre-visualizar.html` no browser: mostra os
seis lado a lado, já com um código e endereços de exemplo lá dentro.

## Onde colar

Supabase → **Authentication** → **Emails** → **Templates**. Cada modelo tem dois
campos: o assunto em cima e o corpo em baixo. Abre o `.html`, copia **tudo**
(incluindo o `<!doctype html>`) e cola no corpo.

| No painel do Supabase | Ficheiro | Assunto |
|---|---|---|
| Confirm sign up | `1-confirmar-registo.html` | `Confirma o teu email — FutsalSubStats` |
| Invite user | `2-convite.html` | `Estás convocado — a tua conta no FutsalSubStats` |
| Magic link or OTP | `3-link-magico.html` | `A tua entrada no FutsalSubStats` |
| Change email address | `4-mudar-email.html` | `Confirma o teu email novo — FutsalSubStats` |
| Reset password | `5-recuperar-palavra-passe.html` | `Repor a palavra-passe — FutsalSubStats` |
| Reauthentication | `6-reautenticacao.html` | `O teu código de confirmação — FutsalSubStats` |

Guarda um a um. O painel não avisa se saíres sem guardar.

## O que estes emails fazem de propósito

**Não têm imagens.** Quase todos os clientes de email bloqueiam imagens até a
pessoa carregar em "mostrar imagens". Um email cuja identidade depende de um
logótipo bloqueado chega vazio. Aqui a marca é texto e uma linha verde — aparece
sempre, à primeira, em todo o lado.

**Quatro dos seis levam o código de seis dígitos, mesmo tendo botão.** Não é
repetição. Os filtros de segurança de algumas empresas (e o Outlook com Safe
Links) **abrem os links das mensagens antes de as entregar**, para os verificar.
Como estes links só servem uma vez, quando a pessoa carrega já foi gasto e a app
diz que expirou — sem nada que explique porquê. O código não se gasta a ser
lido, e é a saída quando isso acontece: a página `/password` aceita-o.

**O convite e a recuperação não o levam.** São os dois emails que chegam a quem
ainda não conhece a app, e uma caixa com seis dígitos grandes ao lado de um
botão verde faz a pessoa parar a decidir entre duas coisas quando só há uma a
fazer. Nesses dois o aviso do fim diz o que fazer se o link falhar — pedir
outro — que resolve o caso raro sem estorvar o caso comum. Há um teste que
prende as duas metades desta regra.

**Não dizem quantas horas duram.** O prazo é uma definição do projeto
(*Authentication → Emails → Email OTP Expiration*) e muda sem que ninguém se
lembre de vir corrigir o texto. Um email que promete "1 hora" quando a definição
diz outra coisa é pior do que um que não promete nada.

**Estão só em português.** O Supabase tem um modelo por tipo de email, não um por
idioma, e no momento em que envia o convite ainda não há utilizador nenhum a quem
perguntar que língua fala. Traduzir isto obriga a um *Send Email Hook* — uma
função que recebe o pedido e escreve o email ela própria. Dá para fazer; é
trabalho a mais para o número de pessoas que há hoje.

**O convite e a recuperação não usam o `{{ .ConfirmationURL }}`.** Apontam para
`{{ .SiteURL }}/password/?th={{ .TokenHash }}&tipo=…`, e a razão é do lado da
app: o cliente do Supabase é criado com `detectSessionInUrl: false` (ver
`src/lib/supabase/client.js`). Com essa definição, uma sessão que chegue no fim
do endereço é ignorada — e o `ConfirmationURL` é exactamente isso. O convite
abria a app e não acontecia nada. Assim o email entrega um símbolo e é a página
`/password` que o troca por uma sessão, no código, à vista.

Isso tem uma consequência boa: **não é preciso mexer na lista de *Redirect
URLs***. O endereço é construído a partir do `Site URL`, e esse já é de
confiança por definição.

## O que confirmar antes de enviar o primeiro

**1. O SMTP tem de estar a funcionar.** Sem SMTP próprio, o Supabase limita os
emails a poucos por hora e só para endereços da equipa do projeto — os convites
aos treinadores simplesmente não saem.

**2. O `Site URL` tem de estar certo e sem barra no fim.**
*Authentication → URL Configuration → Site URL*. É de lá que sai o endereço do
botão do convite. Com uma barra a mais, sai `//password/` e o link não abre nada.

**3. Os outros quatro emails continuam com `{{ .ConfirmationURL }}`,** e está
certo assim. A confirmação de registo e a mudança de email são tratadas pelo
servidor do Supabase quando o link é aberto — a app não precisa de fazer nada. O
link mágico e a reautenticação não são usados por ecrã nenhum da app, e por isso
os modelos ficam prontos mas parados.

## Onde é que os links vão dar

| Email | Leva a | Quem trata |
|---|---|---|
| Convite | `/password/?tipo=invite` | a app troca o símbolo por sessão e pede uma palavra-passe |
| Recuperação | `/password/?tipo=recovery` | idem |
| Confirmar registo | `Site URL` | o servidor confirma o email ao abrir o link |
| Mudar email | `Site URL` | o servidor aplica a mudança ao abrir o link |
| Link mágico | `Site URL` | *nada na app o pede — modelo parado* |
| Reautenticação | não tem link | só código |

Se o link chegar gasto — e chega, quando um filtro de segurança o abre primeiro
— a página `/password` não fica num beco: pede o email e o código de seis
dígitos do mesmo email, e segue daí.

## Testar

O botão *Send test email* do painel do Supabase não existe. Para ver um a sério:

1. mete-te a ti próprio (`review.futsalsubstats@gmail.com`) em
   *Authentication → Users → Invite user*;
2. confere no Gmail, **e também no telemóvel** — é onde 90% dos treinadores vão
   abrir isto;
3. carrega no botão e vai até ao fim: tens de conseguir escolher uma
   palavra-passe e depois entrar com ela.

O passo 3 é o que importa. O link abre no **browser**, não na app — os links
profundos não estão montados, e para este caso é melhor assim: a pessoa escolhe
a palavra-passe no browser e depois entra na app do telemóvel com o email e essa
palavra-passe.

Se puderes, manda um para um endereço do Outlook. É o cliente que desenha HTML
com o motor do Word e o único onde estes emails podem sair diferentes: os cantos
dos botões ficam quadrados, o que é normal e não vale a pena arranjar.
