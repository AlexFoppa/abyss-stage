export type Role = { id: number; name: string; description?: string };
export type Specialty = {
  id: number;
  name: string;
  role_id?: number | null;
  description?: string;
  image_storage_key?: string;
};

export type CandelaAction = {
  action_key:
    | "MOVER"
    | "ATACAR"
    | "CONTROLAR"
    | "INFLUENCIAR"
    | "LER"
    | "ESCONDER"
    | "AVALIAR"
    | "FOCAR"
    | "SENTIR";
  rating: number; // 0..3
  gilded: boolean;
};

export type CandelaGroupKey = "VIGOR" | "ASTUCIA" | "INTUICAO";

export type CandelaGroupState = {
  group_key: CandelaGroupKey;
  drive_current: number; // 0..9
  drive_max: number; // 0..9
  resist_current: number; // 0..3
  resist_max: number; // 0..3
};

export type CandelaMark = {
  mark_key: "CORPO" | "MENTE" | "SANGRIA";
  current: number; // 0..3
  max: number; // 0..3
};

export type CandelaScar = {
  id?: number;
  mark_key: "CORPO" | "MENTE" | "SANGRIA";
  description: string;
};

export type CandelaListItem = { id?: number; text: string };

export type CandelaPower = { id: number; name: string; description?: string };
export type CandelaAbility = { id: number; name: string; description: string };

export type CandelaDraft = {
  pronouns: string;
  circle: string;
  style: string;
  catalyst: string;
  question: string;

  actions: CandelaAction[];
  group_state: CandelaGroupState[];
  marks: CandelaMark[];
  scars: CandelaScar[];

  relations: CandelaListItem[];
  equipment: CandelaListItem[];
  illumination_keys: CandelaListItem[];

  // picks obrigatórios no BE
  role_power_ids: number[];
  specialty_power_id: number | null;

  // picks obrigatórios no BE (min 2), mas permite extras
  ability_ids: number[];
};

const ACTIONS: CandelaAction["action_key"][] = [
  "MOVER",
  "ATACAR",
  "CONTROLAR",
  "INFLUENCIAR",
  "LER",
  "ESCONDER",
  "AVALIAR",
  "FOCAR",
  "SENTIR",
];

function clampInt(v: number, min: number, max: number) {
  const n = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.min(max, Math.max(min, n));
}

