# Compras iOS: versao 1.5.1 com configuracao de conta

## Entrega atual

A versao iOS e o pacote do projeto sao agora 1.5.1. `autoUpdate` esta desligado
no `capacitor.config.json`. `resetWhenUpdate` continua ativo para o Capgo
descartar o bundle anterior quando a nova compilacao nativa e instalada.
O plugin e mantido para fazer essa limpeza e mostrar a versao em uso.

Foi confirmado em producao que o servidor oferecia o bundle 1.4.2 a uma app
iOS 1.4.1. Esse ZIP contem codigo de compras anterior a correcao. O utilizador
confirmou App 1.4.1 / bundle 1.4.2 no iPhone. Isto explica a reaplicacao da
interface antiga; a disponibilidade do plugin nativo ainda precisa de ser
validada num dispositivo com o codigo incluido nesta nova compilacao.

O estado dos bundles no servidor nao foi alterado. A nova compilacao deixa
de pedir atualizacoes automaticamente. Isto nao altera apps ja instaladas.
Nao publicar um OTA para tentar instalar a correcao Swift.

No Codemagic usar `fix/ios-billing-registration` e `ios-testflight`. Instalar
a versao 1.5.1 pelo TestFlight. No Perfil, o pacote deve aparecer como original
(`builtin`), nao como 1.4.2. Nao e necessario apagar a app nem os dados locais.

## Botao sem resposta e conta ausente na 1.5.0

O utilizador confirmou que o Perfil nao mostra email. O codigo da compra e do
restauro terminava sem mensagem quando `userId` estava ausente. Agora mostra
um aviso de sessao necessaria ou de configuracao de servidor ausente.

Sem as variaveis publicas do Supabase na compilacao, o cliente devolve `null`
e a app permite abrir em modo local. O workflow nao declarava essas variaveis;
nao foram inspecionados os valores privados do grupo de ambiente do Codemagic
nem extraidos os ficheiros da app instalada. A configuracao ausente e uma
explicacao consistente com o sintoma, nao uma inspecao do binario 1.5.0.

O workflow `ios-testflight` passa a declarar explicitamente o URL do projeto
e a sua chave publicavel. Esta chave e publica e nao concede privilegios de
administracao. O endpoint de configuracao Auth respondeu com email ativo.
Nao foram alteradas contas nem dados no servidor.

`tools/check-store-config.mjs` verifica a configuracao antes da compilacao e
confirma a sua presenca nos ficheiros JavaScript exportados antes de `cap sync`.
Assim, este workflow falha se tentar empacotar uma exportacao sem servidor.
O Codemagic tambem aplica a versao de `package.json` ao projeto iOS.

Depois de instalar a 1.5.1, iniciar sessao com a conta existente caso nao seja
recuperada. Confirmar o email no Perfil antes de testar a compra. O TestFlight
usa Sandbox automaticamente; nao e preciso criar outra conta da app.

## Diagnostico inicial

Revisao do codigo a partir de `4298fedb39af0046892f8c788023ff480e1d5340`.

## Causa confirmada no codigo

`SceneDelegate.swift` usava `registerPluginType(FutsalBillingPlugin.self)`.
No Capacitor iOS 8.5.0 instalado pelo lockfile, esse metodo termina imediatamente
quando `autoRegisterPlugins` esta ativo. O `CAPBridgeViewController` cria a ponte
com essa opcao ativa por omissao. O plugin local nao faz parte dos pacotes
descobertos pelo `cap sync`.

Consequencia: `Capacitor.Plugins.FutsalBilling` nao existe. A funcao
`nativeStoreAvailable()` devolve `true`, mas `billingPlugin()` falha. O codigo
original repetia esse erro tres vezes e apresentava-o como produtos em falta.
Foi reproduzida exatamente a mensagem do screenshot, simulando iOS nativo sem
o plugin. Nesse caminho, nenhum pedido chega ao StoreKit ou ao servidor.

Referencia oficial:
https://capacitorjs.com/docs/ios/custom-code

## Alteracoes

- Registar `FutsalBillingPlugin()` com `registerPluginInstance`.
- Usar `FutsalBridgeViewController` tambem no storyboard, cobrindo ambos os
  caminhos de arranque. O SceneDelegate ja usa essa classe.
- Pedir apenas `Treinador` e `Clube` no iOS, os IDs dos screenshots. Os aliases
  Android mantem-se. O codigo anterior ja aceitava qualquer alias devolvido;
  os aliases nao eram a causa do erro observado.
- Distinguir PWA, plugin ausente, falha no pedido e catalogo vazio.
- Registar IDs publicos dos produtos e codigos de erro, sem contas, tokens,
  recibos ou credenciais.

## PWA e atualizacoes por Wi-Fi

Foram revistos os providers, a deteccao nativa, o service worker, a confirmacao
de arranque, o empacotamento OTA, a selecao de bundles, os entry points iOS,
o plugin de compras, o ecra de conta e os workflows de compilacao.

`prepararOffline()` nao regista service workers dentro do Capacitor e remove
registos anteriores. A configuracao usa `capacitor://` no iOS, sem `server.url`
remoto. O Capgo atualiza os ficheiros web; nao substitui o Swift compilado.
Pode chegar uma interface nova a uma app com codigo nativo antigo, mas nao
ha evidencia de que o OTA tenha transformado esta app numa PWA. Desligar o
Wi-Fi ou publicar outro bundle nao corrige o registo nativo.

O bundle ID do projeto iOS e `com.futsalsubstats.app`. A variavel `BUNDLE_ID`
no Codemagic tinha capitalizacao diferente; foi alinhada ao preparar a versao
1.4.1 anterior. Essa variavel nao era usada pelos comandos desse workflow e nao explica
o plugin ausente. O build efetivamente instalado nao foi extraido do iPhone.

## Validacao e publicacao

Os testes de regressao cobrem iOS sem plugin, web/PWA, IDs Apple, aliases
Android, passagem da conta para compras, cancelamento, catalogo vazio,
falhas de rede, recuperacao e a configuracao dos entry points iOS.
O teste dos entry points verifica o codigo; nao substitui uma compilacao iOS.

Esta correcao precisa de uma nova compilacao nativa e publicacao na App Store.
A versao comercial foi preparada como 1.5.1 e o Codemagic usa o seu contador
de builds mais 27, ficando acima do build 26 ja publicado. Correr `cap sync ios`
no macOS, como fazem os workflows,
para regenerar as dependencias SPM com caminhos desse sistema.

Na revisao 1.5.1 passaram `npm run check` (272 testes), a compilacao web das
34 paginas e a verificacao da configuracao no JavaScript exportado. Os testes
novos recusam configuracao ausente, projeto errado, chave privilegiada e
exportacao sem configuracao publica.

No TestFlight, confirmar que aparecem precos devolvidos pela Apple, testar
uma compra Sandbox e um restauro. Confirmar que o pacote permanece original
depois de fechar e reabrir a app com rede. So depois submeter a nova versao.

Nao foram efetuadas compras reais nem foi publicado um binario iOS nesta
revisao. A compilacao e o teste StoreKit num dispositivo requerem macOS/iOS.
O cliente continua a chamar `verify-store-purchase`; trocar de endpoint nao
resolve o problema de registo aqui corrigido.
