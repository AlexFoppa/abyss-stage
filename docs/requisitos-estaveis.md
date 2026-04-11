# Requisitos estáveis (não regredir)

**Versão:** 1.3  
**Actualização:** 2026-03-30  
**Uso:** referência para refactor e redesign; alterações que quebrem estes pontos exigem decisão explícita de produto. O que **não** estiver aqui **não** conta como requisito estável até ser acrescentado (este ficheiro é a fonte de planeamento em `docs/`).

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

- Se o **mestre** sair (rede, browser, crash) **durante** o espetáculo, ao voltar a autenticar-se deve **retomar o jogo no ponto em que parou**: o estado da sessão de jogo **não** se perde só por essa desconexão (reconexão + estado persistido/recuperável conforme arquitectura adoptada).

## Observabilidade e carga (polling)

- O ritmo de **polling** e o fan-out de pedidos mudaram tantas vezes que **não há hoje um “certo” documentado** só de cabeça; o contexto perde-se entre alterações.
- **Estratégia:** **logar os pedidos na API** de forma explícita (método, path, status, duração), activável por variável de ambiente (`ABYSS_HTTP_LOG` — ver `.env.example`). Objectivo: quando algo **quebrar** (limite do túnel, sobrecarga, etc.), haver **dados no log** para inferir **limites reais** do polling e do padrão de tráfego — aceitando que volume de log pode ser alto e que **não** há segundo documento de governança obrigatório em `docs/`.

## Privacidade nos logs de operação

- Sem requisitos adicionais de privacidade para o conteúdo dos traces técnicos acordados para esta fase (método, path, status, duração); evitar na mesma boas práticas desnecessárias (corpos, cookies, secrets).

## Escala de referência

- Sessões de RPG: ordem de **~6 pessoas**, **~6 h** por sessão, **≥4 sessões/mês**; arquitectura e custos devem tolerar **crescimento** além disso quando possível.
