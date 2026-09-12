import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

export default function Logo() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1 }}>
      <Box
        component="svg"
        viewBox="0 0 32 32"
        sx={{ width: 30, height: 30, flexShrink: 0 }}
      >
        <rect width="32" height="32" rx="8" fill={primary} />
        <circle cx="10.5" cy="21" r="3" fill={theme.palette.primary.contrastText} />
        <circle cx="21.5" cy="21" r="3" fill={theme.palette.primary.contrastText} />
        <circle cx="16" cy="10.5" r="3" fill={theme.palette.primary.contrastText} />
        <path
          d="M10.5 18 L16 13.5 L21.5 18"
          stroke={theme.palette.primary.contrastText}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </Box>
      <Box sx={{ lineHeight: 1 }}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: "1.05rem",
            letterSpacing: "0.06em",
            color: "text.primary",
            lineHeight: 1.1,
          }}
        >
          RAISCO
        </Typography>
        <Typography
          sx={{ fontSize: "0.65rem", color: "text.secondary", letterSpacing: "0.02em" }}
        >
          Orquestador de Automatizaciones
        </Typography>
      </Box>
    </Box>
  );
}
