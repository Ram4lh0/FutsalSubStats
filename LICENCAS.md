# Licenças e acessos

O que uma conta pode fazer, e como um clube partilha os seus escalões.

Este documento é o desenho acordado, não o que está construído. O que está
construído hoje está no fim, em [Estado](#estado).

## As duas licenças

| | Treinador | Clube |
|---|---|---|
| Clubes | 1, criado por si | 1, criado por si |
| Escalões | **1**, e só | vários |
| Dá acesso a outros | não | sim, escalão a escalão |

**Treinador** é o coach sozinho. Cria o seu clube, cria o seu escalão, e é dono
de tudo o que lá está dentro. Não partilha com ninguém.

**Clube** é a conta da estrutura — o email do clube, não de uma pessoa. Cria os
escalões todos, vê-os todos, e distribui acesso pelos treinadores.

## Os três papéis

**Administrador do clube** (conta com licença Clube) — vê e edita todos os
escalões do seu clube. Cria e remove escalões. Dá e tira acesso.

**Treinador associado** — vê apenas os escalões que lhe foram atribuídos, e em
cada um com o nível que lhe foi dado: **ver** ou **ver e editar**.

Com `editar` faz tudo dentro do escalão — plantel, jogos, competições,
cronómetro — e muda também o nome e o emblema do próprio escalão. O que não faz
é **criar** nem **apagar** escalões: isso é da estrutura do clube. Apagar, na
app, é arquivar; uma política de `update` não distingue que colunas mudaram, por
isso quem trava essa é um gatilho (`teams_so_o_dono_arquiva`, migração 0013).

Não vê os outros escalões do clube, nem sabe que existem.

**Treinador sozinho** (licença Treinador) — vê o clube que criou e o único
escalão que pode criar. É o dono.

## Como alguém entra

O registo continua a ser por convite, e **o convite é sempre autorizado por
nós**. Um clube não cria contas.

1. O clube manda-nos a lista de emails dos seus treinadores.
2. Nós autorizamos cada email **e deixamo-lo já ligado a esse clube**.
3. O treinador recebe o convite, escolhe a palavra-passe, e ao entrar já aparece
   associado ao clube X.
4. Dentro de cada escalão, nas definições, o administrador escolhe quais dos
   treinadores associados têm acesso — e se é só ver, ou ver e editar.

O passo 2 é o único que ainda não está fechado, e vale a pena perceber porquê:
**a associação nasce antes da conta existir**. Quando autorizamos
`treinador@clube.pt`, ainda não há utilizador nenhum com esse email — o registo
só acontece dias depois.

A forma habitual de resolver isto é guardar a associação **pelo email**, numa
linha à espera, e ligá-la ao utilizador no primeiro início de sessão. Funciona,
mas obriga a decidir o que fazer quando alguém entra com um email parecido mas
não igual (maiúsculas, pontos no Gmail), e a limpar as que nunca forem usadas.

## O que muda na base de dados

Hoje toda a segurança pende de uma frase: `clubs.owner_id = auth.uid()` — cada
linha é de quem a criou. Isso deixa de chegar.

**`profiles.licenca`** — `'treinador'` ou `'clube'`. Definida por nós quando
autorizamos o email. É o que decide se pode haver um segundo escalão.

**Uma tabela de acessos** — quem pode ver o quê, com que nível. Uma linha por
(treinador, escalão, nível), mais a associação ao clube.

**As políticas de todas as tabelas** — clubes, escalões, jogadores, jogos,
convocatórias, eventos — passam de "é meu" para "tenho acesso ao escalão a que
isto pertence". São muitas, e é aqui que está o grosso do trabalho.

### A decisão que é cara mudar depois

**Os dados pertencem ao clube, não ao treinador que os criou.**

Um treinador associado cria jogadores e regista jogos num escalão que não é dele.
Se sair do clube no fim da época, esses dados têm de ficar lá. Portanto o dono é
sempre o clube; o treinador tem acesso, não posse.

Hoje isto ainda é verdade por acidente — só há uma pessoa por clube. Convém
mantê-lo verdadeiro de propósito: com utilizadores lá dentro, mudar quem é o dono
obriga a migrar dados a sério.

## O que muda na app

**O que se descarrega** deixa de ser "os clubes que são meus":

- licença Treinador → o seu clube e o seu escalão;
- administrador do clube → o clube e todos os escalões;
- treinador associado → o clube a que pertence, e só os escalões que lhe foram
  atribuídos.

**A licença tem de viajar para o aparelho.** A app é offline-first e decide sem
rede se pode criar um segundo escalão. Hoje o `profiles` só é enviado, nunca
descarregado (`sync.js`) — passa a ter de vir também.

**O nível "só ver"** tem de estar presente em todos os ecrãs de edição, não só
nos botões. Já existe uma peça para isto — o `SoLeitura`, usado no jogo de
experiência — e é o mesmo problema: esconder o botão não chega, porque o
endereço escreve-se à mão.

## Sequência

Por ordem de valor, e não de entusiasmo:

**1. A licença e o limite de escalões.** Fecha a licença de Treinador, que é a
mais barata e a mais fácil de vender. Pequeno: um campo, uma recusa no
`teams.create`, um gatilho na base de dados.

**2. Vender a licença de Clube como "vários escalões numa conta".** O clube usa
uma conta só e funciona hoje, sem código nenhum. A maioria dos clubes pequenos
não vai querer mais do que isto.

**3. A partilha entre pessoas.** Só quando o primeiro clube que **já esteja a
pagar** a pedir.

A razão da ordem: o passo 3 é um dia de trabalho, e é o género de coisa que sai
errada quando se desenha para o clube que imaginamos em vez do que aparece. O
primeiro clube a sério vai dizer coisas que aqui não adivinhamos — se um
treinador precisa de dois escalões, se o adjunto também quer acesso, se o
coordenador quer ver tudo sem editar nada.

## Estado

Construído, no servidor:

- uma conta, um clube (`repository.js` + migração `0010`);
- `profiles.licenca`, `club_members`, `team_access` e as políticas de nove
  tabelas reescritas (migração `0011`);
- o limite de um escalão para a licença de Treinador, por gatilho;
- o emblema do escalão e o direito de o trocar sem o poder apagar (migrações
  `0012` e `0013`);
- as políticas de leitura de `clubs` e `teams` refeitas para deixarem passar o
  `upsert`, que é como a app grava (migrações `0014` e `0015` — a explicação
  está no cabeçalho da `0015`);
- `supabase/scripts/verificar_acessos.sql`, que prova tudo isto dentro de uma
  transação que se desfaz no fim.

Construído, na app:

- a licença desce com a descarga e fica no perfil do aparelho;
- a descarga deixou de filtrar por dono — quem filtra é a segurança por linha,
  senão um treinador associado recebia uma lista vazia;
- cada escalão fica anotado com `dono`, `editar` ou `ver`, reescrito em todas as
  descargas;
- o `teams.create` recusa o segundo escalão a quem tem licença de Treinador;
- o ecrã **Quem tem acesso**, dentro das definições do escalão, só para o dono;
- o modo de só leitura aplicado aos ecrãs do escalão, e não apenas aos botões.

- **a associação de um treinador a um clube**, pelo comando `npm run convidar`.

## Autorizar e associar

O gerente manda-nos a lista de emails. Nós corremos:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "…"

npm run convidar -- --clubes                          # ver os clubes e os ids
npm run convidar -- gerente@clube.pt --licenca clube  # a conta da estrutura
npm run convidar -- ze@clube.pt rui@clube.pt --clube <id>
```

Cada email fica com **conta criada, convite enviado e associação feita**. A conta
existe a partir desse momento, mesmo antes de a pessoa abrir o email — e é isso
que permite ao gerente distribuir os escalões antes de os treinadores instalarem
a app.

Não se criam palavras-passe temporárias. Um convite já cria o utilizador; não é
preciso saber a palavra-passe de ninguém para a conta existir, e assim ela não
viaja pelo WhatsApp do gerente até ao treinador.

É um comando e não um botão na app porque precisa da chave de serviço. Um
endereço na web capaz de criar contas tem de se defender de quem o descobrir; um
comando que corre na nossa máquina não tem esse problema.

Por construir:

- nada de essencial. Fica em aberto se um treinador associado deve poder criar
  também um clube seu — hoje pode, porque não é dono de nenhum. Não faz mal a
  ninguém e ainda não apareceu quem se queixasse.
