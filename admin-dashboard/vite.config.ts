import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: dirname,
  base: "/admin-dashboard/",
  plugins: [react()],
  build: { outDir: path.resolve(dirname, "dist"), emptyOutDir: true },
  server: { port: 3200, host: "0.0.0.0" },
});
