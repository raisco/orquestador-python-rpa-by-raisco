/**
 * FastAPI devuelve `detail` como STRING para HTTPException("mensaje"), pero
 * como ARRAY de objetos {type, loc, msg, ...} cuando falla la validación de
 * Pydantic (ej. un pattern de un campo). Meter ese array directo en JSX
 * revienta React ("Objects are not valid as a React child"). Esta función
 * siempre devuelve un string, sea cual sea la forma real de `detail`.
 */
export function apiErrorMessage(e, fallback = "Ocurrió un error.") {
  const detail = e?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "string" ? d : d?.msg || JSON.stringify(d)))
      .join("; ") || fallback;
  }
  if (typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return String(detail);
}
