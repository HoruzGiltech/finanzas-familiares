import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Puerto fijo: el backend solo acepta peticiones de http://localhost:5183.
    // strictPort hace que Vite avise si está ocupado, en vez de cambiarlo solo.
    port: 5183,
    strictPort: true,
  },
});
