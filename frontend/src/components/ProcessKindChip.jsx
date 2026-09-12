import React from "react";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { alpha, useTheme } from "@mui/material/styles";

/**
 * Tag de tipo de proceso: dispatcher = azul, performer = verde,
 * standalone = gris. Fondo al 15% de opacidad del color + texto del color
 * pleno (mismo lenguaje visual que StatusChip).
 */
const LABEL = { dispatcher: "dispatcher", performer: "performer", standalone: "standalone" };
const DESCRIPTION = {
  dispatcher: "genera ítems",
  performer: "procesa ítems",
  standalone: "sin cola",
};

export default function ProcessKindChip({ kind, size = "small" }) {
  const theme = useTheme();
  const k = kind || "standalone";
  const main = k === "dispatcher" ? theme.palette.info.main
    : k === "performer" ? theme.palette.success.main
    : theme.palette.text.secondary;

  return (
    <Tooltip title={DESCRIPTION[k] || ""}>
      <Chip
        size={size}
        label={LABEL[k] || k}
        sx={{
          color: main,
          bgcolor: alpha(main, 0.15),
          fontWeight: 600,
          border: "none",
        }}
      />
    </Tooltip>
  );
}
