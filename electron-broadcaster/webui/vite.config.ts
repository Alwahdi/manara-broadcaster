import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The WIVA Agent serves this build from disk over the LAN (no CDN, no internet).
// Use relative asset paths so the app works under any base path the Agent mounts.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5273,
    // During development, proxy API + stream calls to a running Agent.
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/media": "http://127.0.0.1:8788",
      "/iptv": "http://127.0.0.1:8788",
      "/sub": "http://127.0.0.1:8788",
      "/library-assets": "http://127.0.0.1:8788",
      "/media-art": "http://127.0.0.1:8788",
    },
  },
});
