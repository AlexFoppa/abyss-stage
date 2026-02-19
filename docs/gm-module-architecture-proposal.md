# Proposta: Módulo GM — Histórias e Cenas (Roteiro + Editor)

**Objetivo:** Arquitetura e plano de implementação do módulo GM para criação/edição de Histórias e Cenas, com isolamento total do fluxo do Jogador.

**Restrições:** Não alterar o fluxo do Jogador; se for necessário tocar em arquivo do Player, parar e justificar + alternativa.

**Ajustes incorporados (requisito detalhado):** Scene normal = title, type, scenarioId?, descriptionRich, notesRich, characterIds[]; Scene narrativa = title, type=narrative, descriptionRich, images[] ordenadas (sem cenário/personagens). IDs = UUID em tudo. Modais encadeados = pilha (A aberto atrás de B). DnD = @dnd-kit. Autosave: ligado = debounce + salvar ao sair/trocar cena; desligado = trocar/sair sem salvar. Detalhes da história: título, premissa, o que está acontecendo, temas e atmosfera, notas. Grid 5×5 conceitual; cenários estilo polaroid; personagens com indicação visual na cena; spellcheck transversal conforme especificação.

---

## A) Diagrama textual de pastas / rotas / módulos

```
apps/
├── web/src/
│   ├── auth/                    # [existente] inalterado
│   ├── api.ts                   # [existente] inalterado
│   ├── main.tsx, App.tsx        # [existente] inalterado
│   ├── routes.tsx               # [TOCAR] apenas adicionar views GM_STORIES, GM_STORY_EDITOR e ramos de render
│   ├── index.css                # [TOCAR] adicionar import do(s) CSS do módulo GM
│   │
│   ├── screens/                 # [existente] telas do Player — NÃO MODIFICAR lógica
│   │   ├── LobbyScreen, LoginScreen, ...
│   │   ├── SelectCharacterScreen, GMCharactersScreen, ...
│   │   └── CharacterScreen, ...
│   │
│   ├── gm/                      # [NOVO] módulo GM isolado
│   │   ├── index.ts             # re-export público do módulo (telas, tipos)
│   │   ├── types.ts             # DTOs: Story, Scene, Scenario, CharacterRef, vínculos
│   │   ├── api.ts               # funções api.* para /api/gm/stories, /scenarios, etc.
│   │   ├── context/             # (opcional) estado GM local ao módulo
│   │   │   └── SpellCheckContext.tsx  # [transversal] hook/context spellcheck
│   │   ├── screens/
│   │   │   ├── HomeGMScreen.tsx # [SUBSTITUIR/EVOLUIR] atual HomeGMScreen: 4 botões (Roteiro, Figurinos, Espetáculo, Se retirar)
│   │   │   ├── StoryListScreen.tsx    # lista de histórias (similar SelectCharacter)
│   │   │   ├── StoryEditorScreen.tsx   # grid 5×5 + lógica de cena ativa
│   │   │   └── ... modais (ScenarioManager, CharacterManager, SceneDetails, etc.)
│   │   ├── components/          # componentes específicos do editor (reutilizam ui-* e shared)
│   │   │   ├── EditorGrid.tsx
│   │   │   ├── ScenarioThumbs.tsx
│   │   │   ├── SceneList.tsx
│   │   │   ├── SceneDetailPopup.tsx
│   │   │   └── ...
│   │   └── styles/
│   │       ├── gm-home.css
│   │       ├── story-list.css
│   │       └── story-editor.css
│   │
│   ├── shared/                  # [NOVO] apenas se extração for segura (ver C)
│   │   ├── SelectListDetail.tsx # abstração lista + detalhe + ações (usada por SelectCharacter e StoryList)
│   │   └── ...
│   │
│   └── ui/                      # [existente] ConfirmDialog, Screen, StageLayout — reutilizar sem alterar
│
├── api/backend/
│   ├── main.py                  # [TOCAR] include_router(gm_stories_router)
│   ├── routers/
│   │   ├── characters.py        # [existente] gm_router = Figurinos; NÃO TOCAR para Histórias
│   │   └── gm_stories.py        # [NOVO] prefix /gm/stories (histórias, cenas, cenários, vínculos)
│   └── ...
```

**Rotas (estado em `routes.tsx`):**

- `View`: adicionar `"GM_STORIES"` e `"GM_STORY_EDITOR"`.
- `gmSubView`: evoluir para `"GM_HOME" | "GM_CHARACTERS" | "GM_STORIES" | "GM_STORY_EDITOR"`.
- Estado novo (apenas quando `effectiveRole === "GM"`): `editingStoryId: number | null`, `editingStory: Story | null` (ou só id e fetch no editor). Nenhum estado de `subView` ou `selectedCharacter` do Player é alterado.

