# Instalar no iPad pelo TestFlight

O objetivo: ter a app no ecrã principal do iPad como uma app a sério — ícone,
sem barra de endereço, a aparecer no seletor de aplicações — sem passar pela
revisão da App Store.

**Porque é que isto evita a revisão:** o TestFlight distingue testadores
*internos* de *externos*. Os internos são pessoas com uma conta em App Store
Connect, até 100, e os builds que lhes chegam **não são revistos pela Apple**. É
o caminho certo para uma ferramenta usada por ti e pela equipa técnica.

Custa 99 USD por ano (Apple Developer Program). Não é preciso ter um Mac — o
Codemagic compila.

---

## Antes de começar

Precisas de:

- Um Apple ID com autenticação em dois passos ativa.
- Cartão para os 99 USD/ano.
- A conta do GitHub onde está o repositório.

---

## 1. Entrar no Apple Developer Program

[developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll)

Escolhe **Individual**. Pede o teu nome legal e um documento de identificação.
A aprovação costuma demorar entre um e dois dias — trata disto primeiro, porque
tudo o resto fica à espera.

---

## 2. Criar a app em App Store Connect

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+**

- **Platform**: iOS
- **Name**: o nome tem de ser único em toda a App Store, mesmo que nunca
  publiques. Se "Futsal Subs & Stats" estiver tomado, inventa uma variação.
- **Primary Language**: Portuguese (Portugal)
- **Bundle ID**: `com.futsalsubstats.app`. Se não aparecer na lista, cria-o
  primeiro em [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list)
  → Identifiers → **+** → App IDs → App.
- **SKU**: qualquer texto teu, por exemplo `futsalsubstats`. Ninguém o vê.

Depois de criada, repara no endereço da página:

```
https://appstoreconnect.apple.com/apps/6499999999/...
                                      ^^^^^^^^^^
```

Esse número é o **Apple ID da app**. Guarda-o — é preciso no passo 4.

---

## 3. Criar a chave de acesso

Ainda em App Store Connect → **Users and Access** → separador **Integrations** →
**App Store Connect API** → **+**

- **Name**: `Codemagic`
- **Access**: **App Manager**

Ao gerar, o ficheiro `.p8` só pode ser transferido **uma vez**. Guarda-o bem —
perdê-lo obriga a criar outra chave. Anota também, do mesmo ecrã:

- **Issuer ID** (em cima, um código longo)
- **Key ID** (na linha da chave)

---

## 4. Configurar o Codemagic

[codemagic.io](https://codemagic.io) → entrar com o GitHub → **Add application**
→ escolher `Ram4lh0/FutsalSubStats` → **Use codemagic.yaml**.

Depois, duas configurações:

**A chave da Apple.** Teams → o teu team → **Integrations** → **Developer Portal**
→ **Connect**. Cola o Issuer ID, o Key ID e o ficheiro `.p8`. Dá-lhe o nome
exatamente **`AppStoreConnect`** — é este nome que o `codemagic.yaml` procura.

**O número da app.** No projeto → **Environment variables**:

- Group: `appstore`
- Nome: `APP_STORE_APPLE_ID`
- Valor: o número do passo 2

---

## 5. Compilar e enviar

No painel do Codemagic, escolhe o fluxo **FutsalSubStats iOS TestFlight** e
carrega em **Start new build**.

O que ele faz, por ordem: instala as dependências, corre os verificadores e os
50 testes, sincroniza o projeto iOS, vai buscar os certificados à Apple
(criando-os na primeira vez), pergunta ao TestFlight qual foi o último número de
build e soma um, compila assinado e envia.

Demora entre dez e vinte minutos. Recebes um email no fim, corra bem ou mal.

Depois de enviado, a Apple ainda leva mais alguns minutos a processar o build
antes de ele aparecer no TestFlight. É normal ver "Processing" durante um bocado.

---

## 6. Instalar

App Store Connect → a app → separador **TestFlight** → **Internal Testing** →
criar um grupo → **+** para acrescentar testadores.

Só se pode acrescentar quem já tiver conta em App Store Connect (Users and Access
→ **+**, com o papel de **Developer** ou superior). Cada um recebe um convite por
email.

No iPad: instalar o **TestFlight** da App Store, entrar com o mesmo Apple ID,
aceitar o convite, instalar. Fica no ecrã principal como qualquer outra app.

---

## O que saber depois

**Cada correção obriga a um build novo.** O código vai dentro da app
(`webDir: out` no `capacitor.config.json`), por isso mudar o site na Vercel já
não muda a app. O ciclo passa a ser: `git push` → correr o fluxo no Codemagic →
uns 20 minutos → o TestFlight instala sozinho no iPad. Sem revisão da Apple pelo
meio, porque os testadores são internos.

Enquanto isso, o site na Vercel continua a existir e a funcionar. Para
experimentar uma correção depressa, abre-o no browser — é o mesmo código.

**Os builds expiram ao fim de 90 dias.** Passado esse tempo a app deixa de abrir
e é preciso um build novo. Vale a pena marcar no calendário, ou correr o fluxo de
vez em quando.

**Abre sem internet.** Como o código está lá dentro, a app arranca em qualquer
lado. Só a sincronização com o servidor é que precisa de rede — e essa já sabia
esperar.

**A confirmação de email abre no Safari.** O link que o Supabase envia aponta
para o endereço da Vercel, confirma a conta lá, e depois volta-se à app para
iniciar sessão com o mesmo email e palavra-passe. Funciona, mas é um salto a
mais; se incomodar, resolve-se com um esquema de ligação próprio.

**Não acrescentes testadores externos.** Grupos externos passam por Beta App
Review, e é aí que a Apple pode invocar a regra 4.2 — "isto não é
suficientemente diferente de abrir o site no browser". Enquanto forem só
internos, ninguém revê nada.

---

## Se um dia quiseres mesmo publicar

O caminho é diferente e bastante mais longo. Por ordem:

1. **Empacotar o código dentro da app**, em vez de o ir buscar. Implica
   `output: 'export'` no Next.js, e como as rotas têm ids no caminho
   (`/matches/[matchId]/live`), passa por mudá-las para parâmetros
   (`/live?match=…`). É a fatia grande.
2. **Capacidades nativas** que justifiquem ser uma app: ecrã sempre aceso no
   jogo, vibração, notificações locais no fim da sanção.
3. **Apagar a conta dentro da app.** Obrigatório para qualquer app com registo.
4. **Política de privacidade** num endereço público, e as declarações de recolha
   de dados (email e conteúdo do utilizador).
5. Capturas de ecrã para iPhone e iPad, categoria, classificação etária, texto
   de descrição.
