/**
 * RFC 4180 CSV writer with spreadsheet formula-injection protection.
 *
 * - Fields containing the delimiter, quotes, CR or LF are quoted; quotes are doubled.
 * - Text beginning with = + - @ TAB or CR is prefixed with a single quote so spreadsheet
 *   applications treat it as text (OWASP CSV injection guidance). Real numbers are left alone.
 */
export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return text;
}

export function escapeCsvField(value: CsvValue, delimiter = ","): string {
  const text = sanitizeCsvCell(value);
  if (text.includes(delimiter) || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: CsvValue[][], delimiter = ","): string {
  const lines = [headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter)];
  for (const row of rows) lines.push(row.map((v) => escapeCsvField(v, delimiter)).join(delimiter));
  return lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): Response {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Byte-order mark so Excel opens UTF-8 (µg/m³, °C) correctly.
  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
