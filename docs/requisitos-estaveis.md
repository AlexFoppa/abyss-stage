# Requisitos estáveis (não regredir)

**Versão:** 2.5  
**Actualização:** 2026-04-14  
**Uso:** referência para refactor e redesign; alterações que quebrem estes pontos exigem decisão explícita de produto. O que **não** estiver aqui **não** conta como requisito estável até ser acrescentado (este ficheiro é a fonte de planeamento em `docs/`).

**Colaboração (IA / terceiros):** **Não** alterar código, middleware, variáveis de ambiente, `.env.example` nem ficheiros em `docs/` **sem autorização explícita** do dono do repositório. **Não** implementar funcionalidades a meio nem alargar o âmbito do pedido sem combinar (evita logs, flags ou refactors “pela metade” sem alinhamento).

**Histórico de versões (só cabeçalho + estrutura de backlogs):**  
**2.5** (2026-04-14) — **Expressão fixa:** estado persistido no **espetáculo activo na API** (uma autoridade, não paralelo ao lobby para o partilhado). **Jogador:** acção explícita «**Atualizar mesa**» (ou equivalente) que força `GET /api/show/active` e reconciliação; **sem** refresh periódico em segundo plano só para esse fim.  
**2.4** (2026-04-14) — **Palco partilhado / paridade:** fonte da verdade do estado partilhado do espetáculo na **API** (leitura reconciliada + escritas definidas); **LiveKit** e **lobby** como canais (deltas, preview, presença); obrigações de **reconnect** e **entrada tardia** alinhadas a esse contrato.  
**2.3** (2026-04-13) — **Cenário:** carregamento **antes** da abertura das cortinas (revelação, não “puxar” o asset depois); sem intervalo perceptível de vazio/obsoleto nas **atualizações** do cenário; alinhamento com jogador que entra durante o espetáculo.  
**2.2** (2026-04-13) — Fechado backlog desenvolvimento **Krisp** (implementação auditada); **Áudio:** requisito estável explícito de não reintroduzir `@livekit/krisp-noise-filter`; renumerado item PDF para **3.**; índice com **três** itens no backlog geral.  
**2.1** (2026-03-30) — Removido item duplicado no backlog geral que apenas apontava para o backlog de trilha; índice ajustado (quatro itens no backlog de desenvolvimento).  
**2.0** (2026-04-11) — Salto de versão para fechar ambiguidade 1.8/1.9 em merges; índice dos backlogs com contagens explícitas; requisitos de expressões multi-alvo + `expressionPortrait.ts` nas secções estáveis.  
**1.7** (2026-03-30) — Referência anterior estável antes da vaga lobby/palco/expressões.

**Regra de edição deste ficheiro:** cada alteração material a requisitos estáveis ou à lista de backlogs deve **subir `Versão`** (minor, ex. 2.0→2.1), **actualizar `Actualização`** (data ISO) e **acrescentar uma linha** ao histórico acima (evita dois ramos com “1.9” diferentes).

---

## Autenticação e sessão

- JWT em cookie HttpOnly; papéis GM vs PLAYER com autorização coerente na API.
- `must_reset_password`: utilizador não prossegue até redefinir senha (`Readme`, fluxos em `apps/api/backend/routers/auth`).

## Áudio (LiveKit)

- Voz no lobby (e uso no espetáculo) via LiveKit: token, sala `lobby`, URL `wss` configurável. Referência operacional: `Readme`, `scripts/start-lobby-tunnels.sh`, `apps/web/src/screens/LobbyScreen.tsx`, `apps/web/src/rtc/livekit.ts`.
- **Sem add-on Krisp:** não reintroduzir a dependência `@livekit/krisp-noise-filter` nem processador equivalente no track (custo / LiveKit Cloud); redução de ruído e opções de captura via **constraints do browser** apenas, onde aplicável.

## Lobby e espetáculo — consistência visual e controlo do mestre

### Espetáculo: o que é partilhado

- **Cenário:** permanece **sempre visível** para todos enquanto o espetáculo decorre. **Cortinas:** o recurso de imagem do cenário em vigor deve estar **já carregado** quando as cortinas se abrem — elas **revelam** o cenário; **não** é aceitável o jogador ver fundo vazio ou placeholder até o asset aparecer **depois** da abertura. **Mudanças de cenário:** quando o estado do cenário mudar, **não** deve haver **atraso perceptível** em que os jogadores vejam fundo vazio, placeholder genérico ou **imagem obsoleta** em relação ao estado actual da cena; paridade com o mestre no instante do novo estado. *(Interpretação técnica: pré-carga, prioridade de rede e ordem de render — sem alterar este contrato de produto.)*
- **Outros elementos** (ex.: avatares de PCs e NPCs, espaço de rolagem de dados, demais camadas do palco): o mestre define **quais estão visíveis** para os jogadores; o que estiver **oculto** para o jogador continua **visível para o mestre**, que controla essa visibilidade.

