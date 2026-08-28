# iOS/TestFlight pelo GitHub Actions

Este fluxo é a alternativa ao Codemagic para criar a app iOS e enviar para o
TestFlight. Fica em `.github/workflows/ios-testflight.yml` e só corre quando
carregas manualmente em **Run workflow** no GitHub.

## Secrets necessários

No GitHub:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Cria estes secrets:

- `APPLE_TEAM_ID`  
  O Team ID da tua conta Apple Developer.

- `APP_STORE_CONNECT_KEY_ID`  
  O Key ID da chave `.p8` criada em App Store Connect.

- `APP_STORE_CONNECT_ISSUER_ID`  
  O Issuer ID da App Store Connect API.

- `APP_STORE_CONNECT_API_KEY_BASE64`  
  O conteúdo do ficheiro `.p8`, convertido para base64.

- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`  
  O certificado Apple Distribution em `.p12`, convertido para base64.

- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`  
  A password que escolheste ao exportar o `.p12`.

- `IOS_APP_STORE_PROVISIONING_PROFILE_BASE64`  
  O ficheiro `.mobileprovision` App Store para `com.FutsalSubStats.app`,
  convertido para base64.

- `IOS_APP_STORE_PROVISIONING_PROFILE_NAME`  
  O nome do provisioning profile, por exemplo `Futsal SubStats App Store`.

- `IOS_KEYCHAIN_PASSWORD`  
  Uma password qualquer só para o keychain temporário do GitHub Actions.

## Converter ficheiros para base64 no PowerShell

Troca os caminhos pelos ficheiros reais:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\AuthKey_ABC123.p8")) | Set-Clipboard
```

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.p12")) | Set-Clipboard
```

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\perfil.mobileprovision")) | Set-Clipboard
```

Depois cola o valor copiado no secret correspondente.

## Como correr

No GitHub:

`Actions` -> `iOS TestFlight` -> `Run workflow`

O workflow instala dependências, corre os checks, cria o bundle web, sincroniza
o iOS, assina a app, guarda o `.ipa` como artifact e envia para o TestFlight.

## Nota importante

O GitHub Actions não tem a integração automática do Codemagic para ir buscar
certificados à Apple. Por isso aqui tens de colocar o `.p12` e o
`.mobileprovision` como secrets uma vez. Depois disso o processo fica só no
botão **Run workflow**.
