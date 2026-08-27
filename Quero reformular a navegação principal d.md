Quero reformular a navegação principal da **FutsalSubStats**, tanto na app mobile/tablet como na WebApp desktop.

## Objetivo

Substituir a navegação atual por uma estrutura mais limpa e nativa, organizada em 4 áreas principais:

1. **Jogo**
2. **Equipas**
3. **Análise**
4. **Perfil**

A alteração deve ser principalmente de **UI/UX e navegação**. Não quero perder, duplicar ou alterar funcionalidades existentes desnecessariamente.

Antes de implementar, analisa a estrutura atual do projeto e identifica onde estão atualmente as páginas, componentes e funcionalidades que devem ser reorganizados.

---

# 1. Contexto de clube e escalão

A aplicação pode ter um clube com **vários escalões**.

Por isso, o escalão atualmente selecionado deve passar a funcionar como um **contexto global da aplicação**.

Nas áreas **Jogo**, **Equipas** e **Análise**, deve existir no topo um seletor contextual semelhante a:

**CAP · Seniores B ▾**

ou, dependendo do espaço disponível:

**CAP**  
**Seniores B ▾**

Ao tocar/clicar no escalão, deve abrir um seletor com todos os escalões aos quais o utilizador tem acesso.

Exemplo:

- Seniores B ✓
- Juniores
- Juvenis

Ao selecionar outro escalão, todo o conteúdo relevante da aplicação deve passar automaticamente para esse escalão.

Por exemplo, se estiver em:

**Jogo → Seniores B**

e mudar para:

**Juniores**

a página Jogo deve imediatamente passar a mostrar os jogos, competições e informação dos Juniores.

O mesmo comportamento deve existir em **Equipas** e **Análise**.

Guardar também o **último escalão selecionado**, para que ao voltar a abrir a aplicação o utilizador continue nesse escalão, desde que ainda tenha acesso a ele.

Se existir apenas um escalão disponível, não é necessário obrigar o utilizador a fazer qualquer seleção.

---

# 2. Mobile

Em mobile, criar uma **bottom navigation fixa**.

Deve ter:

**Jogo | Equipas | Análise | Perfil**

Cada opção deve ter um ícone simples e consistente com o design atual.

A barra deve respeitar corretamente as safe areas de iOS e Android e não deve tapar conteúdo.

O conteúdo das páginas deve ter padding inferior suficiente para não ficar escondido atrás da barra.

Não quero o texto **FutsalSubStats** permanentemente a ocupar espaço no topo dos ecrãs.

O topo deve ser usado principalmente para informação contextual da página e para o seletor de clube/escalão.

---

# 3. Tablet

Em tablet, manter uma experiência responsiva e aproveitar melhor o espaço disponível.

Não assumir que um dispositivo é tablet apenas por ser iPad.

A decisão de layout deve ser baseada no tamanho/viewport disponível e funcionar corretamente tanto em tablets Android como iPad.

Dependendo da largura disponível, pode ser usada a bottom navigation ou a navegação desktop, escolhendo a solução que produza melhor UX.

---

# 4. Desktop / WebApp

No desktop, **não usar a barra inferior**.

Transformar as mesmas 4 áreas numa **sidebar fixa à esquerda**:

- Jogo
- Equipas
- Análise
- Perfil

No topo da sidebar pode existir discretamente a identidade/logo da FutsalSubStats.

A área principal deve ter no topo o contexto atual:

**CAP · Seniores B ▾**

A estrutura conceptual deve ser exatamente a mesma entre mobile e desktop.

Mobile:

`Bottom Navigation → Jogo | Equipas | Análise | Perfil`

Desktop:

`Sidebar → Jogo | Equipas | Análise | Perfil`

Ou seja, não criar duas arquiteturas de navegação diferentes. Apenas adaptar visualmente a mesma arquitetura ao tamanho do ecrã.

---

# 5. Área Jogo

A área **Jogo** deve concentrar tudo o que está relacionado com jogos do escalão atualmente selecionado.

Por exemplo:

- Próximo jogo
- Jogos recentes
- Preparar/criar novo jogo
- Jogos já criados
- Acesso ao jogo ao vivo
- Histórico relacionado com jogos

Ao criar um novo jogo, usar automaticamente o **escalão atualmente selecionado**.

Não obrigar o utilizador a escolher novamente o escalão se este já estiver definido pelo contexto global.

No processo de criação, mostrar de forma discreta qual é o escalão associado ao jogo para evitar erros.

---

# 6. Área Equipas

A área **Equipas** deve mostrar informação relacionada com o escalão selecionado, incluindo as funcionalidades já existentes relacionadas com:

- Plantel
- Jogadores
- Competições
- Gestão do escalão

Não remover funcionalidades existentes.

Reorganizar as páginas/componentes atuais dentro desta nova estrutura.

---

# 7. Área Análise

A área **Análise** deve concentrar as estatísticas e dashboards existentes.

