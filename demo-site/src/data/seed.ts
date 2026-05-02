import { InsuranceProcess, ProcessStatus, ProcessType } from "@/types/process";

// ---------- ניוד: נטען ישירות מהדוחות היומיים של הראל ומנורה ----------
// בדוחות מופיע: שם, ת.ז., מספר קופה (= הקופה המעבירה), צפי ניוד, הערות.
// הקופה המקבלת נקבעת לפי הדוח (הראל / מנורה).
// "קופה קיימת" = שם היצרן המעביר (אם לא רשום בדוח — מומצא לצורך הדמו).
// "מספר קופה" בטבלה = מספר הקופה המעבירה (כפי שמופיע בדוח).

interface NiudRow {
  customerName: string;
  idNumber: string;
  fundNumber: string; // מספר הקופה המעבירה (מהדוח)
  existingFund: string; // שם יצרן מעביר
  newFund: string; // יצרן מקבל לפי הדוח
}

const NIUD_ROWS: NiudRow[] = [
  // --- דוח הראל (קופה מקבלת = הראל) ---
  { customerName: "דנה כהן",     idNumber: "123456789", fundNumber: "1001", existingFund: "אלטשולר שחם גמל", newFund: "הראל" },
  { customerName: "יוסי לוי",     idNumber: "987654321", fundNumber: "2001", existingFund: "פסגות גמל ופנסיה", newFund: "הראל" },
  { customerName: "משה ישראלי",  idNumber: "111222333", fundNumber: "3001", existingFund: "מיטב דש גמל",     newFund: "הראל" },
  { customerName: "דנה כהן",     idNumber: "123456789", fundNumber: "1002", existingFund: "ילין לפידות גמל", newFund: "הראל" },
  { customerName: "רותם בר",      idNumber: "222333444", fundNumber: "4001", existingFund: "כלל פנסיה וגמל",  newFund: "הראל" },
  // --- דוח מנורה (קופה מקבלת = מנורה) ---
  { customerName: "אלון פרץ",    idNumber: "555666777", fundNumber: "5001", existingFund: "מגדל מקפת",         newFund: "מנורה" },
  { customerName: "קרן דויד",     idNumber: "888999000", fundNumber: "6001", existingFund: "אנליסט גמל",        newFund: "מנורה" },
  { customerName: "אבי כהן",      idNumber: "321321321", fundNumber: "7001", existingFund: "הפניקס פנסיה",      newFund: "מנורה" },
  { customerName: "אלון פרץ",    idNumber: "555666777", fundNumber: "5002", existingFund: "פסגות גמל ופנסיה", newFund: "מנורה" },
  { customerName: "שיר לוי",      idNumber: "444555666", fundNumber: "8001", existingFund: "אלטשולר שחם גמל", newFund: "מנורה" },
];

// ---------- משימות דמה אחרות (לא ניוד) ----------
interface OtherRow {
  type: Exclude<ProcessType, "ניוד">;
  customerName: string;
  idNumber: string;
  fundNumber: string;
  status: ProcessStatus;
  note?: string;
}

