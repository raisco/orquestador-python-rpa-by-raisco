import { createTheme } from "@mui/material/styles";

/**
 * theme.js — tema corporativo con modo claro y modo noche.
 * `getTheme("light" | "dark")` devuelve el theme de MUI correspondiente.
 * Sin neón: superficies planas, bordes 1px, azul corporativo para la acción.
 */

const SHARED = {
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h4: { fontWeight: 600, fontSize: "1.5rem" },
    h5: { fontWeight: 600, fontSize: "1.25rem" },
    h6: { fontWeight: 600, fontSize: "1rem", letterSpacing: 0 },
    subtitle2: { fontWeight: 600 },
    body2: { fontSize: "0.8125rem" },
    button: { textTransform: "none", fontWeight: 500 },
  },
};

const PALETTES = {
  light: {
    mode: "light",
    primary: { main: "#2266E3", contrastText: "#FFFFFF" },
    secondary: { main: "#E8590C" },
    success: { main: "#1B7A5A" },
    error: { main: "#C0362C" },
    warning: { main: "#B7791F" },
    info: { main: "#1E63B8" },
    background: { default: "#F4F6F8", paper: "#FFFFFF" },
    divider: "#E4E7EB",
    text: { primary: "#1F2933", secondary: "#6B7280" },
  },
  dark: {
    mode: "dark",
    primary: { main: "#4C86F0", contrastText: "#0B1220" },
    secondary: { main: "#F0803C" },
    success: { main: "#3F9D7C" },
    error: { main: "#E5675C" },
    warning: { main: "#D9A441" },
    info: { main: "#5B9BD5" },
    background: { default: "#0F141A", paper: "#1A2027" },
    divider: "#2A323C",
    // primary = título de fila (blanco/semibold); secondary = metadata tenue
    // (key, rutas, timestamps) — #8A8F98 da ~5:1 de contraste sobre el fondo
    // oscuro actual (paper y default), pasa AA para texto normal.
    text: { primary: "#F5F5F5", secondary: "#8A8F98" },
  },
};

const SURFACE = {
  light: { appbar: "#FFFFFF", border: "#E4E7EB", tableHead: "#FAFBFC" },
  dark: { appbar: "#1A2027", border: "#2A323C", tableHead: "#161C22" },
};

export function getTheme(mode = "light") {
  const s = SURFACE[mode] || SURFACE.light;
  return createTheme({
    ...SHARED,
    palette: PALETTES[mode] || PALETTES.light,
    components: {
      MuiButton: { defaultProps: { size: "small", disableElevation: true } },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "inherit" },
        styleOverrides: {
          root: { backgroundColor: s.appbar, borderBottom: `1px solid ${s.border}` },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: s.appbar, borderRight: `1px solid ${s.border}` },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { outlined: { border: `1px solid ${s.border}` } },
      },
      MuiCard: { defaultProps: { variant: "outlined" } },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 600,
            color: PALETTES[mode].text.secondary,
            backgroundColor: s.tableHead,
            fontSize: "0.75rem",
          },
          root: { borderBottom: `1px solid ${s.border}` },
        },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 500, borderRadius: 4 } } },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 500, minHeight: 44 } } },
    },
  });
}

// Compatibilidad: export default = tema claro.
export default getTheme("light");
