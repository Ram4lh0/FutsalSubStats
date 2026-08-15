# Android — do zero à Play Store

O equivalente do `TESTFLIGHT.md`, para o outro lado. O código é o mesmo: o
Capacitor empacota a mesma pasta `out/` que já vai para o iOS, por isso não há
uma "versão Android" a manter à parte — há um segundo invólucro à volta da
mesma app.

Duas coisas neste documento vão travar-te se as descobrires tarde. Estão na
secção 1, e não são técnicas.

---

## 1. Antes de escrever um comando: duas surpresas

### 1.1 A regra dos 12 testadores × 14 dias

Contas de programador **pessoais** criadas depois de 13 de novembro de 2023 não
podem publicar em produção sem antes correr um teste fechado com **12
testadores, inscritos sem interrupção durante 14 dias**. Os 14 dias têm de ser
seguidos e têm de ser os 14 mais recentes no momento em que pedes acesso à
produção. Um testador que saia e volte reinicia a contagem.

Contas de **organização** estão isentas — mas exigem entidade legal, número
D-U-N-S e documentos da empresa, tal como do lado da Apple.

**O que isto significa para ti, na prática:** a app não está a duas semanas da
Play Store, está a duas semanas *depois* de teres 12 pessoas a usá-la. Como
andas a angariar testadores em grupos de treinadores, isto encaixa no que já
estavas a fazer — mas é preciso começar cedo, e é preciso que eles não se
desinscrevam.

Começa a contar assim que tiveres o primeiro AAB na faixa interna. Não esperes
pela app "acabada": os 14 dias correm em paralelo com o resto do trabalho.

### 1.2 O keystore é para sempre

O ficheiro que assina a app **não se pode perder nem trocar**. Se o perderes,
não voltas a publicar atualizações desta app — tens de publicar outra, com
outro identificador, e os utilizadores que a tiverem instalada nunca mais
recebem nada.

Guarda-o em dois sítios fora do teu computador, e guarda as palavras-passe com
ele. O `.gitignore` já recusa `*.keystore` e `*.jks` de propósito.

(Há a opção de deixar a Google gerir a chave — *Play App Signing* —, que é o
que se recomenda hoje. Mesmo assim guarda o teu: é o que te deixa enviar o
primeiro AAB.)

### 1.3 O que custa

| | Google Play | Apple |
|---|---|---|
| Inscrição | **25 USD, uma vez** | 99 USD, por ano |
| Revisão da primeira versão | dias | dias |
| Teste antes de produção | 12 testadores × 14 dias (conta pessoal) | não exigido |

---

## 2. O projeto Android — já está criado

```bash
npm install
npx cap add android
```

Isto já foi corrido. A pasta `android/` existe e **vai para o repositório** — é
lá que vivem o ícone, o nome e as permissões. O que o Capacitor copia para lá a
cada build (`app/src/main/assets/public`) fica de fora, por um `.gitignore` que
ele próprio escreveu.

A seguir, sempre que mudares alguma coisa na app:

```bash
npm run app:android      # next build + cap sync android
```

### O Android Studio vale a pena

Dá para trabalhar sem ele — `npm run dev` no Chrome do telemóvel cobre a
interface, e o fluxo `android-preview` do Codemagic compila um APK a cada push.
Mas há três coisas que só ele dá, e todas se notam durante os 14 dias de teste:

- **O logcat.** É a única forma de saber porque é que a app rebenta no telemóvel
  de outra pessoa. Um testador a dizer "abre e fecha logo" sem logcat é uma
  semana a adivinhar.
- **Ciclo de meio minuto.** Compilar e instalar direto no telefone, contra fazer
  push e esperar pelo Codemagic.
- **O emulador com tablets.** O ecrã do jogo foi desenhado para paisagem em
  tablet, e essa é a única forma de o ver antes de um treinador o ver primeiro.

Conta **8 a 15 GB** com o SDK e uma imagem de sistema. Se tiveres um Android
teu, salta o emulador na instalação e liga o telefone por cabo com a depuração
USB: fica mais leve e mais fiel.

