import { describe, it, expect } from "vitest";
import { sanitizeForCsv, rowsToCsv, parseCsvText, parseGuestImportCsv, GUEST_IMPORT_TEMPLATE_CSV } from "./guest-csv";

describe("sanitizeForCsv — formula injection protection", () => {
  it("prefixes a leading =, +, -, or @ with an apostrophe", () => {
    expect(sanitizeForCsv("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(sanitizeForCsv("+1234")).toBe("'+1234");
    expect(sanitizeForCsv("-1234")).toBe("'-1234");
    expect(sanitizeForCsv("@import")).toBe("'@import");
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeForCsv("Jane Doe")).toBe("Jane Doe");
    expect(sanitizeForCsv("jane@example.com")).toBe("jane@example.com"); // @ not leading
  });
});

describe("rowsToCsv", () => {
  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = rowsToCsv(["name", "note"], [["Jane, Doe", 'she said "hi"']]);
    expect(csv).toContain('"Jane, Doe"');
    expect(csv).toContain('"she said ""hi"""');
  });

  it("never exports a raw formula-shaped cell unescaped", () => {
    const csv = rowsToCsv(["name"], [["=cmd|'/c calc'!A1"]]);
    expect(csv.split("\r\n")[1]).toBe("'=cmd|'/c calc'!A1");
  });
});

describe("parseCsvText", () => {
  it("parses a simple CSV", () => {
    expect(parseCsvText("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    expect(parseCsvText('name,note\n"Doe, Jane","she said ""hi"""')).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'she said "hi"'],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsvText("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseGuestImportCsv", () => {
  it("parses the template file itself with zero errors", () => {
    const result = parseGuestImportCsv(GUEST_IMPORT_TEMPLATE_CSV);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      name: "Jane Doe",
      householdName: "Doe Family",
      contactEmail: "jane@example.com",
      contactPhone: "+1 555 0100",
      permittedAttendees: 2,
      allowPlusOne: true,
      internalNotes: null,
    });
  });

  it("maps columns by header name, not position", () => {
    const csv = "contactEmail,name\nx@example.com,X";
    const result = parseGuestImportCsv(csv);
    expect(result.rows[0].name).toBe("X");
    expect(result.rows[0].contactEmail).toBe("x@example.com");
  });

  it("reports a missing name column as a file-level error", () => {
    const result = parseGuestImportCsv("contactEmail\nx@example.com");
    expect(result.errors[0].message).toContain("no 'name' column");
    expect(result.rows).toEqual([]);
  });

  it("reports a row with a missing name", () => {
    const result = parseGuestImportCsv("name,contactEmail\n,x@example.com");
    expect(result.errors).toEqual([{ row: 1, message: "Missing name." }]);
  });

  it("rejects an invalid email", () => {
    const result = parseGuestImportCsv("name,contactEmail\nJane,not-an-email");
    expect(result.errors[0].message).toContain("valid email");
  });

  it("rejects an out-of-range permittedAttendees", () => {
    const result = parseGuestImportCsv("name,permittedAttendees\nJane,99");
    expect(result.errors[0].message).toContain("between 1 and 10");
  });

  it("flags a file over the row limit as truncated", () => {
    const rows = Array.from({ length: 510 }, (_, i) => `Guest ${i}`).join("\n");
    const result = parseGuestImportCsv(`name\n${rows}`);
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(500);
  });

  it("does not choke on a formula-injection attempt in a name field — parses it as plain text (sanitization happens on export, not import)", () => {
    const result = parseGuestImportCsv('name\n"=cmd|\'/c calc\'!A1"');
    expect(result.errors).toEqual([]);
    expect(result.rows[0].name).toBe("=cmd|'/c calc'!A1");
  });
});
