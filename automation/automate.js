/**
 * Insurance Daily Report Automation
 * -----------------------------------
 * Reads a daily Excel report (Harel / Menora / any with the same schema) and
 * updates the matching tasks in the demo site via Playwright.
 *
 * Usage:
 *   node automate.js <path-to-report.xlsx>
 *
 * Env vars:
 *   SITE_URL  — base URL of the demo site (default: http://localhost:8080)
 *   HEADLESS  — "true" to run headless, default: false for local dev
 */

import { chromium } from "playwright";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------- config
const SITE_URL = process.env.SITE_URL || "http://localhost:8080";

// FIX: was `=== "false"` which was completely inverted.
// Now: HEADLESS=true → headless, anything else → visible browser (local dev default).
const HEADLESS = process.env.HEADLESS === "true";

const REPORT_PATH = process.argv[2];

if (!REPORT_PATH) {
  console.error("❌ חסר נתיב לקובץ הדוח. שימוש: node automate.js <file.xlsx>");
  process.exit(1);
}
if (!fs.existsSync(REPORT_PATH)) {
  console.error(`❌ הקובץ לא קיים: ${REPORT_PATH}`);
  process.exit(1);
}

// Path where the Playwright browser context (localStorage) is persisted
// between runs so data is not reset each time.
const STATE_FILE = path.join(
  path.dirname(REPORT_PATH),
  "..",
  "browser-state.json"
);

// ---------------------------------------------------------------- helpers

