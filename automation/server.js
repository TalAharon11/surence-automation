/**
 * Automation HTTP Service
 * -----------------------
 * Wraps automate.js as an Express HTTP server so n8n can trigger it remotely.
 *
 * POST /run
 *   Body: multipart/form-data  →  field "file" = the Excel report (.xlsx)
 *   Response: JSON { success, auditText, auditJson }
 *
 * GET /health
 *   Response: JSON { status: "ok" }
 *
 * Env vars:
 *   PORT      — port to listen on (default: 3000)
 *   SITE_URL  — URL of the demo site (default: http://localhost:8080)
 *   HEADLESS  — passed through to automate.js (default: "true" in server mode)
 */

import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Save uploaded Excel files into the existing reports/ folder
const upload = multer({
  dest: path.join(__dirname, "reports"),
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.includes("spreadsheet") ||
      file.mimetype.includes("excel") ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls");
    cb(null, ok);
  },
});

// ---------------------------------------------------------------- company name extractor

function extractCompanyName(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("harel") || lower.includes("הראל")) return "הראל";
  if (lower.includes("menora") || lower.includes("מנורה")) return "מנורה";
  if (lower.includes("migdal") || lower.includes("מגדל")) return "מגדל";
  if (lower.includes("clal") || lower.includes("כלל")) return "כלל";
  // fallback — take the first word before _ or space
  const match = filename.match(/^([^_\s]+)/);
  return match ? match[1] : "לא ידוע";
}

// ---------------------------------------------------------------- POST /run

app.post("/run", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No Excel file received. Send it as multipart/form-data field named "file".',
    });
  }

  // Multer strips the extension — add it back so XLSX and the audit naming work
  const originalName = req.file.originalname || "report.xlsx";
  const ext = path.extname(originalName) || ".xlsx";
  const xlsxPath = req.file.path + ext;
  fs.renameSync(req.file.path, xlsxPath);

  console.log(`\n[server] 📥 Received file: ${originalName}`);
  console.log(`[server] 📂 Saved to: ${xlsxPath}`);
  console.log(`[server] 🚀 Starting automation...`);

  try {
    const result = await runAutomation(xlsxPath, originalName);
    console.log("[server] ✅ Automation complete.");
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[server] ❌ Automation failed:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------- GET /health

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "insurance-automation" });
});

// ---------------------------------------------------------------- runner

function runAutomation(xlsxPath, originalName) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      // Default to headless in server mode; can be overridden via env
      HEADLESS: process.env.HEADLESS ?? "true",
    };

    const child = spawn("node", ["automate.js", xlsxPath], {
      cwd: __dirname,
      env: { ...env, ORIGINAL_FILENAME: originalName },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk); // mirror to server logs
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`automate.js exited with code ${code}.\n${stderr}`)
        );
      }

      // Read the audit files written by automate.js
      const baseName = path.basename(xlsxPath, path.extname(xlsxPath));
      const auditDir = path.join(__dirname, "audit");
      const txtPath = path.join(auditDir, `${baseName}-audit.txt`);
      const jsonPath = path.join(auditDir, `${baseName}-audit.json`);

      const auditText = fs.existsSync(txtPath)
        ? fs.readFileSync(txtPath, "utf8")
        : stdout;

      const htmlPath = path.join(auditDir, `${baseName}-audit.html`);
      const auditHtml = fs.existsSync(htmlPath)
        ? fs.readFileSync(htmlPath, "utf8")
        : null;

      let auditJson = null;
      if (fs.existsSync(jsonPath)) {
        try {
          auditJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        } catch {
          // ignore parse errors — text report is enough
        }
      }

      resolve({ auditText, auditHtml, auditJson, companyName: extractCompanyName(originalName) });
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn automate.js: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------- start

app.listen(PORT, () => {
  console.log(`\n🚀 Automation service listening on port ${PORT}`);
  console.log(`   POST /run    — trigger automation with Excel file`);
  console.log(`   GET  /health — health check\n`);
});
