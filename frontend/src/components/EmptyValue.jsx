import React from "react";
import Typography from "@mui/material/Typography";

/**
 * Reemplazo del guión "—" suelto: mismo glifo pero atenuado (opacity 0.4)
 * para que se lea como "sin dato todavía", no como un error visual.
 */
export default function EmptyValue({ children = "—", variant, component = "span" }) {
  return (
    <Typography component={component} variant={variant} sx={{ opacity: 0.4 }}>
      {children}
    </Typography>
  );
}
