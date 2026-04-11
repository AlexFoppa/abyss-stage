# Plano — melhorar a **geração** de prompts (meta)

Objetivo: deixar de produzir prompts **frágeis** (audiência misturada, conclusões assumidas, documentos gigantes, requisitos contraditórios) e passar a ter um **processo** repetível para criar e rever prompts antes de os usares.

---

## 1. O que falhou nos prompts gerados (para não repetir)

| Problema | Sintoma | Correção de processo |
|----------|---------|----------------------|
| **Audiência dupla** | Instruções para ti e para o agente no mesmo ficheiro. | Dois artefactos ou secções **claramente rotuladas**: (A) *briefing humano* fora do prompt; (B) *instruções ao executor* só com imperativos ao agente. |
| **Diagnóstico no enunciado** | “A causa é o `useEffect`” antes da análise. | Prompt obriga **inferência só a partir do código**; proibir hipóteses técnicas no texto do pedido salvo como “suspeita a falsificar”. |
| **Saída inútil** | Relatório enorme sem veredito no topo. | Exigir **estrutura de saída** com secção inicial **curta** (N linhas) + orçamento de tamanho; validar com revisão humana antes de adoptar o modelo. |
| **Requisitos desalinhados** | “Poll 1 s” vs “menos requisições”. | Nenhum prompt de implementação sem **fonte única** de números (governança / tabela delta); o prompt **referencia** o doc, não redefine metas. |
| **Prompt = mini-spec opaca** | Muitas secções, pouca decisão. | Um prompt **uma intenção** (só design, só fix áudio, só API). Vários intentos = vários prompts **sequenciais**, não um monólito. |
| **Limite único demasiado baixo** | Pedido de “análise arquitectural” com teto global (ex.: 120 linhas) que **cabe** inventário e **não cabe** quadro de alternativas, caminho de rede, ou critérios de pivot. | Contratar **orçamentos por bloco** (ver §2.1) ou **dois prompts sequenciais**: (1) mapa do código; (2) decisão de stack/protocolo com entrada = saída de (1). |
| **Profundidade não contratada** | O executor resume o repositório e declara “refactor médio” sem comparar **famílias** de solução (eventos app-owned, barramento existente, room server, etc.). | Para intenção “arquitectura / sincronização / protocolo”, o prompt **obriga** secções mínimas (§5.1) e **mínimo de linhas** ou bullets nas secções de decisão — não só teto máximo. |
| **Custo de rede vago** | “Pode estourar o limite” sem separar **canal** (HTTP vs realtime vs só cliente). | Exigir **cadeia nomeada** (passo a passo) para fluxos críticos e pergunta explícita: o comportamento X **adiciona** pedidos HTTP no intervalo Y? Que **refactor hipotético** adicionaria? |

---

## 2. Princípios para um prompt **utilizável**

1. **Um leitor, uma voz** — Quem executa (agente) recebe só o que o agente deve fazer; o que **tu** fazes (colar, gravar ficheiro, ordem das conversas) fica em nota tua ou noutro sítio.
2. **Entrada explícita** — Repositório aberto, paths obrigatórios a ler, **commit ou tag** se o contexto for regressão.
3. **Saída contratada** — Formato (Markdown, secções), **limite** (linhas ou palavras), **proibido** (ex.: tabelas gigantes no resumo).
4. **Decisões de produto e números** — **Metas numéricas** (intervalos de poll, tetos de pedidos) ficam em requisitos/governança; o prompt **referencia** o doc ou manda “quantificar após medição”. **Não** confundir isso com **proibir** matrizes de trade-off: o executor pode **produzir** comparação qualitativa (A vs B vs C) e **ligar** cada opção ao doc de governança ou a “baseline por definir”.
5. **Testável** — O fim do prompt liga a critérios que **podes verificar** (estrutura da entrega, presença de secções, cadeias citadas no código), não a frases vazias do tipo “melhor arquitectura”.

### 2.1 Orçamento de saída alinhado à **intenção**

| Intenção do prompt | Orçamento típico | Notas |
|--------------------|------------------|--------|
| Bugfix local / patch | Resumo curto + diff mental; poucas linhas. | Uma intenção. |
| Inventário (só mapa do código) | Limite moderado; secções fixas. | Não misturar com “pivot de stack” no mesmo ficheiro sem orçamento extra. |
| Análise arquitectural (sincronização, protocolo, custo) | **Síntese curta no topo** + bloco “código actual” + bloco “alternativas / protocolo / rede” com **mínimo** contratado (linhas ou bullets). | Se o prompt não couber em ~40–60 linhas, usar **Parte A / Parte B** no mesmo `.md` ou dois ficheiros numerados. |

Regra: se a intenção precisa de **decisão entre famílias de sistema** (ex.: eventos próprios vs barramento actual vs motor de sala), o limite global **não** pode ser só um número baixo sem **mínimo** nas secções de decisão — senão o modelo optimiza para caber e **omite** o quadro.

---

## 3. Fluxo em 4 passos **antes** de gravar um prompt em `docs/`

