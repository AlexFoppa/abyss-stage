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
  // CandelaObscuraForm.tsx (estrutura esperada p/ ficar com a mesma estética)
  return (
    <>
      <h2 className="create-title">Ficha do Sistema — Candela Obscura</h2>

      <label className="ui-label">
        <span>Papel</span>
        <select className="ui-field" value={roleId} onChange={(e) => setRoleId(Number(e.target.value) || "")} disabled={loading}>
          <option value="">{loading ? "Carregando…" : "Selecione…"}</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>

      <label className="ui-label">
        <span>Especialidade</span>
        <select className="ui-field" value={specialtyId} onChange={(e) => setSpecialtyId(Number(e.target.value) || "")} disabled={loading || roleId === ""}>
          <option value="">{loading ? "Carregando…" : "Selecione…"}</option>
          {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
    </>
  );
}