const OTHER_ROWS: OtherRow[] = [
  { type: "הצטרפות",                       customerName: "מיכל לוי",       idNumber: "305112233", fundNumber: "210045", status: "בטיפול",          note: "ממתין לחתימת הלקוח על טפסי הצטרפות" },
  { type: "הצטרפות",                       customerName: "תומר דהן",        idNumber: "204556677", fundNumber: "210112", status: "חדש" },
  { type: "גבייה",                          customerName: "נועה אברהם",     idNumber: "318223344", fundNumber: "330021", status: "בטיפול",          note: "פנייה למעסיק לבדיקת הפקדות חסרות" },
  { type: "גבייה",                          customerName: "ערן סבן",         idNumber: "027554433", fundNumber: "330099", status: "הסתיים בהצלחה",  note: "ההפקדות הושלמו" },
  { type: "עדכון פרטים",                   customerName: "שירה פרידמן",    idNumber: "311009988", fundNumber: "415601", status: "חדש" },
  { type: "עדכון פרטים",                   customerName: "ליאת נחום",      idNumber: "208877665", fundNumber: "415620", status: "בטיפול",          note: "עדכון כתובת ופרטי קשר" },
  { type: "משיכה",                          customerName: "אורי בן-דוד",    idNumber: "059443322", fundNumber: "560011", status: "בטיפול",          note: "ממתין לאישור מס" },
  { type: "הפקדה",                          customerName: "הילה כץ",         idNumber: "315667788", fundNumber: "560074", status: "חדש" },
  { type: "שינוי מסלול השקעה",            customerName: "מאיה גולן",       idNumber: "204998877", fundNumber: "612203", status: "הסתיים בהצלחה",  note: "המסלול עודכן בהצלחה" },
  { type: "שינוי מסלול השקעה",            customerName: "יובל אלון",       idNumber: "318112233", fundNumber: "612260", status: "חדש" },
  { type: "העברת בעלות / שינוי מוטבים", customerName: "טל גרינברג",      idNumber: "041223344", fundNumber: "701145", status: "בטיפול",          note: "התקבלו טפסי מוטבים, ממתין לאימות" },
  { type: "בקשת מסמכים",                  customerName: "ענת חדד",         idNumber: "302445566", fundNumber: "805011", status: "חדש" },
  { type: "בקשת מסמכים",                  customerName: "גיא אוחיון",      idNumber: "210334455", fundNumber: "805088", status: "הסתיים בהצלחה",  note: "המסמכים נשלחו ללקוח במייל" },
  { type: "טיפול בטפסים חסרים",          customerName: "סיגל ברק",        idNumber: "316778899", fundNumber: "910022", status: "נדחה",             note: "הלקוח לא השיב לאחר 3 פניות" },
  { type: "טיפול בטפסים חסרים",          customerName: "רן אטיאס",        idNumber: "058991122", fundNumber: "910077", status: "בטיפול",          note: "ממתין לטופס 161 מהמעסיק" },
];

function isoOffset(daysAgo: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// תאריך דינמי — "היום" האמיתי בכל פעם שהאפליקציה נטענת
const _today = new Date();
export const TODAY_ISO = _today.toISOString();
export const TODAY_DATE = _today.toISOString().slice(0, 10);

export function buildSeed(): InsuranceProcess[] {
  const processes: InsuranceProcess[] = [];

  NIUD_ROWS.forEach((row, i) => {
    // כל משימות הניוד בסטטוס "חדש" - תאריך פתיחה וטיפול = היום
    const created = TODAY_ISO;
    processes.push({
      id: `PRC-${2000 + i}`,
      type: "ניוד",
      customerName: row.customerName,
      idNumber: row.idNumber,
      existingFund: row.existingFund,
      newFund: row.newFund,
      fundNumber: row.fundNumber,
      status: "חדש",
      createdAt: created,
      requiredDate: TODAY_DATE,
      notes: [
        {
          id: `n-niud-${i}-1`,
          timestamp: created,
          author: "Agent",
          text: "נשלח לחברת הביטוח",
        },
      ],
    });
  });

  OTHER_ROWS.forEach((row, i) => {
    const isNew = row.status === "חדש";
    // משימות חדשות = נפתחו היום. אחרות שומרות על תאריכים מפוזרים מהעבר.
    const created = isNew
      ? TODAY_ISO
      : isoOffset(OTHER_ROWS.length - i + 5, 10 + (i % 5), (i * 17) % 60);
    const notes = [
      {
        id: `n-other-${i}-1`,
        timestamp: created,
        author: "Agent",
        text: `נפתחה משימת ${row.type} עבור הלקוח.`,
      },
    ];
    if (row.note) {
      notes.push({
        id: `n-other-${i}-2`,
        timestamp: isNew
          ? TODAY_ISO
          : isoOffset(OTHER_ROWS.length - i + 2, 11, (i * 7) % 60),
        author: "Agent",
        text: row.note,
      });
    }
    processes.push({
      id: `PRC-${3000 + i}`,
      type: row.type,
      customerName: row.customerName,
      idNumber: row.idNumber,
      existingFund: "",
      newFund: "",
      fundNumber: row.fundNumber,
      status: row.status,
      createdAt: created,
      requiredDate: isNew ? TODAY_DATE : dateOffset(((i * 5) % 25) - 3),
      notes,
    });
  });

  return processes;
}