function capFirst(s: string) {
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function CandelaObscuraForm({
  loading,
  roles,
  specialties,
  roleId,
  setRoleId,
  specialtyId,
  setSpecialtyId,

  draft,
  setDraft,

  rolePowers,
  specialtyPower,
  roleAbilities,
  specialtyAbilities,
}: {
  loading: boolean;
  roles: Role[];
  specialties: Specialty[];
  roleId: number | "";
  setRoleId: (v: number | "") => void;
  specialtyId: number | "";
  setSpecialtyId: (v: number | "") => void;

  draft: CandelaDraft;
  setDraft: (updater: (prev: CandelaDraft) => CandelaDraft) => void;

  rolePowers: CandelaPower[];
  specialtyPower: CandelaPower | null;

  roleAbilities: CandelaAbility[];
  specialtyAbilities: CandelaAbility[];
}) {
  const toggleRolePower = (id: number) => {
    setDraft((prev) => {
      const has = prev.role_power_ids.includes(id);
      return {
        ...prev,
        role_power_ids: has
          ? prev.role_power_ids.filter((x) => x !== id)
          : [...prev.role_power_ids, id],
      };
    });
  };

  const toggleAbility = (id: number) => {
    setDraft((prev) => {
      const has = prev.ability_ids.includes(id);
      return {
        ...prev,
        ability_ids: has ? prev.ability_ids.filter((x) => x !== id) : [...prev.ability_ids, id],
      };
    });
  };

  const setActionRating = (action_key: CandelaAction["action_key"], rating: number) => {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.map((a) =>
        a.action_key === action_key ? { ...a, rating: clampInt(rating, 0, 3) } : a
      ),
    }));
  };

  const toggleActionGilded = (action_key: CandelaAction["action_key"]) => {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.map((a) =>
        a.action_key === action_key ? { ...a, gilded: !a.gilded } : a
      ),
    }));
  };

  const setGroup = (group_key: CandelaGroupKey, patch: Partial<CandelaGroupState>) => {
    setDraft((prev) => ({
      ...prev,
      group_state: prev.group_state.map((g) =>
        g.group_key === group_key
          ? {
              ...g,
              drive_current: patch.drive_current ?? g.drive_current,
              drive_max: patch.drive_max ?? g.drive_max,
              resist_current: patch.resist_current ?? g.resist_current,
              resist_max: patch.resist_max ?? g.resist_max,
            }
          : g
      ),
    }));
  };

  const setMark = (mark_key: CandelaMark["mark_key"], patch: Partial<CandelaMark>) => {
    setDraft((prev) => ({
      ...prev,
      marks: prev.marks.map((m) =>
        m.mark_key === mark_key
          ? {
              ...m,
              current: patch.current ?? m.current,
              max: patch.max ?? m.max,
            }
          : m
      ),
    }));
  };

  const addListItem = (key: "relations" | "equipment" | "illumination_keys") => {
    setDraft((prev) => ({ ...prev, [key]: [...prev[key], { text: "" }] }));
  };

  const setListItemText = (
    key: "relations" | "equipment" | "illumination_keys",
    idx: number,
    text: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].map((it, i) => (i === idx ? { ...it, text } : it)),
    }));
  };

  const removeListItem = (key: "relations" | "equipment" | "illumination_keys", idx: number) => {
    setDraft((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  };

  const addScar = () => {
    setDraft((prev) => ({ ...prev, scars: [...prev.scars, { mark_key: "CORPO", description: "" }] }));
  };

  const setScar = (idx: number, patch: Partial<CandelaScar>) => {
    setDraft((prev) => ({
      ...prev,
      scars: prev.scars.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const removeScar = (idx: number) => {
    setDraft((prev) => ({ ...prev, scars: prev.scars.filter((_, i) => i !== idx) }));
  };

  return (
    <>
      <h2 className="create-title">Ficha do Sistema — Candela Obscura</h2>

      <div className="candela-grid-2">
        <label className="ui-label">
          <span>Papel</span>
          <select
            className="ui-field"
            value={roleId}
            onChange={(e) => setRoleId(Number(e.target.value) || "")}
            disabled={loading}
          >
            <option value="">{loading ? "Carregando…" : "Selecione…"}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-label">
          <span>Especialidade</span>
          <select
            className="ui-field"
            value={specialtyId}
            onChange={(e) => setSpecialtyId(Number(e.target.value) || "")}
            disabled={loading || roleId === ""}
          >
            <option value="">{loading ? "Carregando…" : "Selecione…"}</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-label">
          <span>Pronomes</span>
          <input
            className="ui-field"
            value={draft.pronouns}
            onChange={(e) => setDraft((p) => ({ ...p, pronouns: e.target.value }))}
            disabled={loading}
          />
        </label>

        <label className="ui-label">
          <span>Círculo</span>
          <input
            className="ui-field"
            value={draft.circle}
            onChange={(e) => setDraft((p) => ({ ...p, circle: e.target.value }))}
            disabled={loading}
          />
        </label>
      </div>

      <label className="ui-label">
        <span>Estilo</span>
        <input
          className="ui-field"
          value={draft.style}
          onChange={(e) => setDraft((p) => ({ ...p, style: e.target.value }))}
          disabled={loading}
        />
      </label>

      <label className="ui-label">
        <span>Estopim</span>
        <input
          className="ui-field"
          value={draft.catalyst}
          onChange={(e) => setDraft((p) => ({ ...p, catalyst: e.target.value }))}
          disabled={loading}
        />
      </label>

      <label className="ui-label">
        <span>Pergunta</span>
        <input
          className="ui-field"
          value={draft.question}
          onChange={(e) => setDraft((p) => ({ ...p, question: e.target.value }))}
          disabled={loading}
        />
      </label>

      {/* Actions */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Ações
      </div>
      {ACTIONS.map((ak) => {
        const row = draft.actions.find((a) => a.action_key === ak);
        const rating = row?.rating ?? 0;
        const gilded = row?.gilded ?? false;
        return (
          <div key={ak} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", gap: 8, marginBottom: 8 }}>
            <div className="select-muted" style={{ alignSelf: "center" }}>
              {capFirst(ak)}
            </div>
            <input
              className="ui-field"
              type="number"
              min={0}
              max={3}
              value={rating}
              onChange={(e) => setActionRating(ak, Number(e.target.value))}
              disabled={loading}
            />
            <label className="select-muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={gilded}
                onChange={() => toggleActionGilded(ak)}
                disabled={loading}
              />
              Dourada
            </label>
          </div>
        );
      })}

      {/* Drives/Resist */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Motivações e Resistências
      </div>
      {draft.group_state.map((g) => (
        <div key={g.group_key} style={{ marginBottom: 10 }}>
          <div className="select-muted" style={{ marginBottom: 6 }}>
            {g.group_key}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="ui-label">
              <span>Motivação (atual)</span>
              <input
                className="ui-field"
                type="number"
                min={0}
                max={9}
                value={g.drive_current}
                onChange={(e) => setGroup(g.group_key, { drive_current: clampInt(Number(e.target.value), 0, 9) })}
                disabled={loading}
              />
            </label>
            <label className="ui-label">
              <span>Motivação (máx)</span>
              <input
                className="ui-field"
                type="number"
                min={0}
                max={9}
                value={g.drive_max}
                onChange={(e) => setGroup(g.group_key, { drive_max: clampInt(Number(e.target.value), 0, 9) })}
                disabled={loading}
              />
            </label>

            <label className="ui-label">
              <span>Resistência (atual)</span>
              <input
                className="ui-field"
                type="number"
                min={0}
                max={3}
                value={g.resist_current}
                onChange={(e) =>
                  setGroup(g.group_key, { resist_current: clampInt(Number(e.target.value), 0, 3) })
                }
                disabled={loading}
              />
            </label>
            <label className="ui-label">
              <span>Resistência (máx)</span>
              <input
                className="ui-field"
                type="number"
                min={0}
                max={3}
                value={g.resist_max}
                onChange={(e) =>
                  setGroup(g.group_key, { resist_max: clampInt(Number(e.target.value), 0, 3) })
                }
                disabled={loading}
              />
            </label>
          </div>
        </div>
      ))}

      {/* Marks */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Marcas
      </div>
      {draft.marks.map((m) => (
        <div key={m.mark_key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <label className="ui-label">
            <span>{m.mark_key} (atual)</span>
            <input
              className="ui-field"
              type="number"
              min={0}
              max={3}
              value={m.current}
              onChange={(e) => setMark(m.mark_key, { current: clampInt(Number(e.target.value), 0, 3) })}
              disabled={loading}
            />
          </label>
          <label className="ui-label">
            <span>{m.mark_key} (máx)</span>
            <input
              className="ui-field"
              type="number"
              min={0}
              max={3}
              value={m.max}
              onChange={(e) => setMark(m.mark_key, { max: clampInt(Number(e.target.value), 0, 3) })}
              disabled={loading}
            />
          </label>
        </div>
      ))}

      {/* Scars */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Cicatrizes</span>
        <button className="ui-btn ui-btn--ghost" type="button" onClick={addScar} disabled={loading}>
          + Adicionar
        </button>
      </div>
      {draft.scars.map((s, idx) => (
        <div key={idx} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8, marginTop: 8 }}>
          <label className="ui-label">
            <span>Tipo</span>
            <select
              className="ui-field"
              value={s.mark_key}
              onChange={(e) => setScar(idx, { mark_key: e.target.value as any })}
              disabled={loading}
            >
              <option value="CORPO">CORPO</option>
              <option value="MENTE">MENTE</option>
              <option value="SANGRIA">SANGRIA</option>
            </select>
          </label>
          <label className="ui-label">
            <span>Descrição</span>
            <input
              className="ui-field"
              value={s.description}
              onChange={(e) => setScar(idx, { description: e.target.value })}
              disabled={loading}
            />
          </label>
          <button className="ui-btn ui-btn--ghost" type="button" onClick={() => removeScar(idx)} disabled={loading}>
            Remover
          </button>
        </div>
      ))}

      {/* Powers */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Poderes do Papel (escolha livre)
      </div>
      {rolePowers.length ? (
        rolePowers.map((p) => (
          <label key={p.id} className="select-muted" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={draft.role_power_ids.includes(p.id)}
              onChange={() => toggleRolePower(p.id)}
              disabled={loading}
            />
            <span>
              {p.name}
              {p.description ? <span style={{ opacity: 0.8 }}> — {p.description}</span> : null}
            </span>
          </label>
        ))
      ) : (
        <div className="select-muted">Selecione um papel para carregar poderes.</div>
      )}

      <div style={{ marginTop: 10 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Poder da Especialidade (1)
      </div>
      <div className="select-muted" style={{ marginBottom: 10 }}>
        {specialtyPower
          ? `${specialtyPower.name}${specialtyPower.description ? ` — ${specialtyPower.description}` : ""}`
          : specialtyId === ""
            ? "Selecione uma especialidade."
            : "Carregando poder da especialidade…"}
      </div>

      {/* Abilities */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Habilidades (obrigatório: pelo menos 1 do papel e 1 da especialidade; pode marcar extras)
      </div>

      <div className="select-muted" style={{ marginTop: 8, marginBottom: 6 }}>
        Do Papel
      </div>
      {roleAbilities.length ? (
        roleAbilities.map((a) => (
          <label key={a.id} className="select-muted" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={draft.ability_ids.includes(a.id)}
              onChange={() => toggleAbility(a.id)}
              disabled={loading}
            />
            <span>
              {a.name}
              {a.description ? <span style={{ opacity: 0.8 }}> — {a.description}</span> : null}
            </span>
          </label>
        ))
      ) : (
        <div className="select-muted">Selecione um papel para carregar habilidades.</div>
      )}

      <div className="select-muted" style={{ marginTop: 10, marginBottom: 6 }}>
        Da Especialidade
      </div>
      {specialtyAbilities.length ? (
        specialtyAbilities.map((a) => (
          <label key={a.id} className="select-muted" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={draft.ability_ids.includes(a.id)}
              onChange={() => toggleAbility(a.id)}
              disabled={loading}
            />
            <span>
              {a.name}
              {a.description ? <span style={{ opacity: 0.8 }}> — {a.description}</span> : null}
            </span>
          </label>
        ))
      ) : (
        <div className="select-muted">Selecione uma especialidade para carregar habilidades.</div>
      )}

      {/* Lists */}
      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Relações
      </div>
      {draft.relations.map((it, idx) => (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, marginBottom: 8 }}>
          <input
            className="ui-field"
            value={it.text}
            onChange={(e) => setListItemText("relations", idx, e.target.value)}
            disabled={loading}
          />
          <button className="ui-btn ui-btn--ghost" type="button" onClick={() => removeListItem("relations", idx)} disabled={loading}>
            Remover
          </button>
        </div>
      ))}
      <button className="ui-btn ui-btn--ghost" type="button" onClick={() => addListItem("relations")} disabled={loading}>
        + Adicionar relação
      </button>

      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Equipamentos
      </div>
      {draft.equipment.map((it, idx) => (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, marginBottom: 8 }}>
          <input
            className="ui-field"
            value={it.text}
            onChange={(e) => setListItemText("equipment", idx, e.target.value)}
            disabled={loading}
          />
          <button className="ui-btn ui-btn--ghost" type="button" onClick={() => removeListItem("equipment", idx)} disabled={loading}>
            Remover
          </button>
        </div>
      ))}
      <button className="ui-btn ui-btn--ghost" type="button" onClick={() => addListItem("equipment")} disabled={loading}>
        + Adicionar equipamento
      </button>

      <div style={{ marginTop: 12 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Chaves de Iluminação
      </div>
      {draft.illumination_keys.map((it, idx) => (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, marginBottom: 8 }}>
          <input
            className="ui-field"
            value={it.text}
            onChange={(e) => setListItemText("illumination_keys", idx, e.target.value)}
            disabled={loading}
          />
          <button className="ui-btn ui-btn--ghost" type="button" onClick={() => removeListItem("illumination_keys", idx)} disabled={loading}>
            Remover
          </button>
        </div>
      ))}
      <button className="ui-btn ui-btn--ghost" type="button" onClick={() => addListItem("illumination_keys")} disabled={loading}>
        + Adicionar chave
      </button>
    </>
  );
}
