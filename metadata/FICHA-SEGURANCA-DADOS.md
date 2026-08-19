# Ficha de segurança dos dados — Play Console

As respostas ao formulário *Data safety*, em **Play Console → Política → Conteúdo
da app → Segurança dos dados**.

Ficam escritas aqui, e não decididas dentro do formulário, por duas razões: são
uma declaração pública que tem de bater certo com a política de privacidade, e
porque o formulário tem de ser preenchido outra vez a cada versão — copiar é
mais seguro do que relembrar.

> **Aviso:** declarar a menos é motivo de suspensão. Se um dia a app passar a
> recolher outra coisa — telemetria, relatórios de erro, publicidade —, isto
> muda no mesmo dia.

---

## Antes de tudo: a ligação de eliminação

Antes do formulário, a Play Console pede uma coisa que a Apple não pede: **um
endereço na web onde se possa pedir a eliminação da conta**, acessível sem
sessão iniciada.

| Campo | O que responder |
|---|---|
| A app permite criar conta? | **Sim** |
| Ligação para eliminação da conta | `https://futsalsubstats.vercel.app/delete-account` |
| A app permite pedir a eliminação dentro dela? | **Sim** — Definições → Apagar a conta |
| Alguns dados são retidos após a eliminação? | **Não** |

A página existe: `src/app/delete-account/page.jsx`. Diz o que é apagado, o que
fica (nada) e em quanto tempo (até 30 dias, na prática no próprio dia), que são
exactamente as três coisas que a Google exige que lá estejam.

Substituir `<domínio>` pelo endereço a sério quando o site existir. Por agora é
o da Vercel, o mesmo da política de privacidade.

---

## 1. Recolha e partilha

**A app recolhe ou partilha algum dos tipos de dados obrigatórios?** → **Sim**

### O que se declara

| Tipo de dado | Recolhido | Partilhado | Obrigatório | Para quê |
|---|---|---|---|---|
| **Informações pessoais → Endereço de email** | Sim | Não | Obrigatório | Gestão da conta |
| **Informações pessoais → Nome** | Sim | Não | Opcional | Gestão da conta |
| **Atividade na app → Outro conteúdo gerado pelo utilizador** | Sim | Não | Obrigatório | Funcionalidade da app |
| **Informações pessoais → IDs de utilizador** | Sim | Não | Obrigatório | Gestão da conta |

Sobre os **IDs de utilizador**: não é o email nem o nome, é uma terceira coisa
que escapou à primeira versão desta ficha. A app atribui a cada conta um
identificador próprio — o `id` do perfil, um UUID — e esse identificador viaja
para o servidor em cada linha que se grava. Um identificador de conta que se
liga a uma pessoa identificável é, pela definição da Google, um ID de
utilizador, e declara-se.

E mais nada. Em particular, **não** se declara:

- Localização — a app nunca a pede.
- Informações financeiras, saúde, mensagens, fotografias, áudio, ficheiros,
  calendário, contactos, histórico de navegação.
- **Identificadores do dispositivo** — não há nenhum, nem para publicidade nem
  para análise.
- **Registos de falhas ou diagnósticos** — não há SDK de telemetria na app.

### Porque é que os jogadores entram em "conteúdo gerado pelo utilizador"

Os nomes e números dos jogadores são escritos pelo treinador. Do ponto de vista
da Google, são conteúdo que o utilizador criou dentro da app — não dados que a
app foi buscar a lado nenhum. É a categoria certa, e é a que corresponde ao que
a política de privacidade já diz: guarda-se o nome, o número, a posição e o pé
preferido, o suficiente para uma ficha de jogo.

### Porque é que o Supabase e a Vercel não contam como "partilha"

A Google distingue **partilhar** (transferir para um terceiro) de **processar**
(um fornecedor a tratar dados por conta de quem faz a app). O Supabase guarda os
dados e a Vercel serve a app; nenhum deles os usa para fins próprios. São
processadores, e por isso a resposta a "partilhado" é **Não** em todas as
linhas.

Isto está escrito na política de privacidade nos mesmos termos, e as duas
declarações têm de continuar a dizer o mesmo.

### O email: obrigatório ou opcional?

**Obrigatório.** Há um modo de experiência que deixa jogar um jogo completo sem
conta nenhuma — e nesse modo não se recolhe nada —, mas a partir do momento em
que alguém cria conta, o email é indispensável. Declarar "opcional" seria
esticar a verdade a favor da app, que é precisamente o que a Google castiga.

O **nome** é opcional a sério: o campo existe no registo e pode ficar em branco.

---

## 2. Práticas de segurança

| Pergunta | Resposta | Porquê |
|---|---|---|
| Os dados são cifrados em trânsito? | **Sim** | Tudo passa por HTTPS até ao Supabase. |
| Os utilizadores podem pedir a eliminação dos dados? | **Sim** | Botão dentro da app e a página web acima. |
| A app segue a política de Famílias? | **Não aplicável** | A app é para treinadores, não é dirigida a crianças. |
| Foi validada por terceiros? | **Não** | Não houve auditoria independente. Não inventar. |

---

## 3. Público-alvo e conteúdo

| Campo | Resposta |
|---|---|
| Faixa etária | **18 anos ou mais** |
| A app é dirigida a crianças? | **Não** |
| Categoria | Desporto |
| Contém anúncios? | **Não** |
| Compras dentro da app? | **Não** |
| Classificação de conteúdo | Preencher o questionário: sem violência, sem linguagem, sem conteúdo sexual, sem jogo a dinheiro → sai *Para todos* |

Sobre a faixa etária: os **jogadores** podem ser menores, mas quem **usa** a app
é o treinador. Essa distinção está na política de privacidade e é a mesma que se
declara aqui — a responsabilidade de ter autorização para registar um menor é de
quem o inscreve, e a app só guarda nome, número, posição e pé.

---

## 4. Ligações que o formulário pede

| Campo | Valor |
|---|---|
| Política de privacidade | `https://futsalsubstats.vercel.app/privacy` |
| Eliminação de conta | `https://futsalsubstats.vercel.app/delete-account` |
| Email de contacto | `review.futsalsubstats@gmail.com` |
| Site | `https://futsalsubstats.r4m.workers.dev` |

---

## 5. O que dizer nas notas para quem revê

A Play Console tem um campo de instruções para a revisão. Vale a pena preencher,
mesmo que a revisão seja quase toda automática:

```
A app é um bloco de notas para treinadores de futsal: marca substituições e
conta o tempo de jogo de cada jogador durante um jogo.

Funciona sem internet — os dados ficam no aparelho e sincronizam quando houver
ligação.

Para experimentar sem criar conta, no ecrã inicial há o botão "Experimentar sem
criar conta", que abre um jogo completo com uma equipa fictícia.

Conta de teste, se preferirem:
  review.futsalsubstats@gmail.com
  (palavra-passe no campo de credenciais)
```

**A palavra-passe vai no campo próprio da Play Console, nunca neste ficheiro nem
em mais lado nenhum do repositório.**

---

## 6. Quando é preciso voltar aqui

- Se entrar um SDK de análise, publicidade ou relatórios de falhas.
- Se a app passar a pedir alguma permissão nova.
- Se aparecerem compras dentro da app.
- Se a política de privacidade mudar — as duas têm de continuar a dizer o mesmo.
