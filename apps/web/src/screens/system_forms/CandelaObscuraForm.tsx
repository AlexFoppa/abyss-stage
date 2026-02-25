import { useEffect, useMemo, useRef } from "react";

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
  rating: number; // 0..3 (mas na criação limitamos a 2)
  gilded: boolean;
};

export type CandelaGroupKey = "VIGOR" | "ASTUCIA" | "INTUICAO";

export type CandelaGroupState = {
  group_key: CandelaGroupKey;
  drive_current: number; // mantido por contrato, mas UI edita só o max
  drive_max: number;
  resist_current: number; // calculado a partir do drive_max
  resist_max: number; // calculado a partir do drive_max
};

export type CandelaMark = {
  mark_key: "CORPO" | "MENTE" | "SANGRIA";
  current: number;
  max: number;
};

export type CandelaScar = {
  id?: number;
  mark_key: "CORPO" | "MENTE" | "SANGRIA";
  description: string;
};

export type CandelaListItem = { id?: number; text: string };
export type CandelaAbility = { id: number; name: string; description: string };

export type CandelaDraft = {
  pronouns: string;
  circle: string;
  style: string;
  catalyst: string;
  question: string;

  actions: CandelaAction[];
  group_state: CandelaGroupState[];
  marks: CandelaMark[]; // mantido por contrato, mas removido da UI
  scars: CandelaScar[];

  relations: CandelaListItem[];
  equipment: CandelaListItem[];
  illumination_keys: CandelaListItem[];
  ability_ids: number[]; // UI força exatamente 2 (1 role + 1 specialty)
};

type Mode = "create" | "edit";

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

const ACTION_GROUPS: { key: CandelaGroupKey; actions: CandelaAction["action_key"][] }[] = [
  { key: "VIGOR", actions: ["MOVER", "ATACAR", "CONTROLAR"] },
  { key: "ASTUCIA", actions: ["INFLUENCIAR", "LER", "ESCONDER"] },
  { key: "INTUICAO", actions: ["AVALIAR", "FOCAR", "SENTIR"] },
];

function clampInt(v: number, min: number, max: number) {
  const n = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.min(max, Math.max(min, n));
}

function capFirst(s: string) {
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Regra: 1 resistência a cada bloco de 3 pontos de motivação (max)
// Ex.: 4 => 1; 6 => 2; 1 => 0
function resistFromDriveMax(driveMax: number) {
  return Math.floor(clampInt(driveMax, 0, 9) / 3);
}

function RatingDots({
  value,
  max = 3,
  onChange,
  disabled,
}: {
  value: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="candela-dots">
      {Array.from({ length: max }).map((_, i) => {
        const dotValue = i + 1;
        const filled = dotValue <= value;
        return (
          <button
            key={i}
            type="button"
            className={`candela-dot ${filled ? "filled" : ""}`}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              // permite “desmarcar”: clicar no mesmo valor reduz 1 (clicar no 1 vira 0)
              const next = value === dotValue ? i : dotValue;
              onChange(next);
            }}
          />
        );
      })}
    </div>
  );
}

type Baseline = {
  actionBase: Record<CandelaAction["action_key"], { rating: number; gilded: boolean }>;
  driveBase: Record<CandelaGroupKey, number>;
  gildedDefaultKeys: Set<CandelaAction["action_key"]>;
};

