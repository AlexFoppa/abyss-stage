import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Screen } from "../ui/Screen";
import { CandelaObscuraForm, type Role, type Specialty } from "./system_forms/CandelaObscuraForm";
import { EmptySystemForm } from "./system_forms/EmptySystemForm"

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
    <Screen title="Criar personagem">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ opacity: 0.85 }}>Criação</div>
        <button onClick={onBack}>Voltar</button>
      </div>

      <div style={{
            width: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(360px,1fr) minmax(360px,1fr) 280px",
            gap: 12,
        }}
        >

        {/* Simplificado */}
        <div className="panel">
          <div style={{ fontWeight: 700, marginBottom: 10, opacity: 0.9 }}>Simplificado</div>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              Sistema
              <select value={system} onChange={(e) => setSystem(e.target.value)} disabled={loadingSystems}>
                <option value="">{loadingSystems ? "Carregando…" : "Selecione…"}</option>
                {systems.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label>
              Conceito
              <input value={concept} onChange={(e) => setConcept(e.target.value)} />
            </label>

            <label>
              Backstory
              <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)} />
            </label>

            <label>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={createCharacter} disabled={loadingSystems || (isCandela && loadingSystemCatalog)}>
                Criar
              </button>
              <button onClick={onBack}>Voltar</button>
            </div>
          </div>
        </div>

        {/* Ficha do Sistema (arquivo por sistema) */}
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

        {/* Imagem */}
        <div className="panel" style={{ display: "grid", placeItems: "center", minHeight: 240 }}>
          {specialtyImgSrc ? (
            <img src={specialtyImgSrc} alt="Especialidade" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8 }} />
          ) : (
            <div style={{ opacity: 0.7, textAlign: "center" }}>
              {isCandela ? "Selecione uma especialidade para ver a imagem" : "Selecione um sistema"}
            </div>
          )}
        </div>
      </div>

      {err && <div style={{ color: "crimson", marginTop: 12 }}>{err}</div>}
    </Screen>
  );
}
