import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  CandelaObscuraForm,
  type Role,
  type Specialty,
  type CandelaDraft,
  type CandelaAbility,
  type CandelaAction,
  type CandelaGroupState,
  type CandelaMark,
} from "./system_forms/CandelaObscuraForm";
import { EmptySystemForm } from "./system_forms/EmptySystemForm";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Character } from "../types/character";
import { getAvatarUrl } from "../utils/avatar";

export type { Character } from "../types/character";

type SystemOpt = { key: string; label: string };
type Mode = "create" | "edit";

type CandelaOut = {
  role_id: number;
  specialty_id: number;
  pronouns: string;
  circle: string;
  style: string;
  catalyst: string;
  question: string;

  actions: { action_key: CandelaAction["action_key"]; rating: number; gilded: boolean }[];
  group_state: { group_key: CandelaGroupState["group_key"]; drive_current: number; drive_max: number; resist_current: number; resist_max: number }[];
  marks: { mark_key: CandelaMark["mark_key"]; current: number; max: number }[];
  scars: { id?: number; mark_key: CandelaMark["mark_key"]; description: string }[];

  relations: { id?: number; text: string }[];
  equipment: { id?: number; text: string }[];
  illumination_keys: { id?: number; text: string }[];
  ability_ids: number[];
};

const ACTION_KEYS: CandelaAction["action_key"][] = [
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

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, x));
}

function emptyCandelaDraft(): CandelaDraft {
  return {
    pronouns: "",
    circle: "",
    style: "",
    catalyst: "",
    question: "",

    actions: ACTION_KEYS.map((k) => ({ action_key: k, rating: 0, gilded: false })),
    group_state: [
      { group_key: "VIGOR", drive_current: 0, drive_max: 0, resist_current: 0, resist_max: 0 },
      { group_key: "ASTUCIA", drive_current: 0, drive_max: 0, resist_current: 0, resist_max: 0 },
      { group_key: "INTUICAO", drive_current: 0, drive_max: 0, resist_current: 0, resist_max: 0 },
    ],
    marks: [
      { mark_key: "CORPO", current: 0, max: 3 },
      { mark_key: "MENTE", current: 0, max: 3 },
      { mark_key: "SANGRIA", current: 0, max: 3 },
    ],
    scars: [],

    relations: [],
    equipment: [],
    illumination_keys: [],
    ability_ids: [],
  };
}

