import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendUrl = process.env.VITE_BACKEND_URL || "http://localhost:5050";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    middlewareMode: false,
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true
      },
      "/verify-callback": {
        target: backendUrl,
        changeOrigin: true
      }
    }
  },
  appType: "spa",
  build: {
    target: "es2022"
  },
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    globals: true
  }
});
