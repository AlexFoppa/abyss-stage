import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { GMCharacter } from "../types/character";
import { getAvatarUrl } from "../utils/avatar";

export function GMCharactersScreen({
  onBack,
  onEdit,
  onCreate,
  onCreateNpc,
}: {
  onBack: () => void;
  onEdit?: (c: GMCharacter) => void;
  onCreate?: () => void;
  onCreateNpc?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [chars, setChars] = useState<GMCharacter[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [players, setPlayers] = useState<Array<{ id: number; email: string; name: string }>>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [characterFilter, setCharacterFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "PC" | "NPC">("all");

  async function deleteCharacter(c: GMCharacter) {
    const ok = window.confirm(`Apagar personagem "${c.name}"?\n\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    setErr(null);
    setDeletingId(c.id);
    try {
      await api(`/api/gm/characters/${c.id}`, { method: "DELETE" });
      setChars((prev) => prev.filter((x) => x.id !== c.id));
      setActiveId((prev) => (prev === c.id ? null : prev));
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e === "string"
            ? e
            : typeof e?.body?.detail === "string"
              ? e.body.detail
              : "Falha ao apagar personagem";
      setErr(msg);
    } finally {
      setDeletingId(null);
    }
  }

  const normalizeText = (value?: string | null) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const availableSystems = useMemo(() => {
    const unique = new Set<string>();
    chars.forEach((c) => {
      (c.systems && c.systems.length ? c.systems : [c.system]).forEach((sys) => {
        if (sys) unique.add(sys);
      });
    });
    return Array.from(unique).sort((a, b) => systemLabel(a).localeCompare(systemLabel(b), "pt-BR"));
  }, [chars]);

  const filteredChars = useMemo(() => {
    const normalizedCharacter = normalizeText(characterFilter);
    const normalizedOwner = normalizeText(ownerFilter);
    return chars.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (systemFilter !== "all") {
        const systems = c.systems && c.systems.length ? c.systems : [c.system];
        if (!systems.includes(systemFilter)) return false;
      }
      if (normalizedCharacter && !normalizeText(c.name).includes(normalizedCharacter)) return false;
      if (normalizedOwner) {
        const ownerSearch = normalizeText(`${c.owner_name || ""} ${c.owner_email || ""}`);
        if (!ownerSearch || !ownerSearch.includes(normalizedOwner)) return false;
      }
      return true;
    });
  }, [chars, characterFilter, ownerFilter, systemFilter, kindFilter]);

  const hasActiveFilters =
    normalizeText(characterFilter).length > 0 ||
    normalizeText(ownerFilter).length > 0 ||
    systemFilter !== "all" ||
    kindFilter !== "all";

  const active = useMemo(
    () => filteredChars.find((c) => c.id === activeId) || null,
    [filteredChars, activeId]
  );

  useEffect(() => {
    if (filteredChars.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const stillVisible = filteredChars.some((c) => c.id === activeId);
    if (!stillVisible) setActiveId(filteredChars[0].id);
  }, [filteredChars, activeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        const list = await api<GMCharacter[]>("/api/gm/characters");
        if (cancelled) return;
        setChars(Array.isArray(list) ? list : []);
        setActiveId((Array.isArray(list) && list[0]?.id) || null);
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          typeof e?.message === "string"
            ? e.message
            : typeof e === "string"
              ? e
              : typeof e?.body?.detail === "string"
                ? e.body.detail
                : "Falha ao carregar personagens";
        setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function systemLabel(sys: string) {
    if (sys === "candela_obscura") return "Candela Obscura";
    if (sys === "simplificado") return "Simplificado";
    return sys || "—";
  }

  function systemsLabel(systems?: string[]) {
    const list = (systems || []).filter(Boolean);
    if (!list.length) return "—";
    return list.map(systemLabel).join(", ");
  }

  async function refetchChars() {
    try {
      const list = await api<GMCharacter[]>("/api/gm/characters");
      setChars(Array.isArray(list) ? list : []);
    } catch {
      // keep current list
    }
  }

  async function convertToNpc(c: GMCharacter) {
    const ok = window.confirm(
      `Transformar "${c.name}" em NPC?\n\nO personagem deixará de ter dono (jogador) e passará a ser do mestre.`
    );
    if (!ok) return;
    setErr(null);
    setConvertingId(c.id);
    try {
      await api(`/api/gm/characters/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: c.name || "",
          concept: c.concept ?? "",
          backstory: c.backstory ?? "",
          notes: c.notes ?? "",
          kind: "NPC",
        }),
      });
      await refetchChars();
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : "Falha ao transformar em NPC";
      setErr(msg);
    } finally {
      setConvertingId(null);
    }
  }

  function openAssignModal() {
    setErr(null);
    setAssignErr(null);
    setPlayers([]);
    setAssignModalOpen(true);
    setAssignLoading(true);
    api<Array<{ id: number; email: string; name: string }>>("/api/gm/characters/players")
      .then((list) => setPlayers(Array.isArray(list) ? list : []))
      .catch((e: any) => {
        const status = typeof e?.status === "number" ? ` (${e.status})` : "";
        const detail = typeof e?.body?.detail === "string" ? `: ${e.body.detail}` : "";
        const fallback =
          typeof e?.message === "string" && e.message.trim()
            ? e.message
            : "Falha ao carregar jogadores";
        const detailed = `Falha ao carregar jogadores${status}${detail}`;
        setAssignErr(detailed === "Falha ao carregar jogadores" ? fallback : detailed);
      })
      .finally(() => setAssignLoading(false));
  }

  async function assignToPlayer(c: GMCharacter, ownerUserId: number) {
    setErr(null);
    setConvertingId(c.id);
    try {
      await api(`/api/gm/characters/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: c.name || "",
          concept: c.concept ?? "",
          backstory: c.backstory ?? "",
          notes: c.notes ?? "",
          kind: "PC",
          owner_user_id: ownerUserId,
        }),
      });
      setAssignModalOpen(false);
      await refetchChars();
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : "Falha ao atribuir ao jogador";
      setErr(msg);
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="select-scene">
      <div className="select-grid">
        <section className="ui-card select-col select-col--list">
          <div className="select-head">
            <h2 className="select-title">Personagens</h2>
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
              <input
                className="ui-field"
                type="text"
                placeholder="Buscar personagem"
                value={characterFilter}
                onChange={(e) => setCharacterFilter(e.target.value)}
              />
              <input
                className="ui-field"
                type="text"
                placeholder="Buscar jogador"
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
              />
              <select className="ui-field" value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
                <option value="all">Todos os sistemas</option>
                {availableSystems.map((sys) => (
                  <option key={sys} value={sys}>
                    {systemLabel(sys)}
                  </option>
                ))}
              </select>
              <select
                className="ui-field"
                value={kindFilter}
                onChange={(e) => setKindFilter((e.target.value as "all" | "PC" | "NPC") || "all")}
              >
                <option value="all">Todos os tipos</option>
                <option value="PC">PC</option>
                <option value="NPC">NPC</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="select-muted">Carregando…</div>
          ) : filteredChars.length === 0 ? (
            <div className="select-muted">
              {hasActiveFilters ? "Nenhum personagem encontrado com os filtros atuais." : "Nenhum personagem encontrado."}
            </div>
          ) : chars.length === 0 ? (
            <div className="select-muted">Nenhum personagem encontrado.</div>
          ) : (
            <div className="select-list">
              {filteredChars.map((c) => {
                const isActive = c.id === activeId;
                const kindLabel = c.kind === "NPC" ? "NPC" : "PC";
                const ownerLabel = c.owner_name ? `${c.owner_name}${c.owner_email ? ` (${c.owner_email})` : ""}` : c.owner_email;
                return (
                  <button
                    key={c.id}
                    className={`select-item ${isActive ? "is-active" : ""}`}
                    onClick={() => setActiveId(c.id)}
                    type="button"
                  >
                    <div className="select-item-name">
                      <span className="select-item-badge" title={kindLabel === "NPC" ? "Personagem do mestre" : "Personagem de jogador"}>
                        {kindLabel}
                      </span>
                      {c.name}
                      {ownerLabel != null && ownerLabel !== "" && (
                        <span className="select-item-owner"> ({ownerLabel})</span>
                      )}
                    </div>
                    <div className="select-item-sub">
                      {systemsLabel(c.systems || [c.system])}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="select-footer" style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button className="ui-btn ui-btn--ghost" onClick={onBack} type="button">
              Voltar
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ui-btn"
                onClick={() => onCreate?.()}
                type="button"
                disabled={!onCreate}
                title={!onCreate ? "Criação não disponível" : "Novo personagem de jogador (PC)"}
              >
                Criar (PC)
              </button>
              <button
                className="ui-btn ui-btn--ghost"
                onClick={() => onCreateNpc?.()}
                type="button"
                disabled={!onCreateNpc}
                title={!onCreateNpc ? "Criação não disponível" : "Novo personagem do mestre (NPC)"}
              >
                Novo NPC
              </button>
            </div>
          </div>

          {err && <div className="select-error">{err}</div>}
        </section>

        <section className="ui-card select-col select-col--book">
          <h2 className="select-title">Ficha</h2>

          {!active ? (
            <div className="select-muted">Selecione um personagem.</div>
          ) : (
            <div className="book">
              <div className="book-page">
                <div className="book-portrait">
                  <img className="book-portrait__img" src={getAvatarUrl(active ?? undefined)} alt="" />
                </div>

                <div className="book-content">
                  <div className="book-row">
                    <div className="book-label">Nome</div>
                    <div className="book-value">{active.name || "—"}</div>
                  </div>

                  <div className="book-row">
                    <div className="book-label">Dono</div>
                    <div className="book-value">{active.owner_email || "—"}</div>
                  </div>

                  <div className="book-row">
                    <div className="book-label">Conceito</div>
                    <div className="book-value">{active.concept || "—"}</div>
                  </div>

                  <div className="book-row">
                    <div className="book-label">Backstory</div>
                    <div className="book-value book-multiline">{active.backstory || "—"}</div>
                  </div>

                  <div className="book-row">
                    <div className="book-label">Notas</div>
                    <div className="book-value book-multiline">{active.notes || "—"}</div>
                  </div>

                  <div className="book-row">
                    <div className="book-label">Sistemas</div>
                    <div className="book-value">{systemsLabel(active.systems || [active.system])}</div>
                  </div>
                </div>
              </div>

              <div className="select-actions" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  className="ui-btn ui-btn--ghost"
                  onClick={() => active && onEdit?.(active)}
                  disabled={!active || !onEdit}
                  title={!onEdit ? "Edição não disponível" : ""}
                  type="button"
                >
                  Editar
                </button>

                {active?.kind === "PC" && (
                  <button
                    className="ui-btn ui-btn--ghost"
                    onClick={() => active && convertToNpc(active)}
                    disabled={!active || convertingId === active?.id}
                    type="button"
                    title="Transformar em personagem do mestre (NPC)"
                  >
                    {convertingId === active?.id ? "Convertendo…" : "Transformar em NPC"}
                  </button>
                )}

                {active?.kind === "NPC" && (
                  <button
                    className="ui-btn ui-btn--ghost"
                    onClick={openAssignModal}
                    disabled={!active || convertingId === active?.id}
                    type="button"
                    title="Atribuir este personagem a um jogador (transformar em PC)"
                  >
                    {convertingId === active?.id ? "Atribuindo…" : "Atribuir a jogador"}
                  </button>
                )}

                <button
                  className="ui-btn ui-btn--ghost"
                  onClick={() => active && deleteCharacter(active)}
                  disabled={!active || deletingId === active?.id}
                  type="button"
                  title={!active ? "Selecione um personagem" : ""}
                >
                  {deletingId === active?.id ? "Apagando..." : "Apagar"}
                </button>
              </div>

              {assignModalOpen && active?.kind === "NPC" && (
                <div className="gm-characters-assign-overlay" role="dialog" aria-modal="true" aria-label="Atribuir a jogador">
                  <div className="gm-characters-assign-modal">
                    <h3 className="gm-characters-assign-title">Atribuir &quot;{active.name}&quot; a um jogador</h3>
                    <p className="gm-characters-assign-desc">O personagem passará a ser um PC desse jogador.</p>
                    {assignLoading ? (
                      <div className="select-muted">Carregando jogadores…</div>
                    ) : assignErr ? (
                      <div className="select-error">{assignErr}</div>
                    ) : players.length === 0 ? (
                      <div className="select-muted">Nenhum jogador cadastrado.</div>
                    ) : (
                      <ul className="gm-characters-assign-list">
                        {players.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="ui-btn ui-btn--ghost"
                              onClick={() => assignToPlayer(active, p.id)}
                              disabled={convertingId === active.id}
                            >
                              {p.name || p.email} {p.email && <span className="gm-characters-assign-email">({p.email})</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost"
                      onClick={() => setAssignModalOpen(false)}
                      style={{ marginTop: 12 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
