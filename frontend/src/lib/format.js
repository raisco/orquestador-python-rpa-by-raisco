/**
 * Utilidades de formato. Los timestamps del backend vienen en ISO 8601 con
 * offset (UTC o local del contenedor); acá se muestran SIEMPRE en la hora
 * local del navegador.
 */

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Duración legible: <60s -> "42s"; >=60s -> "2m 12s"; >=1h -> "1h 05m 03s".
 */
export function fmtDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const total = Math.round(Number(seconds));
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

/**
 * Copia texto al portapapeles. Usa la Clipboard API cuando hay contexto
 * seguro (localhost o https) y cae a un textarea+execCommand si no
 * (ej. si se accede por IP de la LAN sin https). Devuelve true/false.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text ?? "");
      return true;
    }
  } catch {
    /* sigue al fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text ?? "";
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