Depois de instalado, `npm run cap:open:android` abre o projeto.

### O emulador, quando não há telefone Android

O projeto aceita a partir do **Android 7.0** (`minSdkVersion = 24`) e é compilado
contra o **16** (`targetSdkVersion = 36`).

Cria dois aparelhos virtuais, não um:

- **Um telemóvel** — Pixel 8, API 35 ou 36. É o que vais usar todos os dias.
- **Um tablet, em paisagem** — Pixel Tablet, API 35. O ecrã do jogo tem um
  desenho próprio para tablet e é o único sítio onde o podes ver.

Escolhe imagens **x86_64**; as ARM correm por emulação e ficam lentas ao ponto de
não servirem. No Windows isso obriga a ter a aceleração por hardware ligada
(Hyper-V ou WHPX nas funcionalidades do Windows) — é a primeira coisa a
verificar se o emulador não arrancar.

Entre "Google APIs" e "Google Play": a segunda é maior mas traz a Play Store lá
dentro, o que te deixa instalar a app pela faixa interna como um testador a
faria. Vale a pena numa das duas.

**O que o emulador não testa**, e convém não te iludires:

- **O ecrã que não adormece.** O emulador não gere a energia como um telemóvel a
  sério, por isso o *wake lock* só se confirma num aparelho de carne e osso.
- **Uma bateria ao longo de 40 minutos**, com o ecrã aceso e a app à frente.
- **O polegar.** Acertar num cartão de jogador com o dedo, de pé, à beira do
  campo, é outra coisa que clicar com o rato.

Estes três ficam para os 12 testadores. Não é um problema — eles têm de existir
de qualquer maneira, e são eles a tua cobertura de aparelhos reais.

**O que o emulador testa muito bem**, e devias usar já:

- **O modo de avião.** Liga-o, aponta um jogo inteiro, desliga-o, e vê a
  sincronização acontecer. É a promessa central da app e o emulador reproduz-a
  fielmente.
- **Rodar o ecrã** a meio de um jogo, para confirmar que nada se perde.
- **Ecrãs pequenos**: um Pixel 4a mostra se as tabelas do plantel ainda cabem.

### Depurar a interface no telemóvel

Com a app instalada em modo de depuração, abre `chrome://inspect` no Chrome do
computador: a WebView aparece lá e tens as DevTools completas — consola, rede,
elementos — sobre a app a correr no telefone.

É por isto que o `capacitor.config.json` **não** tem uma secção `android` com
`webContentsDebuggingEnabled`. O valor por omissão do Capacitor já faz o certo
(ligado em depuração, desligado em lançamento); escrevê-lo à mão como `false`
desligava-o nos dois e levava o `chrome://inspect` à frente.

---

## 3. O que já está tratado

Estas quatro coisas vinham mal do `cap add android` e já foram corrigidas. Ficam
aqui para se saber onde estão, não para se voltar a fazer.

### 3.1 O nome da app ✅

`android/app/src/main/res/values/strings.xml` diz **FutsalSubStats**. O
Capacitor tinha lá `FutsalSubStats`, que é o nome do projeto e não o nome que as
pessoas veem no telemóvel.

### 3.2 O ícone e o ecrã de arranque ✅

O Android usa **ícones adaptáveis**: uma camada de fundo e uma de frente, que o
sistema recorta em círculo, quadrado ou no formato que o fabricante quiser. O
primeiro plano tem 108 dp de lado mas só o quadrado central de 72 dp é que se vê
garantidamente — o resto pode ser cortado.

Estão gerados por `tools/android-icones.mjs`, a partir do mesmo desenho do
ícone do iOS, com o campo dentro desses 66%:

```bash
npm run android:icones
```

São 27 ficheiros: o ícone em cinco densidades, a versão redonda, o primeiro
plano do adaptável, e onze ecrãs de arranque de proporções diferentes. Corre o
comando outra vez se o ícone mudar — sai tudo alinhado, que é o que não acontece
quando se faz à mão.

O ecrã de arranque vinha branco. Numa app de tema escuro isso é um clarão a cada
abertura; agora é o mesmo `#0b1220` do resto.

