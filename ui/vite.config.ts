import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Telas da interface (S21, ADR 017). `npm run ui` compila para `ui/dist`, que o
 * próprio servidor da S20 serve em 127.0.0.1:5179. `npm run ui:dev` sobe o Vite
 * com proxy para a API.
 */
const API = "http://127.0.0.1:5179";
const DEV = 5173;

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: DEV,
    strictPort: true,
    proxy: {
      "/api": {
        target: API,
        changeOrigin: true,
        configure: (proxy) => {
          // O servidor recusa Origin de fora (DNS rebinding). Só a origem do
          // próprio Vite é trocada pela da API; qualquer outra segue e é barrada.
          proxy.on("proxyReq", (req) => {
            const o = req.getHeader("origin");
            if (o === `http://127.0.0.1:${DEV}` || o === `http://localhost:${DEV}`) req.setHeader("origin", API);
          });
        },
      },
    },
  },
});
