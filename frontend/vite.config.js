import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración estándar de Vite + React.
// El puerto 5173 es el default y coincide con el CORS habilitado en el backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
