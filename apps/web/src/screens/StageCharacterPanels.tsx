import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

type CharacterBook = {
  id: number;
  name: string;
  concept: string;
  backstory: string;
  notes: string;
};

type CandelaAction = { action_key: string; rating: number; gilded: boolean };
type CandelaGroupState = {
  group_key: string;
  drive_current: number;
  drive_max: number;
  resist_current: number;
  resist_max: number;
};
type CandelaMark = { mark_key: string; current: number; max: number };
type CandelaScar = { id?: number; mark_key: string; description: string };
type CandelaEquipmentItem = { id?: number; text: string; uses_improvisation_slot?: boolean };
type CandelaSheet = {
  role_id: number;
  specialty_id: number;
  actions: CandelaAction[];
  group_state: CandelaGroupState[];
  marks: CandelaMark[];
  scars?: CandelaScar[];
  equipment: CandelaEquipmentItem[];
  ability_ids: number[];
};
type AbilityInfo = { id: number; name: string; description: string };

const ACTION_LABELS: Record<string, string> = {
  MOVER: "Mover",
  ATACAR: "Atacar",
  CONTROLAR: "Controlar",
  INFLUENCIAR: "Influenciar",
  LER: "Ler",
  ESCONDER: "Esconder",
  AVALIAR: "Avaliar",
  FOCAR: "Focar",
  SENTIR: "Sentir",
};
const GROUP_LABELS: Record<string, string> = {
  VIGOR: "Vigor",
  ASTUCIA: "Astúcia",
  INTUICAO: "Intuição",
};
const MARK_LABELS: Record<string, string> = {
  CORPO: "Corpo",
  MENTE: "Mente",
  SANGRIA: "Sangria",
};

function resistFromDrive(drive: number): number {
  return Math.floor(Math.max(0, Math.min(9, Math.trunc(drive))) / 3);
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </svg>
  );
}
function SheetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}
function StatusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function InventoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

const ACTION_GROUPS: { key: keyof typeof GROUP_LABELS; actions: string[] }[] = [
  { key: "ASTUCIA", actions: ["INFLUENCIAR", "LER", "ESCONDER"] },
  { key: "INTUICAO", actions: ["AVALIAR", "FOCAR", "SENTIR"] },
  { key: "VIGOR", actions: ["MOVER", "ATACAR", "CONTROLAR"] },
];

export function StageCharacterBar({
  focusCharacterId,
  panelOpen,
  onDragStart,
  onBook,
  onFicha,
  onStatus,
  onInventory,
}: {
  focusCharacterId: number | null;
  panelOpen: "book" | "ficha" | "status" | "inventory" | null;
  onDragStart?: (e: React.MouseEvent) => void;
  onBook: () => void;
  onFicha: () => void;
  onStatus: () => void;
  onInventory: () => void;
}) {
  const disabled = focusCharacterId == null;
  const handleMouseDown = (e: React.MouseEvent) => {
    onDragStart?.(e);
  };
  return (
    <div className="stage-character-bar stage-character-bar--column" aria-label="Livro, ficha, status e inventário do personagem">
      <button
        type="button"
        className={"stage-character-bar__btn" + (panelOpen === "book" ? " is-active" : "")}
        onMouseDown={handleMouseDown}
        onClick={onBook}
        disabled={disabled}
        title={disabled ? "Selecione um personagem" : "Conceito, backstory e notas — clique ou arraste"}
        aria-label="Abrir livro (conceito e notas)"
      >
        <BookIcon className="stage-character-bar__icon" />
      </button>
      <button
        type="button"
        className={"stage-character-bar__btn" + (panelOpen === "ficha" ? " is-active" : "")}
        onMouseDown={handleMouseDown}
        onClick={onFicha}
        disabled={disabled}
        title={disabled ? "Selecione um personagem" : "Ações e habilidades — clique ou arraste"}
        aria-label="Abrir ficha (ações e habilidades)"
      >
        <SheetIcon className="stage-character-bar__icon" />
      </button>
      <button
        type="button"
        className={"stage-character-bar__btn" + (panelOpen === "status" ? " is-active" : "")}
        onMouseDown={handleMouseDown}
        onClick={onStatus}
        disabled={disabled}
        title={disabled ? "Selecione um personagem" : "Marcas e cicatrizes — clique ou arraste"}
        aria-label="Abrir status (marcas e cicatrizes)"
      >
        <StatusIcon className="stage-character-bar__icon" />
      </button>
      <button
        type="button"
        className={"stage-character-bar__btn" + (panelOpen === "inventory" ? " is-active" : "")}
        onMouseDown={handleMouseDown}
        onClick={onInventory}
        disabled={disabled}
        title={disabled ? "Selecione um personagem" : "Equipamentos — clique ou arraste"}
        aria-label="Abrir inventário (equipamentos)"
      >
        <InventoryIcon className="stage-character-bar__icon" />
      </button>
    </div>
  );
}

