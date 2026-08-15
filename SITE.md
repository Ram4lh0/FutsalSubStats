# Site de apresentação — FutsalSubStats

Documento de contexto para quem vai construir o site. Lê-o todo antes de
escrever a primeira linha: há aqui restrições que não se adivinham, e uma delas
— a da App Store — pode custar a rejeição da app se for ignorada.

---

## 1. O que é o produto

O **FutsalSubStats** é uma app para treinadores de futsal apontarem o jogo
enquanto ele acontece, à beira do campo, com o polegar.

O problema que resolve, numa frase: **quem treina sabe de cor quem marcou, mas
ninguém se lembra de quanto tempo cada jogador esteve em campo** — e é esse o
número que decide as rotações da semana seguinte, as conversas com os pais nos
escalões de formação, e quem joga no domingo.

O que a app faz de diferente das folhas de Excel que os treinadores usam hoje:
conta o tempo sozinha, respeita as regras do futsal (as paragens, os dois
minutos de inferioridade, o guarda-redes avançado), e funciona **sem internet**
— um pavilhão sem rede não impede nada.

**Estado:** a app existe e funciona. Está a caminho da App Store; ainda não foi
publicada. Isso tem consequências para o site — ver a secção 6.

---

## 2. Quem é o público

Treinadores de futsal, sobretudo em Portugal, e sobretudo nos escalões de
formação e nos distritais. Não são pessoas de tecnologia: são pessoas que têm o
plantel numa folha de Excel e o jogo num caderno.

Duas consequências para o site:

- **Nada de vocabulário de software.** Não há "dashboards", "workflows" nem
  "onboarding". Há jogos, planteis, escalões, competições.
- **O argumento não é a app, é o problema.** Quem chega ao site já ouviu falar
  do produto (ver secção 5) e quer confirmar que resolve o que lhe dói. Mostrar
  o campo com o cronómetro a andar explica mais do que três parágrafos.

Há também um segundo comprador, que vale mais: **o clube**. Um clube com oito
escalões tem oito treinadores a apontar jogos em papel. A página de licenças
tem de falar aos dois — ver secção 7.

---

## 3. As funcionalidades, para explicar no site

Está tudo construído e a funcionar. Não inventes funcionalidades que não estão
nesta lista, e não prometas nada para "em breve".

### Durante o jogo

- **Campo com os cinco em posição.** Tocar num jogador em campo e depois num do
  banco troca-os. É o mesmo gesto em toda a app.
- **Cronómetro que respeita as paragens.** Dois modos: cronometrado (o tempo
  pára a cada interrupção, 20 min por parte) ou corrido (30 min por parte). É
  uma propriedade do escalão, mudável jogo a jogo.
- **Golos, assistências, faltas e cartões em dois toques.** O marcador sobe
  primeiro; a pergunta de quem marcou vem a seguir, e pode ficar por responder.
- **Os dois minutos de inferioridade**, contados em **tempo de jogo** e não em
  tempo real: param quando o cronómetro pára, atravessam o intervalo, e
  sobrevivem a fechar o iPad. Com aviso sonoro quando terminam.
- **Um golo sofrido liberta um jogador**, como mandam as Leis do Jogo — e só
  quando a equipa que sofreu é a que está reduzida. Há um contador de expulsões
  do adversário precisamente para a app saber isso.
- **Guarda-redes avançado (5v4)** detetado sozinho quando um jogador de campo
  vai à baliza, com o tempo em 5v4 registado e mostrado no resumo.
- **Desfazer** para trás, sem perder nada.

### Depois do jogo

- **Tempo em campo, entradas e tempo de banco**, jogador a jogador.
- **Participações em golos**: quanto a equipa marcou e sofreu com cada jogador
  em campo. Não é mérito individual — é quanto a equipa produz com ele lá
  dentro, que é uma leitura diferente e mais honesta.
- **Golos por parte**, com o minuto de cada um.
- **Correção a frio**: acertar o marcador de um golo, o minuto, ou o resultado
  inteiro, e tudo se recalcula — incluindo o resultado ao intervalo.
- **Exportar para folha de cálculo** (CSV), jogo a jogo ou o plantel inteiro.

### Arrumação

- **Clubes → escalões → competições.** As estatísticas de cada prova em
  separado: perder na taça não é o mesmo que perder no campeonato.
- **Plantel por escalão**, com número, posição preferida e pé preferido.
- **Histórico por jogador** ao longo da época.
- **Importar o plantel de um CSV**, para quem já o tem escrito no Excel. Com
  ficheiro de exemplo para descarregar.

### Sem internet

Tudo é guardado no aparelho primeiro. A sincronização acontece sozinha quando
houver ligação, e os mesmos dados abrem no iPad e no telemóvel.

### Privacidade

Sem publicidade, sem rastreio, sem identificadores publicitários. Recolhe o
email da conta e o que o treinador escreve, e mais nada. Dados alojados na
União Europeia. Apagar a conta é um botão dentro da app, imediato.

