import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  CandelaObscuraForm,
  type Role,
  type Specialty,
} from "./system_forms/CandelaObscuraForm";
import { EmptySystemForm } from "./system_forms/EmptySystemForm";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export type Character = {
  id: number;
  name: string;
  concept: string;
  system: string; // base (sempre "simplificado")
  backstory: string;
  notes: string;
  systems?: string[]; // ex: ["simplificado","candela_obscura"]
};

type SystemOpt = { key: string; label: string };
type Mode = "create" | "edit";

export function CharacterScreen({
  mode,
  character,
  onBack,
  onCreated,
}: {
  mode: Mode;
  character?: Character | null;
  onBack: () => void;
  onCreated?: (c: Character) => void;
}) {
  const [err, setErr] = useState<string | null>(null);

  const [systems, setSystems] = useState<SystemOpt[]>([]);
  const [loadingSystems, setLoadingSystems] = useState(false);

  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [backstory, setBackstory] = useState("");
  const [notes, setNotes] = useState("");

  // mesma UX em create/edit: select sempre existe
  const [selectedSystem, setSelectedSystem] = useState<string>("");

  const [roles, setRoles] = useState<Role[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSystemCatalog, setLoadingSystemCatalog] = useState(false);
  const [roleId, setRoleId] = useState<number | "">("");
  const [specialtyId, setSpecialtyId] = useState<number | "">("");

  const [confirmOpen, setConfirmOpen] = useState(false);

  const existingSystems = useMemo(() => {
    const s = character?.systems?.length
      ? character.systems
      : character?.system
        ? [character.system]
        : [];
    return Array.from(new Set(s)).filter(Boolean);
  }, [character]);

  const isCandela = selectedSystem === "candela_obscura";
  const candelaAlreadyExists = existingSystems.includes("candela_obscura");

  useEffect(() => {
    if (mode !== "edit") return;
    if (!character?.id) return;
    if (selectedSystem !== "candela_obscura") return;

    // se já existe candela, carrega role/specialty atuais pra permitir editar
    if (!candelaAlreadyExists) return;

    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const data = await api<{ role_id: number; specialty_id: number }>(
          `/api/me/characters/${character.id}/systems/candela_obscura`
        );
        if (cancelled) return;
        setRoleId(data.role_id);
        setSpecialtyId(data.specialty_id);
      } catch (e: any) {
        if (cancelled) return;
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
  }, [mode, character?.id, selectedSystem, candelaAlreadyExists]);

  // preload do edit
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
  }, [mode, character]);

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
        editingId: mode === "edit" ? character?.id ?? null : null,
      }),
    [mode, name, concept, backstory, notes, selectedSystem, roleId, specialtyId, character]
  );

  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const isDirty = snapshot !== savedSnapshot;

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

    setRoles([]);
    setSpecialties([]);
    setRoleId("");
    setSpecialtyId("");

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
  }, [isCandela]);

  useEffect(() => {
    let cancelled = false;

    setSpecialties([]);

    if (!isCandela) return;
    if (roleId === "") return;

    (async () => {
      setErr(null);
      setLoadingSystemCatalog(true);
      try {
        const sAny = await api<any>(
          `/api/catalog/candela/specialties?role_id=${roleId}`
        );
        if (cancelled) return;

        const next = Array.isArray(sAny) ? (sAny as Specialty[]) : [];
        setSpecialties(next);

        // Se o specialty atual nao pertence mais ao papel selecionado, limpa.
        if (specialtyId !== "" && !next.some((s) => s.id === specialtyId)) {
          setSpecialtyId("");
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Falha ao carregar especialidades");
      } finally {
        if (!cancelled) setLoadingSystemCatalog(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCandela, roleId]);


  const selectedSpecialty = useMemo(() => {
    if (specialtyId === "") return null;
    return specialties.find((s) => s.id === specialtyId) || null;
  }, [specialties, specialtyId]);

  const specialtyImgSrc = useMemo(() => {
    const key = selectedSpecialty?.image_storage_key?.trim();
    if (!key) return "";
    return `/assets/${key}`;
  }, [selectedSpecialty]);

  async function saveBaseEdits() {
    setErr(null);
    if (!character?.id) return setErr("Nenhum personagem selecionado.");
    if (!name.trim()) return setErr("Nome é obrigatório");

    try {
      const updated = await api<Character>(`/api/me/characters/${character.id}`, {
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

    if (selectedSystem === "candela_obscura" && (roleId === "" || specialtyId === "")) {
      return setErr("Selecione papel e especialidade");
    }

    try {
      const res = await api<{ character: Character }>("/api/me/characters", {
        method: "POST",
        body: JSON.stringify({
          name: name || "",
          concept: concept || "",
          backstory: backstory || "",
          notes: notes || "",
        }),
      });

      const created = res.character;

      if (selectedSystem === "candela_obscura") {
        await api(`/api/me/characters/${created.id}/systems/candela_obscura`, {
          method: "POST",
          body: JSON.stringify({
            role_id: roleId,
            specialty_id: specialtyId,
          }),
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

    if (
      selectedSystem === "candela_obscura" &&
      (roleId === "" || specialtyId === "")
    ) {
      return setErr("Selecione papel e especialidade");
    }

    try {
      if (selectedSystem === "candela_obscura") {
        // Se ja existe, edita. Se nao existe, cria.
        await api(`/api/me/characters/${character.id}/systems/candela_obscura`, {
          method: candelaAlreadyExists ? "PUT" : "POST",
          body: JSON.stringify({ role_id: roleId, specialty_id: specialtyId }),
        });
      } else {
        await api(`/api/me/characters/${character.id}/systems/${selectedSystem}`, {
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
      <div className={`create-grid ${selectedSystem ? "" : "create-grid--single"}`}>
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

            <button className="ui-btn ui-btn--ghost" onClick={requestBack}>
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
                roles={roles}
                specialties={specialties}
                roleId={roleId}
                setRoleId={setRoleId}
                specialtyId={specialtyId}
                setSpecialtyId={setSpecialtyId}
              />
            ) : (
              <EmptySystemForm />
            )}
          </section>
        ) : null}

        {selectedSystem ? (
          <section className="create-col create-col--preview">
            <div className="mirror">
              {specialtyImgSrc ? (
                <img className="portrait" src={specialtyImgSrc} alt="Especialidade" />
              ) : (
                <div className="mirror-empty" />
              )}
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
