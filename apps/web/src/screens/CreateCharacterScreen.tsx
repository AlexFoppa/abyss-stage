import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CandelaObscuraForm, type Role, type Specialty } from "./system_forms/CandelaObscuraForm";
import { EmptySystemForm } from "./system_forms/EmptySystemForm"
import "./createCharacter.css";

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
    if (!system) return setErr("Selecione um sistema");
    if (!name.trim()) return setErr("Nome é obrigatório");
    if (isCandela && (roleId === "" || specialtyId === "")) return setErr("Selecione papel e especialidade");

    try {
      const payload: any = { name, concept, system, backstory, notes };
      if (isCandela) {
        payload.role_id = roleId;
        payload.specialty_id = specialtyId;
      }

      const res = await api<{ character: Character }>("/api/me/characters", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onCreated?.(res.character);
      onBack();
    } catch (e: any) {
      setErr(e?.message || "Falha ao criar personagem");
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
            <button className="ui-btn ui-btn--ghost" onClick={onBack}>
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
    </div>
  );
}
