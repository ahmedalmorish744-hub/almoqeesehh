/**
 * POST /api/generate-pdf
 * Body: LeaveFormData (JSON)
 * Response: application/pdf (the sick leave report)
 *
 * Generates a bilingual (Arabic/English) Sick Leave Report PDF mirroring
 * the layout of the original Python bot's pdf_generator_updated.py and
 * the website's sickLeaveReportGenerator.js.
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import {
  LeaveFormData,
  DEFAULTS,
} from "@/lib/leave-form";
import {
  normalizeDateToDDMMYYYY,
  calculateDays,
  generateLeaveId,
  toISODate,
  toTimeDisplay,
} from "@/lib/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Asset paths (resolved from project root at runtime) ---
const ROOT = process.cwd();
const FONT_AR_REG = path.join(ROOT, "public", "fonts", "NotoSansArabic-Regular.ttf");
const FONT_AR_BOLD = path.join(ROOT, "public", "fonts", "NotoSansArabic-Bold.ttf");
const SEHA_LOGO = path.join(ROOT, "public", "images", "seha-logo.jpg");
const KINGDOM_TEXT = path.join(ROOT, "public", "images", "kingdom-text.jpg");
const GEOMETRIC = path.join(ROOT, "public", "images", "geometric-shape.jpg");
const NATIONAL_INFO = path.join(ROOT, "public", "images", "national-health-info.jpg");

export interface ApiPayload {
  leaveNumber: string;
  idNumber: string;
  name: string;
  nameEn: string;
  reportDate: string;
  entryDate: string;
  exitDate: string;
  dayCount: number;
  doctor: string;
  doctorEn: string;
  jobTitle: string;
  jobTitleEn: string;
  employer: string;
  employerEn: string;
  nationality: string;
  nationalityEn: string;
  hospitalName: string;
  hospitalNameEn: string;
  licenseNumber: string;
  leaveType: string;
  time: string;
}

/**
 * Build the API payload (the same shape the Python bot sent to /api/bot/add_leave).
 * Mirrors bot/api_client.py send_leave_data_to_api.
 */