**Fluxo de navegação GM (resumo):**

- GM_HOME → 4 botões: Roteiro → GM_STORIES; Figurinos → GM_CHARACTERS; Espetáculo → (fora de escopo); Se retirar → logout.
- GM_STORIES → lista de histórias; “Nova história” (nome) → GM_STORY_EDITOR com story nova; clicar em história → carrega e abre GM_STORY_EDITOR.
- GM_STORY_EDITOR → grid 5×5; sair → volta GM_STORIES (com confirmação se sujo).

---

## B) Lista exata de arquivos a criar e arquivos existentes a tocar

### Arquivos a CRIAR (módulo GM e backend)

| Arquivo | Motivo |
|--------|--------|
| `apps/web/src/gm/index.ts` | Ponto de entrada do módulo GM; exporta telas e tipos para `routes.tsx`. |
| `apps/web/src/gm/types.ts` | Contratos Story, Scene, Scenario, CharacterRef, vínculos (ver seção Contratos). |
| `apps/web/src/gm/api.ts` | Cliente API: list/create/update/delete stories, scenes, scenarios; autosave por cena. |
| `apps/web/src/gm/screens/HomeGMScreen.tsx` | Nova home GM com 4 botões (Roteiro, Figurinos, Espetáculo, Se retirar). Substitui uso do atual ou convive com ele (ver decisão pendente). |
| `apps/web/src/gm/screens/StoryListScreen.tsx` | Lista de histórias + “Nova história” + abrir editor. |
| `apps/web/src/gm/screens/StoryEditorScreen.tsx` | Container do grid 5×5; orquestra Cenários, História (cenas), Cena ativa, Personagens. |
| `apps/web/src/gm/components/EditorGrid.tsx` | Layout grid 5×5 (topo cenários, esq história, centro cena, dir personagens). |
| `apps/web/src/gm/components/ScenarioThumbs.tsx` | Thumbs de cenários + modal gerenciar/criar. |
| `apps/web/src/gm/components/SceneList.tsx` | Lista reordenável de cenas + popup Detalhes + duplicar. |
| `apps/web/src/gm/components/SceneDetailPopup.tsx` | Modal/popup de detalhes da cena. |
| `apps/web/src/gm/components/ScenarioManagerModal.tsx` | Modal cenários (criar/gerenciar). |
| `apps/web/src/gm/components/CharacterManagerModal.tsx` | Modal personagens (lista ordenada; reutiliza conceito de “Figurinos” / personagens GM). |
| `apps/web/src/gm/styles/gm-home.css` | Estilos da home GM (4 botões, lobby-cabinet). |
| `apps/web/src/gm/styles/story-list.css` | Estilos da lista de histórias (select-grid-like). |
| `apps/web/src/gm/styles/story-editor.css` | Estilos do editor (grid 5×5, painéis). |
| `apps/api/backend/routers/gm_stories.py` | API REST: histórias, cenas, cenários, vínculos; namespace separado do Player. |
| Migrations/DDL (se houver migrations no projeto) | Tabelas: `story`, `scene`, `scenario`, `story_character`, `scene_scenario`, etc. (ver Contratos). |

Opcional / transversal:

- `apps/web/src/gm/context/SpellCheckContext.tsx` (ou `shared/`): hook/context para spellcheck “nível Word” (Web Worker, dicionário, opt-out). Detalhamento fica para etapa dedicada.

### Arquivos EXISTENTES a TOCAR (com motivo e cuidado)

| Arquivo | O que fazer | Motivo | Risco ao Player |
|--------|-------------|--------|------------------|
| `apps/web/src/routes.tsx` | (1) Estender tipo `View` com `GM_STORIES`, `GM_STORY_EDITOR`. (2) Estender `gmSubView` e estado `editingStoryId` (ou equivalente). (3) Importar telas de `gm/` e adicionar ramos `view === "GM_STORIES"` e `view === "GM_STORY_EDITOR"`. (4) Em `view === "GM_HOME"` renderizar o novo `HomeGMScreen` do módulo GM (4 botões). | Único ponto de decisão de view no app; GM já tem ramos aqui. | Baixo: apenas novos ramos e novo estado GM; nenhum `if` de subView/Player alterado. |
| `apps/web/src/index.css` | Adicionar `@import "./gm/styles/gm-home.css"` (e demais CSS do GM). | Carregar estilos do módulo GM. | Nenhum: só imports. |
| `apps/api/main.py` | `from apps.api.backend.routers.gm_stories import router as gm_stories_router` e `app.include_router(gm_stories_router)`. | Expor API de histórias/cenas. | Nenhum. |

