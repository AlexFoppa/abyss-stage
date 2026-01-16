import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CandelaObscuraForm, type Role, type Specialty } from "./system_forms/CandelaObscuraForm";
import { EmptySystemForm } from "./system_forms/EmptySystemForm"
import { ConfirmDialog } from "../ui/ConfirmDialog";


type Character = { id: number; name: string; concept: string; system: string; backstory: string; notes: string };
type SystemOpt = { key: string; label: string };

export function CreateCharacterScreen({ onBack, onCreated }: { onBack: () => void; onCreated?: (c: Character) => void }) {
  const [err, setErr] = useState<string | null>(null);

  // Simplificado
  const [systems, setSystems] = useState<SystemOpt[]>([]);
  const [system, setSystem] = useState<string>(""); // começa vazio para poder selecionar
  const [loadingSystems, setLoadingSystems] = useState(false);

  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [backstory, setBackstory] = useState("");
  const [notes, setNotes] = useState("");
  
  // Sistema (Candela)
  const [roles, setRoles] = useState<Role[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loadingSystemCatalog, setLoadingSystemCatalog] = useState(false);
  const [roleId, setRoleId] = useState<number | "">("");
  const [specialtyId, setSpecialtyId] = useState<number | "">("");

    const [confirmOpen, setConfirmOpen] = useState(false);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        system: system || "",
        name: name || "",
        concept: concept || "",
        backstory: backstory || "",
        notes: notes || "",
        roleId: roleId === "" ? null : roleId,
        specialtyId: specialtyId === "" ? null : specialtyId,
      }),
    [system, name, concept, backstory, notes, roleId, specialtyId]
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

  const isCandela = system === "candela_obscura";

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
    setSpecialtyId("");

    if (!isCandela) return;
    if (roleId === "") return;

    (async () => {
        setErr(null);
        setLoadingSystemCatalog(true);
        try {
        const sAny = await api<any>(`/api/catalog/candela/specialties?role_id=${roleId}`);
        if (cancelled) return;
        setSpecialties(Array.isArray(sAny) ? (sAny as Specialty[]) : []);
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
    // esperado: public/assets/<key>
    return `/assets/${key}`;
  }, [selectedSpecialty]);

  async function createCharacter() {
    setErr(null);
    if (!name.trim()) return setErr("Nome é obrigatório");
    if (isCandela && (roleId === "" || specialtyId === "")) return setErr("Selecione papel e especialidade");

    try {
      const payload = {
      name: name || "",
      concept: concept || "",
      system: system || null,
      backstory: backstory || "",
      notes: notes || "",
      role_id: isCandela && roleId !== "" ? roleId : null,
      specialty_id: isCandela && specialtyId !== "" ? specialtyId : null,
};

      if (isCandela) {
        payload.role_id = roleId === "" ? null : roleId;
        payload.specialty_id = specialtyId === "" ? null : specialtyId;
      }

      const res = await api<{ character: Character }>("/api/me/characters", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSavedSnapshot(snapshot);
      onCreated?.(res.character);
      onBack();
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message
          : typeof e === "string"
            ? e
            : typeof e?.body?.detail === "string"
              ? e.body.detail
              : Array.isArray(e?.body?.detail)
                ? e.body.detail.map((d: any) => d?.msg).filter(Boolean).join(" | ")
                : "Falha ao criar personagem";
      setErr(msg);
    }
  }

  return (
    <div className="create-scene">
      <div className={`create-grid ${system ? "" : "create-grid--single"}`}>
        {/* COL 1 */}
        <section className="ui-card create-col create-col--base create-panel">
          <h2 className="create-title">Criação de personagem</h2>

          <label className="ui-label">
            <span>Nome</span>
            <input className="ui-field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="ui-label">
            <span>Conceito</span>
            <input className="ui-field" value={concept} onChange={(e) => setConcept(e.target.value)} />
          </label>

          <label className="ui-label">
            <span>Sistema</span>
            <select
              className="ui-field"
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              disabled={loadingSystems}
            >
              <option value="">{loadingSystems ? "Carregando…" : "Selecione…"}</option>
              {systems.map((s) => (
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

          <div className="ui-actions create-actions">
            <button
              className="ui-btn"
              onClick={createCharacter}
              disabled={loadingSystems || (isCandela && loadingSystemCatalog)}
            >
              Salvar
            </button>
            <button className="ui-btn ui-btn--ghost" onClick={requestBack}>
              Voltar
            </button>
          </div>

          {err && <div className="create-error">{err}</div>}
        </section>

        {/* COL 2 (só aparece após escolher sistema) */}
        {system ? (
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

        {/* COL 3 (só aparece após escolher sistema) */}
        {system ? (
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
