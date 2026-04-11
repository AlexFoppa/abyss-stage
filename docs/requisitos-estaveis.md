# Requisitos estáveis (não regredir)

**Versão:** 1.7  
**Actualização:** 2026-03-30  
**Uso:** referência para refactor e redesign; alterações que quebrem estes pontos exigem decisão explícita de produto. O que **não** estiver aqui **não** conta como requisito estável até ser acrescentado (este ficheiro é a fonte de planeamento em `docs/`).

**Colaboração (IA / terceiros):** **Não** alterar código, middleware, variáveis de ambiente, `.env.example` nem ficheiros em `docs/` **sem autorização explícita** do dono do repositório. **Não** implementar funcionalidades a meio nem alargar o âmbito do pedido sem combinar (evita logs, flags ou refactors “pela metade” sem alinhamento).

---

## Autenticação e sessão

- JWT em cookie HttpOnly; papéis GM vs PLAYER com autorização coerente na API.
- `must_reset_password`: utilizador não prossegue até redefinir senha (`Readme`, fluxos em `apps/api/backend/routers/auth`).

## Áudio (LiveKit)

- Voz no lobby (e uso no espetáculo) via LiveKit: token, sala `lobby`, URL `wss` configurável. Referência operacional: `Readme`, `scripts/start-lobby-tunnels.sh`, `apps/web/src/screens/LobbyScreen.tsx`, `apps/web/src/rtc/livekit.ts`.

## Lobby e espetáculo — consistência visual e controlo do mestre

### Espetáculo: o que é partilhado

- **Cenário:** permanece **sempre visível** para todos enquanto o espetáculo decorre.
- **Outros elementos** (ex.: avatares de PCs e NPCs, espaço de rolagem de dados, demais camadas do palco): o mestre define **quais estão visíveis** para os jogadores; o que estiver **oculto** para o jogador continua **visível para o mestre**, que controla essa visibilidade.

### Regra de paridade (jogadores entre si e com o mestre no que é partilhado)

- Para **dois jogadores** (ou para **jogador e mestre**, quando o assunto é o mesmo elemento visível no ecrã do jogador): o conjunto de elementos **visíveis** e a **imagem** mostrada em cada um (URL/asset/estado de expressão) deve ser **exactamente o mesmo**. Não há “versão local” do palco que difira do que os outros jogadores veem nos itens visíveis.
- **Piscar / preview de expressão** (ex.: teclas numéricas): se um **jogador** actua sobre o **seu** avatar, o efeito deve ser visto por **todos** (incluindo o mestre). Se o **mestre** actua sobre **imagem de PC ou NPC** (ou equivalente), o mesmo efeito deve ser visto por **todos** os que veem esse elemento **nesse momento** (ou seja, quem o vê, vê o mesmo piscar).

### Anti-regressão (fonte da verdade)

- Não reintroduzir **várias fontes concorrentes** (ex.: HTTP, estado só no cliente, LiveKit) para a **mesma** imagem ou expressão **sem** decisão de produto documentada; com impacto em pedidos, usar **logs HTTP** (secção Observabilidade) para comparar antes/depois.

## Espetáculo iniciado — jogador que entra depois

- Com espetáculo **já em curso**, se um jogador **fizer login** (ou entrar na app autenticado), deve ser **imediatamente** conduzido a **escolher personagem** e **juntar-se ao jogo** em curso, **sem** ser tratado como visitante do lobby como se não houvesse jogo activo.
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

## Backlog de desenvolvimento (código — actualizar quando fechar)

1. **Paridade de retratos (lobby + palco):** Unificar a origem da URL por `character_id` e slot de expressão efectivo (hoje: `localCharacterImageBySlot`, `character_image_by_slot` do `GET /lobby`, e vias no GM em `StageView` / `fetchCharactersForGM`) numa ordem de precedência alinhada ao servidor, sem mapas locais que contradigam o lobby para o mesmo alvo visível.
2. **Piscar / preview para todos:** Garantir que o override temporário (`expression/override` e estado espelhado) produza a **mesma** percepção visual em todos os clientes; corrigir efeitos só no cliente local (ex.: `expressionJustFixedAt` só com `isLocal`) se violarem o RF.
3. **Duplicação de `GET /lobby`:** Com GM em espetáculo, `routes.tsx` e `StageView` disparam pedidos ao lobby em paralelo — consolidar (um dono do poll ou partilha de dados).
4. **Jogador com espetáculo activo:** Rever UX/copy (`showActiveMustSelectCharacter`, bootstrap `GET /show/active`) para cumprir o RF (orientação clara, não “visitante sem jogo”).
5. **Remover Krisp (LiveKit noise filter):** Retirar dependência `@livekit/krisp-noise-filter`, processador no track de áudio e UI associada no lobby — motivo: custo / facturação BVC no LiveKit Cloud (e-mail Maio 2026); manter opções de captura do browser (noise suppression, etc.) que não dependam desse add-on.
6. **Trilha sonora no espetáculo:** A definir quando o item for abordado (fonte, sync, direitos, GM vs jogador).
7. **Transcrição de fala:** A definir quando o item for abordado (privacidade, custo, língua, quem vê o texto).

## Backlog nice to have (desenvolvimento)

1. **Simplificar fluxo** de entrada do jogador com espetáculo a decorrer (menos passos ou UI mais directa), mantendo aceitável o lobby para áudio e escolha de personagem — ver bullet “Nice to have” em **Espetáculo iniciado — jogador que entra depois**.
2. **Timer no espetáculo** (contagem visível para mesa / GM — detalhe a fechar quando for prioridade).
3. **Baralho de arquétipos** para apoio à **criação de personagens** (mecânica e UX a fechar quando for prioridade).
4. **Seleccionar dispositivo de saída de áudio** (altifalante / auscultadores) no lobby ou espetáculo — hoje só é possível escolher o **dispositivo de entrada** (microfone).
