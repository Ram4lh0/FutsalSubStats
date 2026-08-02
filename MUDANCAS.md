# O que mudou nesta ronda

## Antes de correr: a base de dados

No Supabase → **SQL Editor**, correr `supabase/migrations/0003_escaloes_e_competicoes.sql`.

A migração não perde nada: cada clube existente ganha um escalão chamado
**"Sénior"** (podes renomeá-lo depois) e os jogadores e jogos passam para lá. As
competições que estavam escritas à mão nos jogos viram competições a sério.

Depois, no computador:

```
npm install
npm run build
```

E no browser, uma vez: sai da conta e volta a entrar, para a app descarregar a
estrutura nova.

## Estrutura

**O clube deixou de ter estatísticas.** Passou a ser um guarda-chuva: abre-se o
clube e vêem-se os escalões. Comparar um Sub-15 com os séniores não dizia nada a
ninguém.

**O escalão é onde tudo vive** — plantel, jogos, competições e estatísticas.
Cada jogador pertence a um escalão, e o número de camisola é único dentro dele:
o 10 dos Sub-15 e o 10 dos séniores são pessoas diferentes.

**As competições são do escalão.** Há uma aba com o resumo de todas e, ao clicar
numa, o detalhe: jogos, resultados e as estatísticas dos jogadores só nessa
prova. Ao criar um jogo escolhe-se a competição.

**A época é do clube** (todos os escalões partilham a mesma). **O tipo de tempo é
do escalão**, porque é aí que difere — e continua a poder ser mudado jogo a jogo,
já preenchido com o do escalão.

## Estatísticas

Saíram o maior e o menor período. Entraram as **participações em golos**: golos
marcados e sofridos pela equipa com aquele jogador dentro das quatro linhas. Não
é mérito individual — é a leitura de quanto a equipa produz (e sofre) com ele em
campo. Os períodos de entrada e saída continuam todos registados, no botão de
sempre.

## Pormenores

- A linha do jogo é clicável por inteiro; o botão "Abrir" desapareceu.
- "Guardar jogo" ganhou cor suave, para se distinguir de "Guardar e abrir".
- O local do jogo é só casa ou fora — o campo de texto do pavilhão saiu.
- Cada cartão de clube e de escalão tem "Editar" ao canto, com eliminação e
  confirmação lá dentro.
- O intervalo volta a deslizar no computador (faltava deixar as colunas
  encolherem abaixo do conteúdo).
