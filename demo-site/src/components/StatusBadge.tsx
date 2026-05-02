import { ProcessStatus } from "@/types/process";
import { cn } from "@/lib/utils";

const styles: Record<ProcessStatus, string> = {
  "חדש": "bg-info/10 text-info border-info/20",
  "בטיפול": "bg-warning/15 text-warning-foreground border-warning/30",
  "נדחה": "bg-destructive/10 text-destructive border-destructive/20",
  "הסתיים בהצלחה": "bg-success/10 text-success border-success/20",
  "הסתיים לא בהצלחה": "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}