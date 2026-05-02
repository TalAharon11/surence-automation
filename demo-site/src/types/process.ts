export type ProcessType =
  | "ניוד"
  | "הצטרפות"
  | "גבייה"
  | "עדכון פרטים"
  | "משיכה"
  | "הפקדה"
  | "שינוי מסלול השקעה"
  | "העברת בעלות / שינוי מוטבים"
  | "בקשת מסמכים"
  | "טיפול בטפסים חסרים";

export type ProcessStatus =
  | "חדש"
  | "בטיפול"
  | "נדחה"
  | "הסתיים בהצלחה"
  | "הסתיים לא בהצלחה";

export const PROCESS_TYPES: ProcessType[] = [
  "ניוד",
  "הצטרפות",
  "גבייה",
  "עדכון פרטים",
  "משיכה",
  "הפקדה",
  "שינוי מסלול השקעה",
  "העברת בעלות / שינוי מוטבים",
  "בקשת מסמכים",
  "טיפול בטפסים חסרים",
];

export const PROCESS_STATUSES: ProcessStatus[] = [
  "חדש",
  "בטיפול",
  "נדחה",
  "הסתיים בהצלחה",
  "הסתיים לא בהצלחה",
];

export interface ProcessNote {
  id: string;
  timestamp: string; // ISO
  author: string; // "Agent" | "Automation Bot" | name
  text: string;
}

export interface InsuranceProcess {
  id: string; // process number, e.g. "PRC-1024"
  type: ProcessType;
  customerName: string;
  idNumber: string; // Israeli ID (fake)
  existingFund: string;
  newFund: string;
  fundNumber: string;
  status: ProcessStatus;
  createdAt: string; // ISO
  requiredDate: string; // ISO date (yyyy-mm-dd)
  notes: ProcessNote[];
}