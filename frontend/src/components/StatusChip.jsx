import React from "react";
import Chip from "@mui/material/Chip";
import { alpha, useTheme } from "@mui/material/styles";

/**
 * Chip de estado unificado para ejecuciones y queue items. Fondo tintado al
 * 15% del color semántico + texto del color pleno (no solo un borde de
 * color, que en fallos se leía como "solo texto rojo" y perdía peso visual).
 */
const MAP = {
  // ejecuciones
  PENDING: { label: "Pendiente", color: "default" },
  RUNNING: { label: "En ejecución", color: "info" },
  SUCCESS: { label: "Éxito", color: "success" },
  FAILED: { label: "Falló", color: "error" },
  ABORTED: { label: "Abortada", color: "warning" },
  // queue items
  New: { label: "New", color: "default" },
  InProgress: { label: "In Progress", color: "info" },
  Successful: { label: "Successful", color: "success" },
  Failed: { label: "Failed", color: "error" },
  Retried: { label: "Retried", color: "warning" },
  Abandoned: { label: "Abandoned", color: "warning" },
};

export default function StatusChip({ status, size = "small" }) {
  const theme = useTheme();
  const cfg = MAP[status] || { label: status || "—", color: "default" };
  const main = cfg.color === "default" ? theme.palette.text.secondary : theme.palette[cfg.color].main;

  return (
    <Chip
      label={cfg.label}
      size={size}
      sx={{
        color: main,
        bgcolor: alpha(main, 0.15),
        fontWeight: 600,
        border: "none",
      }}
    />
  );
}
