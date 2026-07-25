/**
 * Smart Paste Parser.
 * يحوّل رسالة البوت المنسقة (بنفس صيغة message_parser.py) إلى بيانات النموذج.
 *
 * مثال على الرسالة المدعومة:
 * 👤 اسم المريض (عربي): عبدالله محمد علي
 * 👤 اسم المريض (إنجليزي): Abdullah Mohammed Ali
 * 🆔 رقم الهوية: 828287654
 * ...
 */

import { LeaveFormData, EMPTY_FORM, FIELDS } from "./leave-form";

/**
 * Strip emojis & decorative punctuation from a value, exactly like the Python version.
 * يزيل الرموز التعبيرية والمسافات الزائدة من القيمة.
 */
function cleanValue(raw: string): string {
  // Remove emojis and any non-word/space/-/:./،؛ characters (preserve Arabic, Latin, digits, -, /, :, ., ،, ؛)
  return raw
    .replace(/[^\p{L}\p{N}\s\-/:.،؛]/gu, "")
    .trim();
}

/**
 * Build a regex pattern that matches a field line.
 * - Allows optional emoji prefix
 * - Allows optional whitespace around the colon
 * - Captures the rest of the line as value
 */
function buildPattern(emoji: string, labelAr: string): RegExp {
  // Escape regex special chars in labelAr
  const escaped = labelAr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Pattern: optional emoji, optional whitespace, labelAr, optional whitespace, ':', value
  // The emoji is matched non-greedily; label is literal.
  const emojiPart = emoji ? `${emoji}\\s*` : "";
  return new RegExp(`${emojiPart}${escaped}\\s*:\\s*(.+)`, "i");
}

/**
 * Convert YYYY-MM-DD (HTML date input) -> DD-MM-YYYY (display/storage format used by the bot).
 */
export function normalizeDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return dateStr;
  for (const sep of ["-", "/", "."]) {
    if (dateStr.includes(sep)) {
      const parts = dateStr.split(sep);
      if (parts.length === 3) {
        // YYYY-MM-DD -> DD-MM-YYYY
        if (parts[0].length === 4) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        // Already DD-MM-YYYY
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
      }
    }
  }
  return dateStr;
}

/**
 * Try to parse a value as a date and return YYYY-MM-DD (for <input type="date">).
 * Returns empty string if not parseable.
 */
export function toDateInputValue(dateStr: string): string {
  if (!dateStr) return "";
  for (const sep of ["-", "/", "."]) {
    if (dateStr.includes(sep)) {
      const parts = dateStr.split(sep);
      if (parts.length === 3) {
        let day: string, month: string, year: string;
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          [year, month, day] = parts;
        } else {
          // DD-MM-YYYY
          [day, month, year] = parts;
        }
        if (year.length === 4 && day.length >= 1 && day.length <= 2 && month.length >= 1 && month.length <= 2) {
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
      }
    }
  }
  return "";
}

/**
 * Parse a 12-hour or 24-hour time string and return HH:MM (24h) for <input type="time">.
 * Returns empty string if not parseable.
 */
export function toTimeInputValue(timeStr: string): string {
  if (!timeStr) return "";
  // Try 12-hour format: 10:20 AM / 10:20 PM
  const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const isPM = /PM/i.test(ampmMatch[3]);
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  // Try 24-hour format: 14:30
  const h24Match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (h24Match) {
    return `${h24Match[1].padStart(2, "0")}:${h24Match[2]}`;
  }
  return "";
}

/**
 * Convert 24h HH:MM to 12-hour display (10:20 AM) for storage/display.
 */
