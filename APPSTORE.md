# Publicar na App Store — o que falta preencher

Este documento é a lista do que a Apple pede e que não é código. O código que
faltava — apagar a conta e a política de privacidade — já está feito.

Antes disto, o TestFlight: ver `TESTFLIGHT.md`.

---

## 1. Antes de submeter, correr no Supabase

`supabase/migrations/0005_apagar_conta.sql`

Cria a função que apaga a conta. **Sem ela o botão na app dá erro**, e um botão
de apagar conta que não apaga é rejeição garantida — vão testá-lo.

---

## 2. Conta de demonstração

Quem revê abre a app, vê um ecrã de início de sessão e precisa de entrar. Se
encontrar um painel vazio do outro lado, não tem como avaliar nada — e "não
conseguimos avaliar a funcionalidade" é dos motivos de rejeição mais comuns.

A conta é a **`review.futsalsubstats@gmail.com`**.

1. Cria-a pela app, normalmente. A palavra-passe vai ser escrita no formulário
   da Apple, por isso que sirva só para isto.
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

## 7. Ordem de trabalhos

1. Correr a migração `0005` no Supabase.
2. Criar e encher a conta de demonstração.
3. Testar o botão de apagar conta com uma conta descartável — **antes** de
   submeter, e sabendo que apaga mesmo.
4. Tirar as capturas de ecrã.
5. Preencher a ficha, as declarações de privacidade e as notas da revisão.
6. Submeter.
