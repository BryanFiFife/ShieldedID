import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-sqlite-wasm",
      buildStart() {
        const source = path.resolve("node_modules/sql.js/dist/sql-wasm.wasm");
        const targetDir = path.resolve("public/sql");
        const target = path.join(targetDir, "sql-wasm.wasm");
        if (fs.existsSync(source)) {
          fs.mkdirSync(targetDir, { recursive: true });
          fs.copyFileSync(source, target);
        }
      }
    },
    {
      name: "spa-fallback-middleware",
      apply: "serve",
      enforce: "post",
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            // Skip static assets and API calls
            if (/\.(?:js|css|json|wasm|png|svg|jpg|gif|ico)$/.test(req.url)) {
              return next();
            }
            // For API calls, let them through
            if (req.url.startsWith("/api") || req.url.startsWith("/v1")) {
              return next();
            }
            // For SPA navigation, rewrite to index.html (let Vite serve it through transform pipeline)
            if (req.method === "GET") {
              req.url = "/index.html";
              next();
            } else {
              next();
            }
          });
        };
      }
    },
    // Mock age-zk module during tests and development (ZK is simulated)
    {
      name: "mock-age-zk",
      enforce: "pre",
      resolveId(id) {
        if (id === 'virtual:age-zk') {
          if (process.env.NODE_ENV === 'production') {
            return this.resolve('/age-zk/shielded_age_zk.js');
          } else {
            return this.resolve(path.resolve(__dirname, 'tests/mocks/age-zk.js'));
          }
        }
      }
    }
  ],
  server: {
    host: "0.0.0.0",
    port: 5173
  },
  build: {
    target: "es2022",
    rollupOptions: {
      external: ["/age-zk/shielded_age_zk.js"]
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    globals: true,
    server: {
      deps: {
        inline: ['/age-zk/shielded_age_zk.js']
      }
    },
    resolve: {
      alias: {
        '/age-zk/shielded_age_zk.js': path.resolve(__dirname, 'tests/mocks/age-zk.js')
      }
    },
    coverage: {
      exclude: [
        'src/App.tsx',
        'src/main.tsx',
        'src/service-worker.ts',
        'src/store/**',
        'src/backend/**',
        'src/lib/chat-storage.ts',
        'src/lib/companion.ts',
        'src/lib/document-capture.ts',
        'src/lib/vault-storage.ts',
        'dist/**',
        'coverage/**',
        'tests/**',
        '**/*.d.ts'
      ],
      statements: 85,
      branches: 75,
      functions: 85,
      lines: 85
    }
  }
});
