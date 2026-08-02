# O que mudou nesta ronda

## Antes de correr: a base de dados

No Supabase → **SQL Editor**, correr `supabase/migrations/0004_5v4_e_expulsoes_do_adversario.sql`.

São quatro tipos de evento novos. O Postgres recusa eventos que não conheça, por
isso sem esta migração o 5v4 e as expulsões do adversário ficavam presos no iPad,
com a sincronização a falhar.

(Se ainda não tiveres corrido a `0003_escaloes_e_competicoes.sql`, essa vem
primeiro.)

Depois, no computador:

```
npm install
npm run check   # imports, propriedades e 48 testes
npm run build
```

## 5v4 — guarda-redes avançado

**A app percebe sozinha.** Assim que quem está à baliza é um jogador de campo —
fixo, ala, pivot ou universal —, começa a contar. Quando o guarda-redes volta, a
contagem pára. Cada troca é um período novo.

**O selo 5v4 no cartão da baliza** existe para os dois casos que o automatismo
não resolve: um guarda-redes a sério que sobe para jogar como quinto (a app não
adivinha), e uma deteção errada que se quer desligar. A decisão do treinador vale
enquanto for o mesmo jogador à baliza; trocar de guarda-redes recomeça do
automatismo. O intervalo também limpa a decisão.

Se o plantel não tiver posições registadas, a app não inventa nada — fica calada
e o selo continua disponível.

**No resumo do jogo** aparece o cartão "Tempo em 5v4" com o total; clicar abre a
lista dos períodos, com a parte, o minuto de início e de fim e a duração. Também
vai no CSV.

## Expulsões do adversário

Um contador com mais e menos, por baixo do campo. Sem cronómetro: tira-se quando
eles voltarem a ser cinco.

Serve para uma regra que a app estava a aplicar mal. Em futsal, um golo só
devolve um jogador à equipa que está **com menos gente do que a outra**. Se cada
equipa tiver um expulso — 4 contra 4 —, o golo não repõe ninguém; se eles
voltarem aos cinco e marcarem, aí sim o nosso quinto jogador pode entrar. Sem
saber quantos são eles, a app repunha sempre.

## Resultado ao intervalo

Passou a ser **contado a partir dos golos da 1.ª parte**, em vez de fotografado
no apito. Corrigir um golo a frio — acrescentar um que faltava, acertar o minuto
de outro — mexe agora também no resultado ao intervalo, em vez de deixar o jogo a
contar duas histórias diferentes.

## Pormenores

- A aba **Plantel** mostra quantos jogadores são ao todo, quantos estão ativos e
  quantos inativos.
- **Sem competições no escalão não se cria jogo.** Em vez de deixar chegar à
  quarta etapa e falhar, o assistente avisa logo e leva a criar a primeira.
- Corrigidos dois erros que rebentavam páginas: a competição no ecrã de
  confirmação do jogo, e os apelidos por preencher nos formulários de clube,
  escalão e competição.

## Ronda anterior: escalões e competições

O clube deixou de ter estatísticas e passou a ser um guarda-chuva: dentro dele
vivem os escalões, e é no escalão que estão o plantel, os jogos, as competições e
as estatísticas. Cada jogador pertence a um escalão, e o número de camisola é
único dentro dele. A época é do clube; o tipo de tempo é do escalão e pode ser
mudado jogo a jogo. Nas estatísticas, saíram o maior e o menor período e entraram
as participações em golos marcados e sofridos. A migração dessa ronda é a
`0003_escaloes_e_competicoes.sql`.

## Sobras do modelo antigo (erro 23502)

`null value in column "team_id"` acontecia porque a base de dados do servidor foi
migrada para escalões e a base que vive dentro do browser não: ganhou as tabelas
novas e ficou com os jogadores e jogos de antes, sem escalão. O servidor
recusava-os, e como o envio pára no primeiro erro, uma linha de há meses
bloqueava tudo o que vinha atrás.

Duas correções:

- **No envio**, uma linha antiga sem escalão é adotada pelo escalão do clube se
  houver um só. Se não houver por onde decidir, deixa de contar como pendente —
  fica guardada, mas para de encravar a fila.
- **"Limpar este dispositivo"**, no painel dos clubes. Apaga o que está guardado
  no browser e volta a descarregar do servidor. É a cura definitiva para sobras
  de versões antigas. O que já foi sincronizado não se perde nem é tocado nos
  outros dispositivos; o que estiver por enviar, esse desaparece — e a
  confirmação diz quantas alterações são.

## Verificação

`npm run check` corre três coisas: todos os `import` apontam para algo que
existe, todas as propriedades passadas a um componente são recebidas, e os 48
testes do domínio e da sincronização. Os verificadores estão em `tools/` e são
uma rede de segurança enquanto o compilador não corre aqui — não substituem o
`npm run build`.
