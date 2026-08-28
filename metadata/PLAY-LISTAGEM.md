# A ficha da Play Store

O `LISTAGEM.md` do lado é a ficha da Apple. Este é o mesmo trabalho para a
Google, e existe em separado porque os campos **não são os mesmos**:

| Campo | Apple | Google |
|---|---|---|
| Nome | 30 | 30 |
| Subtítulo | 30 | — não existe |
| Descrição breve | — não existe | **80** |
| Descrição | 4000 | 4000 |
| Palavras-chave | campo próprio | **não existe** |
| Novidades | 4000 | **500** |

As duas diferenças que dão trabalho: a Google não tem campo de palavras-chave —
indexa o **nome, a descrição breve e a descrição completa**, por isso as
palavras que interessam têm de aparecer no texto escritas com naturalidade — e
pede uma descrição breve de 80 caracteres que a Apple não pede.

---

## Nome (30 caracteres)

```
Futsal SubStats
```

## Descrição breve (80 caracteres)

```
Futsal: substituições em dois toques e o tempo de cada jogador contado sozinho.
```

79 caracteres. É a linha que aparece por baixo do nome nos resultados de
pesquisa, e é indexada — daí começar por "Futsal", que é a palavra por que
alguém procura isto. As alternativas que ficaram de fora, se um dia quiseres
trocar:

- `Substituições, tempo de jogo e estatísticas de futsal — mesmo sem internet.` (75)
- `O tempo de jogo de cada jogador, ao segundo. Futsal, e sem precisar de internet.` (80)

## Descrição completa (4000 caracteres)

```
Quem treina futsal sabe de cor quem marcou. Do tempo de jogo de cada um, ninguém se lembra — e é esse o número que decide as rotações da semana seguinte.

O Futsal SubStats é um bloco de notas que sabe contar o tempo. Marca as substituições com o polegar, à beira do campo, e no fim do jogo tem a ficha pronta: quanto tempo cada jogador esteve em campo, quantas vezes entrou, quanto tempo levou no banco.

NO JOGO
• Campo com os cinco em posição — tocar num jogador e num do banco troca-os
• Cronómetro que respeita as paragens, cronometrado ou corrido
• Golos, assistências, faltas e cartões em dois toques
• Os dois minutos de inferioridade contados em tempo de jogo, com aviso no fim
• Guarda-redes avançado detetado sozinho, com o tempo em 5v4 registado
• Desfazer para trás, sem perder nada

DEPOIS DO JOGO
• Tempo em campo, entradas e tempo de banco, jogador a jogador
• Participações em golos: o que a equipa marcou e sofreu com cada um em campo
• Golos por parte, com o minuto de cada um
• Correção a frio: acertar o marcador de um golo ou o minuto, e tudo se recalcula
• Exportar para folha de cálculo

ARRUMAÇÃO
• Clubes, escalões e competições de futsal — as estatísticas de cada prova em separado
• Plantel por escalão, com número, posição e pé preferido
• Histórico por jogador ao longo da época

PARA O CLUBE
• Vários escalões no mesmo clube, cada um com o seu plantel e as suas contas
• O clube decide quem vê e quem edita cada escalão
• Um treinador vê só os escalões que lhe deram

SEM INTERNET
Tudo é guardado no aparelho primeiro. Um pavilhão sem rede não impede nada; a sincronização acontece sozinha quando houver ligação, e os mesmos dados abrem no tablet e no telemóvel.

Sem publicidade. Sem rastreio. Sem compras dentro da app.
```

Duas notas sobre este texto na Google:

O bloco **PARA O CLUBE** não existe na versão da Apple e foi acrescentado aqui:
descreve o que a licença de Clube faz, e as palavras "escalão", "plantel" e
"treinador" ajudam a indexação sem soar a lista de palavras-chave.

**Nada de preços nem de convites a comprar.** A app não vende nada por dentro —
as licenças tratam-se por email — e é isso que a última linha diz. Manter esta
regra também na Google evita ter dois textos a divergir.

## Novidades desta versão (500 caracteres)

```
Primeira versão.
```

## Categoria e etiquetas

Categoria: **Desporto**.

Etiquetas (a Google deixa escolher até cinco de uma lista fechada): *Sports*,
*Team Sports*, *Sports Games* não serve — isto não é um jogo. Escolher as que
existirem mais próximas de treino e desporto de equipa.

Tipo de app: **Aplicação**, não jogo.

## Contactos da ficha

```
review.FutsalSubStats@gmail.com
```

Site: `https://futsalsubstats.r4m.workers.dev`

Telefone: opcional, deixar vazio.

## Política de privacidade

```
https://futsalsubstats.vercel.app/privacy
```

Tem de responder sem sessão iniciada — a Google abre-a com um robô, não com uma
conta. É o mesmo endereço que vai na ficha de segurança dos dados.

## Eliminação da conta

```
https://futsalsubstats.vercel.app/delete-account
```

A Google exige este endereço para apps com contas, e exige que a página exista
**fora** da app: alguém que já desinstalou tem de conseguir apagar os dados.

## Acesso para quem revê

**A app avalia-se inteira sem conta nenhuma.** O jogo de experiência, no ecrã de
entrada, não é uma amostra: monta um clube, um escalão, um plantel e um jogo, e
o `Guard` deixa percorrer tudo a partir daí — painel, clube, escalões, plantel,
jogos, competições e estatísticas. O que ele não deixa é **alterar** a
estrutura, e isso é de propósito: aquilo desaparece quando a experiência acaba.

Ficam de fora três coisas, todas pequenas: apagar a conta (não há conta),
o ecrã "Quem tem acesso" (precisa de rede e de sessão) e a sincronização. A
eliminação da conta — a única que a Google verifica a sério — está coberta pelo
endereço público mais acima, que responde sem sessão.

Mesmo assim, preencher o **App access** com a conta de revisão. Não é por a
demonstração não chegar: é porque basta um revisor tentar entrar, reparar que o
registo está fechado, e marcar como bloqueado. Custa dois campos e evita um
ciclo de recusa com os 14 dias do teste fechado a correr.

No mesmo campo, escrever a nota da demonstração — é ela que dá o caminho rápido:

```
Não é preciso conta para avaliar a app. No ecrã de entrada há um jogo de
experiência que não exige registo e dá acesso a todos os ecrãs: painel, clube,
escalões, plantel, jogos, competições e estatísticas. As credenciais abaixo
servem apenas para quem quiser ver a app com uma conta a sério.
```

A palavra-passe **nunca** se escreve aqui nem em nenhum ficheiro do
repositório — vai só no formulário da consola.

---

## O que a Google pede e não é texto

- **Ícone**: 512 × 512 — `metadata/play/icone-512.png`
- **Gráfico de destaque**: 1024 × 500 — `metadata/play/destaque-1024x500.png`
- **Capturas de telemóvel**: mínimo 2, máximo 8, 1080 × 1920, proporção 9:16
- **Ficha de segurança dos dados**: as respostas estão em
  `metadata/FICHA-SEGURANCA-DADOS.md`
- **Classificação de conteúdo**: questionário IARC, dentro da consola
- **Anúncios**: não
