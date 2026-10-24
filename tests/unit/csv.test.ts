import { describe, expect, it } from "vitest";
import { escapeCsvField, sanitizeCsvCell, toCsv } from "@/lib/exports/csv";

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(sanitizeCsvCell(evil).startsWith("'")).toBe(true);
    }
    expect(sanitizeCsvCell("Normal text")).toBe("Normal text");
  });
  it("leaves real numbers, booleans and dates intact", () => {
    expect(sanitizeCsvCell(-12.5)).toBe("-12.5");
    expect(sanitizeCsvCell(true)).toBe("true");
    expect(sanitizeCsvCell(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z");
    expect(sanitizeCsvCell(Number.NaN)).toBe("");
    expect(sanitizeCsvCell(null)).toBe("");
  });
  it("quotes delimiters, quotes and newlines", () => {
    expect(escapeCsvField('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });
  it("builds CRLF rows with a header", () => {
    expect(toCsv(["a", "b"], [[1, "=x"], [null, "y,z"]])).toBe("a,b\r\n1,'=x\r\n,\"y,z\"\r\n");
  });
});
