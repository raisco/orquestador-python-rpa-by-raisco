import React from "react";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";

/**
 * Syntax highlighting liviano para JSON, sin librería nueva: escapa el
 * texto a HTML seguro y despues envuelve tokens (keys/strings/números/
 * booleans/null) en <span> coloreados vía regex. Pensado para bloques
 * chicos/medianos (datos de entrada, resultado, logs) — no es un parser
 * completo, es suficiente para "escanear rápido" como pide el diseño.
 */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Grupo 1: string (con o sin ":" de key después) | Grupo 2: true/false | Grupo 3: null | Grupo 4: número
const TOKEN_RE = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?)|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function tokenize(escaped, colors) {
  return escaped.replace(TOKEN_RE, (match, strTok, boolTok, nullTok, numTok) => {
    if (strTok) {
      const isKey = /:\s*$/.test(strTok);
      return `<span style="color:${isKey ? colors.key : colors.string}">${strTok}</span>`;
    }
    if (boolTok) return `<span style="color:${colors.boolean}">${match}</span>`;
    if (nullTok) return `<span style="color:${colors.nullv}">${match}</span>`;
    if (numTok) return `<span style="color:${colors.number}">${match}</span>`;
    return match;
  });
}

function useJsonColors() {
  const t = useTheme();
  return {
    key: t.palette.info.light || t.palette.info.main,
    string: t.palette.success.main,
    number: t.palette.warning.main,
    boolean: t.palette.secondary.main,
    nullv: t.palette.text.secondary,
  };
}

/** Bloque único: recibe un objeto/array (se stringifica lindo) o un string ya JSON. */
export function JsonBlock({ value, sx, emptyLabel = "null" }) {
  const colors = useJsonColors();
  let text;
  if (value == null) {
    text = emptyLabel;
  } else if (typeof value === "string") {
    try { text = JSON.stringify(JSON.parse(value), null, 2); }
    catch { text = value; }
  } else {
    text = JSON.stringify(value, null, 2);
  }
  const html = tokenize(escapeHtml(text), colors);
  return <Box component="pre" sx={sx} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Para logs de texto plano donde CADA LÍNEA puede (o no) ser un objeto JSON
 * (el patrón `self.log()` del SDK, una línea = un evento). Las líneas que no
 * parsean como JSON se muestran escapadas pero sin colorear.
 */
export function JsonLinesBlock({ text, sx }) {
  const colors = useJsonColors();
  const lines = String(text || "").split("\n");
  const html = lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          JSON.parse(trimmed);
          return tokenize(escapeHtml(line), colors);
        } catch {
          return escapeHtml(line);
        }
      }
      return escapeHtml(line);
    })
    .join("\n");
  return <Box component="pre" sx={sx} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />;
}
