import React from "react";
import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ArrowBackIcon from "@mui/icons-material/ArrowBackIosNew";

/**
 * Encabezado de página con botón "atrás". `to` opcional: si se pasa navega
 * a esa ruta; si no, hace history.back().
 */
export default function PageHeader({ title, subtitle, to, actions }) {
  const navigate = useNavigate();
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
      <Tooltip title="Volver">
        <IconButton size="small" aria-label="Volver" onClick={() => (to ? navigate(to) : navigate(-1))}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h5" noWrap>{title}</Typography>
        {subtitle && (
          typeof subtitle === "string" ? (
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {subtitle}
            </Typography>
          ) : (
            <Box sx={{ mt: 0.5 }}>{subtitle}</Box>
          )
        )}
      </Box>
      {actions}
    </Stack>
  );
}