export function buildApiPayload(data: LeaveFormData): ApiPayload {
  const filled: LeaveFormData = { ...DEFAULTS, ...data } as any;

  if (!filled.id_number) filled.id_number = DEFAULTS.id_number;
  if (!filled.patient_name_ar) filled.patient_name_ar = DEFAULTS.patient_name_ar;

  const leaveNumber = generateLeaveId(
    filled.id_number,
    filled.admission_date_gregorian,
    filled.discharge_date_gregorian,
  );
  const dayCount = calculateDays(
    filled.admission_date_gregorian,
    filled.discharge_date_gregorian,
  );
  const reportDate = toISODate(normalizeDateToDDMMYYYY(filled.admission_date_gregorian)) || toISODate(new Date().toISOString().slice(0, 10));
  const entryDate = toISODate(normalizeDateToDDMMYYYY(filled.admission_date_gregorian));
  const exitDate = toISODate(normalizeDateToDDMMYYYY(filled.discharge_date_gregorian));

  return {
    leaveNumber,
    idNumber: filled.id_number,
    name: filled.patient_name_ar,
    nameEn: filled.patient_name_en,
    reportDate,
    entryDate,
    exitDate,
    dayCount,
    doctor: filled.doctor_name_ar,
    doctorEn: filled.doctor_name_en,
    jobTitle: filled.position_ar,
    jobTitleEn: filled.position_en,
    employer: filled.employer_ar,
    employerEn: filled.employer_en,
    nationality: filled.nationality_ar,
    nationalityEn: filled.nationality_en,
    hospitalName: filled.hospital_name_ar,
    hospitalNameEn: filled.hospital_name_en,
    licenseNumber: filled.license_number,
    leaveType: "sick",
    time: toTimeDisplay(filled.time) || filled.time,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LeaveFormData;
    const payload = buildApiPayload(body);

    const pageWidth = 841.89;
    const pageHeight = 1150;
    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
    });

    const arRegExists = fs.existsSync(FONT_AR_REG);
    const arBoldExists = fs.existsSync(FONT_AR_BOLD);
    const fontArReg = arRegExists ? FONT_AR_REG : "Helvetica";
    const fontArBold = arBoldExists ? FONT_AR_BOLD : "Helvetica-Bold";
    const useArabicFont = arRegExists && arBoldExists;

    const fontEnReg = "Times-Roman";
    const fontEnBold = "Times-Bold";

    // فك ترميز الشعار المرفوع (base64 data URL) إلى Buffer إن وُجد
    // Decode the uploaded hospital logo (base64 data URL) into a Buffer if present
    let uploadedLogoBuffer: Buffer | null = null;
    if (body.hospital_logo && typeof body.hospital_logo === "string") {
      const matches = body.hospital_logo.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (matches && matches[2]) {
        try {
          uploadedLogoBuffer = Buffer.from(matches[2], "base64");
        } catch {
          uploadedLogoBuffer = null;
        }
      }
    }

    const drawTextAr = (text: string, x: number, y: number, options: any = {}) => {
      const fontToUse = options.weight === "bold" ? fontArBold : fontArReg;
      if (options.fontSize) doc.fontSize(options.fontSize);
      if (options.color) doc.fillColor(options.color);
      const opts: any = { align: "right", features: ["rtla"], ...options };
      if (!useArabicFont) delete opts.features;
      doc.font(fontToUse).text(text, x, y, opts);
    };

    const drawTextEn = (text: string, x: number, y: number, options: any = {}) => {
      const fontToUse = options.weight === "bold" ? fontEnBold : fontEnReg;
      if (options.color) doc.fillColor(options.color);
      doc.font(fontToUse).text(text, x, y, options);
    };

    /**
     * عرض خلية نص مختلط عربي/إنجليزي مع الحفاظ على ترتيب BiDi الصحيح
     * ومنع عكس أرقام التواريخ.
     *
     * السبب الجذري للمشكلة: عند تمرير `features: ["rtla"]` إلى pdfkit مع نص
     * مختلط (عربي + أرقام لاتينية)، يعكس pdfkit ترتيب الأرقام داخل المقاطع
     * الـ LTR (يظهر "20-09-2025" كـ "5202-90-02"). الحل: لا تستخدم `rtla`
     * لهذه الخلية — تشكيل الحروف العربية يحدث افتراضياً عبر GSUB بدون الحاجة
     * لهذه الميزة، وخوارزمية BiDi ستتعامل مع الترتيب البصري الصحيح.
     *
     * Root cause: when `features: ["rtla"]` is passed to pdfkit with mixed
     * Arabic + Latin-digit text, pdfkit reverses digit order within LTR runs
     * (showing "20-09-2025" as "5202-90-02"). Fix: don't use `rtla` for this
     * cell — Arabic letter shaping happens via default GSUB without this feature,
     * and pdfkit's BiDi handles the correct visual order.
     *
     * استخدم خط NotoSansArabic للنص بالكامل (يدعم الحروف العربية واللاتينية
     * والأرقام) لتجنب مشاكل تموضع المقاطع المتعددة على خطوط منفصلة.
     * Use NotoSansArabic font for the entire text (it supports Arabic letters,
     * Latin letters, and digits) to avoid multi-segment positioning issues.
     */
    const renderMixedRtlCell = (opts: {
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      color: string;
      weight?: "regular" | "bold";
    }) => {
      const { text, x, y, width, height, fontSize, color, weight = "regular" } = opts;
      // أزل علامات التحكم غير المرئية (LRM/RLM/ZWJ/ZWNJ) لأن خط NotoSansArabic
      // قد يعرضها كمربعات صغيرة. خوارزمية BiDi في pdfkit ستعالج الترتيب صحيحاً
      // بدونها.
      // Remove invisible format controls (LRM/RLM/ZWJ/ZWNJ) — NotoSansArabic
      // may render them as small tofu boxes. pdfkit's BiDi handles order correctly
      // without them.
      const cleanText = text.replace(/[\u200e\u200f\u200d\u200c]/g, "");
      if (!cleanText) return;

      const font = weight === "bold" ? fontArBold : fontArReg;
      doc.font(font).fontSize(fontSize).fillColor(color);

      // احسب ارتفاع السطر للتوسيط الرأسي
      // Compute line height for vertical centering
      const textH = doc.currentLineHeight(true);
      const startY = y + (height - textH) / 2;

      // اعرض النص بخط NotoSansArabic بدون `features: ["rtla"]` — التشكيل
      // الافتراضي عبر GSUB يكفي للحروف العربية، وخوارزمية BiDi سترتب الأرقام
      // والمقاطع اللاتينية في ترتيب LTR الصحيح داخل السياق RTL.
      // Render the text with NotoSansArabic font WITHOUT `features: ["rtla"]`.
      // Default GSUB shaping is sufficient for Arabic letters, and pdfkit's BiDi
      // will order digits and Latin runs in correct LTR within the RTL context.
      const useRtla = false;
      const textOpts: any = {
        width: width,
        align: "center",
        lineBreak: false,
      };
      if (useArabicFont && useRtla) {
        textOpts.features = ["rtla"];
      }
      doc.text(cleanText, x, startY, textOpts);
    };

    /**
     * اعرض عدة مقاطع نصية في صف واحد بترتيب بصري (يسار→يمين على الشاشة)،
     * كل مقطع بخطه الخاص. كل مقطع يجب أن يكون نقي الاتجاه (إما عربي فقط أو
     * لاتيني فقط) لمنع خوارزمية BiDi في pdfkit من إعادة ترتيب الأحرف داخل
     * المقطع.
     *
     * Renders multiple text pieces on a single line in VISUAL order
     * (left-to-right on screen). Each piece MUST be pure-direction (either
     * all-Arabic or all-Latin/digits) to prevent pdfkit's BiDi from
     * reordering characters within a piece.
     *
     * المقاربة مطابقة لما يفعله بوت Python عبر دالة `render_mixed_font_cell_v2`
     * — يبني النص بترتيب بصري محسوب يدوياً ثم يعرض كل مقطع بخطه المناسب
     * (NotoSansArabic للعربي، Times-Roman للاتيني/الأرقام).
     *
     * This mirrors the Python bot's `render_mixed_font_cell_v2` approach —
     * build the text in manually-computed visual order, then render each
     * piece with the appropriate font (NotoSansArabic for Arabic,
     * Times-Roman for Latin/digits).
     *
     * وضع المحاذاة الأفقي: 'center' (توسيط) أو 'right' (محاذاة لليمين).
     * Horizontal alignment: 'center' or 'right'.
     */
    const renderVisualPieces = (opts: {
      pieces: { text: string; font: any }[];
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      color: string;
      align?: "center" | "right" | "left";
    }) => {
      const { pieces, x, y, width, height, fontSize, color, align = "center" } = opts;
      if (pieces.length === 0) return;

      // احسب عرض كل مقطع بالخط الخاص به
      // Compute width of each piece using its own font
      const widths = pieces.map((p) => {
        doc.font(p.font).fontSize(fontSize);
        return doc.widthOfString(p.text);
      });
      const totalWidth = widths.reduce((a, b) => a + b, 0);
      if (totalWidth <= 0) return;

      // ارتفاع السطر للتوسيط الرأسي
      // Line height for vertical centering
      doc.fontSize(fontSize);
      const textH = doc.currentLineHeight(true);
      const pieceY = y + (height - textH) / 2;

      // احسب الإزاحة الأفقية الابتدائية حسب المحاذاة
      // Compute starting X offset based on alignment
      let cursorX: number;
      if (align === "center") {
        cursorX = x + (width - totalWidth) / 2;
      } else if (align === "right") {
        cursorX = x + width - totalWidth;
      } else {
        cursorX = x;
      }

      // اعرض كل مقطع بإحداثياته المطلقة — لا تستخدم continued:true لأنه
      // يفعّل BiDi على مستوى السطر كاملاً مما يعيد ترتيب المقاطع.
      // Render each piece at its absolute coordinates — do NOT use
      // continued:true because it triggers line-level BiDi that reorders
      // pieces.
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        doc.font(piece.font).fillColor(color).fontSize(fontSize);
        // lineBreak: false يمنع لف النص إلى سطر جديد (كل البيانات في سطر واحد)
        // lineBreak: false prevents wrapping (all data on one line)
        doc.text(piece.text, cursorX, pieceY, { lineBreak: false });
        cursorX += widths[i];
      }
    };

    // --- Header: three logos ---
    // الشعار الأيسر: شعار منصة صحة (ثابت)
    // Left logo: SEHA platform logo (static)
    if (fs.existsSync(SEHA_LOGO)) doc.image(SEHA_LOGO, 40, 40, { width: 150 });
    // الشعار الأوسط: نص المملكة العربية السعودية (ثابت)
    // Center logo: Kingdom of Saudi Arabia text (static)
    if (fs.existsSync(KINGDOM_TEXT)) doc.image(KINGDOM_TEXT, (pageWidth - 180) / 2, 70, { width: 180, align: "center" });
    // الشعار الأيمن: الشعار الافتراضي (geometric-shape) دائماً.
    // الشعار المرفوع يظهر في التذييل فقط فوق اسم المنشأة كما طلب المستخدم.
    // Right logo: default geometric shape always.
    // The uploaded logo appears in the footer only, above the hospital name, per user request.
    if (fs.existsSync(GEOMETRIC)) {
      doc.image(GEOMETRIC, pageWidth - 180, 40, { width: 170 });
    }

    doc.moveDown(9);

    // --- Title ---
    doc.fillColor("#306db5");
    drawTextAr("تقرير إجازة مرضية", 0, doc.y, {
      align: "center",
      weight: "bold",
      fontSize: 22,
      width: pageWidth,
    });
    doc.moveDown(0.1);
    doc
      .font(fontEnBold)
      .fillColor("#2c3e77")
      .fontSize(19)
      .text("Sick Leave Report", 0, doc.y, { align: "center", width: pageWidth });
    doc.moveDown(1.5);

    // --- Table ---
    const startX = 40;
    const startY = 250;
    const col1W = 160;
    const col3W = 160;
    const tableWidth = 760;
    const col2W = tableWidth - col1W - col3W;
    let currentY = startY;

    const drawRow = (
      labelEn: string,
      value: string | { en: string; ar: string },
      labelAr: string,
      isDoubleValue = false,
      bgColor: string | null = null,
    ) => {
      const labelFontSize = 14;
      const valueFontSize = 14;
      const padding = 15;

      doc.font(fontEnReg).fontSize(valueFontSize);
      let maxTextHeight = 0;

      if (isDoubleValue && typeof value === "object") {
        const subColW = col2W / 2;
        const h1 = doc.heightOfString(value.en || "-", { width: subColW - 20 });
        doc.font(fontArReg);
        const h2 = doc.heightOfString(value.ar || "-", { width: subColW - 20 });
        maxTextHeight = Math.max(h1, h2);
      } else {
        maxTextHeight = doc.heightOfString((value as string) || "-", { width: col2W - 20 });
      }

      doc.font(fontEnBold).fontSize(labelFontSize);
      const labelH1 = doc.heightOfString(labelEn, { width: col1W - 20 });
      doc.font(fontArBold).fontSize(labelFontSize);
      const labelH2 = doc.heightOfString(labelAr, { width: col3W - 20 });
      maxTextHeight = Math.max(maxTextHeight, labelH1, labelH2);

      const dynamicRowH = Math.max(40, maxTextHeight + padding);

      if (bgColor) {
        doc.save();
        doc.rect(startX, currentY, tableWidth, dynamicRowH).fill(bgColor);
        doc.restore();
      }

      doc.rect(startX, currentY, tableWidth, dynamicRowH).strokeColor("#e0e0e0").stroke();
      doc.moveTo(startX + col1W, currentY).lineTo(startX + col1W, currentY + dynamicRowH).stroke();
      doc.moveTo(startX + col1W + col2W, currentY).lineTo(startX + col1W + col2W, currentY + dynamicRowH).stroke();

      doc.font(fontEnBold).fontSize(labelFontSize);
      const lH1 = doc.heightOfString(labelEn, { width: col1W - 30 });
      const y1 = currentY + (dynamicRowH - lH1) / 2;
      doc.font(fontArBold).fontSize(labelFontSize);
      const lH2 = doc.heightOfString(labelAr, { width: col3W - 30 });
      const y2 = currentY + (dynamicRowH - lH2) / 2;

      drawTextEn(labelEn, startX + 15, y1, {
        width: col1W - 30,
        align: "center",
        weight: "bold",
        fontSize: labelFontSize,
        color: "#2b5d88",
      });
      drawTextAr(labelAr, startX + col1W + col2W + 15, y2, {
        width: col3W - 30,
        align: "center",
        weight: "bold",
        fontSize: labelFontSize,
        color: "#2b5d88",
      });

      if (isDoubleValue && typeof value === "object") {
        const subColW = col2W / 2;
        doc.moveTo(startX + col1W + subColW, currentY).lineTo(startX + col1W + subColW, currentY + dynamicRowH).strokeColor("#e0e0e0").stroke();

        doc.font(fontEnReg).fontSize(valueFontSize);
        const vH1 = doc.heightOfString(value.en || "-", { width: subColW - 30 });
        const vy1 = currentY + (dynamicRowH - vH1) / 2;
        drawTextEn(value.en || "-", startX + col1W + 15, vy1, {
          width: subColW - 30,
          align: "center",
          fontSize: valueFontSize,
          color: "#29396e",
        });

        const arText = value.ar || "-";
        const cleanText = String(arText).replace(/[^0-9\-/]/g, "").trim();
        let isDate = false;
        let vH2 = 0;
        if (cleanText.length > 0 && /^[0-9\-/]+$/.test(cleanText)) {
          isDate = true;
          doc.font(fontEnReg).fontSize(valueFontSize);
          vH2 = doc.heightOfString(cleanText, { width: subColW - 30 });
        } else {
          doc.font(fontArReg).fontSize(valueFontSize);
          vH2 = doc.heightOfString(arText, { width: subColW - 30 });
        }
        const vy2 = currentY + (dynamicRowH - vH2) / 2;
        if (isDate) {
          drawTextEn(cleanText, startX + col1W + subColW + 15, vy2, {
            width: subColW - 30,
            align: "center",
            fontSize: valueFontSize,
            color: "#29396e",
          });
        } else {
          drawTextAr(arText, startX + col1W + subColW + 15, vy2, {
            width: subColW - 30,
            align: "center",
            fontSize: valueFontSize,
            color: "#29396e",
          });
        }
      } else {
        doc.font(fontEnReg).fontSize(valueFontSize);
        const vH = doc.heightOfString((value as string) || "-", { width: col2W - 30 });
        const vY = currentY + (dynamicRowH - vH) / 2;
        drawTextEn((value as string) || "-", startX + col1W + 15, vY, {
          width: col2W - 30,
          align: "center",
          fontSize: valueFontSize,
          color: "#29396e",
        });
      }

      currentY += dynamicRowH;
    };

    const startDateFormatted = normalizeDateToDDMMYYYY(payload.entryDate);
    const endDateFormatted = normalizeDateToDDMMYYYY(payload.exitDate);

    const getArabicDuration = (count: number) => {
      if (count === 0) return "0 يوم";
      if (count === 1) return "1 يوم";
      if (count === 2) return "2 يومان";
      if (count >= 3 && count <= 10) return `${count} أيام`;
      return `${count} يوم`;
    };

    const durText = getArabicDuration(payload.dayCount);
    // أزل "(s)" بعد كلمة day بناءً على طلب المستخدم — أصبحت "day" فقط.
    // أضف مسافة قبل القوس المفتوح وبعد القوس المغلق لمطابقة التنسيق المرجعي.
    // Removed the "(s)" after "day" per user request — now just "day".
    // Added space before "(" and after ")" to match reference format.
    const duration = `${payload.dayCount} day ( ${startDateFormatted} to ${endDateFormatted} )`;

    drawRow("Leave ID", payload.leaveNumber, "رمز الإجازة");

    // Row 2: Duration
    const rowH = 45;
    const durFontSize = 13;

    doc.save();
    doc.rect(startX, currentY, tableWidth, rowH).fill("#2c3e77");

    doc.font(fontEnBold).fontSize(durFontSize);
    const durLabelH1 = doc.heightOfString("Leave Duration", { width: col1W - 30 });
    const durY1 = currentY + (rowH - durLabelH1) / 2;
    doc.font(fontArBold).fontSize(durFontSize);
    const durLabelH2 = doc.heightOfString("مدة الإجازة", { width: col3W - 30 });
    const durY2 = currentY + (rowH - durLabelH2) / 2;

    drawTextEn("Leave Duration", startX + 15, durY1, {
      width: col1W - 30,
      align: "center",
      weight: "bold",
      fontSize: durFontSize,
      color: "#ffffff",
    });
    drawTextAr("مدة الإجازة", startX + col1W + col2W + 15, durY2, {
      width: col3W - 30,
      align: "center",
      weight: "bold",
      fontSize: durFontSize,
      color: "#ffffff",
    });

    const subColW = col2W / 2;
    doc.moveTo(startX + col1W, currentY).lineTo(startX + col1W, currentY + rowH).strokeColor("#ffffff").stroke();
    doc.moveTo(startX + col1W + subColW, currentY).lineTo(startX + col1W + subColW, currentY + rowH).stroke();
    doc.moveTo(startX + col1W + col2W, currentY).lineTo(startX + col1W + col2W, currentY + rowH).stroke();

    doc.font(fontEnReg).fontSize(durFontSize - 1);
    const durValH1 = doc.heightOfString(duration, { width: subColW - 20 });
    const durValY1 = currentY + (rowH - durValH1) / 2;
    drawTextEn(duration, startX + col1W + 10, durValY1, {
      width: subColW - 20,
      align: "center",
      fontSize: durFontSize - 1,
      color: "#ffffff",
    });

    // عرض خلية المدة العربية — مطابقة لإخراج بوت Python.
    //
    // البوت يبني النص المنطقي: `1 يوم (date1 إلى date2)` ثم يطبّق
    // arabic_reshaper + python-bidi للحصول على الترتيب البصري:
    //   `) date2 إلى date1 ( يوم 1`  (مرئي L→R على الشاشة)
    //
    // بما أنه لا تتوفر مكتبة BiDi في Node.js، نحسب الترتيب البصري يدوياً
    // لِنمطنا المحدد، ونُعرِض كل مقطع بخطه الخاص (NotoSansArabic للعربي،
    // Times-Roman للأرقام/الأقواس). كل مقطع نقي الاتجاه، فلا يُعاد ترتيبه
    // بواسطة BiDi في pdfkit.
    //
    // Render the Arabic duration cell — mirrors Python bot's output.
    //
    // The bot builds logical text `1 يوم (date1 إلى date2)` then runs
    // arabic_reshaper + python-bidi to get visual order:
    //   `) date2 إلى date1 ( يوم 1`  (visual L→R on screen)
    //
    // Since Node has no BiDi library, we manually compute the visual order
    // for our specific pattern and render each piece with its own font
    // (NotoSansArabic for Arabic, Times-Roman for digits/brackets). Each
    // piece is pure-direction so pdfkit's BiDi won't reorder within it.
    const toArabicDate = (ddmmyyyy: string) => {
      // حوّل DD-MM-YYYY إلى YYYY-MM-DD لمطابقة التنسيق المطلوب
      // Convert DD-MM-YYYY to YYYY-MM-DD to match required format
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return ddmmyyyy;
    };
    const startDateAr = toArabicDate(startDateFormatted);
    const endDateAr = toArabicDate(endDateFormatted);

    // فكّ المدة العربية إلى رقم + كلمة عربية. هذا ضروري لأن المدة العربية
    // تحتوي على رقم لاتيني مع كلمة عربية (مثل "1 يوم")، ولكي نُبقي كل مقطع
    // نقي الاتجاه يجب فصل الرقم عن الكلمة.
    // Split the Arabic duration text into a digit + Arabic word. This is
    // required because the Arabic duration contains a Latin digit mixed
    // with an Arabic word (e.g., "1 يوم"); to keep each piece pure-
    // direction we must separate the digit from the word.
    const durParts = /^(\d+)\s+(.+)$/.exec(durText);
    const durDigit = durParts ? durParts[1] : String(payload.dayCount);
    const durWord = durParts ? durParts[2] : "يوم";

    // المقاطع بترتيب بصري L→R على الشاشة (مطابق لإخراج البوت):
    //   `) date2 إلى date1 ( يوم 1`
    // Pieces in visual L→R order on screen (matches bot output):
    //   `) date2 إلى date1 ( يوم 1`
    const durPieces = [
      { text: ")", font: fontEnReg },                  // يساري بصرياً: قوس إغلاق / visual leftmost: close paren
      { text: " ", font: fontEnReg },                  // مسافة / space
      { text: endDateAr, font: fontEnReg },            // التاريخ الثاني YYYY-MM-DD / second date
      { text: " ", font: fontEnReg },                  // مسافة / space
      { text: "إلى", font: fontArReg },                // كلمة "إلى" بين التاريخين / "to" word between dates
      { text: " ", font: fontEnReg },                  // مسافة / space
      { text: startDateAr, font: fontEnReg },          // التاريخ الأول YYYY-MM-DD / first date
      { text: " ", font: fontEnReg },                  // مسافة / space
      { text: "(", font: fontEnReg },                  // قوس فتح / open paren
      { text: " ", font: fontEnReg },                  // مسافة / space
      { text: durWord, font: fontArReg },              // الكلمة العربية (يوم/يومان/أيام) / Arabic word
      { text: " ", font: fontEnReg },                  // مسافة / space
      { text: durDigit, font: fontEnReg },             // يميني بصرياً: الرقم / visual rightmost: the digit
    ];
    renderVisualPieces({
      pieces: durPieces,
      x: startX + col1W + subColW + 10,
      y: currentY,
      width: subColW - 20,
      height: rowH,
      fontSize: durFontSize - 1,
      color: "#ffffff",
      align: "center",
    });

    doc.restore();
    currentY += rowH;

    drawRow("Admission Date", { en: startDateFormatted, ar: startDateFormatted }, "تاريخ الدخول", true, "#f7f7f7");
    drawRow("Discharge Date", { en: endDateFormatted, ar: endDateFormatted }, "تاريخ الخروج", true);
    drawRow("Issue Date", startDateFormatted, "تاريخ إصدار التقرير");
    drawRow("Name", { en: payload.nameEn, ar: payload.name }, "الاسم", true, "#f7f7f7");
    drawRow("National ID / Iqama", payload.idNumber, "رقم الهوية / الإقامة");
    drawRow("Nationality", { en: payload.nationalityEn, ar: payload.nationality }, "الجنسية", true, "#f7f7f7");

    const emptyIndicators = new Set(["", "غير محدد", "فارغ", "-", "None", "none", "null", "NULL", "Not Specified", "N/A", "n/a", "undefined"]);
    const employerAr = emptyIndicators.has((payload.employer || "").trim()) ? " " : payload.employer;
    const employerEn = emptyIndicators.has((payload.employerEn || "").trim()) ? " " : payload.employerEn;
    drawRow("Employer", { en: employerEn, ar: employerAr }, "جهة العمل", true, "#f7f7f7");

    drawRow("Practitioner Name", { en: payload.doctorEn, ar: payload.doctor }, "اسم الممارس", true, "#f7f7f7");
    drawRow("Position", { en: payload.jobTitleEn, ar: payload.jobTitle }, "المسمى الوظيفي", true);

    // --- Footer ---
    const footerY = pageHeight - 400;
    const centerX = pageWidth / 2;
    doc.moveTo(centerX, footerY).lineTo(centerX, footerY + 150).strokeColor("#e0e0e0").stroke();

    const leftCenterX = centerX / 2;
    try {
      const qrData = `Check Report: ${payload.leaveNumber}`;
      const qrImage = await QRCode.toDataURL(qrData);
      doc.image(qrImage, leftCenterX - 20, footerY, { width: 100 });
    } catch (e) {
      // ignore QR errors
    }

    drawTextAr(
      "للتحقق من بيانات التقرير يرجى التأكد من زيارة موقع منصة صحة الرسمي",
      leftCenterX - 125,
      footerY + 110,
      { width: 300, align: "center", weight: "bold", fontSize: 10, color: "#000000" },
    );
    drawTextEn("To check the report please visit Seha's official website", leftCenterX - 100, footerY + 150, {
      width: 250,
      align: "center",
      weight: "bold",
      fontSize: 10,
      color: "#000000",
    });

    doc.fillColor("blue").font(fontEnBold).fontSize(9);
    doc.text("www.seha.sa/#/inquiries/slenquiry", leftCenterX - 110, footerY + 180, {
      width: 250,
      align: "center",
      link: "https://www.seha.sa/#/inquiries/slenquiry",
      underline: true,
    });

    const rightCenterX = centerX + centerX / 2;

    // شعار المنشأة في التذييل: يُعرض فوق اسم المنشأة إن رُفع شعار من المستخدم
    // Footer facility logo: shown above the hospital name when user uploaded one
    if (uploadedLogoBuffer) {
      // ضع الشعار في صندوق 90×90 فوق اسم المنشأة
      // Place logo in a 90x90 box above the hospital name
      const logoBoxW = 90;
      const logoBoxH = 90;
      const logoX = rightCenterX - logoBoxW / 2;
      const logoY = footerY;
      try {
        doc.image(uploadedLogoBuffer, logoX, logoY, { fit: [logoBoxW, logoBoxH], align: "center", valign: "center" });
      } catch {
        // تجاهل أخطاء الصور
      }
    }

    // تخطيط اسم المنشأة في التذييل — مطابق للتنسيق المرجعي:
    // - الاسم العربي في السطر الأول
    // - الاسم الإنجليزي في السطر الثاني (دائماً في سطر مستقل)
    // - رقم الترخيص (إن وُجد) في السطر الثالث
    //
    // Footer hospital name layout — matches reference format:
    // - Arabic name on line 1
    // - English name on line 2 (always on its own line)
    // - License number (if any) on line 3
    drawTextAr(payload.hospitalName || "", rightCenterX - 125, footerY + 100, {
      width: 250,
      align: "center",
      weight: "bold",
      fontSize: 12,
      color: "#000000",
    });
    drawTextEn(payload.hospitalNameEn || "", rightCenterX - 125, footerY + 130, {
      width: 250,
      align: "center",
      weight: "bold",
      fontSize: 12,
      color: "#000000",
    });

    const hasLicense = !!(payload.licenseNumber && !emptyIndicators.has(payload.licenseNumber.trim()));
    if (hasLicense) {
      // رقم الترخيص في سطر منفصل — مطابق لإخراج بوت Python.
      //
      // البوت يبني النص المنطقي: `رقم الترخيص : 1410101201200443` ثم
      // يطبّق arabic_reshaper + python-bidi للحصول على الترتيب البصري:
      //   `1410101201200443 : رقم الترخيص`  (مرئي L→R على الشاشة)
      //
      // نُكرّر نفس النهج: نُحسب الترتيب البصري يدوياً ونُعرِض كل مقطع
      // بخطه (NotoSansArabic للعربي، Times-Roman للأرقام والنقطتين).
      // السطر مُوسَّط أفقيًا كما في البوت.
      //
      // License number on a separate line — mirrors Python bot's output.
      //
      // The bot builds logical text `رقم الترخيص : 1410101201200443` then
      // applies arabic_reshaper + python-bidi to get visual order:
      //   `1410101201200443 : رقم الترخيص`  (visual L→R on screen)
      //
      // We replicate this: manually compute visual order, render each
      // piece with its own font (NotoSansArabic for Arabic, Times-Roman
      // for digits and colon). The line is horizontally centered, like
      // the bot.
      const licensePieces = [
        { text: payload.licenseNumber, font: fontEnReg },     // يساري بصرياً: الرقم / visual leftmost: the number
        { text: " ", font: fontEnReg },                       // مسافة / space
        { text: ":", font: fontEnReg },                       // نقطتين / colon
        { text: " ", font: fontEnReg },                       // مسافة / space
        { text: "رقم الترخيص", font: fontArReg },             // يميني بصرياً: العبارة العربية / visual rightmost: Arabic label
      ];
      renderVisualPieces({
        pieces: licensePieces,
        x: rightCenterX - 150,
        y: footerY + 158,
        width: 300,
        height: 25,
        fontSize: 12,
        color: "#000000",
        align: "center",
      });
    }

    const bottomY = pageHeight - 150;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = payload.time || now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    doc.font(fontEnBold).fontSize(12).fillColor("#000000");
    doc.text(timeStr, 40, bottomY);
    doc.text(dateStr, 40, bottomY + 20);

    if (fs.existsSync(NATIONAL_INFO)) {
      doc.image(NATIONAL_INFO, pageWidth - 160, bottomY - 20, { width: 120 });
    }

    doc.end();

    const chunks: Buffer[] = [];
    for await (const chunk of doc) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="sick_leave_${payload.leaveNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[generate-pdf] Error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "PDF generation failed" },
      { status: 500 },
    );
  }
}