**Arquivo do Player que NÃO deve ser alterado nesta etapa:**  
`apps/web/src/screens/HomeGMScreen.tsx` — hoje é a “home do GM”. Decisão pendente: **substituir** pelo novo `gm/screens/HomeGMScreen.tsx` (e deixar o antigo como legado ou remover) **ou** fazer o `routes.tsx` chamar o novo componente com outro nome (ex.: `GMMenuScreen`) e manter o antigo para compatibilidade. Ambos evitam alterar lógica do Player.

---

## C) Tabela: Recurso existente → onde está → como reutilizar → ajustes mínimos → risco ao Player

| Recurso existente | Onde está | Como reutilizar | Ajustes mínimos | Risco ao Player |
|-------------------|-----------|------------------|------------------|------------------|
| Rotas / view | `routes.tsx` | Mesmo padrão: `view` + `gmSubView`; novos valores e ramos só para GM. | Adicionar 2 views, 1+ estados GM, 2 ramos de render. | Baixo (apenas expansão). |
| Design system (card, btn, field, modal) | `styles/tokens.css`, `layouts.css`, `components.css` | Import já global em `index.css`; GM usa classes `ui-card`, `ui-btn`, `ui-field`, etc. | Nenhum no CSS existente. | Nenhum. |
| Modal (ConfirmDialog) | `ui/ConfirmDialog.tsx` | Importar em telas GM; usar para “Sair sem salvar?”, confirmar exclusão, etc. | Nenhum. | Nenhum. |
| Padrão lista + detalhe + ações | `SelectCharacterScreen.tsx`, `GMCharactersScreen.tsx` | **Não extrair** no início: criar `StoryListScreen` no módulo GM inspirado na estrutura (select-grid, select-col--list, select-col--book) e reutilizar classes CSS. | Criar `story-list.css` com variantes de `.select-*` (ex.: `.story-list`, `.story-detail`) para não sobrescrever select do Player. | Nenhum se não tocarmos em `SelectCharacterScreen` nem em `selectCharacter.css`. |
| Grid de colunas | `createCharacter.css` (create-grid), `selectCharacter.css` (select-grid) | Reutilizar classes em novo layout ou definir `.editor-grid` em `story-editor.css` (grid 5×5). | Apenas CSS novo no módulo GM. | Nenhum. |
| Upload de imagens | `CharacterScreen.tsx` + `api.ts` + backend `characters.py` | Figurinos continuam usando o fluxo atual (GMCharactersScreen + CharacterScreen). Cenários (thumbs) no editor: **novo** endpoint em `gm_stories.py` (ex.: `/gm/stories/scenarios/{id}/image`) e componente `ScenarioThumbs` no GM. | Nenhum em CharacterScreen. | Nenhum. |
| Personagens GM (Figurinos) | `GMCharactersScreen.tsx`, `CharacterScreen.tsx`, `routers/characters.py` (gm_router) | “Figurinos” = mesmo módulo de personagens GM. Home GM terá botão que leva a `GM_CHARACTERS` (já existe). No editor, “Personagens” (direita) usa lista ordenada + modal; modal pode listar personagens via `api("/api/gm/characters")` e permitir vincular à história/cena (novos endpoints em gm_stories). | Possível ajuste fino em `GMCharactersScreen` apenas se precisar de “lista ordenada” ou “vincular a história”; caso contrário, só novo modal no GM que chama API existente. | Baixo; manter Figurinos como hoje e usar como fonte de dados no editor. |
| Autosave / estado persistido | Não existe hoje (formulários sem autosave) | Implementar apenas no módulo GM: em `StoryEditorScreen` (ou hook), debounce de N segundos após edição da cena ativa → `PATCH /api/gm/stories/{id}/scenes/{sceneId}`; em falha, aviso (toast ou inline). | Nenhum no Player. | Nenhum. |
| Lista reordenável / D&D | Não existe no codebase | Introduzir só no GM: em `SceneList` (e eventualmente em “Personagens” do editor). Biblioteca leve (ex.: @dnd-kit ou react-beautiful-dnd) apenas no módulo GM; não usar no Player nesta fase. | Nenhum. | Nenhum. |
| Spellcheck “nível Word” | Não existe | Serviço central (hook/context) + Web Worker + TextField base; opt-out; sublinhado ≤150ms; menu top5; dicionário pessoal/org; offline por padrão. Escopo transversal; detalhamento em etapa própria. | Decisão: componente base `TextField` compartilhado (shared) ou só no GM no início. | Se o TextField com spellcheck for usado no Player depois, pode ser adicionado via shared sem alterar telas atuais. |

