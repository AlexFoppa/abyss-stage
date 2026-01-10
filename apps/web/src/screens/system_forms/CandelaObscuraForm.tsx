import { useMemo } from "react";

export type Role = { id: number; name: string; description?: string };
export type Specialty = { id: number; name: string; role_id?: number | null; description?: string; image_storage_key?: string };

export function CandelaObscuraForm({
  loading,
  roles,
  specialties,
  roleId,
  setRoleId,
  specialtyId,
  setSpecialtyId,
}: {
  loading: boolean;
  roles: Role[];
  specialties: Specialty[];
  roleId: number | "";
  setRoleId: (v: number | "") => void;
  specialtyId: number | "";
  setSpecialtyId: (v: number | "") => void;
}) {
  return (
    <div className="panel">
      <div style={{ fontWeight: 700, marginBottom: 10, opacity: 0.9 }}>Ficha do Sistema — Candela Obscura</div>

      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Papel
          <select
            value={roleId}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : "";
              setRoleId(v);
              setSpecialtyId("");
            }}
            disabled={loading}
          >
            <option value="">{loading ? "Carregando…" : "Selecione…"}</option>
            {Array.isArray(roles) ? roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            )) : null}
          </select>
        </label>

        <label>
          Especialidade
          <select
            value={specialtyId}
            onChange={(e) => setSpecialtyId(e.target.value ? Number(e.target.value) : "")}
            disabled={loading || roleId === ""}
          >
            <option value="">
              {roleId === "" ? "Escolha um papel primeiro…" : loading ? "Carregando…" : "Selecione…"}
            </option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