### 3.3 As permissões ✅

O manifesto pede **só `INTERNET`**, que é o mínimo para a sincronização. Nada de
câmara, localização, contactos, armazenamento nem microfone. Se um dia
acrescentares um plugin, confirma o que ele mete no manifesto: permissões que a
app não usa são um mau sinal na Play Console e uma pergunta a mais na ficha de
segurança dos dados.

### 3.4 A cópia automática do Android ✅

`android:allowBackup="false"`, e é deliberado. Com a cópia automática ligada, a
base local e a sessão iniciada iam para a Google Drive do utilizador — o que
contradiz a política de privacidade e não serve para nada, porque os jogos já
sincronizam com a conta.

Há ainda um efeito lateral desagradável que isto evita: uma cópia restaurada
traria a base de outra conta para dentro do aparelho, e é exactamente isso que a
regra do dono da base local existe para impedir.

### 3.5 A rotação do ecrã ✅

O Capacitor não fixou a orientação, e o `configChanges` da actividade já inclui
`orientation` — a app roda sem se reiniciar. O ecrã do jogo foi desenhado para
funcionar em retrato e em paisagem, e num tablet a paisagem é o que se usa.

---

## 4. O ecrã que não adormece

Já está feito, e vale a pena saber porquê aparece aqui.

Durante o jogo a app pede um *wake lock* ao browser (`src/lib/ecraAceso.js`),
para o ecrã não se apagar entre substituições. É a API standard, sem plugin.

- No **Android** funciona: o WebView suporta-a.
- No **iOS** o WKWebView ainda não a implementa. A chamada falha em silêncio e
  a app fica como estava.

Por isso este é um caso raro em que o Android fica melhor do que o iOS sem se
fazer nada de especial. Confirma-o no teste: abre um jogo, pousa o telemóvel, e
vê se o ecrã fica aceso.

---

## 5. Assinar e enviar

### 5.1 Criar o keystore

Uma vez, e guarda tudo:

```bash
keytool -genkey -v \
  -keystore futsalsubstats.keystore \
  -alias futsalsubstats \
  -keyalg RSA -keysize 2048 -validity 10000
```

Guarda o ficheiro, a palavra-passe do keystore e a da chave. Não os metas no
repositório — ver a secção 1.2.

### 5.2 Configurar o Codemagic

O `codemagic.yaml` já tem os dois fluxos:

- **`android-preview`** corre a cada push e compila um APK de depuração. Não
  precisa de segredos: serve só para saber se o projeto Android parte.
- **`android-google-play`** corre à mão, compila um AAB assinado e envia para a
  faixa interna.

Para o segundo, no painel do Codemagic:

1. **Teams → Code signing identities → Android keystores**: carrega o
   `.keystore`, com a referência **`futsalsubstats`** (é o nome usado no
   ficheiro) e as duas palavras-passe.
2. **Uma conta de serviço da Google Cloud** com acesso à Play Console:
   - Na Play Console: *Setup → API access*, liga um projeto da Google Cloud e
     cria uma conta de serviço.
   - Dá-lhe permissão de *Release manager* na Play Console.
   - Descarrega a chave JSON.
   - No Codemagic, grupo de variáveis **`google-play`**, variável
     `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`, marcada como **secure**.

### 5.3 A primeira vez tem de ser à mão

A conta de serviço só consegue enviar para uma app que **já existe** na Play
Console. Por isso a primeira subida é manual:

1. Play Console → *Create app*, com o identificador
   `com.futsalsubstats.app`.
2. Compila o AAB localmente:
   ```bash
   npm run app:android
   cd android && ./gradlew bundleRelease
   ```
3. Carrega `android/app/build/outputs/bundle/release/app-release.aab` na faixa
   **Internal testing**.

A partir daí o Codemagic trata do resto.

---

## 6. A ficha da Play Store

Muito do que está em `metadata/LISTAGEM.md` serve, mas os limites são outros:

