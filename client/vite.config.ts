import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "../game"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/logs": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/shutdown": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});