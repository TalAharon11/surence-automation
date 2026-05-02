import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// File where process state is persisted on disk so Playwright and the
// user's browser share the same source of truth.
const STATE_FILE = path.resolve(__dirname, "state.json");

// https://vitejs.dev/config/
export default defineConfig(({}) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // ── State persistence API ──────────────────────────────────────────────
    // GET  /api/state  → returns the saved process list (or null)
    // POST /api/state  → saves the process list to state.json on disk
    //
    // This lets any browser context (Playwright OR the user's browser)
    // share the same persisted state, solving the localStorage isolation issue.
    {
      name: "state-persistence",
      configureServer(server) {
        server.middlewares.use("/api/state", (req, res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");

          if (req.method === "GET") {
            if (fs.existsSync(STATE_FILE)) {
              res.end(fs.readFileSync(STATE_FILE, "utf8"));
            } else {
              res.end("null");
            }
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              try {
                fs.writeFileSync(STATE_FILE, body, "utf8");
                res.end('{"ok":true}');
              } catch (e) {
                res.statusCode = 500;
                res.end('{"ok":false}');
              }
            });
            return;
          }

          res.statusCode = 405;
          res.end("Method Not Allowed");
        });
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
