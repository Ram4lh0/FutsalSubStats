# Publicar na App Store — o que falta preencher

Este documento é a lista do que a Apple pede e que não é código. O código que
faltava — apagar a conta e a política de privacidade — já está feito.

Antes disto, o TestFlight: ver `TESTFLIGHT.md`.

---

## 1. Antes de submeter, correr no Supabase

```
supabase/migrations/0005_apagar_conta.sql
supabase/migrations/0006_apagar_conta_por_ordem.sql
```

As duas, por esta ordem. A `0006` corrige a `0005`, que contava com as cascatas
da base de dados e não chegava — há sete chaves a apontar para dentro da corrente
sem cascata, algumas de propósito.

**Sem isto o botão na app dá erro**, e um botão de apagar conta que não apaga é
rejeição garantida: vão testá-lo.

---

## 2. Conta de demonstração

Quem revê abre a app, vê um ecrã de início de sessão e precisa de entrar. Se
encontrar um painel vazio do outro lado, não tem como avaliar nada — e "não
conseguimos avaliar a funcionalidade" é dos motivos de rejeição mais comuns.

A conta é a **`review.futsalsubstats@gmail.com`**.

> **A palavra-passe não entra no repositório.** Nem em ficheiro, nem em
> comentário. Vive em dois sítios: no teu gestor de palavras-passe e no campo
> *Password* em App Store Connect. Que sirva só para isto — vai ser escrita num
> formulário e lida por pessoas que não conheces.

> **Contar que a conta seja apagada.** Quem revê vai carregar no botão de apagar
> a conta, para confirmar que faz o que diz. E faz: a conta desaparece. Se houver
> uma segunda submissão, é criá-la outra vez e voltar a correr o script — dois
> minutos.

1. Cria-a pela app, normalmente.
2. Confirma o email.
3. Corre `supabase/scripts/conta_de_demonstracao.sql` — já tem o email lá
   dentro. Fica com um clube, dois escalões, dez jogadores, duas competições, um
   jogo terminado 4-2 (com golos, substituições, faltas, um amarelo e um período
   de 5v4) e um jogo por jogar.
4. Entra com essa conta e confirma que está tudo lá.

Em **App Store Connect → a versão → App Review Information**:

- **Sign-in required**: sim
- **User name** e **Password**: os da conta
- **Notes**:

  > A app serve para acompanhar jogos de futsal ao vivo e medir o tempo de jogo
  > de cada jogador.
  >
  > A conta fornecida já tem um clube com dois escalões e um jogo terminado.
  > Sugestão de percurso: Os meus clubes → CD Demonstração → Séniores → aba
  > Jogos → abrir o jogo terminado, onde estão as estatísticas por jogador,
  > incluindo o tempo em campo, as participações em golos e o tempo em 5v4.
  >
  > Para ver a app a funcionar ao vivo: aba Jogos → Novo jogo → escolher
  > convocados e cinco inicial → iniciar. O cronómetro, as substituições e o
  > marcador funcionam sem ligação à internet.
  >
  > A conta pode ser apagada dentro da app em Conta → Apagar a conta.

---

## 3. Política de privacidade

Já existe, servida pela própria app:

```
https://futsal-lake-five.vercel.app/privacy
```

É este endereço que vai no campo **Privacy Policy URL**. Abre sem sessão
iniciada, de propósito — quem revê não tem conta.

---

## 4. Declarações de recolha de dados (App Privacy)

Em **App Store Connect → App Privacy**. Isto é preenchido à mão e tem de bater
certo com a política. O que a app recolhe:

| Categoria | Recolhe? | Ligado à identidade? | Usado para seguir? | Finalidade |
|---|---|---|---|---|
| Contact Info → Email Address | Sim | Sim | Não | App Functionality (conta) |
| Contact Info → Name | Sim | Sim | Não | App Functionality (nome do treinador) |
| User Content → Other User Content | Sim | Sim | Não | App Functionality (clubes, planteis, jogos) |
| Identifiers → User ID | Sim | Sim | Não | App Functionality |
| Location | Não | — | — | — |
| Health & Fitness | Não | — | — | — |
| Usage Data | Não | — | — | — |
| Diagnostics | Não | — | — | — |

Em **Tracking**: responder **não**. A app não segue ninguém entre apps ou sites,
e não tem publicidade.

Nota sobre os nomes dos jogadores: são conteúdo escrito pelo utilizador e
declaram-se como *User Content*, não como dados de terceiros recolhidos pela app.

---

## 5. Ficha da app

- **Nome**: tem de ser único em toda a App Store.
- **Subtítulo** (30 caracteres): por exemplo *Tempo de jogo, ao segundo*.
- **Categoria**: Sports. Secundária: Utilities.
- **Classificação etária**: preencher o questionário. Sem conteúdo sensível de
  nenhum tipo — dá 4+.
- **Support URL**: obrigatório. Serve uma página simples com um email de
  contacto; não pode ser um endereço de email sozinho.
- **Copyright**, **descrição**, **palavras-chave**.

**Capturas de ecrã**, no mínimo:

