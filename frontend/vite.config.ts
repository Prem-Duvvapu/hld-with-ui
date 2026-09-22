import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: Number(env.FRONTEND_PORT || 5173),
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${env.BACKEND_PORT || 8080}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "happy-dom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
