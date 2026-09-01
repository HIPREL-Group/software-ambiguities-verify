import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Firebase emulators bind to loopback on the dev machine, so a browser on
// any other host cannot reach them directly. Proxying them through the dev
// server means only port 5173 has to be reachable (or forwarded) — the app,
// auth and functions all arrive on one origin. Dev-only; production builds
// talk to real Firebase and never see this config.
const emulatorProxy = {
  "/identitytoolkit.googleapis.com": "http://127.0.0.1:9099",
  "/securetoken.googleapis.com": "http://127.0.0.1:9099",
  // Must keep the region segment: bare "/software-ambi" is a prefix of the
  // app's own base path "/software-ambiguities-verify/" and would swallow it.
  "/software-ambi/us-east1": "http://127.0.0.1:5001",
};

export default defineConfig({
  base: "/software-ambiguities-verify/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: Object.fromEntries(
      Object.entries(emulatorProxy).map(([path, target]) => [
        path,
        { target, changeOrigin: true },
      ]),
    ),
  },
  build: {
    outDir: "dist",
  },
});
