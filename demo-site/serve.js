/**
 * Production server for the demo site (used in Docker).
 * - Serves the built React app from dist/
 * - Handles GET /api/state and POST /api/state for process state persistence
 * - SPA fallback so React Router works on direct URL access
 *
 * Env vars:
 *   PORT       — port to listen on (default: 8080)
 *   STATE_FILE — path to the JSON state file (default: /data/state.json)
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// In Docker: STATE_FILE=/data/state.json (mounted volume)
// Locally:   defaults to ./state.json next to this file
const STATE_FILE =
  process.env.STATE_FILE || path.join(__dirname, "state.json");

// Ensure the directory for state.json exists
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

app.use(express.json({ limit: "10mb" }));

// ── Static React build ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));

// ── State API ──────────────────────────────────────────────────────────────

app.get("/api/state", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (fs.existsSync(STATE_FILE)) {
    res.send(fs.readFileSync(STATE_FILE, "utf8"));
  } else {
    res.send("null");
  }
});

app.post("/api/state", (req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(req.body), "utf8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── SPA fallback (React Router) ────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌐 Demo site running on port ${PORT}`);
  console.log(`   State file: ${STATE_FILE}\n`);
});