| Passo | Quem | Acção |
|-------|------|--------|
| **1. Intenção** | Tu | Uma frase: “Quero que o agente **só** [analisar / implementar / documentar baseline] [âmbito].” Se não couber numa frase, partir em dois prompts. |
| **2. Rascunho** | Tu ou IA | Bullet points: contexto mínimo, ficheiros, saída esperada, o que **não** fazer. |
| **3. Corte** | Tu | Remover tudo que seja opinião técnica não verificada, duplicata de `requisitos` ou `governança`, e instruções para ti misturadas com instruções para o agente. |
| **4. Checklist** | Tu | Percorrer secção 4 deste plano; só então `git add` o `.md`. |

---

## 4. Checklist de revisão do prompt (obrigatório)

- [ ] Só existe **uma** audiência principal no corpo do prompt (o executor).
- [ ] Não há **causa raiz** afirmada sem “hipótese” ou “a verificar no código”.
- [ ] A **saída** tem formato e limite definidos (ou remete a um template único em `docs/`).
- [ ] Requisitos numéricos ou de carga **não** são reinventados aqui — há link para `requisitos-*` ou `plano-evolucao-requisitos-governanca-v1.md` (ou instrução explícita de não fixar números sem baseline / doc).
- [ ] O prompt cabe em **~1 ecrã** (~40–60 linhas) ou está **explicitamente** partido em “parte 1 / parte 2” (ou Parte A / B).
- [ ] Há **critério de sucesso** em 1–3 bullets (o que consideras “feito”).
- [ ] Se a intenção for **arquitectura / sincronização / protocolo / custo de rede**: há **mínimo** contratado para o bloco de decisão (não só teto global); há obrigação de **comparar pelo menos duas famílias** de solução ou de declarar porquê só uma é relevante **com critério**; há pedido de **cadeia de rede** (passos nomeados) para pelo menos um fluxo crítico, separando HTTP, realtime e estado só local.
- [ ] O limite de linhas da **entrega** não força, por si só, omitir o bloco de decisão (ajustar conforme §2.1).

Se algum item falhar, **não** uses o prompt como referência oficial; refaz o rascunho.

---

## 5. Template mínimo (copiar para novos prompts)

```markdown
# Prompt — <intenção única>

**Executor:** <agente / ferramenta>.
**Proibido:** <ex.: implementar código / alterar ficheiros fora de X>.

**Ler:** <paths ou @codebase com âmbito estreito>.

**Tarefa:**
1. …
2. …

**Entregar:**
- Formato: …
- Limite: …
- Secção inicial (máx. N linhas): …

**Não fazer:** …
```

### 5.1 Extensão — prompt de **análise arquitectural** (sincronização, protocolo, carga)

Usar quando a intenção **não** for só inventário: o executor deve sustentar **decisão** ou **opções** com profundidade. Copiar e preencher; pode partir em **Parte A** (leitura + requisitos) e **Parte B** (tarefas + entregar).

```markdown
# Prompt — análise arquitectural: <âmbito>

**Executor:** …
**Proibido:** …

**Ler:** …

**Critérios de produto** (suposições ou perguntas em aberto; não duplicar governança numérica): …

**Tarefas**
1. Mapa do código actual (fontes de verdade, gaps vs requisitos).
2. Custo / timers (por canal: HTTP vs …).
3. **Quadro de alternativas:** ≥ 2 famílias (ex.: eventos app-owned; barramento realtime existente; room server). Para cada uma: autoridade, reconexão, complexidade, **quando é overkill**. Conclusão: evolução incremental vs pivot — **gatilho de produto** que mudaria a conclusão.
4. **Caminho de rede** do fluxo crítico <nome>: passos A→B→C; separar HTTP / realtime / local; perguntas explícitas sobre o que **não** aumenta pedidos e o que **passaria** a aumentar se o desenho mudasse.

**Entregar**
- §0 síntese (máx. N linhas).
- Bloco “código” (máx. M linhas).
- Bloco “decisão / alternativas / rede” (**mín.** P linhas **ou** Q bullets) — se faltar, entrega inválida.

**Não fazer:** …
```

Ajustar só o necessário; não acrescentar filosofia nem duplicar `requisitos` inteiros.

---

## 6. Relação com os ficheiros já existentes

- **Manter** `requisitos-adequacao-aplicacao-v1.md` e `plano-evolucao-requisitos-governanca-v1.md` como **fonte de decisões** (não como prompts).
- **Prompts antigos** que não passem no checklist: tratar como **rascunho** — não obrigar novas conversas a usá-los; podes substituir por um prompt gerado com este plano ou arquivar com prefixo `rascunho-`.
- **Novo prompt de feature:** só depois da intenção e do checklist; preferir **um ficheiro curto** + link aos docs de produto.

---

## 7. Como usar **este** plano na prática

1. Quando fores pedir “gera um prompt”, exige explicitamente: **“Segue `docs/plano-geracao-prompts-qualidade-v1.md` (checklist + template).”**
2. Se o resultado violar o checklist, **recusa** e pede **só** a correcção do prompt (sem código).
3. Para **análise arquitectural**: usar o template §5.1 ou dois prompts sequenciais (mapa → decisão); não depender de um único teto de linhas para a entrega sem **mínimo** no bloco de decisão.
4. Periodicamente: se um tipo de tarefa se repete (ex.: design de API), extrair **um** template estável de ~20 linhas — não dez variantes longas.

---

*Versão 1.1 — processo de **prompt**; §1–§2.1, §4 (itens extra), §5.1 e §7.3 alinham intenção “arquitectura” a orçamento e secções obrigatórias.*
