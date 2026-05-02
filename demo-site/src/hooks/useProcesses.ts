import { useEffect, useState, useCallback, useRef } from "react";
import { InsuranceProcess, ProcessNote } from "@/types/process";
import { buildSeed, TODAY_ISO, TODAY_DATE } from "@/data/seed";

const STORAGE_KEY = "insurance_processes_v7";
const STATE_API = "/api/state";

function normalizeNiud(list: InsuranceProcess[], forceReset = false): InsuranceProcess[] {
  // מקור-אמת לשדות המבניים (קופה, ת.ז., שם) הוא ה-seed.
  // כאשר forceReset=false (טעינה רגילה מ-localStorage) — שומרים את הסטטוס
  // וההערות השמורים כדי שהאוטומציה תישמר לאחר רענון.
  // כאשר forceReset=true (לחיצת "איפוס דמו") — מאפסים לסטטוס "חדש".
  const seed = buildSeed();
  const seedById = new Map(seed.map((p) => [p.id, p]));
  const storedById = new Map(list.map((p) => [p.id, p]));
  const nonNiud = list.filter((p) => p.type !== "ניוד");
  const niud = seed
    .filter((p) => p.type === "ניוד")
    .map((seedProcess) => {
      const fromSeed = seedById.get(seedProcess.id) ?? seedProcess;
      const fromStored = storedById.get(seedProcess.id);
      const initialNote = {
        id: `n-niud-${fromSeed.id}-init`,
        timestamp: TODAY_ISO,
        author: "Agent",
        text: "נשלח לחברת הביטוח",
      };
      return {
        ...fromSeed,
        customerName: fromSeed.customerName,
        idNumber: fromSeed.idNumber,
        fundNumber: fromSeed.fundNumber,
        existingFund: fromSeed.existingFund,
        newFund: fromSeed.newFund,
        createdAt: TODAY_ISO,
        requiredDate: forceReset || !fromStored ? TODAY_DATE : fromStored.requiredDate,
        // שמור סטטוס והערות מה-localStorage אלא אם מדובר באיפוס מכוון
        status: forceReset || !fromStored ? ("חדש" as const) : fromStored.status,
        notes: forceReset || !fromStored ? [initialNote] : fromStored.notes,
      };
    });

  return [...niud, ...nonNiud];
}

function load(): InsuranceProcess[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeNiud(JSON.parse(raw) as InsuranceProcess[], false);
  } catch {
    // ignore
  }
  // אין נתונים שמורים — בנה seed ראשוני
  const seed = normalizeNiud(buildSeed(), true);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

export function useProcesses() {
  const [processes, setProcesses] = useState<InsuranceProcess[]>(() => load());
  // Becomes true once we've fetched from the server — prevents writing
  // the stale localStorage snapshot back to the server before we've read it.
  const serverReady = useRef(false);

  // On mount: pull the authoritative state from the dev-server API.
  // This is what Playwright wrote, so it survives browser context isolation.
  useEffect(() => {
    fetch(STATE_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: InsuranceProcess[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          const normalized = normalizeNiud(data, false);
          setProcesses(normalized);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        }
      })
      .catch(() => {})
      .finally(() => {
        serverReady.current = true;
      });
  }, []);

  // Save on every change — to both localStorage and the server.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(processes));
    if (serverReady.current) {
      fetch(STATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processes),
      }).catch(() => {});
    }
  }, [processes]);

  const updateProcess = useCallback(
    (id: string, patch: Partial<InsuranceProcess>) => {
      setProcesses((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    []
  );

  const addNote = useCallback(
    (id: string, note: Omit<ProcessNote, "id" | "timestamp"> & { timestamp?: string }) => {
      setProcesses((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                notes: [
                  ...p.notes,
                  {
                    id: `n-${id}-${Date.now()}`,
                    timestamp: note.timestamp ?? new Date().toISOString(),
                    author: note.author,
                    text: note.text,
                  },
                ],
              }
            : p
        )
      );
    },
    []
  );

  const resetDemo = useCallback(() => {
    const seed = normalizeNiud(buildSeed(), true);
    setProcesses(seed);
    // Also clear server state so the next page open starts clean.
    fetch(STATE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seed),
    }).catch(() => {});
  }, []);

  return { processes, updateProcess, addNote, resetDemo };
}