/** Format Date -> dd/mm/yyyy */
function formatDateDMY(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Parse "DD/MM/YYYY" -> Date */
function parseDMY(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  const s = String(str).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

/** Convert Date -> "YYYY-MM-DD" for the <input type="date"> element. */
function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The 15th of the next month, relative to today. */
function fifteenthOfNextMonth(today = new Date()) {
  return new Date(today.getFullYear(), today.getMonth() + 1, 15);
}

/** Normalize header names so we don't depend on column order or trailing spaces. */
function normalizeHeader(h) {
  return String(h || "").trim();
}

/** Read the Excel file -> array of rows with normalized fields. */
function readReport(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const wb = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  return rows.map((row, i) => {
    const get = (key) => {
      const found = Object.keys(row).find(
        (k) => normalizeHeader(k) === key
      );
      return found ? String(row[found]).trim() : "";
    };

    return {
      rowIndex: i + 2,
      customerName: get("שם"),
      idNumber: get("תעודת זהות"),
      fundNumber: get("מספר קופה"),
      isValid: get("האם הטפסים התקבלו תקין"),
      notes: get("הערות"),
      expectedDate: get("צפי ניוד"),
    };
  });
}

/**
 * Decide which case applies to a row.
 * Returns { case: 1|2|3, status, requiredDateISO, requiredDateDMY, noteText }
 *      or { case: null, reason } if the row doesn't match any rule.
 */
function decideCase(row, today = new Date()) {
  const valid = row.isValid === "כן";
  const expected = parseDMY(row.expectedDate);

  // Case 3 — not valid
  if (row.isValid === "לא") {
    return {
      case: 3,
      status: "נדחה",
      requiredDateISO: toDateInputValue(today),
      requiredDateDMY: formatDateDMY(today),
      noteText: row.notes || "הטפסים לא תקינים",
    };
  }

  // Case 1 — valid + expected transfer date
  if (valid && expected) {
    return {
      case: 1,
      status: "בטיפול",
      requiredDateISO: toDateInputValue(expected),
      requiredDateDMY: formatDateDMY(expected),
      noteText: `צפי ניוד בתאריך: ${formatDateDMY(expected)}`,
    };
  }

  // Case 2 — valid + "ממתין להפקדות"
  if (valid && row.notes.includes("ממתין להפקדות")) {
    const date = fifteenthOfNextMonth(today);
    return {
      case: 2,
      status: "בטיפול",
      requiredDateISO: toDateInputValue(date),
      requiredDateDMY: formatDateDMY(date),
      noteText: "ממתין להפקדות",
    };
  }

  return { case: null, reason: "לא תואם לאף מקרה מוגדר באוטומציה" };
}

// ---------------------------------------------------------------- automation

async function updateTask(page, row, decision, audit) {
  // 1. Clear search fields and filter to the specific task (id + fund number).
  await page.fill('[data-testid="search-id-input"]', "");
  await page.fill('[data-testid="search-fund-input"]', "");
  await page.fill('[data-testid="search-id-input"]', row.idNumber);
  await page.fill('[data-testid="search-fund-input"]', row.fundNumber);

  // Small settle delay so the filter re-renders the table rows.
  await page.waitForTimeout(300);

  // 2. Find the matching row.
  const rowSelector = `[data-testid="process-row"][data-id-number="${row.idNumber}"][data-fund-number="${row.fundNumber}"]`;
  const targetRow = page.locator(rowSelector);

  if ((await targetRow.count()) === 0) {
    audit.failed.push({
      customerName: row.customerName,
      idNumber: row.idNumber,
      fundNumber: row.fundNumber,
      reason: "לא נמצאה משימה תואמת באתר",
    });
    return;
  }

  // 2b. Check if this exact scenario was already processed — compare by last note text.
  // This correctly handles cases where status is the same (e.g. "בטיפול") but the
  // underlying data changed (e.g. ממתין להפקדות → צפי ניוד).
  const currentLastNote = await targetRow.getAttribute("data-last-note");
  const currentStatus = await targetRow.getAttribute("data-status");
  if (currentStatus !== "חדש" && currentLastNote === decision.noteText) {
    audit.unchanged.push({
      customerName: row.customerName,
      idNumber: row.idNumber,
      fundNumber: row.fundNumber,
      status: currentStatus,
      reason: "אותו מצב כמו בדוח הקודם — לא בוצע עדכון",
    });
    return;
  }

  // 3. Open the details dialog.
  await targetRow.locator('[data-testid="open-process-button"]').first().click();
  await page.waitForSelector('[data-testid="process-details-dialog"]');

  // FIX: Wait for the form elements inside the dialog to be ready.
  await page.waitForSelector('[data-testid="status-select"]');

  // 4. Update status — open the dropdown, wait for option, click it.
  await page.click('[data-testid="status-select"]');
  // FIX: Wait for the dropdown option to appear in the DOM before clicking.
  await page.waitForSelector(`[data-testid="status-option-${decision.status}"]`, {
    state: "visible",
  });
  await page.click(`[data-testid="status-option-${decision.status}"]`);

  // 5. Update required date.
  await page.fill('[data-testid="required-date-input"]', decision.requiredDateISO);

  // 6. Save status + date changes.
  await page.click('[data-testid="save-process-button"]');

  // 7. Add note.
  await page.fill('[data-testid="add-note-textarea"]', decision.noteText);
  await page.click('[data-testid="add-note-button"]');

  // Wait for the note to appear in the list before closing.
  await page.waitForSelector('[data-testid="new-note-item"]', { timeout: 3000 }).catch(() => {});

  // 8. Close dialog and wait for it to fully unmount.
  await page.click('[data-testid="close-process-button"]');
  await page
    .waitForSelector('[data-testid="process-details-dialog"]', {
      state: "detached",
      timeout: 5000,
    })
    .catch(() => {});

  // 9. Record in audit.
  const entry = {
    customerName: row.customerName,
    idNumber: row.idNumber,
    fundNumber: row.fundNumber,
    case: decision.case,
    status: decision.status,
    requiredDate: decision.requiredDateDMY,
    noteText: decision.noteText,
  };

  if (decision.status === "נדחה") {
    audit.rejected.push(entry);
  } else {
    audit.success.push(entry);
  }
}

// ---------------------------------------------------------------- audit report builder

function buildAuditReport(audit, reportFile) {
  const originalFilename = process.env.ORIGINAL_FILENAME || path.basename(reportFile);
  const total =
    audit.success.length +
    audit.rejected.length +
    audit.failed.length +
    audit.skipped.length +
    audit.unchanged.length;
  const today = formatDateDMY(new Date());

  // ── HTML report ────────────────────────────────────────────────
  const tableStyle = `width:100%;border-collapse:collapse;margin-bottom:24px;`;
  const thStyle = `background:#1e3a5f;color:#fff;padding:10px 14px;text-align:right;font-size:13px;`;
  const tdStyle = `padding:9px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;`;

  const successRows = audit.success.map((e, i) => {
    let action = "";
    if (e.case === 1) action = `עודכן צפי ניוד לתאריך ${e.requiredDate}`;
    else if (e.case === 2) action = `ממתין להפקדות — טיפול נדחה ל-${e.requiredDate}`;
    else action = `עודכן סטטוס ל-${e.status}, תאריך טיפול: ${e.requiredDate}`;
    return `<tr>
      <td style="${tdStyle}">${i + 1}</td>
      <td style="${tdStyle}">${e.customerName}</td>
      <td style="${tdStyle}">${e.idNumber}</td>
      <td style="${tdStyle}">${e.fundNumber}</td>
      <td style="${tdStyle}">${action}</td>
    </tr>`;
  }).join("");

  const rejectedRows = audit.rejected.map((e, i) => `<tr>
    <td style="${tdStyle}">${i + 1}</td>
    <td style="${tdStyle}">${e.customerName}</td>
    <td style="${tdStyle}">${e.idNumber}</td>
    <td style="${tdStyle}">${e.fundNumber}</td>
    <td style="${tdStyle}">${e.noteText} — תאריך טיפול עודכן ל-${e.requiredDate}</td>
  </tr>`).join("");

  const failedRows = [...audit.failed, ...audit.skipped].map((e, i) => `<tr>
    <td style="${tdStyle}">${i + 1}</td>
    <td style="${tdStyle}">${e.customerName}</td>
    <td style="${tdStyle}">${e.idNumber || "—"}</td>
    <td style="${tdStyle}">${e.fundNumber || "—"}</td>
    <td style="${tdStyle}">${e.reason}</td>
  </tr>`).join("");


  const auditHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;direction:rtl;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#1e3a5f;padding:24px 28px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">דוח אוטומציה — סיכום פעולות</h1>
      <p style="color:#93c5fd;margin:6px 0 0;font-size:13px;">קובץ: ${originalFilename} &nbsp;|&nbsp; תאריך הרצה: ${today}</p>
    </div>

    <!-- Summary -->
    <div style="display:flex;gap:12px;padding:20px 28px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="flex:1;text-align:center;background:#fff;border-radius:8px;padding:14px;border:1px solid #e2e8f0;">
        <div style="font-size:26px;font-weight:bold;color:#1e3a5f;">${total}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">סה״כ תהליכים</div>
      </div>
      <div style="flex:1;text-align:center;background:#fff;border-radius:8px;padding:14px;border:1px solid #e2e8f0;">
        <div style="font-size:26px;font-weight:bold;color:#16a34a;">${audit.success.length}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">עודכנו בהצלחה</div>
      </div>
      <div style="flex:1;text-align:center;background:#fff;border-radius:8px;padding:14px;border:1px solid #e2e8f0;">
        <div style="font-size:26px;font-weight:bold;color:#d97706;">${audit.rejected.length}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">נדחו</div>
      </div>
      <div style="flex:1;text-align:center;background:#fff;border-radius:8px;padding:14px;border:1px solid #e2e8f0;">
        <div style="font-size:26px;font-weight:bold;color:#dc2626;">${audit.failed.length + audit.skipped.length}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">לא טופלו</div>
      </div>
      <div style="flex:1;text-align:center;background:#fff;border-radius:8px;padding:14px;border:1px solid #e2e8f0;">
        <div style="font-size:26px;font-weight:bold;color:#6366f1;">${audit.unchanged.length}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">ללא שינוי</div>
      </div>
    </div>

    <div style="padding:24px 28px;">

      <!-- Success -->
      <h2 style="font-size:15px;color:#16a34a;margin:0 0 12px;">✅ א. תהליכים שטופלו בהצלחה</h2>
      ${audit.success.length === 0
        ? `<p style="color:#64748b;font-size:13px;">אין תהליכים בקבוצה זו.</p>`
        : `<table style="${tableStyle}">
            <tr><th style="${thStyle}">מס׳</th><th style="${thStyle}">שם לקוח</th><th style="${thStyle}">תעודת זהות</th><th style="${thStyle}">מספר קופה</th><th style="${thStyle}">פעולה שבוצעה</th></tr>
            ${successRows}
           </table>`}

      <!-- Rejected -->
      <h2 style="font-size:15px;color:#d97706;margin:0 0 12px;">⚠️ ב. תהליכים שנדחו</h2>
      ${audit.rejected.length === 0
        ? `<p style="color:#64748b;font-size:13px;">אין תהליכים בקבוצה זו.</p>`
        : `<table style="${tableStyle}">
            <tr><th style="${thStyle}">מס׳</th><th style="${thStyle}">שם לקוח</th><th style="${thStyle}">תעודת זהות</th><th style="${thStyle}">מספר קופה</th><th style="${thStyle}">סיבה ותאריך</th></tr>
            ${rejectedRows}
           </table>`}

      <!-- Failed -->
      <h2 style="font-size:15px;color:#dc2626;margin:0 0 12px;">❌ ג. תהליכים שלא טופלו</h2>
      ${(audit.failed.length + audit.skipped.length) === 0
        ? `<p style="color:#64748b;font-size:13px;">אין תהליכים בקבוצה זו.</p>`
        : `<table style="${tableStyle}">
            <tr><th style="${thStyle}">מס׳</th><th style="${thStyle}">שם לקוח</th><th style="${thStyle}">תעודת זהות</th><th style="${thStyle}">מספר קופה</th><th style="${thStyle}">סיבה</th></tr>
            ${failedRows}
           </table>`}

      <!-- Unchanged -->
      <h2 style="font-size:15px;color:#6366f1;margin:0 0 12px;">🔵 ד. תהליכים ללא שינוי</h2>
      ${audit.unchanged.length === 0
        ? `<p style="color:#64748b;font-size:13px;">אין תהליכים בקבוצה זו.</p>`
        : `<table style="${tableStyle}">
            <tr><th style="${thStyle}">מס׳</th><th style="${thStyle}">שם לקוח</th><th style="${thStyle}">תעודת זהות</th><th style="${thStyle}">מספר קופה</th><th style="${thStyle}">סטטוס נוכחי</th></tr>
            ${audit.unchanged.map((e, i) => `<tr>
              <td style="${tdStyle}">${i + 1}</td>
              <td style="${tdStyle}">${e.customerName}</td>
              <td style="${tdStyle}">${e.idNumber}</td>
              <td style="${tdStyle}">${e.fundNumber || "—"}</td>
              <td style="${tdStyle}">${e.status} — לא בוצע עדכון</td>
            </tr>`).join("")}
           </table>`}

    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">דוח זה נוצר אוטומטית · ${today}</p>
    </div>

  </div>
</body>
</html>`;

  // ── Plain text fallback ────────────────────────────────────────
  const lines = [];
  lines.push("דוח אוטומציה — סיכום פעולות");
  lines.push("===========================================");
  lines.push(`קובץ דוח: ${originalFilename}`);
  lines.push(`תאריך הרצה: ${today}`);
  lines.push("");
  lines.push(`סה״כ תהליכים: ${total} | עודכנו: ${audit.success.length} | נדחו: ${audit.rejected.length} | לא טופלו: ${audit.failed.length + audit.skipped.length} | ללא שינוי: ${audit.unchanged.length}`);
  lines.push("");

  lines.push("✅ א. תהליכים שטופלו בהצלחה");
  lines.push("-------------------------------------------");
  if (audit.success.length === 0) {
    lines.push("אין תהליכים בקבוצה זו.");
  } else {
    audit.success.forEach((e, i) => {
      if (e.case === 1) lines.push(`${i + 1}. ${e.customerName} (ת.ז. ${e.idNumber}) — עודכן צפי ניוד לתאריך ${e.requiredDate}`);
      else if (e.case === 2) lines.push(`${i + 1}. ${e.customerName} | ת.ז. ${e.idNumber} | קופה ${e.fundNumber} — ממתין להפקדות, טיפול נדחה ל-${e.requiredDate}`);
      else lines.push(`${i + 1}. ${e.customerName} | ת.ז. ${e.idNumber} | קופה ${e.fundNumber} — סטטוס: ${e.status}, תאריך: ${e.requiredDate}`);
    });
  }
  lines.push("");

  lines.push("⚠️ ב. תהליכים שנדחו");
  lines.push("-------------------------------------------");
  if (audit.rejected.length === 0) {
    lines.push("אין תהליכים בקבוצה זו.");
  } else {
    audit.rejected.forEach((e, i) => {
      lines.push(`${i + 1}. ${e.customerName} | ת.ז. ${e.idNumber} | קופה ${e.fundNumber} — ${e.noteText}, תאריך: ${e.requiredDate}`);
    });
  }
  lines.push("");

  lines.push("❌ ג. תהליכים שלא טופלו");
  lines.push("-------------------------------------------");
  const notHandled = [...audit.failed, ...audit.skipped];
  if (notHandled.length === 0) {
    lines.push("אין תהליכים בקבוצה זו.");
  } else {
    notHandled.forEach((e, i) => {
      lines.push(`${i + 1}. ${e.customerName} | ת.ז. ${e.idNumber || "—"} | קופה ${e.fundNumber || "—"} — ${e.reason}`);
    });
  }
  lines.push("🔵 ד. תהליכים ללא שינוי");
  lines.push("-------------------------------------------");
  if (audit.unchanged.length === 0) {
    lines.push("אין תהליכים בקבוצה זו.");
  } else {
    audit.unchanged.forEach((e, i) => {
      lines.push(`${i + 1}. ${e.customerName} | ת.ז. ${e.idNumber} | קופה ${e.fundNumber || "—"} — סטטוס ${e.status} לא השתנה מהדוח הקודם`);
    });
  }
  lines.push("");
  lines.push("===========================================");

  return { text: lines.join("\n"), html: auditHtml };
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`📥 קורא דוח: ${REPORT_PATH}`);
  const rows = readReport(REPORT_PATH);
  console.log(` נקראו ${rows.length} שורות.`);

  const audit = { success: [], rejected: [], failed: [], skipped: [], unchanged: [] };
  const today = new Date();

  console.log(`🌐 פותח דפדפן (headless=${HEADLESS})...`);
  const browser = await chromium.launch({ headless: HEADLESS });

  // FIX: Restore localStorage state from previous run if available.
  // This prevents data from being reset each time a new browser context opens.
  const contextOptions = fs.existsSync(STATE_FILE)
    ? { storageState: STATE_FILE }
    : {};

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    await page.goto(SITE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="process-table"]');

    for (const row of rows) {
      const decision = decideCase(row, today);
      console.log(
        `→ ${row.customerName} (${row.idNumber}/${row.fundNumber}) → מקרה ${decision.case ?? "-"}`
      );

      if (!decision.case) {
        audit.skipped.push({
          customerName: row.customerName,
          idNumber: row.idNumber,
          fundNumber: row.fundNumber,
          reason: decision.reason,
        });
        continue;
      }

      try {
        await updateTask(page, row, decision, audit);
      } catch (err) {
        console.error(` ⚠️ שגיאה: ${err.message}`);
        audit.failed.push({
          customerName: row.customerName,
          idNumber: row.idNumber,
          fundNumber: row.fundNumber,
          reason: `שגיאה טכנית: ${err.message}`,
        });
        // Try to close any open dialog so the next iteration starts clean.
        await page
          .click('[data-testid="close-process-button"]', { timeout: 1000 })
          .catch(() => {});
      }
    }

    // FIX: Save the browser context (localStorage) so next run continues
    // from the current state instead of starting fresh.
    await context.storageState({ path: STATE_FILE });
    console.log(`💾 מצב דפדפן נשמר: ${STATE_FILE}`);

  } finally {
    // FIX: Always close the browser to prevent Chromium process leaks.
    await browser.close();
  }

  // ---- Write outputs ----
  const { text: reportText, html: reportHtml } = buildAuditReport(audit, REPORT_PATH);
  const baseName = path.basename(REPORT_PATH, path.extname(REPORT_PATH));
  const outDir = path.join(path.dirname(REPORT_PATH), "..", "audit");
  fs.mkdirSync(outDir, { recursive: true });

  const txtPath = path.join(outDir, `${baseName}-audit.txt`);
  const htmlPath = path.join(outDir, `${baseName}-audit.html`);
  const jsonPath = path.join(outDir, `${baseName}-audit.json`);

  fs.writeFileSync(txtPath, reportText, "utf8");
  fs.writeFileSync(htmlPath, reportHtml, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source: REPORT_PATH, audit },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(reportText);
  console.log("");
  console.log(`✅ דוח Audit נשמר ב:\n  ${txtPath}\n  ${jsonPath}`);
}

main().catch((err) => {
  console.error("❌ שגיאה כללית באוטומציה:", err);
  process.exit(1);
});
