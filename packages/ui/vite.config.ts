import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// In dev, `npm run dev -w @pheme/ui` proxies the API to a server started with `npm run dev:fake`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://127.0.0.1:7676" } },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
