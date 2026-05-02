import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InsuranceProcess,
  PROCESS_STATUSES,
  ProcessStatus,
} from "@/types/process";
import { StatusBadge } from "./StatusBadge";
import { toast } from "sonner";

interface Props {
  process: InsuranceProcess | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: string,
    patch: { status: ProcessStatus; requiredDate: string }
  ) => void;
  onAddNote: (id: string, text: string, author?: string) => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("he-IL");
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export function ProcessDetailsDialog({
  process,
  open,
  onOpenChange,
  onSave,
  onAddNote,
}: Props) {
  const [status, setStatus] = useState<ProcessStatus>("חדש");
  const [requiredDate, setRequiredDate] = useState("");
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (process) {
      setStatus(process.status);
      setRequiredDate(process.requiredDate);
      setNoteText("");
    }
  }, [process]);

  if (!process) return null;

  const handleSave = () => {
    onSave(process.id, { status, requiredDate });
    toast.success("השינויים נשמרו בהצלחה");
  };

  const handleAddNote = () => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      toast.error("יש להזין טקסט להערה");
      return;
    }
    onAddNote(process.id, trimmed, "Agent");
    setNoteText("");
    toast.success("ההערה נוספה");
  };

  const sortedNotes = [...process.notes].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const latestNoteId = sortedNotes.length ? sortedNotes[sortedNotes.length - 1].id : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        data-testid="process-details-dialog"
        data-process-id={process.id}
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span data-testid="details-process-number">{process.id}</span>
            <StatusBadge status={process.status} />
          </DialogTitle>
          <DialogDescription>
            פרטי תהליך, עדכון סטטוס, תאריך טיפול והוספת הערות.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <DetailField label="סוג תהליך" value={process.type} testid="details-type" />
          <DetailField label="שם לקוח" value={process.customerName} testid="details-customer" />
          <DetailField label="תעודת זהות" value={process.idNumber} testid="details-id" />
          <DetailField label="מספר קופה" value={process.fundNumber} testid="details-fund-number" />
          <DetailField
            label="קופה קיימת"
            value={process.existingFund || "—"}
            testid="details-existing-fund"
          />
          <DetailField
            label="קופה חדשה"
            value={process.newFund || "—"}
            testid="details-new-fund"
          />
          <DetailField
            label="תאריך פתיחת משימה"
            value={formatDateTime(process.createdAt)}
            testid="details-created"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
          <div className="space-y-2">
            <Label htmlFor="status-select">סטטוס</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProcessStatus)}>
              <SelectTrigger id="status-select" data-testid="status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROCESS_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} data-testid={`status-option-${s}`}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="required-date-input">תאריך טיפול נדרש</Label>
            <Input
              id="required-date-input"
              data-testid="required-date-input"
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="font-semibold mb-3">הערות ({sortedNotes.length})</h3>
          <ul
            data-testid="notes-list"
            className="space-y-2 max-h-64 overflow-y-auto pl-1"
          >
            {sortedNotes.map((n) => (
              <li
                key={n.id}
                data-testid={n.id === latestNoteId ? "new-note-item" : "note-item"}
                data-note-author={n.author}
                className="bg-muted/50 rounded-lg p-3 border border-border"
              >
                <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">{n.author}</span>
                  <span>{formatDateTime(n.timestamp)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
            {sortedNotes.length === 0 && (
              <li className="text-sm text-muted-foreground">אין הערות עדיין.</li>
            )}
          </ul>

          <div className="mt-4 space-y-2">
            <Label htmlFor="add-note-textarea">הוספת הערה חדשה</Label>
            <Textarea
              id="add-note-textarea"
              data-testid="add-note-textarea"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="כתבו הערה..."
              className="min-h-[80px]"
            />
            <Button
              type="button"
              variant="secondary"
              data-testid="add-note-button"
              onClick={handleAddNote}
            >
              הוסף הערה
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-process-button">
            סגור
          </Button>
          <Button onClick={handleSave} data-testid="save-process-button">
            שמור שינויים
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div data-testid={testid} className="text-sm font-medium">
        {value}
      </div>
    </div>
  );
}