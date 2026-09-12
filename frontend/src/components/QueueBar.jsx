import React from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

/**
 * Barra segmentada que muestra la composición de una cola por estado.
 * `counts` = { New, InProgress, Successful, Failed, Retried, Abandoned, total }
 */
export const STATUS_META = {
  New: { label: "Pendientes", color: "#94A3B8" },
  InProgress: { label: "En curso", color: "#2A6DF4" },
  Successful: { label: "OK", color: "#1B7A5A" },
  Failed: { label: "Fallidos", color: "#C0362C" },
  Retried: { label: "Reintentos", color: "#B7791F" },
  Abandoned: { label: "Abandonados", color: "#8B5E34" },
};

// Orden fijo por severidad, izquierda a derecha, igual en todas las colas:
// si hay rojo, siempre está en el extremo izquierdo — no hay que buscarlo
// cola por cola.
const ORDER = ["Failed", "Retried", "InProgress", "New", "Successful", "Abandoned"];

export default function QueueBar({ counts = {} }) {
  const total = counts.total || ORDER.reduce((a, k) => a + (counts[k] || 0), 0);
  return (
    <Box sx={{ display: "flex", gap: "2px", height: 10, borderRadius: 1, overflow: "hidden", bgcolor: "action.hover" }}>
      {total === 0 && <Box sx={{ flex: 1 }} />}
      {ORDER.map((k) => {
        const n = counts[k] || 0;
        if (!n) return null;
        return (
          <Tooltip key={k} title={`${STATUS_META[k].label}: ${n}`}>
            <Box sx={{ flex: n, bgcolor: STATUS_META[k].color, borderRadius: "2px" }} />
          </Tooltip>
        );
      })}
    </Box>
  );
}
