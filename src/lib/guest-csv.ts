/**
 * Guest-list CSV import/export — Stage 10. Pure, client-safe string
 * handling (no Supabase, no `server-only`): usable from the import
 * preview UI (Client Component, parses the file the admin just chose,
 * entirely in the browser, before anything is sent to the server) AND
 * from the export API routes (Route Handlers, building the response
 * body). Deliberately hand-rolled rather than adding a CSV dependency —
 * "do not add XLSX dependencies unless justified; CSV is sufficient," and
 * a guest list's shape (flat, no embedded newlines expected in most
 * fields) does not justify a new supply-chain dependency for this
 * project.
 */

import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, type GuestCsvImportRow } from "@/lib/guests";

export const GUEST_IMPORT_COLUMNS = [
  "name",
  "householdName",
  "contactEmail",
  "contactPhone",
  "permittedAttendees",
  "allowPlusOne",
  "internalNotes",
] as const;

export const GUEST_IMPORT_TEMPLATE_CSV = [
  GUEST_IMPORT_COLUMNS.join(","),
  "Jane Doe,Doe Family,jane@example.com,+1 555 0100,2,true,",
  "Alex Smith,,alex@example.com,,1,false,Vegetarian",
].join("\r\n");

/**
 * Formula-injection protection for CSV EXPORT — a cell whose value would
 * be interpreted as a formula by Excel/Sheets/LibreOffice when the file
 * is opened (leading =, +, -, @, or a leading tab/carriage-return) gets a
 * leading apostrophe, the standard OWASP-recommended neutralization. Only
 * touches the small set of genuinely dangerous leading characters —
 * never rewrites ordinary text, including a name that happens to start
 * with a hyphen used as punctuation elsewhere would be over-broad, but a
 * bare leading -, =, +, or @ is never legitimate for any field this
 * project exports.
 */
export function sanitizeForCsv(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function escapeCsvField(value: string): string {
  const sanitized = sanitizeForCsv(value);
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function rowsToCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvField(cell === null || cell === undefined ? "" : String(cell))).join(","));
  }
  return lines.join("\r\n");
}

/** A minimal but correct CSV parser: handles double-quoted fields,
 *  embedded commas/newlines within quotes, and "" as an escaped quote.
 *  Returns one array of raw string fields per row (no header handling —
 *  the caller decides which row is the header). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export interface GuestCsvParseError {
  row: number;
  message: string;
}

export interface GuestCsvParseResult {
  rows: GuestCsvImportRow[];
  errors: GuestCsvParseError[];
  truncated: boolean;
}

/**
 * Parses an uploaded guest CSV into validated import rows for the
 * PREVIEW step — no database call, nothing applied yet. Column mapping
 * is by header name (case-insensitive, matched against
 * GUEST_IMPORT_COLUMNS) rather than fixed position, so a reordered or
 * partially-omitted header row (e.g. no internalNotes column at all)
 * still maps correctly — "explicit column mapping."
 */
export function parseGuestImportCsv(text: string): GuestCsvParseResult {
  if (text.length > MAX_IMPORT_FILE_BYTES) {
    return { rows: [], errors: [{ row: 0, message: `File exceeds the ${MAX_IMPORT_FILE_BYTES / 1000}KB limit.` }], truncated: false };
  }

  const table = parseCsvText(text);
  if (table.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "The file is empty." }], truncated: false };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const columnIndex = new Map<string, number>();
  for (const col of GUEST_IMPORT_COLUMNS) {
    const idx = header.indexOf(col.toLowerCase());
    if (idx !== -1) columnIndex.set(col, idx);
  }

  if (!columnIndex.has("name")) {
    return { rows: [], errors: [{ row: 0, message: "The file has no 'name' column." }], truncated: false };
  }

  const dataRows = table.slice(1);
  const truncated = dataRows.length > MAX_IMPORT_ROWS;
  const limited = dataRows.slice(0, MAX_IMPORT_ROWS);

  const rows: GuestCsvImportRow[] = [];
  const errors: GuestCsvParseError[] = [];

  limited.forEach((cells, i) => {
    const rowNumber = i + 1;
    const get = (col: (typeof GUEST_IMPORT_COLUMNS)[number]) => {
      const idx = columnIndex.get(col);
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };

    const name = get("name");
    if (!name) {
      errors.push({ row: rowNumber, message: "Missing name." });
      return;
    }
    if (name.length > 160) {
      errors.push({ row: rowNumber, message: "Name exceeds 160 characters." });
      return;
    }

    const permittedRaw = get("permittedAttendees");
    let permittedAttendees: number | null = null;
    if (permittedRaw) {
      const n = Number(permittedRaw);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        errors.push({ row: rowNumber, message: "permittedAttendees must be a whole number between 1 and 10." });
        return;
      }
      permittedAttendees = n;
    }

    const allowPlusOneRaw = get("allowPlusOne").toLowerCase();
    const allowPlusOne = allowPlusOneRaw === "" ? null : allowPlusOneRaw === "true" || allowPlusOneRaw === "1" || allowPlusOneRaw === "yes";

    const contactEmail = get("contactEmail");
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      errors.push({ row: rowNumber, message: "contactEmail is not a valid email address." });
      return;
    }

    rows.push({
      name,
      householdName: get("householdName") || null,
      contactEmail: contactEmail || null,
      contactPhone: get("contactPhone") || null,
      permittedAttendees,
      allowPlusOne,
      internalNotes: get("internalNotes") || null,
    });
  });

  return { rows, errors, truncated };
}