- iPhone 6,9" (1290 × 2796)
- iPad 13" (2064 × 2752), porque a app declara suporte a iPad

Sugestão do que mostrar, por ordem: o campo durante um jogo, o resumo com as
estatísticas por jogador, a lista de jogos de uma competição, o plantel.

---

## 6. O que ainda pesa contra

**Regra 4.2 — funcionalidade mínima.** Empacotar o código dentro da app tirou-te
da situação em que a rejeição era quase certa. O que joga a teu favor: funciona
sem rede, guarda dados no aparelho, e faz uma coisa concreta que um site não faz
bem — cronometrar cinco jogadores ao mesmo tempo com o polegar.

O que ainda ajudaria, por ordem de esforço:

1. **O ecrã não adormecer durante o jogo.** Poucas linhas, e é a diferença entre
   parecer uma app e parecer uma página aberta no browser.
2. **Vibração ao marcar um golo ou ao acabar uma sanção.**
3. **Notificação local quando a sanção de 2 minutos termina**, mesmo com a app em
   segundo plano.

**A conta obrigatória.** A app exige sessão iniciada para tudo, e a Apple às
vezes questiona isso quando as funcionalidades não dependem de servidor — as
tuas, tirando a sincronização, não dependem. Se for levantado, a resposta é que
a conta existe para sincronizar entre iPad e telemóvel e para não se perder o
histórico ao trocar de aparelho. Se insistirem, a saída é deixar entrar em modo
só-dispositivo.

---

## 7. Fazer isto pelo terminal, em vez de clicar

Quase tudo o que está aqui em cima pode ser feito por linha de comandos com o
[`asc`](https://github.com/rorkai/App-Store-Connect-CLI) — um programa único, sem
dependências, que fala com a API do App Store Connect. Corre em Windows.

**Porque vale a pena:** o texto da ficha da app deixa de viver num formulário
web e passa a viver no repositório, ao lado do código. Fica versionado, revisto
em conjunto com o resto, e uma submissão nova não obriga a reescrever nada.

Usa a **mesma chave da API** que o Codemagic precisa — geras uma vez, serve para
os dois.

### Instalar e entrar

Windows (se ainda não estiver no winget, transferir o binário das
[releases](https://github.com/rorkai/App-Store-Connect-CLI/releases/latest)):

```
winget install --id Rorkai.ASC --exact
```

```
asc auth login --name "FutsalSubStats" --key-id "ABC123" --issuer-id "DEF456" --private-key AuthKey_ABC123.p8
asc auth status --validate
asc apps list --output table
```

O último comando dá-te o número da app, que é o `APP_STORE_APPLE_ID` de que o
Codemagic precisa.

### O que passa a ser um comando

```
# A ficha da app como ficheiros no repositório
asc metadata init  --dir ./metadata --version "1.0.0" --locale "pt-PT"
asc metadata apply --dir ./metadata --app "APP_ID" --version "1.0.0" --dry-run

# Capturas de ecrã, sem arrastar nada para o browser
asc screenshots upload --version-localization "ID" --path ./metadata/screenshots/pt-PT --device-type "IPHONE_65" --replace

# O que falta antes de submeter — corre isto ANTES de carregar no botão
asc review doctor --app "APP_ID"
asc validate --app "APP_ID" --version "1.0.0"

# Submeter e acompanhar
asc publish appstore --app "APP_ID" --ipa ./build/App.ipa --version "1.0.0" --submit --confirm
asc status --app "APP_ID" --watch
```

O `asc review doctor` é o mais útil dos três primeiros dias: diz o que está por
preencher antes de a Apple to dizer três dias depois.

### O que continua a ser à mão

- **As declarações de privacidade** (secção 4). Não há comando; é o formulário.
- **A conta de demonstração** e as notas da revisão, na primeira vez.
- **Tirar** as capturas de ecrã. Enviar já é comando.

### O que NÃO vale a pena

**Xcode Command Line Tools** — só existem para macOS. Não te servem de nada em
Windows, e mesmo com um Mac só passarias a poder compilar localmente, que é
precisamente o que o Codemagic já faz por ti.

**EAS CLI (Expo)** — consegue compilar projetos que não são Expo, através de
*custom builds*, por isso em teoria daria para um projeto Capacitor. Mas seria
trocar uma coisa que já está montada e funciona por outra pensada para React
Native, com o mesmo resultado. Se o Codemagic um dia deixar de servir, a
alternativa mais próxima do teu caso é o Capgo Cloud Build, feito de propósito
para Capacitor.

**Resumo da divisão de trabalho:** o Codemagic compila e envia o build; o `asc`
trata de tudo o resto sem sair do terminal.

---

## 8. Ordem de trabalhos

1. Correr a migração `0005` no Supabase.
2. Criar e encher a conta de demonstração.
3. Testar o botão de apagar conta com uma conta descartável — **antes** de
   submeter, e sabendo que apaga mesmo.
4. Tirar as capturas de ecrã.
5. Preencher a ficha, as declarações de privacidade e as notas da revisão.
6. Submeter.
