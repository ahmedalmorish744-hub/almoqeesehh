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

    // --- Header: three logos ---
    // الشعار الأيسر: شعار منصة صحة (ثابت)
    // Left logo: SEHA platform logo (static)
    if (fs.existsSync(SEHA_LOGO)) doc.image(SEHA_LOGO, 40, 40, { width: 150 });
    // الشعار الأوسط: نص المملكة العربية السعودية (ثابت)
    // Center logo: Kingdom of Saudi Arabia text (static)
    if (fs.existsSync(KINGDOM_TEXT)) doc.image(KINGDOM_TEXT, (pageWidth - 180) / 2, 70, { width: 180, align: "center" });
    // الشعار الأيمن: شعار المنشأة المرفوع إن وُجد، وإلا الشعار الافتراضي (geometric-shape)
    // Right logo: uploaded facility logo if present, otherwise default geometric shape
    if (uploadedLogoBuffer) {
      // استخدم fit للحفاظ على نسبة الأبعاد داخل صندوق 170×100
      // Use fit to preserve aspect ratio inside a 170x100 box
      doc.image(uploadedLogoBuffer, pageWidth - 210, 30, { fit: [170, 110], align: "center", valign: "center" });
    } else if (fs.existsSync(GEOMETRIC)) {
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
    const duration = `${payload.dayCount} day(s) (${startDateFormatted} to ${endDateFormatted})`;
    // استخدم أقواس ASCII العادية ( ) التي يدعمها خط NotoSansArabic و Times معاً
    // استخدم علامات LRM (U+200E) حول التواريخ لإجبار الأرقام على البقاء بصيغة DD-MM-YYYY
    // في السياق العربي (RTL) ومنع خوارزمية BiDi من عكس ترتيب الأرقام.
    // Use regular ASCII parentheses (supported by both NotoSansArabic and Times).
    // Wrap each date with LRM (U+200E) marks to keep digits in DD-MM-YYYY order
    // inside the RTL Arabic context (prevents BiDi from reversing digit pairs).
    const LRM = "\u200E";
    const durationAr = `${durText} ( ${LRM}${startDateFormatted}${LRM} الى ${LRM}${endDateFormatted}${LRM} )`;

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

    // عرض خلية المدة العربية بخطوط مختلطة (Arabic → NotoSansArabic, LTR → Times)
    // لمنع خوارزمية BiDi في pdfkit من عكس أرقام التواريخ عند استخدام خط عربي
    // للنص بالكامل. كل مقطع عربي يُعرض بخط NotoSansArabic مع تشكيل RTL،
    // وكل مقطع أرقام/أقواس يُعرض بخط Times بصيغة LTR بدون تشكيل.
    // Render the Arabic duration cell with mixed fonts (Arabic → NotoSansArabic,
    // LTR runs → Times) to prevent pdfkit's BiDi from reversing date digits.
    renderMixedRtlCell({
      text: durationAr,
      x: startX + col1W + subColW + 10,
      y: currentY,
      width: subColW - 20,
      height: rowH,
      fontSize: durFontSize - 1,
      color: "#ffffff",
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

    drawTextAr(payload.hospitalName || "", rightCenterX - 125, footerY + 100, {
      width: 250,
      align: "center",
      weight: "bold",
      fontSize: 12,
      color: "#000000",
    });
    drawTextEn(payload.hospitalNameEn || "", rightCenterX - 125, footerY + 135, {
      width: 250,
      align: "center",
      weight: "bold",
      fontSize: 12,
      color: "#000000",
    });

    if (payload.licenseNumber && !emptyIndicators.has(payload.licenseNumber.trim())) {
      // استخدم النقطتين العاديتين ":" بدلاً من النقطتين العريضتين "：" لأن NotoSansArabic
      // قد لا يدعم الحرف العريض فيظهر كمربع صغير. علامات LRM حول الرقم تمنع عكسه.
      // Use regular ASCII colon ":" instead of fullwidth "：" (NotoSansArabic may lack the
      // fullwidth glyph and render a tofu box). LRM marks around the number prevent reversal.
      const LRM = "\u200E";
      const fullLine = `رقم الترخيص: ${LRM}${payload.licenseNumber}${LRM}`;
      // استخدم العرض المختلط لمنع عكس الأرقام في سياق RTL
      // Use mixed rendering to prevent digit reversal in RTL context
      renderMixedRtlCell({
        text: fullLine,
        x: rightCenterX - 150,
        y: footerY + 155,
        width: 300,
        height: 30,
        fontSize: 12,
        color: "#000000",
        weight: "bold",
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