### Fonte da verdade — estado partilhado do palco e do espetáculo

- **Autoridade única (paridade):** o que mestre e jogadores **devem** ver em conjunto no palco (cenário/cena activa no show, conjunto de actores e respectiva **visibilidade** para o público, posições e restante estado de palco persistido no show activo quando existir, incl. barra de dados quando integrada nesse estado) deriva do **estado servido e reconciliado pela API** — em particular `GET /api/show/active` e as **escritas** que o produto definir para o show (ex.: início do espetáculo, actualização de cena, estado de palco persistido). O cliente **não** pode usar só LiveKit ou só o lobby como substituto desse snapshot **após** bootstrap ou reconnect para o que é **partilhado**.
- **LiveKit (tópicos `lobby` / `espetaculo`, mensagens `show/*`, `expression/*`, etc.):** **canal** de baixa latência — deltas, sincronização rápida, **preview** de expressão; **não** é uma segunda “mesa oficial” cujo estado persistente possa **contradizer** o show activo na API. Quando ordem de chegada ou falhas fizerem divergir transitóriamente, o cliente **reconcilia** para coincidir com a autoridade da API para o estado **fixo** partilhado.
- **`GET /api/lobby` e `POST /api/lobby/me`:** **presença** e metadados de linha (incl. `expression_slot`, `character_image_by_slot` apoiados na base) para áudio e apoio a retratos; **não** substituem o estado de palco partilhado nem a **expressão fixa** oficial para a mesa — essa fixação vive no **estado do espetáculo activo na API** (ver abaixo).
- **Preview vs fixação (expressão):** o **piscar / preview** (~1 s) mantém a regra já indicada em **Regra de paridade**. O estado **fixo** de expressão que afecta o palco partilhado deve ser **persistido e servido** como parte do **show activo na API** (leitura via `GET /api/show/active` e escritas definidas pelo contrato do endpoint); **não** há segunda autoridade paralela no lobby só para “o retrato oficial da mesa”. O lobby pode continuar a reflectir presença e atlas; a reconciliação do palco partilhado alinha-se à API.
- **Reconnect e entrada tardia:** com espetáculo activo, o cliente deve **obter e aplicar** da API o estado relevante para o palco partilhado (incl. `stageState` quando existir); eventos de rede complementam com **delta**, não como **única** inicialização do palco partilhado.
- **Actualização sob pedido do jogador:** **não** é requisito sincronizar o show com **polling periódico em segundo plano** (ex. a cada 1 s) só para manter paridade; isso imporia custo contínuo a todos. O jogador deve ter uma acção explícita (ex.: botão «**Atualizar mesa**» ou equivalente) que force `GET /api/show/active` e **reconciliação** com o que o mestre vê no que é **partilhado**, para recuperar quando perceber desalinhamento — **sem** depender de “refresh eventual”.
- **Abertura / cortinas / animação temporal:** não devem substituir nem contornar o contrato acima; mudanças puramente visuais ou de temporização **não** podem ser a única fonte de verdade para o que é partilhado na mesa.

### Regra de paridade (jogadores entre si e com o mestre no que é partilhado)

- Para **dois jogadores** (ou para **jogador e mestre**, quando o assunto é o mesmo elemento visível no ecrã do jogador): o conjunto de elementos **visíveis** e a **imagem** mostrada em cada um (URL/asset/estado de expressão) deve ser **exactamente o mesmo**. Não há “versão local” do palco que difira do que os outros jogadores veem nos itens visíveis.
- **Piscar / preview de expressão** (ex.: teclas numéricas): se um **jogador** actua sobre o **seu** avatar, o efeito deve ser visto por **todos** (incluindo o mestre). Se o **mestre** actua sobre **imagem de PC ou NPC** (ou equivalente), o mesmo efeito deve ser visto por **todos** os que veem esse elemento **nesse momento** (ou seja, quem o vê, vê o mesmo piscar).

### Mestre: alvo das expressões 0–9 no palco (vários personagens)