**Decisão explícita (evitar acoplamento):**  
- **Não** extrair agora um componente genérico `SelectListDetail` de `SelectCharacterScreen`/`GMCharactersScreen` para o Player: isso exigiria refatorar esses arquivos e poderia afetar o fluxo do Jogador.  
- **Sim:** criar `StoryListScreen` no GM reutilizando **apenas** as classes CSS e a estrutura de layout (grid + lista + painel de detalhe), com nomes de classe próprios (ex.: `story-list-*`) em `story-list.css`.

---

## D) Contratos (types/DTOs) — IDs UUID; Scene normal vs narrativa

- **IDs:** Todas as entidades usam **UUID** (string) como identificador: `story.id`, `scene.id`, `scenario.id`; vínculos por `sceneId`, `scenarioId`, `characterId` (UUIDs onde aplicável; personagens GM podem manter id numérico no backend existente e expor UUID no novo módulo ou migrar depois — decisão de implementação).
- **Story:** `id` (UUID), `title`, `premise`, `whatIsHappening`, `themesAndAtmosphere`, `notes`, `created_at`, `updated_at`; lista de cenas ordenada (por `order_index`).
- **Scene normal:** `id` (UUID), `story_id` (UUID), `title`, `type: "normal"`, `scenarioId?: UUID | null`, `descriptionRich`, `notesRich`, `characterIds: UUID[]` (ordem = ordem na lista). Sem `images`.
- **Scene narrativa:** `id` (UUID), `story_id` (UUID), `title`, `type: "narrative"`, `descriptionRich`, `images: { id: UUID, urlOrKey: string, order: number }[]` (ordenadas). Sem `scenarioId`, sem `characterIds`, sem `notesRich`.
- **Scenario:** `id` (UUID), `name`, `description` (pré-preenche descrição da cena), `imageStorageKey` (imagem de fundo); globais ao GM.
- **CharacterRef:** personagem em `/api/gm/characters` referenciado por `characterId`; em cena normal, lista ordenada `characterIds[]`.
- **Modais encadeados:** Pilha — ao abrir B sobre A, A permanece montado atrás de B; fechar B revela A. Overlay/z-index递增 por ordem de abertura.
- **DnD:** Usar **@dnd-kit** para reordenar cenas e para associar cenário/personagem à cena (única forma de associação).
- **Autosave:** Se **ligado** (padrão): além do debounce ao editar, salvar ao **sair do editor** ou ao **trocar de cena ativa** antes de trocar. Se **desligado:** trocar de cena/sair **sem** salvar (descartar ou avisar “alterações não salvas” conforme regra de produto).

---

## E) Camada de persistência do GM e autosave

- **Namespace:** Tudo sob `/api/gm/`; novo router `/gm/stories` (histórias, cenas) e `/gm/scenarios` (cenários globais). IDs nas rotas como UUID (string).
- **Autosave (regra):** Ligado = debounce + save on exit/switch scene; desligado = switch/exit without saving (com aviso se sujo).

---

## F) Backlog em fatias (5–10 itens) com critérios de aceite

1. **Home GM com 4 botões** ✅  
   - Criar `gm/screens/HomeGMScreen.tsx` com: Roteiro (→ GM_STORIES), Figurinos (→ GM_CHARACTERS), Espetáculo (desabilitado / “Em breve”), Se retirar (logout).  
   - **CA:** (1) Logado como GM, a home exibe os 4 botões. (2) Roteiro navega para Roteiro (placeholder ou lista). (3) Figurinos navega para GM_CHARACTERS. (4) Espetáculo não navega (botão desabilitado). (5) Se retirar chama logout.

2. **Rotas e estado para Roteiro**  
   - Em `routes.tsx`: adicionar `GM_STORIES` e `GM_STORY_EDITOR` ao tipo View; estender `gmSubView`; adicionar estado `editingStoryId` (ou similar); ramos de render para essas views usando placeholders (ex.: “Roteiro – em construção”).  
   - CA: A partir da home, “Roteiro” leva a uma tela que indica Roteiro; voltar retorna à home GM.

3. **API e DTOs mínimos (backend)**  
   - Criar `routers/gm_stories.py` com `GET/POST /gm/stories`, `GET/PUT/DELETE /gm/stories/{id}`; DTOs Story (id, name, created_at, updated_at); tabela `story` no DB. Registrar router em `main.py`.  
   - CA: GM consegue listar e criar histórias via API (e via cliente no front se já houver tela); dados persistem no SQLite.

