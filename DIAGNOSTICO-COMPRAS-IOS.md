# Compras iOS: causa e correcao

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
1.4.1. Essa variavel nao era usada pelos comandos desse workflow e nao explica
o plugin ausente. O build efetivamente instalado nao foi extraido do iPhone.

## Validacao e publicacao

Os testes de regressao cobrem iOS sem plugin, web/PWA, IDs Apple, aliases
Android, passagem da conta para compras, cancelamento, catalogo vazio,
falhas de rede, recuperacao e a configuracao dos entry points iOS.
O teste dos entry points verifica o codigo; nao substitui uma compilacao iOS.

Esta correcao precisa de uma nova compilacao nativa e publicacao na App Store.
A versao comercial foi preparada como 1.4.1 e o Codemagic usa o seu contador
de builds mais 27, ficando acima do build 26 ja publicado. Correr `cap sync ios`
no macOS, como fazem os workflows,
para regenerar as dependencias SPM com caminhos desse sistema.

No TestFlight, confirmar que aparecem precos devolvidos pela Apple, testar
uma compra Sandbox e um restauro. Repetir o carregamento de produtos depois
de aplicar um bundle OTA compativel. So depois submeter a nova versao.

Nao foram efetuadas compras reais nem foi publicado um binario iOS nesta
revisao. A compilacao e o teste StoreKit num dispositivo requerem macOS/iOS.
O cliente continua a chamar `verify-store-purchase`; trocar de endpoint nao
resolve o problema de registo aqui corrigido.