- O mestre **não** usa ecrã nem botão à parte para “escolher personagem das expressões”. O alvo é a **selecção já existente no palco** (`StageView`): **todos** os actores seleccionados são afectados **em simultâneo** pelas teclas **0–9** (preview ~1 s e fixação ao soltar).
- Sincronização em rede: mensagens LiveKit `expression/override` e `expression/current` levam **`characterIds`** (lista), não só um único `characterId`. Durante o espetáculo (half/stage), o mesmo payload é publicado nos tópicos **`lobby`** e **`espetaculo`** para alinhar com o resto do fluxo do show.
- **URLs no payload (paridade real):** o cliente jogador **não** pode depender só do mapa `character_image_by_slot` do `GET /lobby` para reconstruir o retrato de **outros** personagens ou de **NPCs** que não têm linha estável no lobby daquele cliente. O mestre envia, por id, **`previewUrlByCharacterId`** (preview) e **`portraitUrlByCharacterId`** (slot fixo após soltar a tecla), calculados no cliente do mestre. O mapa de retratos usado no palco deve **aplicar** essas URLs a **qualquer** `character_id` presente nesse estado, **mesmo** que o id **não** apareça na lista de participantes do lobby naquele cliente — caso contrário o `StageView` cai no `imageUrl` estático do sync e a paridade quebra-se.
- **Implementação:** precedência de slot + URL (lobby, atlas local, atlas GM, LiveKit) está centralizada em **`apps/web/src/expressionPortrait.ts`**; alterações ao comportamento devem passar por esse módulo (e por `buildExpressionUrlMapForPublish` alinhado a `resolvePortraitUrlForCharacter`), não por lógica duplicada em `routes.tsx`.

### Anti-regressão (expressões multi-alvo + retratos remotos)

- Não remover o envio de **`characterIds`** + mapas de URL em **`expression/override`** / **`expression/current`** para o fluxo do mestre com vários seleccionados. O conjunto de ids resolvido no palco inclui lobby + alvos GM no espetáculo + ids presentes no estado LiveKit — tudo consolidado via **`expressionPortrait.ts`**.

### Anti-regressão (fonte da verdade)

- Não reintroduzir **várias fontes concorrentes** para o **mesmo** aspecto do palco partilhado ou da expressão **fixa** (ex.: HTTP, estado só no cliente, LiveKit como estado final divergente) **sem** decisão explícita **neste** ficheiro; a linha de base é **Fonte da verdade — estado partilhado do palco e do espetáculo**. Com impacto em pedidos, usar **logs HTTP** (secção Observabilidade) para comparar antes/depois.

## Espetáculo iniciado — jogador que entra depois

- Com espetáculo **já em curso**, se um jogador **fizer login** (ou entrar na app autenticado), deve ser **imediatamente** conduzido a **escolher personagem** e **juntar-se ao jogo** em curso, **sem** ser tratado como visitante do lobby como se não houvesse jogo activo. Ao **aceder ao palco** (incl. após cortinas, se aplicável ao fluxo desse cliente), aplica-se o mesmo contrato de **cenário** que em **Espetáculo: o que é partilhado** — **sem** fundo vazio prolongado nem cenário desactualizado face ao estado da mesa; o alinhamento do **palco partilhado** segue **Fonte da verdade — estado partilhado do palco e do espetáculo**.
- **Nice to have (não prioritário):** simplificar esse fluxo (menos passos ou UI mais directa), mantendo aceitável o lobby como passo para áudio e escolha de personagem.

## Queda do mestre durante o espetáculo

- Se o **mestre** fechar só o **browser** ou perder **rede**, mas o **processo da API continuar a correr** com o mesmo **contexto de URL** (mesma instância, mesmo túnel/deploy), ao voltar a autenticar-se deve **retomar o jogo no ponto em que parou** (estado do espetáculo em memória na API + `GET /show/active`, etc.).
- **Reinício do processo da API** (deploy, crash do servidor) ou **mudança da URL pública** do app (novo túnel, novo ambiente): **não** há requisito de restaurar o **mesmo** espetáculo nem a mesma sessão — trata-se de **nova execução** do serviço; jogadores e mestre voltam a alinhar por um novo show se necessário.

## Observabilidade e carga (polling)

- O ritmo de **polling** e o fan-out de pedidos mudaram tantas vezes que **não há hoje um “certo” documentado** só de cabeça; o contexto perde-se entre alterações.
- **Estratégia:** **logar os pedidos na API** de forma explícita (método, path, status, duração), activável por variável de ambiente (`ABYSS_HTTP_LOG` — ver `.env.example`). Objectivo: quando algo **quebrar** (limite do túnel, sobrecarga, etc.), haver **dados no log** para inferir **limites reais** do polling e do padrão de tráfego — aceitando que volume de log pode ser alto e que **não** há segundo documento de governança obrigatório em `docs/`.

## Privacidade nos logs de operação

- Sem requisitos adicionais de privacidade para o conteúdo dos traces técnicos acordados para esta fase (método, path, status, duração); evitar na mesma boas práticas desnecessárias (corpos, cookies, secrets).

## Escala de referência

- Sessões de RPG: ordem de **~6 pessoas**, **~6 h** por sessão, **≥4 sessões/mês**; arquitectura e custos devem tolerar **crescimento** além disso quando possível.

---

### Índice dos backlogs (três secções)

