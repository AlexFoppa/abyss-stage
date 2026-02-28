# Glossário — Abyss Stage

Termos usados no projeto para manter consistência entre documentação, código e prompts para agentes.

**Experiência alvo:** um **mestre** e até **seis jogadores**. O termo **usuário** se refere a ambos (mestre ou jogador); use **mestre** ou **jogador** quando precisar deixar claro o papel.

| Termo | Significado | Onde aparece no código |
|-------|-------------|-------------------------|
| **Jogador** | Usuário que participa da sessão como jogador (não é o mestre). Pode ter um ou mais personagens; escolhe um para a sessão. Até seis jogadores por sessão. | `role === "PLAYER"`, fluxo do jogador, `LobbyScreen`, seleção de personagem |
| **Mestre** | Usuário que conduz a sessão: edita roteiro, cenários, elenco, controla o que todos veem no espetáculo (por enquanto). Uma sessão tem um mestre. | `role === "GM"`, `HomeGMScreen`, `EspetaculoScreen`, `StageView` (controles) |
| **Usuário** | Qualquer pessoa logada no sistema — **mestre ou jogador**. Use “usuário” quando a regra vale para os dois; use “mestre” ou “jogador” quando o comportamento for específico do papel. | Auth, `user`, rotas comuns |
| **Cenário** | Imagem de fundo do palco (entidade Scenario). Pode ter nome, descrição, imagem e recorte (crop) para exibição. | `Scenario`, `scenario_id`, `ScenarioBackground`, `GMScenariosScreen`, `ScenarioManagerModal` |
| **Cena** | Unidade do roteiro dentro de uma história (Scene). Tem título, corpo, tipo (normal/narrativa), cenário opcional e lista de personagens. | `Scene`, `scene_id`, `StoryEditorScreen`, cenas da história |
| **Elenco** | Conjunto de personagens do mestre vinculados a uma história ou a uma cena. | `scene_character`, `story_character`, `SceneCharactersModal`, personagens da cena |
| **Espetáculo** | Momento ao vivo em que o mestre “abre as cortinas” e todos veem o mesmo palco (uma cena). Sincronizado via LiveKit. | `show`, mensagens `show/start`, `StageView`, `EspetaculoScreen` |
| **Figurinos** | Tela/área do mestre para gerenciar personagens (criar, editar, listar). Mesmo conjunto de personagens que o “elenco” usa. | `GMCharactersScreen`, `/api/gm/characters` |
| **Lobby** | Sala de espera onde mestre e jogadores ficam; áudio compartilhado (LiveKit), lista de participantes, escolha de personagem. | `LobbyScreen`, `/api/lobby`, sala LiveKit "lobby" |
| **Palco** | Área visual onde aparecem cenário + personagens (camadas 1 e 2 da experiência). | `StageView`, classes `stage-view`, `lobby-stage` |
| **Roteiro** | Conjunto de histórias e cenas que o mestre edita; fluxo “Roteiro” na home do mestre. | `GM_STORIES`, `GM_STORY_EDITOR`, `StoryListScreen`, `StoryEditorScreen` |
| **Show** | Instância de um espetáculo em andamento: id, storyId, sceneId, cenário (url + crop), etc. Estado compartilhado entre todos via LiveKit. | Estado `show` em `routes.tsx`, mensagens `show/*` no data channel |

---

**Instrução para agentes:** Ao implementar tarefas neste repositório, use os termos deste glossário. Em especial: distinga **Jogador**, **Mestre** e **Usuário**; a experiência é para **um mestre e até seis jogadores**.

*Atualize este arquivo quando surgirem novos termos importantes.*