**Três idiomas:** português, inglês e espanhol, com o vocabulário do futsal em
cada um (em espanhol o *fixo* é *cierre*, em inglês a sanção é *penalty time*).

---

## 4. O que o site tem de ter

Três secções, nesta ordem de importância:

### 4.1 Apresentação (página inicial)

O argumento, as funcionalidades, e imagens. Deve responder em dez segundos a
"isto serve para quê?" e em dois minutos a "vale a pena?".

Sugestão de estrutura, não obrigatória:

1. Frase de abertura sobre o problema do tempo de jogo, com uma imagem do campo
   durante um jogo.
2. As funcionalidades agrupadas como na secção 3 (durante / depois / arrumação).
3. O offline, que é um argumento forte e pouco óbvio.
4. A privacidade, curta.
5. Chamada para a página de licenças.

### 4.2 Contactos

Email e telefone, com `mailto:` e `tel:` diretos. Um formulário simples é bem-
vindo se não exigir servidor (ver secção 8).

Email de contacto: **review.futsalsubstats@gmail.com**

### 4.3 Licenças

Ver secção 7 — tem regras próprias.

---

## 5. Como o produto se vende (e porque isso molda o site)

**A venda não acontece no site.** Acontece em reuniões com treinadores e por
divulgação em grupos e comunidades de futsal. Quem chega ao site já ouviu falar
do produto e vem confirmar, comparar preços, ou pedir uma licença.

O site é, por isso, **material de apoio a uma conversa** e não uma loja. Isso
significa:

- Não precisa de captar tráfego frio nem de SEO agressivo.
- Precisa de ser **partilhável**: um treinador manda o link a outro no
  WhatsApp. A pré-visualização do link (Open Graph) tem de ficar bem.
- Precisa de responder às objeções que surgem numa reunião: "funciona sem
  rede?", "quanto custa?", "e os meus dados?".

---

## 6. ⚠️ A restrição da App Store — ler com atenção

A app iOS vai ser publicada como **app companheira gratuita de uma ferramenta
web**, ao abrigo da regra **3.1.3(f)** das App Store Review Guidelines:

> Free apps acting as a stand-alone companion to a paid web based tool do not
> need to use in-app purchase, **provided there is no purchasing inside the app,
> or calls to action for purchase outside of the app**.

O que isto significa para ti:

- **O site pode ter preços à vontade.** A restrição é só dentro da app.
- **A app nunca vai ligar para este site.** Não contes com tráfego vindo de lá,
  e não peças para se acrescentar um botão na app a apontar para os preços — é
  exatamente isso que a regra proíbe.
- Se um dia alguém te pedir para pôr um link do site dentro da app, a resposta
  é não, e a razão é esta.

Não precisas de escrever nada disto no site. Precisas de saber que existe.

---

## 7. A página de Licenças

### O modelo

Duas licenças, ambas **por época** (setembro a junho), porque o futsal tem
época e ninguém quer pagar julho e agosto por nada:

| Licença | Para quem | Cobre |
|---|---|---|
| **Treinador** | Um treinador, um escalão | Uma conta |
| **Clube** | O clube inteiro | Todos os escalões e treinadores |

**Os valores ainda não estão decididos.** Monta a página com os dois níveis e
deixa os preços num sítio óbvio e fácil de trocar (uma constante no topo do
ficheiro, ou um pequeno JSON). Não inventes números.

### Como se compra

**Não há pagamento no site.** A página mostra os preços e um botão **"Pedir
licença"** que abre o email (ou um formulário, se for sem servidor) já com o
assunto preenchido.

Isto é deliberado: o dono do produto vende por reunião, e montar pagamentos
implicaria conta de pagamentos, faturação e IVA europeu — trabalho que não se
justifica antes de haver clientes. A página tem de deixar isso natural, não
envergonhado: "fale connosco" é normal quando se vende a clubes.

Sugestão de conteúdo, além dos preços:

- O que está incluído em cada licença.
- Que a app funciona nos três idiomas.
- Que há um modo de experiência gratuito — quem instalar a app pode jogar um
  jogo completo com uma equipa fictícia, sem criar conta. É um bom argumento
  para pôr aqui.

---

## 8. Requisitos técnicos

### Obrigatórios

- **Site estático.** Sem servidor, sem base de dados, sem estado. HTML, CSS e o
  JavaScript que for preciso. Isto não é uma preferência estética: mantém o
  alojamento gratuito e o site sem manutenção.
- **Três idiomas: português, inglês e espanhol.** O português é a referência.
  Segue a mesma disciplina da app: um ficheiro por idioma, as mesmas chaves em
  todos, e a escolha guardada no dispositivo. Não uses tradução automática do
  browser.
- **Responsivo, e primeiro no telemóvel.** O link vai ser aberto no WhatsApp.
- **Open Graph e Twitter Card** com imagem, título e descrição. Um link
  partilhado sem pré-visualização perde metade da força.
- **Acessível**: contraste suficiente, textos alternativos nas imagens,
  navegação por teclado.

### Onde vai ser alojado