export function toTimeDisplay(timeInput: string): string {
  if (!timeInput) return "";
  const m = timeInput.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return timeInput;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const isPM = h >= 12;
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${isPM ? "PM" : "AM"}`;
}

/**
 * Parse a pasted bot message into a LeaveFormData object.
 * Only fields that are matched will be filled; others stay as they were.
 *
 * @param message  the pasted text
 * @param base     the existing form data to merge into (defaults to EMPTY_FORM)
 * @returns        { data, matchedFields, totalFields }
 */
export function parseBotMessage(
  message: string,
  base: LeaveFormData = EMPTY_FORM,
): { data: LeaveFormData; matchedFields: string[]; totalFields: number } {
  const data: LeaveFormData = { ...base };
  const matchedFields: string[] = [];

  for (const field of FIELDS) {
    const pattern = buildPattern(field.emoji, field.labelAr);
    const match = message.match(pattern);
    if (match && match[1]) {
      let value = cleanValue(match[1]);
      if (!value) continue;

      // Convert dates/times for HTML inputs
      if (field.type === "date") {
        const iso = toDateInputValue(value);
        if (iso) value = iso;
      } else if (field.type === "time") {
        const t24 = toTimeInputValue(value);
        if (t24) value = t24;
      }

      (data as any)[field.key] = value;
      matchedFields.push(field.key);
    }
  }

  return { data, matchedFields, totalFields: FIELDS.length };
}

/**
 * Convert form data values back to display format (DD-MM-YYYY for dates, 12h for time).
 * Used when sending to the API and when rendering the PDF preview.
 */
export function toDisplayValues(data: LeaveFormData): LeaveFormData {
  return {
    ...data,
    admission_date_gregorian: normalizeDateToDDMMYYYY(data.admission_date_gregorian),
    discharge_date_gregorian: normalizeDateToDDMMYYYY(data.discharge_date_gregorian),
    time: toTimeDisplay(data.time),
  };
}

/**
 * Calculate the number of days between admission and discharge (inclusive).
 * Mirrors bot/api_client.py calculate_days.
 */
export function calculateDays(admission: string, discharge: string): number {
  try {
    const a = parseDateComponents(admission);
    const d = parseDateComponents(discharge);
    if (!a || !d) return 1;
    const aMs = Date.UTC(a.year, a.month - 1, a.day);
    const dMs = Date.UTC(d.year, d.month - 1, d.day);
    const days = Math.round((dMs - aMs) / 86400000) + 1;
    return Math.max(1, days);
  } catch {
    return 1;
  }
}

function parseDateComponents(dateStr: string): { day: number; month: number; year: number } | null {
  if (!dateStr) return null;
  for (const sep of ["-", "/", "."]) {
    if (dateStr.includes(sep)) {
      const parts = dateStr.split(sep);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return { day: parseInt(parts[2], 10), month: parseInt(parts[1], 10), year: parseInt(parts[0], 10) };
        }
        // DD-MM-YYYY
        return { day: parseInt(parts[0], 10), month: parseInt(parts[1], 10), year: parseInt(parts[2], 10) };
      }
    }
  }
  return null;
}

/**
 * Generate a unique GSL leave ID, mirroring bot/api_client.py generate_leave_id.
 */
export function generateLeaveId(idNumber: string, admission: string, discharge: string): string {
  try {
    const admissionNorm = normalizeDateToDDMMYYYY(admission);
    const dischargeNorm = normalizeDateToDDMMYYYY(discharge);

    const idPart = idNumber && idNumber.length >= 4 ? idNumber.slice(-4) : (idNumber || "0000");
    const admissionNums = (admissionNorm.replace(/\D/g, "") || "").slice(-3).padEnd(3, "0");
    const dischargeNums = (dischargeNorm.replace(/\D/g, "") || "").slice(-4).padEnd(4, "0");

    const randomPart = String(Math.floor(1000 + Math.random() * 9000));
    const timePart = String(Date.now() % 1000).padStart(3, "0");
    const uniquePart = randomPart + timePart; // 4 + 3 = 7 digits

    const base = (dischargeNums + admissionNums + idPart).slice(0, 11).padEnd(11, "0");
    let leaveNumber = base.slice(0, 4) + uniquePart;
    leaveNumber = leaveNumber.slice(0, 11).padEnd(11, "0");
    return `GSL${leaveNumber}`;
  } catch {
    const rand = String(Math.floor(10000000 + Math.random() * 89999999));
    return `GSL260${rand}`;
  }
}

/**
 * Format a Date as YYYY-MM-DD (for API payload).
 */
export function toISODate(dateStr: string): string {
  const c = parseDateComponents(dateStr);
  if (!c) return "";
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}