Deve respeitar o escalão selecionado globalmente.

Aqui devem ficar funcionalidades como:

- Estatísticas do escalão
- Estatísticas dos jogadores
- Resumos
- Gráficos
- Histórico estatístico
- Outros dashboards já existentes

Para contas com acesso a vários escalões/licença de clube, preservar a possibilidade de no futuro existir também uma visão agregada de **Todo o clube**.

Não é necessário inventar estatísticas novas nesta alteração.

---

# 8. Área Perfil

A área **Perfil** substitui conceptualmente uma área genérica de "Definições".

Deve concentrar as funcionalidades existentes relacionadas com:

- Conta
- Dados do utilizador
- Idioma
- Licença/plano
- Sincronização, se aplicável
- Privacidade
- Logout
- Outras configurações pessoais já existentes

---

# 9. Navegação durante um jogo ao vivo

Tem especial cuidado com o ecrã de **jogo ao vivo**.

É uma área crítica da aplicação e não quero que esta reformulação prejudique a utilização durante um jogo.

Analisa primeiro o comportamento atual e garante que:

- cronómetros continuam corretos;
- substituições continuam corretas;
- eventos continuam corretos;
- funcionamento offline/sincronização não é afetado;
- estado do jogo não é perdido ao navegar;
- voltar ao jogo em curso é rápido e óbvio.

Se fizer sentido para a UX, durante um jogo ativo pode existir um indicador persistente de **"Jogo em curso"** que permita regressar rapidamente ao jogo.

Não alteres a lógica interna do jogo sem necessidade.

---

# 10. Responsividade

A navegação deve adaptar-se automaticamente ao viewport.

Como princípio:

**Ecrãs pequenos → bottom navigation**

**Ecrãs grandes → sidebar**

Não usar verificações específicas como "é iPad" para determinar o layout.

Usar breakpoints responsivos adequados à estrutura existente do projeto.

Garantir que funciona corretamente em:

- iPhone
- Android phone
- iPad
- Android tablet
- Desktop
- WebApp em browser redimensionado

---

# 11. Design

Manter a identidade visual atual da FutsalSubStats.

Não quero um redesign completo.

Quero:

- interface limpa;
- menos espaço desperdiçado;
- hierarquia visual clara;
- navegação rápida;
- aparência de aplicação nativa em mobile;
- boa utilização do espaço em desktop;
- consistência entre plataformas.

Não adicionar gradientes, efeitos, cards ou elementos decorativos desnecessários apenas para "modernizar" a interface.

Reutilizar os componentes e estilos existentes sempre que fizer sentido.

---

# 12. Compatibilidade com a estrutura atual

Muito importante:

**Não recriar funcionalidades que já existem.**

Antes de alterar código:

1. Analisa as rotas atuais.
2. Analisa os componentes existentes.
3. Identifica onde estão atualmente Jogo, Clube/Equipas, Estatísticas e Conta.
4. Identifica como o escalão ativo é atualmente determinado.
5. Identifica como jogos, competições e jogadores estão associados aos escalões.
6. Identifica qualquer estado global/context/store já existente que possa ser reutilizado.

Depois implementa a nova navegação em cima da arquitetura existente.

Evita alterações à base de dados se não forem necessárias.

Não criar migrations apenas para suportar uma preferência de UI se esta puder ser guardada localmente de forma segura.

---

# 13. Comportamentos importantes

Garantir também:

- Refresh da página não perde desnecessariamente o escalão selecionado.
- Se o utilizador perder acesso ao escalão anteriormente guardado, selecionar automaticamente um escalão válido.
- Links/rotas existentes importantes não devem ficar quebrados.
- O botão Back do browser deve continuar a funcionar corretamente.
- Deep links existentes devem continuar funcionais sempre que possível.
- Não duplicar bottom navigation em páginas que já tenham layouts próprios.
- Evitar mudanças de layout bruscas durante o carregamento.
- Manter acessibilidade e áreas de toque adequadas em mobile.

---

# Resultado esperado

No final quero que a FutsalSubStats tenha esta arquitetura:

### Mobile

**Topo**
`CAP · Seniores B ▾`

**Conteúdo**
Página atualmente selecionada

**Bottom Navigation**
`Jogo | Equipas | Análise | Perfil`

### Desktop

**Sidebar esquerda**
- FutsalSubStats
- Jogo
- Equipas
- Análise
- Perfil

**Área principal**
`CAP · Seniores B ▾`

+ conteúdo da página.

O **escalão selecionado é global** e determina o conteúdo de Jogo, Equipas e Análise.

Implementa isto diretamente no projeto existente, preservando toda a funcionalidade atual e evitando refactors que não sejam necessários para esta alteração.

Antes de começar a modificar ficheiros, faz uma análise curta da arquitetura atual e define quais os componentes/rotas que vais alterar. Depois implementa, testa os principais fluxos e corrige eventuais regressões.