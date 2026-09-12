import React from "react";
import { Alert, AlertTitle, Box, Button } from "@mui/material";

/**
 * Atrapa errores de render de las páginas: en vez de pantalla en blanco,
 * muestra el mensaje del error (y lo deja en la consola).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Error de render:", error, info);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" variant="outlined">
          <AlertTitle>Se rompió esta pantalla</AlertTitle>
          <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", m: 0 }}>
            {String(error?.stack || error?.message || error)}
            {info?.componentStack ? `\n--- componente ---\n${info.componentStack}` : ""}
          </Box>
          <Button sx={{ mt: 1 }} size="small" onClick={() => this.setState({ error: null, info: null })}>
            Reintentar
          </Button>
        </Alert>
      </Box>
    );
  }
}