**Cloudflare Pages.** O plano gratuito permite uso comercial, largura de banda
ilimitada e não tem limite de tráfego — ao contrário do Vercel Hobby, que
proíbe uso comercial nos termos de serviço, e este site vende licenças.

### Identidade visual

A app usa tema escuro. O site pode ser claro ou escuro — mas se for escuro, usa
estas cores, para as capturas de ecrã encaixarem em vez de flutuarem:

```
Fundo        #0b1220
Fundo 2      #111c30
Cartão       #16233b
Linha        #2a3d5f
Texto        #eaf1ff
Texto suave  #91a4c4
Verde        #22c55e   ← a cor da marca
Âmbar        #f59e0b
Vermelho     #ef4444
```

O verde `#22c55e` é a cor de ação em toda a app: é a dos botões que fazem
acontecer alguma coisa. Usa-o com a mesma disciplina — se tudo for verde, nada
é verde.

Tipografia: uma sans-serif de sistema chega e carrega mais depressa. Os números
(tempos, resultados) ficam melhor numa monoespaçada, como na app.

### Imagens

As capturas de ecrã da app estão em `prints/` neste repositório:

| Ficheiro | O que mostra |
|---|---|
| `ao-vivo-primeira-parte.png` | O campo durante um jogo, com o cronómetro a andar |
| `ao-vivo-sancao-5v4.png` | Uma sanção a decorrer e o selo 5v4 |
| `intervalo.png` | O intervalo, com os golos de cada parte |
| `resumo-jogo.png` | O resumo do jogo |
| `ficha-jogador.png` | A ficha de um jogador ao longo da época |
| `competicao.png` | As estatísticas de uma competição |
| `escalao-jogos.png` | A lista de jogos de um escalão |

**Aviso:** algumas destas capturas foram tiradas com dados de teste e mostram
estatísticas a zeros. Confirma antes de as usares — uma imagem de montra com
tudo a zeros afasta mais gente do que uma imagem a menos. A melhor é a do campo
durante o jogo.

Se precisares de molduras de telemóvel à volta das capturas, gera-as; não há
ficheiros prontos.

---

## 9. Tom de escrita

O produto tem uma voz e vale a pena mantê-la. É a mesma que está na ficha da
App Store:

> Quem treina futsal sabe de cor quem marcou. Do tempo de jogo de cada um,
> ninguém se lembra — e é esse o número que decide as rotações da semana
> seguinte.

Regras:

- **Frases curtas. Palavras concretas.** "Aponta as substituições com o polegar,
  à beira do campo" e não "solução integrada de gestão de rotações".
- **Sem superlativos.** Nada de "revolucionário", "poderoso", "líder de
  mercado". O produto vende-se a mostrar o problema, não a elogiar-se.
- **Sem emojis** nos textos correntes. Ícones simples, sim.
- **Português de Portugal.** Não é o mesmo do Brasil, e o público nota: é
  "equipa" e não "time", "guarda-redes" e não "goleiro", "casa de banho" e não
  "banheiro". No espanhol, vocabulário de Espanha.

---

## 10. O que NÃO fazer

- **Não prometas o que não existe.** Não há versão Android, não há vídeo de
  análise, não há integração com federações, não há app de relógio.
- **Não ponhas botão da App Store** enquanto a app não estiver publicada. Um
  link partido é pior do que nenhum.
- **Não inventes preços.** Ver secção 7.
- **Não uses o email pessoal do dono.** O contacto é
  `review.futsalsubstats@gmail.com` e mais nenhum.
- **Não copies os nomes de jogadores** das capturas para textos de exemplo sem
  perceber que são inventados. São todos fictícios, mas convém não os apresentar
  como clientes.
- **Não peças analytics de terceiros** sem perguntar. A app vende-se com o
  argumento de não ter rastreio; um site cheio de píxeis de publicidade
  contradiz isso na primeira frase.

---

## 11. Perguntas frequentes, com as respostas certas

Úteis para a página inicial ou para uma secção de FAQ.

**Funciona sem internet?**
Sim. Tudo é guardado no aparelho primeiro e sincroniza sozinho quando houver
ligação. Um pavilhão sem rede não impede nada.

**Preciso de criar conta?**
Para experimentar, não: a app deixa jogar um jogo completo com uma equipa
fictícia sem conta nenhuma. Para guardar os teus jogos, sim.

**Os meus dados são meus?**
Sim. Não são vendidos nem partilhados, ficam alojados na União Europeia, e há um
botão dentro da app para transferir uma cópia de tudo ou apagar a conta
inteira.

**Serve para escalões de formação?**
É onde serve melhor. O tempo de jogo de cada miúdo é a conversa mais frequente
com os pais, e é a que ninguém consegue ter de memória.

**E se eu já tiver o plantel no Excel?**
Importa-se. A app aceita um ficheiro CSV com número, nome, posição e pé preferido. Tem
um exemplo para descarregar.

**Funciona no iPad?**
Sim, e é onde se vê melhor durante o jogo.

**Há versão Android?**
Ainda não.
