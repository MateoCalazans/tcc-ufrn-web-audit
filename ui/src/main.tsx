import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "@fontsource-variable/archivo/wdth.css";
import "lenis/dist/lenis.css";
import "./estilo.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