export function CharacterScreen({
  scope = "ME",
  mode,
  character,
  onBack,
  onCreated,
  initialKind,
}: {
  scope?: "ME" | "GM";
  mode: Mode;
  character?: Character | null;
  onBack: () => void;
  onCreated?: (c: Character) => void;
  /** Em modo create com scope=GM, kind a enviar (PC ou NPC). Ignorado para ME. */
  initialKind?: "PC" | "NPC";
}) {
  const [err, setErr] = useState<string | null>(null);

  const [systems, setSystems] = useState<SystemOpt[]>([]);
  const [loadingSystems, setLoadingSystems] = useState(false);

  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [backstory, setBackstory] = useState("");
  const [notes, setNotes] = useState("");

  type CharacterImage = { slot: number; storage_key: string };
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [imgIndex, setImgIndex] = useState(0); // agora representa SLOT visível (0..9)
  const [imgBusy, setImgBusy] = useState(false);
  const [imgRevision, setImgRevision] = useState(0); // força reload da URL após refresh

  const SLOT_MIN = 0;
  const SLOT_MAX = 9;

  /** Número exibido e rótulo por slot interno: antigo 0→1 Padrão, … antigo 9→0 Off */
  const SLOT_LABELS: Record<number, string> = {
    0: "Off",
    1: "Padrão",
    2: "Assustado",
    3: "Rindo",
    4: "Furioso",
    5: "Ferido / com dor",
    6: "Personalizado 1",
    7: "Personalizado 2",
    8: "Personalizado 3",
    9: "Atordoado/Incapacitado",
  };

  const visibleSlot = useMemo(() => clampInt(imgIndex, SLOT_MIN, SLOT_MAX), [imgIndex]);
  const slotDisplayNum = (visibleSlot + 1) % 10;
  const slotLabel = SLOT_LABELS[slotDisplayNum] ?? String(visibleSlot);

  const imageBySlot = useMemo(() => {
    const m = new Map<number, CharacterImage>();
    for (const im of images) m.set(im.slot, im);
    return m;
  }, [images]);

  const visibleImage = imageBySlot.get(visibleSlot) || null;

  const visibleImageUrl = useMemo(() => {
    const sk = (visibleImage?.storage_key || "").replace(/^\/+/, "");
    return sk ? `/api/uploads/${sk}?v=${imgRevision}` : "";
  }, [visibleImage, imgRevision]);

  const [selectedSystem, setSelectedSystem] = useState<string>("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSystemCatalog, setLoadingSystemCatalog] = useState(false);
  const [roleId, setRoleId] = useState<number | "">("");
  const [specialtyId, setSpecialtyId] = useState<number | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const basePrefix = scope === "GM" ? "/api/gm/characters" : "/api/me/characters";
  
  const existingSystems = useMemo(() => {
    const s = character?.systems?.length
      ? character.systems
      : character?.system
        ? [character.system]
        : [];
    return Array.from(new Set(s)).filter(Boolean);
  }, [character]);

  const [candelaDraft, setCandelaDraft] = useState<CandelaDraft>(() => emptyCandelaDraft());
  const [roleAbilities, setRoleAbilities] = useState<CandelaAbility[]>([]);
  const [specialtyAbilities, setSpecialtyAbilities] = useState<CandelaAbility[]>([]);
  const [lastAppliedSpecialtyId, setLastAppliedSpecialtyId] = useState<number | null>(null);
  const [candelaSheetExists, setCandelaSheetExists] = useState<boolean | null>(null);

  const isCandela = selectedSystem === "candela_obscura";
  const candelaAlreadyExists = candelaSheetExists === true;
  // dirty check
  const snapshot = useMemo(
    () =>
      JSON.stringify({
        mode,
        name: name || "",
        concept: concept || "",
        backstory: backstory || "",
        notes: notes || "",
        selectedSystem: selectedSystem || "",
        roleId: roleId === "" ? null : roleId,
        specialtyId: specialtyId === "" ? null : specialtyId,
        candelaDraft: isCandela ? candelaDraft : null,
        editingId: mode === "edit" ? character?.id ?? null : null,
      }),
    [mode, name, concept, backstory, notes, selectedSystem, roleId, specialtyId, isCandela, candelaDraft, character]
  );

  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const isDirty = snapshot !== savedSnapshot;
 
  async function refreshImages() {
    if (mode !== "edit") return;
    if (!character?.id) return;

    try {
      const rows = await api<CharacterImage[]>(`${basePrefix}/${character.id}/images`);
      const norm = (rows || [])
        .filter((r) => typeof (r as any)?.slot === "number" && typeof (r as any)?.storage_key === "string")
        .sort((a, b) => a.slot - b.slot);

      const defaultUrl = character?.default_image_url || "";
      const urlKey = defaultUrl.replace(/^.*\/api\/uploads\//i, "").split("?")[0].trim().replace(/^\/+/, "");
      const defaultSlot =
        norm.find((img) => {
          const key = (img.storage_key || "").replace(/^\/+/, "");
          return key && urlKey && key === urlKey;
        })?.slot ?? 0;

      setImages(norm);
      setImgIndex(clampInt(defaultSlot, 0, 9));
      setImgRevision((r) => r + 1);
    } catch (e: any) {
      // no GM, erros de imagem não devem bloquear a edição
    }
  }

  useEffect(() => {
    if (mode !== "edit") return;
    if (!character?.id) return;
    refreshImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, character?.id]);


  useEffect(() => {
    if (mode !== "edit") return;
    if (!character?.id) return;
    if (selectedSystem !== "candela_obscura") return;

    let cancelled = false;

    (async () => {
      setErr(null);

      try {
        // Sempre tenta carregar: se existir, é edição; se 404, é criação.
        const data = await api<CandelaOut>(
          `${basePrefix}/${character.id}/systems/candela_obscura`
        );
        if (cancelled) return;

        setCandelaSheetExists(true);

        setRoleId(data.role_id);
        setSpecialtyId(data.specialty_id);

        setCandelaDraft({
          pronouns: data.pronouns || "",
          circle: data.circle || "",
          style: data.style || "",
          catalyst: data.catalyst || "",
          question: data.question || "",

          actions: ACTION_KEYS.map((k) => {
            const found = data.actions?.find((a) => a.action_key === k);
            return { action_key: k, rating: found?.rating ?? 0, gilded: !!found?.gilded };
          }),

          group_state: (data.group_state || []).map((g) => ({
            group_key: g.group_key,
            drive_current: g.drive_current,
            drive_max: g.drive_max,
            resist_current: g.resist_current,
            resist_max: g.resist_max,
          })),

          marks: (data.marks || []).map((m) => ({
            mark_key: m.mark_key,
            current: m.current,
            max: m.max,
          })),

          scars: (data.scars || []).map((s) => ({
            id: s.id,
            mark_key: s.mark_key,
            description: s.description || "",
          })),

          relations: (data.relations || []).map((x) => ({ id: x.id, text: x.text || "" })),
          equipment: (data.equipment || []).map((x) => ({ id: x.id, text: x.text || "" })),
          illumination_keys: (data.illumination_keys || []).map((x) => ({ id: x.id, text: x.text || "" })),
          ability_ids: data.ability_ids || [],
        });

        setLastAppliedSpecialtyId(data.specialty_id);
      } catch (e: any) {
        if (cancelled) return;

        // 404 = não existe ficha Candela ainda (criação). Não é erro.
        if (e?.status === 404) {
          setCandelaSheetExists(false);
          return;
        }

        const msg =
          typeof e?.message === "string"
            ? e.message
            : typeof e?.body?.detail === "string"
              ? e.body.detail
              : "Falha ao carregar Candela";
        setErr(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, character?.id, selectedSystem]);

  useEffect(() => {
    if (mode !== "edit") return;
    if (!character) return;

    setName(character.name || "");
    setConcept(character.concept || "");
    setBackstory(character.backstory || "");
    setNotes(character.notes || "");

    // mantém o select disponível, mas sem escolha inicial
    setSelectedSystem("");
    setRoleId("");
    setSpecialtyId("");
    setCandelaDraft(emptyCandelaDraft());
    setRoleAbilities([]);
    setSpecialtyAbilities([]);
    setLastAppliedSpecialtyId(null);

  }, [mode, character]);



  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function requestBack() {
    if (!isDirty) return onBack();
    setConfirmOpen(true);
  }

  // carrega sistemas disponíveis
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLoadingSystems(true);
      try {
        const sysAny = await api<any>("/api/catalog/systems");
        if (cancelled) return;
        setSystems(Array.isArray(sysAny) ? (sysAny as SystemOpt[]) : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Falha ao carregar sistemas");
      } finally {
        if (!cancelled) setLoadingSystems(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // carrega roles candela quando seleciona candela
  useEffect(() => {
    let cancelled = false;

    // só reseta se NÃO for edição de Candela existente
    if (!(mode === "edit" && candelaAlreadyExists)) {
      setRoles([]);
      setSpecialties([]);
      setRoleId("");
      setSpecialtyId("");
    }

    if (!isCandela) return;

    (async () => {
      setErr(null);
      setLoadingSystemCatalog(true);
      try {
        const rAny = await api<any>("/api/catalog/candela/roles");
        if (cancelled) return;
        setRoles(Array.isArray(rAny) ? (rAny as Role[]) : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Falha ao carregar papéis");
      } finally {
        if (!cancelled) setLoadingSystemCatalog(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCandela, mode, candelaAlreadyExists]);

  useEffect(() => {
    let cancelled = false;

    setSpecialties([]);
    setRoleAbilities([]);
    setSpecialtyAbilities([]);

    if (!isCandela) return;
    if (roleId === "") return;

    (async () => {
      setErr(null);
      setLoadingSystemCatalog(true);
      try {
        const [sAny, aAny] = await Promise.all([
          api<any>(`/api/catalog/candela/specialties?role_id=${roleId}`),
          api<any>(`/api/catalog/candela/abilities?role_id=${roleId}`),
        ]);

        if (cancelled) return;

        const nextSpecialties = Array.isArray(sAny) ? (sAny as Specialty[]) : [];
        setSpecialties(nextSpecialties);

        // Se o specialty atual nao pertence mais ao papel selecionado, limpa.
        if (specialtyId !== "" && !nextSpecialties.some((s) => s.id === specialtyId)) {
          setSpecialtyId("");
        }
        setRoleAbilities(Array.isArray(aAny?.role) ? (aAny.role as CandelaAbility[]) : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Falha ao carregar catálogo Candela");
      } finally {
        if (!cancelled) setLoadingSystemCatalog(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCandela, roleId, specialtyId]);

  useEffect(() => {
    let cancelled = false;

    if (!isCandela) return;
    if (specialtyId === "") return;

    (async () => {
      setErr(null);
      setLoadingSystemCatalog(true);
      try {
        const [defaults, abAny] = await Promise.all([
          api<any>(`/api/catalog/candela/specialty/defaults?specialty_id=${specialtyId}`),
          api<any>(`/api/catalog/candela/abilities?specialty_id=${specialtyId}`),
        ]);
        if (cancelled) return;

        setSpecialtyAbilities(
          Array.isArray(abAny?.specialty) ? (abAny.specialty as CandelaAbility[]) : []
        );

        const shouldApplyDefaults = lastAppliedSpecialtyId !== specialtyId || mode === "create";
        if (!shouldApplyDefaults) return;

        setCandelaDraft((prev) => {
          const byKey: Record<string, { rating: number; gilded_default: number }> = {};
          for (const a of defaults?.actions || []) {
            byKey[a.action_key] = {
              rating: Number(a.rating) || 0,
              gilded_default: Number(a.gilded_default) || 0,
            };
          }

          const nextActions = prev.actions.map((a) => {
            const d = byKey[a.action_key];
            return d
              ? { ...a, rating: clampInt(d.rating, 0, 3), gilded: !!d.gilded_default }
              : a;
          });

          const groupDefaults = defaults?.groups || [];
          const nextGroupState = prev.group_state.map((g) => {
            const found = groupDefaults.find((x: any) => x.group_key === g.group_key);
            return found
              ? { ...g, drive_max: clampInt(Number(found.drive_default) || 0, 0, 9) }
              : g;
          });

          return {
            ...prev,
            actions: nextActions,
            group_state: nextGroupState,
          };
        });

        setLastAppliedSpecialtyId(specialtyId);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Falha ao carregar defaults da especialidade");
      } finally {
        if (!cancelled) setLoadingSystemCatalog(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCandela, specialtyId, lastAppliedSpecialtyId, mode]);

  const selectedSpecialty = useMemo(() => {
    if (specialtyId === "") return null;
    return specialties.find((s) => s.id === specialtyId) || null;
  }, [specialties, specialtyId]);

  const specialtyImgSrc = useMemo(() => {
    const key = selectedSpecialty?.image_storage_key?.trim();
    if (!key) return "";
    return `/assets/${key}`;
  }, [selectedSpecialty]);

  function validateCandelaBeforeSave(): string | null {
    if (roleId === "" || specialtyId === "") return "Selecione papel e especialidade";
    if (candelaDraft.ability_ids.length !== 2) return "Selecione 1 habilidade do Papel e 1 da Especialidade";

    const hasRoleAbility = candelaDraft.ability_ids.some((id) => roleAbilities.some((a) => a.id === id));
    const hasSpecialtyAbility = candelaDraft.ability_ids.some((id) => specialtyAbilities.some((a) => a.id === id));
    if (!hasRoleAbility || !hasSpecialtyAbility) return "Selecione 1 habilidade do Papel e 1 da Especialidade";

    return null;
  }

  function candelaPayload() {
    return {
      role_id: roleId,
      specialty_id: specialtyId,
      pronouns: candelaDraft.pronouns,
      circle: candelaDraft.circle,
      style: candelaDraft.style,
      catalyst: candelaDraft.catalyst,
      question: candelaDraft.question,
      actions: candelaDraft.actions,
      group_state: candelaDraft.group_state,
      marks: candelaDraft.marks,
      scars: candelaDraft.scars,
      relations: candelaDraft.relations,
      equipment: candelaDraft.equipment,
      illumination_keys: candelaDraft.illumination_keys,
      ability_ids: candelaDraft.ability_ids,
    };
  }
 

  async function saveBaseEdits() {
    setErr(null);
    if (!character?.id) return setErr("Nenhum personagem selecionado.");
    if (!name.trim()) return setErr("Nome é obrigatório");

    try {
      const updated = await api<Character>(`${basePrefix}/${character.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, concept, backstory, notes }),
      });

      setSavedSnapshot(
        JSON.stringify({
          mode,
          name: updated.name || "",
          concept: updated.concept || "",
          backstory: updated.backstory || "",
          notes: updated.notes || "",
          selectedSystem: "",
          roleId: null,
          specialtyId: null,
          editingId: character.id,
        })
      );

      onBack();
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : "Falha ao salvar";
      setErr(msg);
    }
  }

  async function createBaseAndMaybeSystem() {
    setErr(null);
    if (!name.trim()) return setErr("Nome é obrigatório");

    if (selectedSystem === "candela_obscura") {
      const v = validateCandelaBeforeSave();
      if (v) return setErr(v);
    }

    try {
      const body: Record<string, string> = {
        name: name || "",
        concept: concept || "",
        backstory: backstory || "",
        notes: notes || "",
      };
      if (scope === "GM" && (initialKind === "PC" || initialKind === "NPC")) {
        body.kind = initialKind;
      }
      const res = await api<{ character: Character }>(basePrefix, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const created = res.character;

      if (selectedSystem === "candela_obscura") {
        await api(`${basePrefix}/${created.id}/systems/candela_obscura`, {
          method: "POST",
          body: JSON.stringify(candelaPayload()),
        });
      }

      setSavedSnapshot(snapshot);
      onCreated?.(created);
      onBack();
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : "Falha ao salvar";
      setErr(msg);
    }
  }

  async function addSystemToExisting() {
    setErr(null);
    if (!character?.id) return setErr("Nenhum personagem selecionado.");
    if (!selectedSystem) return setErr("Selecione um sistema.");

    if (selectedSystem === "candela_obscura") {
      const v = validateCandelaBeforeSave();
      if (v) return setErr(v);
    }


    try {
      if (selectedSystem === "candela_obscura") {
        // em edit de personagem base, Candela pode ser criação (404) ou edição (200)
        if (mode === "edit" && candelaSheetExists === null) {
          return setErr("Carregando estado da ficha Candela… tente novamente em 1s.");
        }

        const method = candelaAlreadyExists ? "PUT" : "POST";
        await api(`${basePrefix}/${character.id}/systems/candela_obscura`, {
          method,
          body: JSON.stringify(candelaPayload()),
        });

        // após salvar, agora ela certamente existe
        setCandelaSheetExists(true);


      } else {
          await api(`${basePrefix}/${character.id}/systems/${selectedSystem}`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }

      setSavedSnapshot(snapshot);
      onBack();
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e?.body?.detail === "string"
            ? e.body.detail
            : candelaAlreadyExists
              ? "Falha ao editar sistema"
              : "Falha ao adicionar sistema";
      setErr(msg);
    }
  }


  const title = mode === "create" ? "Criação de personagem" : "Editar personagem";

  return (
    <div className="create-scene">
      <div
        className={`create-grid ${
          selectedSystem
            ? ""
            : mode === "edit" && scope === "GM"
              ? "create-grid--gm"
              : "create-grid--single"
        }`}
      >
        <section className="ui-card create-col create-col--base create-panel">
          <h2 className="create-title">{title}</h2>

          <label className="ui-label">
            <span>Nome</span>
            <input className="ui-field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="ui-label">
            <span>Conceito</span>
            <input className="ui-field" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </label>

          <label className="ui-label">
            <span>Sistema (opcional)</span>
            <select
              className="ui-field"
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
              disabled={loadingSystems}
            >
              <option value="">{loadingSystems ? "Carregando…" : "Selecione…"}</option>
              {systems
                .filter((s) => s.key !== "simplificado")
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
            </select>
          </label>

          <label className="ui-label">
            <span>Backstory</span>
            <textarea className="ui-field" value={backstory} onChange={(e) => setBackstory(e.target.value)} />
          </label>

          <label className="ui-label">
            <span>Notes</span>
            <textarea className="ui-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {mode === "edit" ? (
            <div className="select-muted" style={{ marginTop: 10 }}>
              Sistemas atuais: {existingSystems.length ? existingSystems.join(", ") : "—"}
            </div>
          ) : null}

          <div className="ui-actions create-actions">
            <button
              type="button"
              className="ui-btn"
              onClick={
                mode === "create"
                  ? createBaseAndMaybeSystem
                  : selectedSystem
                    ? addSystemToExisting
                    : saveBaseEdits
              }
              disabled={
                loadingSystems ||
                (isCandela && loadingSystemCatalog) ||
                (mode === "edit" && !character)
              }
            >
              Salvar
            </button>

            <button type="button" className="ui-btn ui-btn--ghost" onClick={requestBack}>
              Voltar
            </button>
          </div>

          {err && <div className="create-error">{err}</div>}
        </section>

        {selectedSystem ? (
          <section className="ui-card create-col create-col--system">
            {isCandela ? (
              <CandelaObscuraForm
                loading={loadingSystemCatalog}
                mode={candelaAlreadyExists ? "edit" : "create"}
                roles={roles}
                specialties={specialties}
                roleId={roleId}
                setRoleId={setRoleId}
                specialtyId={specialtyId}
                setSpecialtyId={setSpecialtyId}
                draft={candelaDraft}
                setDraft={(updater) => setCandelaDraft((prev) => updater(prev))}
                roleAbilities={roleAbilities}
                specialtyAbilities={specialtyAbilities}
              />
            ) : (
              <EmptySystemForm />
            )}
          </section>
        ) : null}

        {selectedSystem || (scope === "GM" && mode === "edit") ? (
          <section
            className={`create-col create-col--preview ${
              scope === "GM" ? "create-col--preview--gm" : "create-col--preview--player"
            }`}
          >
            <div className="mirror">
              {(() => {
                const portraitUrl = visibleImageUrl || getAvatarUrl(character ?? undefined);

                if (scope === "GM") {
                  if (portraitUrl) return <img className="portrait" src={portraitUrl} alt="Personagem" />;
                  return <div className="mirror-empty" />;
                }

                if (mode === "edit" && portraitUrl) {
                  return <img className="portrait" src={portraitUrl} alt="Personagem" />;
                }
                const canShowSystemPortrait = Boolean(specialtyImgSrc) && selectedSystem === "candela_obscura";
                if (canShowSystemPortrait) {
                  return <img className="portrait" src={specialtyImgSrc} alt="Personagem" />;
                }
                return <div className="mirror-empty" />;
              })()}
            </div>

            {/* Controles logo abaixo do espelho, dentro da moldura tipo cabinet */}
            <div className="mirror-controls">
              <div className="mirror-cabinet">
                <div className="mirror-controls__nav">
                  <button
                    className="ui-btn"
                    type="button"
                    onClick={() => setImgIndex((i) => clampInt(i - 1, 0, 9))}
                    disabled={imgBusy || visibleSlot <= 0}
                    aria-label="Imagem anterior"
                  >
                    &#11164;
                  </button>

                  <div className="mirror-controls__meta">
                    {slotDisplayNum} – {slotLabel}
                  </div>

                  <button
                    className="ui-btn"
                    type="button"
                    onClick={() => setImgIndex((i) => clampInt(i + 1, 0, 9))}
                    disabled={imgBusy || visibleSlot >= 9}
                    aria-label="Próxima imagem"
                  >
                    &#11166;
                  </button>
                </div>

              {/* GM: UM botão “Adicionar/Substituir” (upload substitui o slot visível) */}
              {scope === "GM" ? (
                  <div className="mirror-controls__actions">
                    <label className="ui-btn mirror-controls__file">
                      Adicionar/Substituir
                      <input
                        type="file"
                        accept="image/*"
                        disabled={imgBusy || !character?.id}
                        onChange={async (ev) => {
                        const f = ev.target.files?.[0];
                        ev.target.value = "";
                        if (!f || !character?.id) return;

                        const fd = new FormData();
                        fd.append("file", f);
                        fd.append("slot", String(visibleSlot)); // determinístico: substitui o slot visível

                        setImgBusy(true);
                        setErr(null);
                        try {
                          await api(`${basePrefix}/${character.id}/images`, { method: "POST", body: fd });
                          await refreshImages();
                        } catch (e: any) {
                          setErr(e?.message || "Falha no upload");
                        } finally {
                          setImgBusy(false);
                        }
                      }}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

      </div>
      <ConfirmDialog
        open={confirmOpen}

        title="Sair sem salvar?"
        message="Há alterações não salvas. Se sair agora, elas serão perdidas."
        confirmText="Sair"
        cancelText="Continuar editando"
        onConfirm={() => {
          setConfirmOpen(false);
          onBack();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