export function StageBookPanel({
  characterId,
  isGM,
  onClose,
}: {
  characterId: number;
  isGM: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<CharacterBook | null>(null);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = isGM ? "/api/gm/characters" : "/api/me/characters";

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    api<CharacterBook>(`${base}/${characterId}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setNotes(res.notes ?? "");
          setNotesDirty(false);
        }
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message ?? "Erro ao carregar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [base, characterId]);

  const handleSave = useCallback(() => {
    if (!data || !notesDirty) return;
    setSaving(true);
    api<CharacterBook>(`${base}/${characterId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: data.name,
        concept: data.concept,
        backstory: data.backstory,
        notes,
      }),
    })
      .then((res) => {
        setData(res);
        setNotes(res.notes ?? "");
        setNotesDirty(false);
      })
      .finally(() => setSaving(false));
  }, [base, characterId, data, notes, notesDirty]);

  if (loading) {
    return (
      <div className="stage-character-panel stage-character-panel--book">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Livro</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__loading">Carregando…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="stage-character-panel stage-character-panel--book">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Livro</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__error">{error ?? "Personagem não encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="stage-character-panel stage-character-panel--book">
      <div className="stage-character-panel__head">
        <span className="stage-character-panel__title">Livro — {data.name}</span>
        <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div className="stage-character-panel__body">
        <div className="stage-character-book__section">
          <label className="stage-character-panel__label">Conceito</label>
          <p className="stage-character-panel__readonly">{data.concept || "—"}</p>
        </div>
        <div className="stage-character-book__section">
          <label className="stage-character-panel__label">Backstory</label>
          <p className="stage-character-panel__readonly stage-character-panel__readonly--block">{data.backstory || "—"}</p>
        </div>
        <div className="stage-character-book__section">
          <label className="stage-character-panel__label">Notas</label>
          <textarea
            className="ui-field stage-character-panel__textarea"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            rows={4}
            placeholder="Notas editáveis…"
          />
        </div>
        <div className="stage-character-panel__actions">
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            disabled={!notesDirty}
            onClick={() => { setNotes(data.notes ?? ""); setNotesDirty(false); }}
          >
            Desfazer
          </button>
          <button
            type="button"
            className="ui-btn"
            disabled={!notesDirty || saving}
            onClick={handleSave}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StageFichaPanel({
  characterId,
  isGM,
  onClose,
  onActionClick,
  onMotivationChange,
  onAbilityClick,
}: {
  characterId: number;
  isGM: boolean;
  onClose: () => void;
  onActionClick: (rating: number, gilded: boolean, extraDice?: number) => void;
  onMotivationChange?: (extraDice: number) => void;
  onAbilityClick: (abilityId: number, name: string, description: string) => void;
}) {
  const [sheet, setSheet] = useState<CandelaSheet | null>(null);
  const [abilities, setAbilities] = useState<AbilityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Grupo da ação selecionada para rolagem: só esse grupo mostra motivação (e gastar adiciona dado). */
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  const base = isGM ? "/api/gm/characters" : "/api/me/characters";

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    api<CandelaSheet>(`${base}/${characterId}/systems/candela_obscura`)
      .then((res) => {
        if (cancelled) return;
        setSheet(res);
        const roleId = res.role_id;
        const specialtyId = res.specialty_id;
        return Promise.all([
          api<{ role: AbilityInfo[]; specialty: AbilityInfo[] }>(
            `/api/catalog/candela/abilities?role_id=${roleId}&specialty_id=${specialtyId}`
          ),
        ]).then(([ab]) => {
          if (cancelled) return;
          const all = [...(ab.role ?? []), ...(ab.specialty ?? [])];
          setAbilities(all);
        });
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message ?? "Erro ao carregar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [base, characterId]);

  const loadSheet = useCallback(() => {
    return api<CandelaSheet>(`${base}/${characterId}/systems/candela_obscura`).then(setSheet);
  }, [base, characterId]);

  const saveCandela = useCallback(
    (patch: Partial<CandelaSheet>) => {
      if (!sheet) return;
      api(`${base}/${characterId}/systems/candela_obscura`, {
        method: "PUT",
        body: JSON.stringify({ ...sheet, ...patch }),
      })
        .then(() => loadSheet())
        .catch(() => {});
    },
    [base, characterId, sheet, loadSheet]
  );

  const setDriveCurrent = useCallback(
    (groupKey: string, value: number) => {
      if (!sheet) return;
      const g = sheet.group_state.find((x) => x.group_key === groupKey);
      if (!g) return;
      const next = sheet.group_state.map((x) =>
        x.group_key === groupKey ? { ...x, drive_current: Math.max(0, Math.min(g.drive_max, value)) } : x
      );
      saveCandela({ ...sheet, group_state: next });
      const updated = next.find((x) => x.group_key === groupKey);
      if (updated && groupKey === selectedGroupKey) {
        const extraDice = updated.drive_max - updated.drive_current;
        onMotivationChange?.(extraDice);
      }
    },
    [sheet, saveCandela, selectedGroupKey, onMotivationChange]
  );

  const setResistCurrent = useCallback(
    (groupKey: string, value: number) => {
      if (!sheet) return;
      const g = sheet.group_state.find((x) => x.group_key === groupKey);
      if (!g) return;
      const resistMax = g.resist_max || resistFromDrive(g.drive_max) || 1;
      const next = sheet.group_state.map((x) =>
        x.group_key === groupKey
          ? { ...x, resist_current: Math.max(0, Math.min(resistMax, value)), resist_max: resistMax }
          : x
      );
      saveCandela({ ...sheet, group_state: next });
    },
    [sheet, saveCandela]
  );

  if (loading) {
    return (
      <div className="stage-character-panel stage-character-panel--ficha">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Ficha</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__loading">Carregando…</p>
      </div>
    );
  }
  if (error || !sheet) {
    return (
      <div className="stage-character-panel stage-character-panel--ficha">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Ficha</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__error">{error ?? "Ficha Candela não encontrada"}</p>
      </div>
    );
  }

  const abilityById = new Map(abilities.map((a) => [a.id, a]));
  const actionByKey = new Map(sheet.actions.map((a) => [a.action_key, a]));
  const groupStateByKey = new Map(sheet.group_state.map((g) => [g.group_key, g]));

  return (
    <div className="stage-character-panel stage-character-panel--ficha stage-character-panel--ficha-wide">
      <div className="stage-character-panel__head">
        <span className="stage-character-panel__title">Ficha — Candela</span>
        <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div className="stage-character-panel__body">
        {ACTION_GROUPS.map((grp) => {
          const gState = groupStateByKey.get(grp.key);
          const isSelected = selectedGroupKey === grp.key;
          const displayDriveMax = gState?.drive_max ?? 0;
          return (
            <div key={grp.key} className="stage-character-ficha__group">
              <div className="stage-character-ficha__group-title">{GROUP_LABELS[grp.key]}</div>
              <ul className="stage-character-ficha__actions">
                {grp.actions.map((actionKey) => {
                  const a = actionByKey.get(actionKey);
                  if (!a) return null;
                  const rating = Math.max(0, Math.min(3, a.rating));
                  const gilded = !!a.gilded;
                  const spent = gState ? Math.max(0, displayDriveMax - gState.drive_current) : 0;
                  return (
                    <li key={a.action_key}>
                      <button
                        type="button"
                        className={"stage-character-ficha__action-btn" + (isSelected ? " is-selected" : "")}
                        onClick={() => {
                          setSelectedGroupKey(grp.key);
                          onActionClick(rating, gilded, spent);
                        }}
                        title={`${rating} dado(s)${gilded ? ", primeiro dourado" : ""}${spent > 0 ? ` + ${spent} por motivação gasta` : ""}`}
                      >
                        <span className="stage-character-ficha__action-name">{ACTION_LABELS[a.action_key] ?? a.action_key}</span>
                        <span className={"stage-character-ficha__action-rating" + (gilded ? " stage-character-ficha__action-rating--gilded" : "")}>
                          {rating} {gilded ? "★" : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {gState != null && (() => {
                const resistMax = gState.resist_max || resistFromDrive(gState.drive_max) || 1;
                const resistCurrent = Math.min(resistMax, gState.resist_current);
                const canEditGroup = isGM || isSelected;
                return (
                  <div className="stage-character-ficha__group-stats stage-character-ficha__group-stats--row">
                    <span className={"stage-character-ficha__motivation" + (!canEditGroup ? " is-disabled" : "")}>
                      Motivação: {gState.drive_current}/{gState.drive_max}
                      {isGM && (
                        <button
                          type="button"
                          className="stage-character-ficha__spend-btn"
                          disabled={!canEditGroup || gState.drive_current >= gState.drive_max}
                          onClick={() => setDriveCurrent(grp.key, Math.min(gState.drive_max, gState.drive_current + 1))}
                          title="Aumentar motivação (mestre)"
                        >
                          +
                        </button>
                      )}
                      <button
                        type="button"
                        className="stage-character-ficha__spend-btn"
                        disabled={!canEditGroup || gState.drive_current <= 0}
                        onClick={() => setDriveCurrent(grp.key, gState.drive_current - 1)}
                        title="Gastar motivação (+1 dado na rolagem)"
                      >
                        −
                      </button>
                    </span>
                    <span className={"stage-character-ficha__motivation" + (!canEditGroup ? " is-disabled" : "")}>
                      Resistência: {resistCurrent}/{resistMax}
                      {isGM && (
                        <button
                          type="button"
                          className="stage-character-ficha__spend-btn"
                          disabled={!canEditGroup || resistCurrent >= resistMax}
                          onClick={() => setResistCurrent(grp.key, Math.min(resistMax, resistCurrent + 1))}
                          title="Aumentar resistência (mestre)"
                        >
                          +
                        </button>
                      )}
                      <button
                        type="button"
                        className="stage-character-ficha__spend-btn"
                        disabled={!canEditGroup || resistCurrent <= 0}
                        onClick={() => setResistCurrent(grp.key, Math.max(0, resistCurrent - 1))}
                        title="Reduzir resistência"
                      >
                        −
                      </button>
                    </span>
                  </div>
                );
              })()}
            </div>
          );
        })}
        <div className="stage-character-ficha__section">
          <label className="stage-character-panel__label">Habilidades (clique para mostrar carta a todos)</label>
          <ul className="stage-character-ficha__abilities">
            {sheet.ability_ids.map((id) => {
              const ab = abilityById.get(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="stage-character-ficha__ability-btn"
                    onClick={() => ab && onAbilityClick(id, ab.name, ab.description)}
                  >
                    {ab?.name ?? `Habilidade #${id}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

const EQUIPMENT_SLOTS = 5;
const MAX_IMPROVISATION = 3;

export function StageStatusPanel({
  characterId,
  isGM,
  onClose,
}: {
  characterId: number;
  isGM: boolean;
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<CandelaSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newScarMark, setNewScarMark] = useState<string>("CORPO");
  const [newScarDesc, setNewScarDesc] = useState("");

  const base = isGM ? "/api/gm/characters" : "/api/me/characters";

  const load = useCallback(() => {
    return api<CandelaSheet>(`${base}/${characterId}/systems/candela_obscura`).then(setSheet);
  }, [base, characterId]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    load()
      .catch((e: { message?: string }) => { if (!cancelled) setError(e?.message ?? "Erro ao carregar"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const saveCandela = useCallback(
    (patch: Partial<CandelaSheet> & { equipment?: CandelaEquipmentItem[] }) => {
      if (!sheet) return;
      setSaving(true);
      const equipment = patch.equipment ?? sheet.equipment;
      const improvCount = equipment.filter((e) => e.uses_improvisation_slot).length;
      if (improvCount > MAX_IMPROVISATION) {
        setSaving(false);
        return;
      }
      const payload = {
        ...sheet,
        ...patch,
        equipment: equipment.slice(0, EQUIPMENT_SLOTS).map((e) => ({
          id: e.id,
          text: e.text || "",
          uses_improvisation_slot: !!e.uses_improvisation_slot,
        })),
      };
      api(`${base}/${characterId}/systems/candela_obscura`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
        .then(() => load())
        .catch(() => {})
        .finally(() => setSaving(false));
    },
    [base, characterId, sheet, load]
  );

  const setEquipment = useCallback(
    (index: number, updater: (prev: CandelaEquipmentItem) => CandelaEquipmentItem) => {
      if (!sheet) return;
      const list = [...sheet.equipment];
      while (list.length <= index) list.push({ text: "" });
      list[index] = updater(list[index] ?? { text: "" });
      saveCandela({ ...sheet, equipment: list });
    },
    [sheet, saveCandela]
  );

  const setMark = useCallback(
    (markKey: string, field: "current" | "max", value: number) => {
      if (!sheet) return;
      const next = sheet.marks.map((m) =>
        m.mark_key === markKey ? { ...m, [field]: value } : m
      );
      saveCandela({ ...sheet, marks: next });
    },
    [sheet, saveCandela]
  );

  const setScars = useCallback(
    (nextScars: CandelaScar[]) => {
      if (!sheet) return;
      saveCandela({ ...sheet, scars: nextScars });
    },
    [sheet, saveCandela]
  );

  const scars = sheet?.scars ?? [];
  const addScar = useCallback(() => {
    const desc = newScarDesc.trim();
    if (!desc || !sheet) return;
    setScars([...scars, { mark_key: newScarMark, description: desc }]);
    setNewScarDesc("");
  }, [scars, newScarMark, newScarDesc, setScars, sheet]);
  const removeScar = useCallback(
    (index: number) => {
      setScars(scars.filter((_, i) => i !== index));
    },
    [scars, setScars]
  );

  if (loading) {
    return (
      <div className="stage-character-panel stage-character-panel--status">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Status</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__loading">Carregando…</p>
      </div>
    );
  }
  if (error || !sheet) {
    return (
      <div className="stage-character-panel stage-character-panel--status">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Status</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__error">{error ?? "Ficha Candela não encontrada"}</p>
      </div>
    );
  }

  return (
    <div className="stage-character-panel stage-character-panel--status">
      <div className="stage-character-panel__head">
        <span className="stage-character-panel__title">Status — Candela</span>
        <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div className="stage-character-panel__body">
        <div className="stage-character-status__section">
          <label className="stage-character-panel__label">Marcas</label>
          <div className="stage-character-status__marks">
            {sheet.marks.map((m) => (
              <div key={m.mark_key} className="stage-character-status__mark">
                <span className={"stage-character-status__mark-icon stage-character-status__mark-icon--" + m.mark_key.toLowerCase()} aria-hidden>
                  {m.mark_key === "CORPO" ? "🫀" : m.mark_key === "MENTE" ? "🧠" : "🩸"}
                </span>
                <span className="stage-character-status__mark-label">{MARK_LABELS[m.mark_key] ?? m.mark_key}</span>
                <input
                  type="number"
                  min={0}
                  max={m.max}
                  value={m.current}
                  onChange={(e) => setMark(m.mark_key, "current", Math.max(0, Math.min(m.max, Number(e.target.value) || 0)))}
                  className="ui-field stage-character-status__input stage-character-status__input--small"
                />
                <span>/</span>
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={m.max}
                  onChange={(e) => setMark(m.mark_key, "max", Math.max(0, Math.min(9, Number(e.target.value) || 0)))}
                  className="ui-field stage-character-status__input stage-character-status__input--small"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="stage-character-status__section">
          <label className="stage-character-panel__label">Cicatrizes</label>
          <div className="stage-character-status__add-scar">
            <select
              className="ui-field stage-character-status__scar-select"
              value={newScarMark}
              onChange={(e) => setNewScarMark(e.target.value)}
              aria-label="Marca da cicatriz"
            >
              {(Object.keys(MARK_LABELS) as (keyof typeof MARK_LABELS)[]).map((mk) => (
                <option key={mk} value={mk}>{MARK_LABELS[mk]}</option>
              ))}
            </select>
            <input
              type="text"
              className="ui-field stage-character-status__scar-input"
              value={newScarDesc}
              onChange={(e) => setNewScarDesc(e.target.value)}
              placeholder="Descrição da cicatriz"
              aria-label="Descrição"
            />
            <button type="button" className="ui-btn stage-character-status__add-scar-btn" onClick={addScar} disabled={!newScarDesc.trim()}>
              Adicionar
            </button>
          </div>
          {scars.length === 0 ? (
            <p className="stage-character-panel__readonly">Nenhuma cicatriz.</p>
          ) : (
            <ul className="stage-character-status__scars">
              {scars.map((sc, idx) => (
                <li key={sc.id ?? idx} className="stage-character-status__scar">
                  <span className="stage-character-status__scar-mark">{MARK_LABELS[sc.mark_key as keyof typeof MARK_LABELS] ?? sc.mark_key}</span>
                  <span className="stage-character-status__scar-desc">{sc.description || "—"}</span>
                  <button
                    type="button"
                    className="stage-character-status__scar-remove"
                    onClick={() => removeScar(idx)}
                    aria-label="Remover cicatriz"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {saving && <p className="stage-character-panel__saving">Salvando…</p>}
      </div>
    </div>
  );
}

function equipmentListFromSheet(sheet: CandelaSheet | null): CandelaEquipmentItem[] {
  if (!sheet) return [];
  const list = sheet.equipment.slice(0, EQUIPMENT_SLOTS);
  while (list.length < EQUIPMENT_SLOTS) list.push({ text: "" });
  return list;
}

export function StageInventoryPanel({
  characterId,
  isGM,
  onClose,
}: {
  characterId: number;
  isGM: boolean;
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<CandelaSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipmentDraft, setEquipmentDraft] = useState<CandelaEquipmentItem[]>([]);

  const base = isGM ? "/api/gm/characters" : "/api/me/characters";

  const load = useCallback(() => {
    return api<CandelaSheet>(`${base}/${characterId}/systems/candela_obscura`).then((data) => {
      setSheet(data);
      setEquipmentDraft(equipmentListFromSheet(data));
    });
  }, [base, characterId]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    load()
      .catch((e: { message?: string }) => { if (!cancelled) setError(e?.message ?? "Erro ao carregar"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const saveCandela = useCallback(
    (patch: Partial<CandelaSheet> & { equipment?: CandelaEquipmentItem[] }) => {
      if (!sheet) return;
      const equipment = patch.equipment ?? sheet.equipment;
      const improvCount = equipment.filter((e) => e.uses_improvisation_slot).length;
      if (improvCount > MAX_IMPROVISATION) {
        return;
      }
      setSaving(true);
      const payload = {
        ...sheet,
        ...patch,
        equipment: equipment.slice(0, EQUIPMENT_SLOTS).map((e) => ({
          id: e.id,
          text: e.text || "",
          uses_improvisation_slot: !!e.uses_improvisation_slot,
        })),
      };
      api(`${base}/${characterId}/systems/candela_obscura`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
        .then(() => load())
        .catch(() => {})
        .finally(() => setSaving(false));
    },
    [base, characterId, sheet, load]
  );

  const updateDraft = useCallback((index: number, updater: (prev: CandelaEquipmentItem) => CandelaEquipmentItem) => {
    setEquipmentDraft((prev) => {
      const list = [...prev];
      while (list.length <= index) list.push({ text: "" });
      list[index] = updater(list[index] ?? { text: "" });
      return list;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!sheet) return;
    const improvCount = equipmentDraft.filter((e) => e.uses_improvisation_slot).length;
    if (improvCount > MAX_IMPROVISATION) return;
    saveCandela({ ...sheet, equipment: equipmentDraft });
  }, [sheet, equipmentDraft, saveCandela]);

  if (loading) {
    return (
      <div className="stage-character-panel stage-character-panel--inventory">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Inventário</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__loading">Carregando…</p>
      </div>
    );
  }
  if (error || !sheet) {
    return (
      <div className="stage-character-panel stage-character-panel--inventory">
        <div className="stage-character-panel__head">
          <span className="stage-character-panel__title">Inventário</span>
          <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <p className="stage-character-panel__error">{error ?? "Ficha Candela não encontrada"}</p>
      </div>
    );
  }

  const improvCount = equipmentDraft.filter((e) => e.uses_improvisation_slot).length;
  const equipment = equipmentDraft.slice(0, EQUIPMENT_SLOTS);
  while (equipment.length < EQUIPMENT_SLOTS) equipment.push({ text: "" });

  return (
    <div className="stage-character-panel stage-character-panel--inventory">
      <div className="stage-character-panel__head">
        <span className="stage-character-panel__title">Inventário — Equipamentos</span>
        <button type="button" className="stage-character-panel__close" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div className="stage-character-panel__body">
        <label className="stage-character-panel__label">
          Máx. {MAX_IMPROVISATION} itens podem usar slot de improviso
        </label>
        {improvCount >= MAX_IMPROVISATION && (
          <p className="stage-character-panel__hint">Máximo de slots de improviso atingido.</p>
        )}
        {equipment.map((item, idx) => {
          const canCheckImprov = item.uses_improvisation_slot || improvCount < MAX_IMPROVISATION;
          return (
            <div key={idx} className="stage-character-status__equipment-row">
              <input
                type="text"
                className="ui-field stage-character-status__equipment-text"
                value={item.text}
                onChange={(e) => updateDraft(idx, (p) => ({ ...p, text: e.target.value }))}
                placeholder={`Equipamento ${idx + 1}`}
              />
              <label className="stage-character-status__improviso">
                <input
                  type="checkbox"
                  checked={!!item.uses_improvisation_slot}
                  disabled={!canCheckImprov && !item.uses_improvisation_slot}
                  onChange={(e) =>
                    updateDraft(idx, (p) => ({
                      ...p,
                      uses_improvisation_slot: e.target.checked,
                    }))
                  }
                />
                <span>Improviso</span>
              </label>
            </div>
          );
        })}
        <div className="stage-character-panel__actions">
          <button
            type="button"
            className="ui-btn"
            disabled={saving || improvCount > MAX_IMPROVISATION}
            onClick={handleSave}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AbilityCardOverlay({
  showId,
  name,
  description,
  onClose,
  room,
}: {
  showId: string;
  name: string;
  description: string;
  onClose: () => void;
  room: import("livekit-client").Room | null;
}) {
  const handleClose = useCallback(() => {
    try {
      room?.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "show/ability/card/close", showId })),
        { reliable: true, topic: "espetaculo" }
      );
    } catch {}
    onClose();
  }, [room, showId, onClose]);

  return (
    <div className="stage-ability-card-overlay" role="dialog" aria-label="Carta da habilidade">
      <div className="stage-ability-card-overlay__backdrop" onClick={handleClose} aria-hidden />
      <div className="stage-ability-card-overlay__card">
        <h3 className="stage-ability-card-overlay__title">{name}</h3>
        <p className="stage-ability-card-overlay__desc">{description || "—"}</p>
        <button type="button" className="ui-btn stage-ability-card-overlay__close" onClick={handleClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
