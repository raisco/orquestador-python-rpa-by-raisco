import { createContext } from "react";

/** Contexto para alternar el modo de color. `toggle()` cambia claro <-> noche. */
const ColorModeContext = createContext({ mode: "light", toggle: () => {} });

export default ColorModeContext;