4. **Tela lista de histórias**  
   - Implementar `StoryListScreen`: lista de histórias (GET /gm/stories), layout tipo select-grid; “Nova história” pede nome (modal ou inline), POST e abre editor; selecionar item abre editor com história carregada.  
   - CA: Lista exibe histórias; nova história com nome abre editor; abrir história existente abre editor com dados da história.

5. **Cenas no backend e no editor (container)**  
   - Backend: tabela `scene` (story_id, title, body, order_index, is_narrative, scenario_id); endpoints GET/POST/PATCH/DELETE cenas por story. Front: `StoryEditorScreen` com grid 5×5 (placeholders nos 4 quadrantes) e estado “cena ativa”; carregar cenas ao abrir história; sempre 1 cena ativa; criar/duplicar cena torna ela ativa.  
   - CA: Abrir uma história no editor mostra as cenas; é possível criar/duplicar cena e ela fica ativa; layout 5×5 visível.

6. **Cenários (thumbs + modal)**  
   - Backend: CRUD cenários (nome, descrição, thumbnail opcional). Front: painel “Cenários” no topo do grid com thumbs; modal gerenciar/criar cenários; drag-and-drop como único jeito de associar cenário à cena (regra); descrição do cenário só pré-preenche.  
   - CA: Cenários globais listados no topo; modal permite criar/editar; associar à cena apenas por D&D; descrição pré-preenche campo da cena.

7. **Personagens no editor (lista + modal)**  
   - Painel “Personagens” à direita: lista ordenada (vínculos da cena); modal gerenciar/criar usa personagens GM (Figurinos) existentes; associação apenas por D&D; cena narrativa não mostra cenário nem personagens.  
   - CA: Lista de personagens da cena à direita; modal abre lista de Figurinos; vincular/desvincular por D&D; modo narrativa oculta cenário e personagens.

8. **Autosave por cena e aviso em falha**  
   - Autosave ligado (padrão): debounce ao editar + salvar ao sair do editor ou ao trocar de cena ativa; desligado: trocar/sair sem salvar (aviso se houver alterações não salvas). PATCH da cena; em falha, exibir aviso.  
   - CA: Com autosave ligado, ao trocar de cena ou sair a cena é salva; com autosave desligado, trocar/sair não persiste; em falha de save o usuário vê aviso.

9. **Popup Detalhes da cena + duplicar**  
   - Na lista de cenas (esquerda): popup com detalhes da cena; botão “Duplicar” cria cópia e torna ativa.  
   - CA: Clicar em cena abre detalhes; duplicar cria nova cena e a seleciona.

10. **Spellcheck transversal (escopo reduzido para esta etapa)**  
    - Definir contrato do serviço (hook/context + opt-out + atraso ≤150ms + sugestões top5); implementar apenas um TextField/textarea de demonstração no editor (ex.: corpo da cena) com sublinhado e menu sugestões; dicionário pessoal/org e offline ficam para próxima fatia.  
    - CA: Em um campo do editor, pausa ≥150ms mostra sublinhado de erros e menu com até 5 sugestões; opt-out desativa.

---

## G) Decisões pendentes (sem inventar padrão)

1. **Home GM atual (`screens/HomeGMScreen.tsx`):** Substituir totalmente pelo novo `gm/screens/HomeGMScreen.tsx` (e remover/arquivar o antigo) ou manter o antigo e usar nome diferente para o novo (ex.: `GMMenuScreen`) e no `routes.tsx` renderizar o novo quando `view === "GM_HOME"`? O codebase não define política de depreciação de telas.

2. **Localização do SpellCheck:** Context/hook em `gm/context/` (só GM) ou em `shared/` para uso futuro no Player? Depende se haverá TextField com spellcheck no Player; hoje não há.

3. **Rich-text no corpo da cena:** Requisito menciona “normal/narrativa” e “campos”; não está claro se “corpo” da cena é texto plano (textarea) ou rich-text. Se for rich-text, qual lib (ex.: TipTap, Slate) e se o autosave serializa HTML/Markdown/JSON — o codebase atual não tem rich-text.

4. **Biblioteca de drag-and-drop:** Definido: **@dnd-kit**.

5. **Modais encadeados:** Definido: **pilha** — A fica aberto atrás de B; fechar B revela A.

6. **Versionamento / undo global:** Fora do escopo desta etapa; não há decisão sobre se no futuro haverá versionamento de cenas (histórico) ou undo global — isso impactaria apenas o desenho da API (ex.: não sobrescrever cena no PATCH, mas criar revisão).

---

**Fim da proposta.** Nenhum código foi implementado; apenas planejamento e inventário com base no codebase existente.
