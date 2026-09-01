import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/software-ambiguities-verify/",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