1. **Backlog de desenvolvimento** — itens gerais de código: **três** entradas numeradas **1.–3.** na secção homónima (não confundir com a numeração da trilha sonora).
2. **Backlog — trilha e ambientação sonora** — música ambiente + efeitos: numeração **própria** 1.–11. ao longo das fases A–D (**sempre a seguir** ao backlog geral).
3. **Backlog nice to have** — **sete** entradas numeradas **1.–7.**

---

## Backlog de desenvolvimento (código — actualizar quando fechar)


3. **Download de pdf do personagem e do livro** adicionar ao espaço de ficha de personagem a possibilidade de fazer um download das informações do personagem em uma estética semelhante a da aplicação, assim como um botão para baixar o livro em pdf - português e inglês. Tenho os dois pdfs.

## Backlog — trilha e ambientação sonora (música ambiente + efeitos)

**Fora deste âmbito:** voz (LiveKit), mute de microfones — ver **Backlog nice to have**.

**Decisões de produto**

- **Arquitectura:** híbrido **C** — voz mantém-se no LiveKit; **música ambiente** e **efeitos sonoros** por **evento em rede + reprodução local** em cada cliente, com **o mesmo ficheiro/URL** servido pela API; **todos** ouvem o mesmo ao mesmo tempo (sem pré-escuta só GM, sem alterar a voz neste backlog).
- **Canais:** **dois** — **ambiente** (trilho contínuo) e **efeitos** (disparos curtos); volumes independentes para o GM; efeitos **por cima** do ambiente.
- **Loop (ambiente):** **simples** (possível salto no remate do ficheiro); refinamentos depois se necessário.
- **Troca de música ambiente:** **só** quando o **GM** manda; **fade padrão** entre faixas de **ambiente**; **efeitos sem fade**.
- **Planeamento:** cues planeados na cena são **disparados pelo GM**; o GM **vê** a lista no espetáculo para disparar com facilidade.
- **Soundboard:** só GM; **sem** upload improvisado na hora.
- **Catálogo:** estilo elenco/cenário; **ligação por referência** às histórias/cenas (não copiar ficheiro por história); primeiro incremento com **formatos e tamanho máximos** explícitos (ex. mp3/ogg/wav + teto por ficheiro), expandir depois se fizer sentido.
- **Licenças:** só conteúdo carregado pelo GM; responsabilidade do utilizador.

### Fase A — Fundações

1. Contrato de mensagens (eventos) para **ambiente** e, mais tarde, **efeitos** (`seq`/`issuedAt`, `assetId`, `showId`/cena, etc.) e comportamento determinístico nos clientes.
2. **Catálogo de áudio** na API + UI GM: criar/editar entradas com **tipo** ambiente vs efeito (ou equivalente), metadados acordados, ficheiros servidos com **limites** do primeiro incremento.
3. Garantir **URL igual para todos** os clientes ao reproduzir um asset.

### Fase B — Música ambiente (primeiro)

4. **Roteiro:** barra por **baixo** (como cenário/personagens), **também em cenas narrativas**, para associar/preparar faixas de **ambiente** por cena.
5. **Espetáculo:** UI GM para **tocar / trocar / parar** ambiente; **fade padrão** **apenas** entre trocas de faixa de **ambiente** e **apenas** quando o GM comanda a troca.
6. **Loop simples** no canal ambiente.

### Fase C — Efeitos sonoros (depois)

7. Canal **efeitos**: one-shots **sem fade**, sem apagar a lógica do ambiente (dois canais).
8. **Cues planeados** na cena: lista visível ao GM no espetáculo para **disparo** (clique GM).
9. **Soundboard** rápida (GM), ligada ao mesmo catálogo.

### Fase D — Refinos

10. Duração do fade entre faixas de ambiente **editável** (além do padrão).
11. Melhorias de loop (ex. crossfade no loop) se o loop simples for insuficiente.

---

## Backlog nice to have (desenvolvimento)

1. **Simplificar fluxo** de entrada do jogador com espetáculo a decorrer (menos passos ou UI mais directa), mantendo aceitável o lobby para áudio e escolha de personagem — ver bullet “Nice to have” em **Espetáculo iniciado — jogador que entra depois**.
2. **Timer no espetáculo** (contagem visível para mesa / GM — detalhe a fechar quando for prioridade).
3. **Baralho de arquétipos** para apoio à **criação de personagens** (mecânica e UX a fechar quando for prioridade).
4. **Seleccionar dispositivo de saída de áudio** (altifalante / auscultadores) no lobby ou espetáculo — hoje só é possível escolher o **dispositivo de entrada** (microfone).
5. **Transcrição de fala:** A definir quando o item for abordado (privacidade, custo, língua, quem vê o texto).
6. **Voz — narração:** GM pode **mutar jogadores** para forçar escuta da narração, com **indicação clara na UI** do jogador de que está mutado para ouvir o mestre.
7. **Voz — moderação:** GM pode **mutar um jogador** (ex.: microfone aberto com utilizador ausente).
