# Atualizações ao vivo

Como mandar uma correção para os telemóveis dos treinadores em minutos, em vez
de esperar dois dias pela revisão da Apple e mais uns dias pelas atualizações
automáticas.

O código web da app vai empacotado dentro dela. Isto acrescenta um segundo
caminho: a app pergunta a um servidor nosso se há uma versão web mais recente,
descarrega-a, e aplica-a na abertura seguinte. O invólucro nativo — o que está
na loja — não muda.

---

## 1. O que pode e o que não pode ir por aqui

| Vai por ar | Continua a exigir versão nova na loja |
|---|---|
| Páginas, ecrãs, textos, traduções | Um plugin do Capacitor novo |
| CSS, disposição, cores | Permissões no manifesto |
| Cálculos, estatísticas, correções | O ícone, o nome, o ecrã de arranque |
| Tudo o que está em `src/` | Tudo o que está em `android/` ou `ios/` |

A regra: **um pacote web não pode pedir nada que a casca instalada não tenha.**
Se uma funcionalidade precisa de um plugin novo, tem de ir pela loja — e só
depois é que os pacotes seguintes a podem usar. A coluna `minima_nativa` existe
para garantir isso (secção 5).

É permitido pelas duas lojas: a Apple autoriza expressamente descarregar e
correr código interpretado, desde que não mude o propósito da app nem
acrescente capacidades nativas. É o mesmo mecanismo do Appflow e afins.

---

## 2. As peças

```
telemóvel ──POST──► Edge Function `atualizacao`  ──lê──►  tabela app_bundles
    │                                                            │
    └──────────────GET (zip)───────────────────────►  Supabase Storage
```

Tudo dentro do Supabase que já tens. Não há segundo fornecedor nem custo novo.

| Peça | Onde | Ficheiro |
|---|---|---|
| Plugin nativo | `package.json` + `capacitor.config.json` | `@capgo/capacitor-updater` |
| Confirmação de arranque | app | `src/lib/atualizacoes.js` |
| Tabela dos pacotes | Supabase | `supabase/migrations/0008_…sql` |
| Quem responde à app | Supabase | `supabase/functions/atualizacao/` |
| Publicar | teu computador | `tools/publicar-bundle.mjs` |

---

## 3. A rede de segurança, que é o que torna isto aceitável

Sem revisão da loja pelo meio, **um erro meu chega a todos os telemóveis ao
mesmo tempo**. Há três travões, e convém saber para que serve cada um.

**O regresso automático.** Depois de aplicar um pacote, o invólucro espera 20
segundos por `notifyAppReady()`. Se não chegar, dá o pacote como avariado e
volta ao anterior sozinho. É por isso que essa chamada está no arranque da app,
sem condições nenhumas — um `if` mal posto ali transforma-se numa app que
reverte sem ninguém perceber porquê.

**O pacote nasce desligado.** O script de publicação insere a linha com
`ativo = false`. Ligar é um comando à parte, feito depois de instalares o
pacote num aparelho e veres a app abrir.

**O lançamento faseado.** `--percentagem 10` manda o pacote a um em cada dez
aparelhos. A escolha é feita por uma marca do aparelho, não à sorte, para o
mesmo telemóvel cair sempre do mesmo lado — senão andaria a saltar entre
versões a cada verificação.

E o botão de emergência:

```sql
update app_bundles set ativo = false where versao = '1.0.2';
```

Os telemóveis voltam ao pacote anterior na verificação seguinte.

---

## 4. Montar (uma vez)

### 4.1 Instalar o plugin

```powershell
npm install
npm run app:android
npm run app:ios      # se estiveres no Mac
```

O plugin é nativo: **a partir daqui é preciso um build novo para as lojas**. As
apps que já estiverem instaladas sem ele nunca recebem atualizações ao vivo — é
por isso que isto se faz antes da primeira publicação e não depois.

### 4.2 A tabela

Correr `supabase/migrations/0008_pacotes_de_atualizacao.sql` no SQL Editor.

### 4.3 O balde

Supabase → **Storage** → *New bucket*, com o nome **`pacotes`**, marcado como
**público**. Os zips não têm segredos — o que protege os dados é a segurança por
linha, não o esconder do código.

### 4.4 A função

Precisa do Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref <o-teu-ref>
npx supabase functions deploy atualizacao --no-verify-jwt
```

O `--no-verify-jwt` é obrigatório: o plugin pergunta antes de a app abrir, sem
sessão iniciada. Uma função que exigisse autenticação nunca seria chamada.

### 4.5 O endereço na configuração

Em `capacitor.config.json`, trocar `<projeto>` pelo teu:

```json
"updateUrl": "https://abcdefgh.supabase.co/functions/v1/atualizacao"
```

E voltar a correr `npm run app:android` para o valor entrar no invólucro.

---

## 5. Publicar uma atualização

```powershell
npm run build

$env:SUPABASE_SERVICE_ROLE_KEY = "..."     # só nesta sessão
npm run publicar:pacote -- 1.0.2 --percentagem 10 --notas "corrige o 5v4"
```

O script recusa-se a publicar se a pasta `out/` tiver mais de 30 minutos — é o
erro mais fácil de cometer aqui, e o mais chato de descobrir.

Depois:

1. Instala o zip num aparelho de teste, ou liga o pacote só para ti.
2. `update app_bundles set ativo = true where versao = '1.0.2';`
3. Vê como corre. Se estiver bom, sobe a percentagem:
   `update app_bundles set percentagem = 100 where versao = '1.0.2';`

### A chave de serviço

`SUPABASE_SERVICE_ROLE_KEY` **ignora toda a segurança por linha**. Nunca pode
entrar na app, no repositório, nem numa variável `NEXT_PUBLIC_`. Vive só no
ambiente de quem publica.

O `npm run check` recusa-a em `src/` e recusa qualquer chave escrita no código,
em qualquer sítio.

### A versão nativa mínima

Se um pacote precisar de alguma coisa que só existe a partir de uma versão da
loja:

```powershell
npm run publicar:pacote -- 1.2.0 --minima-nativa 1.1.0
```

Telemóveis com uma casca mais antiga ignoram-no e ficam no que têm — em vez de
receberem código que chama o que eles não sabem fazer.

---

## 6. A ordem, quando há migração de base de dados

Uma funcionalidade nova costuma ter duas metades: uma coluna ou um tipo de
acontecimento no Supabase, e o ecrã que os usa.

**Migrar primeiro, publicar o pacote depois. Sempre.**

Com a revisão da loja pelo meio havia dois dias de folga; por ar não há nenhuma.
Um pacote que espere uma coluna que ainda não existe rebenta em toda a gente.

E a regra que já era verdade e agora conta mais: **só acrescentar, nunca
reinterpretar.** Vão existir sempre várias versões da app em campo ao mesmo
tempo — a que atualizou ontem e a que não abre a app desde setembro.

---

## 7. Quando isto não chega

- **Um treinador sem rede** fica na versão que tem até abrir a app com ligação.
  A verificação nunca bloqueia o arranque, de propósito.
- **O pacote aplica-se na abertura seguinte**, não a meio de uma sessão. Um jogo
  a decorrer nunca vê a app recarregar debaixo dos pés.
- **Uma versão da loja deita fora os pacotes antigos** (`resetWhenUpdate`).
  Depois de publicares na loja, publica também o pacote correspondente.
