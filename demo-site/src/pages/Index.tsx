import { useMemo, useState } from "react";
import {
  Briefcase,
  Search,
  RotateCcw,
  CalendarClock,
  ListChecks,
  Activity,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProcesses } from "@/hooks/useProcesses";
import {
  PROCESS_STATUSES,
  PROCESS_TYPES,
  ProcessStatus,
  ProcessType,
  InsuranceProcess,
} from "@/types/process";
import { StatusBadge } from "@/components/StatusBadge";
import { ProcessDetailsDialog } from "@/components/ProcessDetailsDialog";

const ALL = "__all__";

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("he-IL");
}

const Index = () => {
  const { processes, updateProcess, addNote, resetDemo } = useProcesses();

  const [searchName, setSearchName] = useState("");
  const [searchId, setSearchId] = useState("");
  const [searchFund, setSearchFund] = useState("");
  const [filterType, setFilterType] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [filterRequiredDate, setFilterRequiredDate] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    return processes.filter((p) => {
      if (searchName && !p.customerName.includes(searchName.trim())) return false;
      if (searchId && !p.idNumber.includes(searchId.trim())) return false;
      if (searchFund && !p.fundNumber.includes(searchFund.trim())) return false;
      if (filterType !== ALL && p.type !== filterType) return false;
      if (filterStatus !== ALL && p.status !== filterStatus) return false;
      if (filterRequiredDate && p.requiredDate !== filterRequiredDate) return false;
      return true;
    });
  }, [processes, searchName, searchId, searchFund, filterType, filterStatus, filterRequiredDate]);

  const stats = useMemo(() => {
    const total = processes.length;
    const inProgress = processes.filter((p) => p.status === "בטיפול").length;
    const newCount = processes.filter((p) => p.status === "חדש").length;
    const today = new Date().toISOString().slice(0, 10);
    const dueToday = processes.filter((p) => p.requiredDate <= today && !p.status.startsWith("הסתיים")).length;
    return { total, inProgress, newCount, dueToday };
  }, [processes]);

  const selected: InsuranceProcess | null = selectedId
    ? processes.find((p) => p.id === selectedId) ?? null
    : null;

  const openDetails = (id: string) => {
    setSelectedId(id);
    setDialogOpen(true);
  };

  const clearFilters = () => {
    setSearchName("");
    setSearchId("");
    setSearchFund("");
    setFilterType(ALL);
    setFilterStatus(ALL);
    setFilterRequiredDate("");
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">מערכת תהליכים תפעוליים</h1>
              <p className="text-xs text-muted-foreground">ניהול תהליכים — קופות גמל, פנסיה והשתלמות</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetDemo} data-testid="reset-demo-button">
              <RotateCcw className="w-4 h-4 ml-2" />
              איפוס דמו
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<ListChecks className="w-4 h-4" />} label="סה״כ תהליכים" value={stats.total} testid="stat-total" />
          <StatCard icon={<Activity className="w-4 h-4" />} label="בטיפול" value={stats.inProgress} testid="stat-in-progress" tone="warning" />
          <StatCard icon={<Briefcase className="w-4 h-4" />} label="חדשים" value={stats.newCount} testid="stat-new" tone="info" />
          <StatCard icon={<CalendarClock className="w-4 h-4" />} label="בטיפול מיידי" value={stats.dueToday} testid="stat-due" tone="destructive" />
        </section>

        {/* Filters */}
        <section className="stat-card" data-testid="filters-card">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Search className="w-4 h-4" /> חיפוש וסינון
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FilterField label="שם לקוח">
              <Input
                data-testid="search-name-input"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="לדוגמה: דניאל"
              />
            </FilterField>
            <FilterField label="תעודת זהות">
              <Input
                data-testid="search-id-input"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="9 ספרות"
                inputMode="numeric"
              />
            </FilterField>
            <FilterField label="מספר קופה">
              <Input
                data-testid="search-fund-input"
                value={searchFund}
                onChange={(e) => setSearchFund(e.target.value)}
                placeholder="מספר קופה"
                inputMode="numeric"
              />
            </FilterField>
            <FilterField label="סוג תהליך">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="filter-type-select">
                  <SelectValue placeholder="הכל" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>הכל</SelectItem>
                  {PROCESS_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="סטטוס">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="filter-status-select">
                  <SelectValue placeholder="הכל" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>הכל</SelectItem>
                  {PROCESS_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="תאריך טיפול נדרש">
              <Input
                type="date"
                data-testid="filter-required-date-input"
                value={filterRequiredDate}
                onChange={(e) => setFilterRequiredDate(e.target.value)}
              />
            </FilterField>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters-button">
              נקה סינון
            </Button>
          </div>
        </section>

        {/* Table */}
        <section className="stat-card p-0 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-border">
            <h2 className="text-sm font-semibold">תהליכים ({filtered.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table data-testid="process-table" className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <Th>מספר תהליך</Th>
                  <Th>סוג תהליך</Th>
                  <Th>שם לקוח</Th>
                  <Th>תעודת זהות</Th>
                  <Th>קופה קיימת</Th>
                  <Th>קופה חדשה</Th>
                  <Th>מספר קופה</Th>
                  <Th>סטטוס</Th>
                  <Th>תאריך פתיחה</Th>
                  <Th>תאריך טיפול</Th>
                  <Th>הערה אחרונה</Th>
                  <Th>פעולות</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const lastNote = p.notes[p.notes.length - 1];
                  return (
                    <tr
                      key={p.id}
                      data-testid="process-row"
                      data-process-id={p.id}
                      data-id-number={p.idNumber}
                      data-fund-number={p.fundNumber}
                      data-status={p.status}
                      data-required-date={p.requiredDate}
                      data-last-note={p.notes[p.notes.length - 1]?.text ?? ""}
                      className="border-t border-border hover:bg-muted/40 transition-colors"
                    >
                      <Td className="font-mono text-xs font-semibold">{p.id}</Td>
                      <Td>{p.type}</Td>
                      <Td className="font-medium">{p.customerName}</Td>
                      <Td className="font-mono text-xs">{p.idNumber}</Td>
                      <Td className="text-xs text-muted-foreground">{p.existingFund || "—"}</Td>
                      <Td className="text-xs text-muted-foreground">{p.newFund || "—"}</Td>
                      <Td className="font-mono text-xs">{p.fundNumber}</Td>
                      <Td><StatusBadge status={p.status} /></Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDate(p.createdAt)}</Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDate(p.requiredDate)}</Td>
                      <Td className="max-w-[200px]">
                        <div className="truncate text-xs text-muted-foreground" title={lastNote?.text}>
                          {lastNote ? lastNote.text : "—"}
                        </div>
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="open-process-button"
                          data-process-id={p.id}
                          onClick={() => openDetails(p.id)}
                        >
                          פתח
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-muted-foreground text-sm" data-testid="empty-state">
                      לא נמצאו תהליכים התואמים את הסינון
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-muted-foreground text-center pb-4">
          מערכת דמו לצורך הדגמת אוטומציה (Playwright + n8n). כל הנתונים פיקטיביים.
        </p>
      </main>

      <ProcessDetailsDialog
        process={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(id, patch) => updateProcess(id, patch)}
        onAddNote={(id, text, author) => addNote(id, { text, author: author ?? "Agent" })}
      />
    </div>
  );
};

function StatCard({
  icon,
  label,
  value,
  testid,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  testid: string;
  tone?: "warning" | "info" | "destructive";
}) {
  const toneCls =
    tone === "warning"
      ? "text-warning-foreground bg-warning/15"
      : tone === "info"
      ? "text-info bg-info/10"
      : tone === "destructive"
      ? "text-destructive bg-destructive/10"
      : "text-primary bg-primary/10";
  return (
    <div className="stat-card flex items-center gap-4" data-testid={testid}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneCls}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export default Index;