export function CandelaObscuraForm({
  mode,
  loading,
  roles,
  specialties,
  roleId,
  setRoleId,
  specialtyId,
  setSpecialtyId,
  draft,
  setDraft,
  roleAbilities,
  specialtyAbilities,
}: {
  mode: Mode;
  loading: boolean;
  roles: Role[];
  specialties: Specialty[];
  roleId: number | "";
  setRoleId: (v: number | "") => void;
  specialtyId: number | "";
  setSpecialtyId: (v: number | "") => void;
  draft: CandelaDraft;
  setDraft: (updater: (prev: CandelaDraft) => CandelaDraft) => void;
  roleAbilities: CandelaAbility[];
  specialtyAbilities: CandelaAbility[];
}) {
  // baseline: valores “default” vindos do BE (bloqueiam remoção na criação)
  const baselineRef = useRef<Baseline | null>(null);

  // quando troca specialty, a baseline muda (defaults do BE mudam)
  useEffect(() => {
    if (mode !== "create") return;
    baselineRef.current = null;
  }, [mode, specialtyId]);

  const baseline = useMemo(() => {
    if (mode !== "create") return null;

    if (baselineRef.current) return baselineRef.current;

    const actionBase: Baseline["actionBase"] = {} as any;
    const gildedDefaultKeys = new Set<CandelaAction["action_key"]>();

    for (const ak of ACTIONS) {
      const a = draft.actions.find((x) => x.action_key === ak);
      const rating = clampInt(a?.rating ?? 0, 0, 2); // baseline de criação é no máx 2
      const gilded = !!a?.gilded;
      actionBase[ak] = { rating, gilded };
      if (gilded) gildedDefaultKeys.add(ak);
    }

    const driveBase: Baseline["driveBase"] = {
      VIGOR: clampInt(draft.group_state.find((g) => g.group_key === "VIGOR")?.drive_max ?? 0, 0, 9),
      ASTUCIA: clampInt(draft.group_state.find((g) => g.group_key === "ASTUCIA")?.drive_max ?? 0, 0, 9),
      INTUICAO: clampInt(draft.group_state.find((g) => g.group_key === "INTUICAO")?.drive_max ?? 0, 0, 9),
    };

    baselineRef.current = { actionBase, driveBase, gildedDefaultKeys };
    return baselineRef.current;
  }, [mode, draft.actions, draft.group_state]);

  // -------------------------
  // Pontos (CRIAÇÃO)
  // -------------------------
  const actionPointsTotal = 4; // 1 ponto em ação que era 0 + 3 pontos livres
  const drivePointsTotal = 6;

  const actionPointsSpent = useMemo(() => {
    if (mode !== "create" || !baseline) return 0;
    return ACTIONS.reduce((sum, ak) => {
      const cur = clampInt(draft.actions.find((a) => a.action_key === ak)?.rating ?? 0, 0, 2);
      const base = baseline.actionBase[ak]?.rating ?? 0;
      return sum + Math.max(0, cur - base);
    }, 0);
  }, [mode, baseline, draft.actions]);

  const actionPointsLeft = Math.max(0, actionPointsTotal - actionPointsSpent);

  const hasBumpedAZeroAction = useMemo(() => {
    if (mode !== "create" || !baseline) return true;
    return ACTIONS.some((ak) => {
      const base = baseline.actionBase[ak]?.rating ?? 0;
      if (base !== 0) return false;
      const cur = clampInt(draft.actions.find((a) => a.action_key === ak)?.rating ?? 0, 0, 2);
      return cur >= 1;
    });
  }, [mode, baseline, draft.actions]);

  const drivePointsSpent = useMemo(() => {
    if (mode !== "create" || !baseline) return 0;
    return (["VIGOR", "ASTUCIA", "INTUICAO"] as CandelaGroupKey[]).reduce((sum, gk) => {
      const cur = clampInt(draft.group_state.find((g) => g.group_key === gk)?.drive_max ?? 0, 0, 9);
      const base = baseline.driveBase[gk] ?? 0;
      return sum + Math.max(0, cur - base);
    }, 0);
  }, [mode, baseline, draft.group_state]);

  const drivePointsLeft = Math.max(0, drivePointsTotal - drivePointsSpent);

  // gilded: defaults do BE + 1 escolha extra
  const maxGilded = useMemo(() => {
    if (mode !== "create" || !baseline) return 99;
    return baseline.gildedDefaultKeys.size + 1;
  }, [mode, baseline]);

  const gildedCount = useMemo(() => {
    return draft.actions.reduce((sum, a) => sum + (a.gilded ? 1 : 0), 0);
  }, [draft.actions]);

  // -------------------------
  // Setters com regras
  // -------------------------
  const setActionRating = (action_key: CandelaAction["action_key"], nextRaw: number) => {
    setDraft((prev) => {
      const nextActions = prev.actions.map((a) => {
        if (a.action_key !== action_key) return a;

        const next = mode === "create" ? clampInt(nextRaw, 0, 2) : clampInt(nextRaw, 0, 3);

        if (mode !== "create" || !baseline) return { ...a, rating: next };

        const base = baseline.actionBase[action_key]?.rating ?? 0;
        const current = clampInt(a.rating ?? 0, 0, 2);

        // não permite remover default
        const lockedNext = Math.max(base, next);

        const currentDelta = Math.max(0, current - base);
        const nextDelta = Math.max(0, lockedNext - base);
        const additional = nextDelta - currentDelta;

        // bloqueia se não tem pontos
        if (additional > 0 && additional > actionPointsLeft) return a;

        return { ...a, rating: lockedNext };
      });

      return { ...prev, actions: nextActions };
    });
  };

  const toggleActionGilded = (action_key: CandelaAction["action_key"]) => {
    setDraft((prev) => {
      if (mode !== "create" || !baseline) {
        return {
          ...prev,
          actions: prev.actions.map((a) =>
            a.action_key === action_key ? { ...a, gilded: !a.gilded } : a
          ),
        };
      }

      // defaults do BE não podem ser alterados
      if (baseline.gildedDefaultKeys.has(action_key)) return prev;

      const isCurrentlyGilded = !!prev.actions.find((a) => a.action_key === action_key)?.gilded;

      // se vai ligar, garante apenas 1 extra (desliga outras extras)
      if (!isCurrentlyGilded && gildedCount >= maxGilded) {
        // já tem a extra escolhida (além dos defaults) => força trocar: desliga outras extras
        const turnedOffOthers = prev.actions.map((a) => {
          if (!a.gilded) return a;
          if (baseline.gildedDefaultKeys.has(a.action_key)) return a; // mantém default
          return { ...a, gilded: false }; // remove extra atual
        });

        const nextActions = turnedOffOthers.map((a) =>
          a.action_key === action_key ? { ...a, gilded: true } : a
        );

        return { ...prev, actions: nextActions };
      }

      // se está ligando e ainda tem espaço => liga e desliga outras extras
      if (!isCurrentlyGilded) {
        const nextActions = prev.actions.map((a) => {
          if (a.action_key === action_key) return { ...a, gilded: true };
          if (!a.gilded) return a;
          if (baseline.gildedDefaultKeys.has(a.action_key)) return a;
          return { ...a, gilded: false };
        });
        return { ...prev, actions: nextActions };
      }

      // se está desligando, pode desligar (exceto default, já bloqueado acima)
      return {
        ...prev,
        actions: prev.actions.map((a) =>
          a.action_key === action_key ? { ...a, gilded: false } : a
        ),
      };
    });
  };

  const setDriveMax = (group_key: CandelaGroupKey, nextRaw: number) => {
    setDraft((prev) => {
      const next = clampInt(nextRaw, 0, 9);

      const nextGroups = prev.group_state.map((g) => {
        if (g.group_key !== group_key) return g;

        if (mode !== "create" || !baseline) {
          const dm = next;
          const r = resistFromDriveMax(dm);
          return {
            ...g,
            drive_max: dm,
            drive_current: dm,
            resist_max: r,
            resist_current: r,
          };
        }

        const base = baseline.driveBase[group_key] ?? 0;
        const current = clampInt(g.drive_max ?? 0, 0, 9);

        const lockedNext = Math.max(base, next);

        const currentDelta = Math.max(0, current - base);
        const nextDelta = Math.max(0, lockedNext - base);
        const additional = nextDelta - currentDelta;

        if (additional > 0 && additional > drivePointsLeft) return g;

        const r = resistFromDriveMax(lockedNext);

        return {
          ...g,
          drive_max: lockedNext,
          drive_current: lockedNext,
          resist_max: r,
          resist_current: r,
        };
      });

      return { ...prev, group_state: nextGroups };
    });
  };

  const selectedRoleAbilityId = useMemo(() => {
    const fromRole = draft.ability_ids.find((id) => roleAbilities.some((a) => a.id === id));
    return fromRole ?? null;
  }, [draft.ability_ids, roleAbilities]);

  const selectedSpecialtyAbilityId = useMemo(() => {
    const fromSpec = draft.ability_ids.find((id) => specialtyAbilities.some((a) => a.id === id));
    return fromSpec ?? null;
  }, [draft.ability_ids, specialtyAbilities]);

  const setRoleAbility = (idOrEmpty: number | null) => {
    setDraft((prev) => {
      const specId = prev.ability_ids.find((id) => specialtyAbilities.some((a) => a.id === id)) ?? null;
      const nextIds = [idOrEmpty, specId].filter((x): x is number => typeof x === "number");
      return { ...prev, ability_ids: nextIds };
    });
  };

  const setSpecialtyAbility = (idOrEmpty: number | null) => {
    setDraft((prev) => {
      const roleIdSel = prev.ability_ids.find((id) => roleAbilities.some((a) => a.id === id)) ?? null;
      const nextIds = [roleIdSel, idOrEmpty].filter((x): x is number => typeof x === "number");
      return { ...prev, ability_ids: nextIds };
    });
  };

  // -------------------------
  // Lists / Scars
  // -------------------------
  const addListItem = (key: "relations" | "equipment" | "illumination_keys") => {
    setDraft((prev) => ({ ...prev, [key]: [...prev[key], { text: "" }] }));
  };

  const setListItemText = (key: "relations" | "equipment" | "illumination_keys", idx: number, text: string) => {
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

  // UI helpers
  const getAction = (ak: CandelaAction["action_key"]) => draft.actions.find((a) => a.action_key === ak);

  const groupDriveMax = (gk: CandelaGroupKey) =>
    clampInt(draft.group_state.find((g) => g.group_key === gk)?.drive_max ?? 0, 0, 9);

  const groupResist = (gk: CandelaGroupKey) => resistFromDriveMax(groupDriveMax(gk));

  return (
    <>
      <h2 className="create-title">Ficha do Sistema — Candela Obscura</h2>

      {/* 2 por linha (Papel, Especialidade, Pronomes, Círculo) */}
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

      {/* AÇÕES */}
      <div className="candela-actions-head">
        <div className="select-muted">Ações</div>
        {mode === "create" ? (
          <div className="select-muted" style={{ textAlign: "right" }}>
            Pontos: {actionPointsSpent}/{actionPointsTotal} (restam {actionPointsLeft}) •{" "}
            {hasBumpedAZeroAction ? "OK: +1 em ação 0" : "Falta: +1 em ação 0"}
            {" • "}Douradas: {gildedCount}/{maxGilded}
          </div>
        ) : null}
      </div>

      <div className="candela-action-groups">
        {ACTION_GROUPS.map((grp) => (
          <div key={grp.key} className="candela-group-card">
            <div className="candela-group-head">
              <div className="select-muted" style={{ fontWeight: 600 }}>
                {capFirst(grp.key)}
              </div>
              <div className="select-muted candela-group-stats" style={{ textAlign: "right" }}>
                <div>Motivação: {groupDriveMax(grp.key)}</div>
                <div>Resistência: {groupResist(grp.key)}</div>
              </div>
            </div>

            {/* Motivação (apenas editável aqui) */}
            <div className="candela-drive-edit">
              <label className="ui-label" style={{ margin: 0 }}>
                <span style={{ opacity: 0.85 }}>Motivação (máx)</span>
                <input
                  className="ui-field"
                  type="number"
                  min={0}
                  max={9}
                  value={groupDriveMax(grp.key)}
                  onChange={(e) => setDriveMax(grp.key, Number(e.target.value))}
                  disabled={loading}
                />
              </label>
            </div>

            {/* Lista de ações do bloco */}
            {grp.actions.map((ak) => {
              const row = getAction(ak);
              const rating = clampInt(row?.rating ?? 0, 0, mode === "create" ? 2 : 3);
              const gilded = !!row?.gilded;

              return (
                <div key={ak} className="candela-action-row">
                  <input
                    type="checkbox"
                    checked={gilded}
                    disabled={
                      loading ||
                      (mode === "create" &&
                        !!baseline &&
                        baseline.gildedDefaultKeys.has(ak)) // default não pode mexer
                    }
                    onChange={() => toggleActionGilded(ak)}
                    title="Dourar"
                  />

                  <div className="select-muted">{capFirst(ak)}</div>

                  <RatingDots
                    value={rating}
                    max={mode === "create" ? 2 : 3}
                    disabled={loading}
                    onChange={(v) => setActionRating(ak, v)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* PONTOS de MOTIVAÇÃO */}
      {mode === "create" ? (
        <div className="select-muted" style={{ marginTop: 10 }}>
          Motivações — Pontos: {drivePointsSpent}/{drivePointsTotal} (restam {drivePointsLeft}). Resistência é calculada (1 a cada 3 pontos).
        </div>
      ) : null}

      {/* HABILIDADES (EXATAMENTE 1 de cada) */}
      <div style={{ marginTop: 14 }} />
      <div className="select-muted" style={{ marginBottom: 6 }}>
        Habilidades (1 do Papel e 1 da Especialidade)
      </div>

      <div className="candela-ability-block">
        <label className="ui-label">
          <span>Do Papel</span>
          <select
            className="ui-field"
            value={selectedRoleAbilityId ?? ""}
            onChange={(e) => setRoleAbility(Number(e.target.value) || null)}
            disabled={loading || !roleAbilities.length}
          >
            <option value="">{!roleAbilities.length ? "Selecione um papel…" : "Selecione…"}</option>
            {roleAbilities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {selectedRoleAbilityId ? (
          <div className="candela-ability-desc">
            <div className="candela-ability-name">
              {(roleAbilities.find((a) => a.id === selectedRoleAbilityId)?.name) ?? ""}
            </div>
            <div className="candela-ability-text">
              {(roleAbilities.find((a) => a.id === selectedRoleAbilityId)?.description) ?? ""}
            </div>
          </div>
        ) : null}
      </div>

      <div className="candela-ability-block">
        <label className="ui-label">
          <span>Da Especialidade</span>
          <select
            className="ui-field"
            value={selectedSpecialtyAbilityId ?? ""}
            onChange={(e) => setSpecialtyAbility(Number(e.target.value) || null)}
            disabled={loading || !specialtyAbilities.length}
          >
            <option value="">{!specialtyAbilities.length ? "Selecione uma especialidade…" : "Selecione…"}</option>
            {specialtyAbilities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {selectedSpecialtyAbilityId ? (
          <div className="candela-ability-desc">
            <div className="candela-ability-name">
              {(specialtyAbilities.find((a) => a.id === selectedSpecialtyAbilityId)?.name) ?? ""}
            </div>
            <div className="candela-ability-text">
              {(specialtyAbilities.find((a) => a.id === selectedSpecialtyAbilityId)?.description) ?? ""}
            </div>
          </div>
        ) : null}
      </div>


      {/* LISTAS */}
      <div style={{ marginTop: 14 }} />
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
          <button
            className="ui-btn ui-btn--ghost"
            type="button"
            onClick={() => removeListItem("relations", idx)}
            disabled={loading}
          >
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
          <button
            className="ui-btn ui-btn--ghost"
            type="button"
            onClick={() => removeListItem("equipment", idx)}
            disabled={loading}
          >
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
          <button
            className="ui-btn ui-btn--ghost"
            type="button"
            onClick={() => removeListItem("illumination_keys", idx)}
            disabled={loading}
          >
            Remover
          </button>
        </div>
      ))}
      <button className="ui-btn ui-btn--ghost" type="button" onClick={() => addListItem("illumination_keys")} disabled={loading}>
        + Adicionar chave
      </button>

      {/* CICATRIZES (no final) */}
      <div style={{ marginTop: 14 }} />
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
    </>
  );
}