| Campo | Apple | Google |
|---|---|---|
| Nome | 30 caracteres | 30 caracteres |
| Subtítulo / descrição curta | 30 | **80** |
| Descrição | 4000 | 4000 |
| Palavras-chave | campo próprio | **não existe** — indexa a descrição |

Duas diferenças que dão trabalho:

- **Não há campo de palavras-chave.** A Google indexa o nome e a descrição, por
  isso as palavras que interessam — futsal, treinador, substituições, plantel,
  estatísticas — têm de aparecer no texto, escritas com naturalidade.
- **Precisas de um gráfico de destaque** (*feature graphic*), 1024 × 500, que a
  Apple não pede. É a imagem que aparece no topo da ficha.

Capturas de ecrã: mínimo duas, entre 320 e 3840 px de lado. As que estão em
`prints/` servem — com o mesmo aviso de sempre: **não uses as que mostram
estatísticas a zeros**.

### O gráfico de destaque ✅

1024 × 500, o único material gráfico que a Apple não pede. Está em
`metadata/play/`, nos três idiomas, gerado por:

```bash
python3 tools/play-grafico.py
```

Não leva capturas de ecrã lá dentro de propósito: a Google recusa gráficos de
destaque que sejam colagens de ecrãs, e já há uma fila de capturas por baixo.

### A ficha de segurança dos dados ✅

As respostas todas, campo a campo, estão em
**`metadata/FICHA-SEGURANCA-DADOS.md`**. Copiar de lá em vez de decidir dentro
do formulário: é uma declaração pública que tem de bater certo com a política de
privacidade, e tem de ser preenchida outra vez a cada versão.

Em resumo: recolhe email e conteúdo gerado pelo utilizador, não partilha com
ninguém, cifra em trânsito, e deixa apagar tudo. Sem publicidade, sem rastreio,
sem identificadores.

### ⚠️ A página web de eliminação de conta ✅

Esta é a que apanha toda a gente desprevenida. Para apps que deixam **criar
conta**, a Google exige, além do botão dentro da app, **um endereço na web onde
se possa pedir a eliminação** — acessível sem sessão iniciada, em HTTPS, a ligar
diretamente ao pedido, e a dizer o que se apaga, o que fica e em quanto tempo.

Está feita: `/delete-account`, em `src/app/delete-account/page.jsx`, nos três
idiomas. O endereço vai no formulário da Play Console ao lado do da política de
privacidade.

A Apple não pede isto — mas também não faz mal nenhum ter a página, e a ligação
está na página de privacidade, que é o endereço que já vai nos dois lados.

---

## 7. O que NÃO muda, e vale a pena não esquecer

- **A regra 3.1.3(f) é da Apple, não da Google.** A Play Store permite links
  para pagamento fora da app com muito menos atrito. Mas como a app é a mesma —
  o mesmo `out/` empacotado duas vezes —, pôr um link de compra para o Android
  poria-o também no iOS. Mantém a app sem menções a preços, e a decisão fica
  simples.
- **A conta e os dados são os mesmos.** Um treinador que use o iPhone no jogo e
  um tablet Android no balneário vê os mesmos jogos: é a mesma conta Supabase.
- **A regra do dono da base local também vale aqui.** Trocar de conta no mesmo
  aparelho limpa o que estava lá — e o caminho para levar os dados é o backup
  nas Definições.

---

## 8. Lista de verificação antes de submeter

- [ ] `npm run check` passa
- [ ] A app abre num telemóvel Android a sério, não só no emulador
- [ ] O nome no ecrã principal diz "FutsalSubStats"
- [ ] O ícone fica bem em círculo e em quadrado
- [ ] O manifesto não pede permissões que a app não usa
- [ ] A app roda para paisagem
- [ ] O ecrã não adormece durante um jogo
- [ ] O botão "atrás" do sistema navega para trás e não fecha a app a meio de
      um jogo
- [ ] O teclado não tapa os campos de texto nos formulários
- [ ] Um jogo inteiro em modo de avião, e a sincronização a acontecer depois
- [ ] A conta de revisão entra: `review.futsalsubstats@gmail.com`
- [ ] 12 testadores inscritos, e os 14 dias a contar
