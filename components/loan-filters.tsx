import type { LoanStatus } from "@/lib/types";

const filters: { value: string; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "requested", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "returned", label: "Devueltos" },
];

export function LoanFilters({ status }: { status?: LoanStatus }) {
  return (
    <form className="filter-form loan-filter" method="get">
      <label htmlFor="loan-status">Estado</label>
      <select defaultValue={status ?? ""} id="loan-status" name="status">
        {filters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
      </select>
      <button className="button button-secondary button-small" type="submit">Filtrar</button>
    </form>
  );
}
