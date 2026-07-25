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

    // --- Header: three logos ---
    if (fs.existsSync(SEHA_LOGO)) doc.image(SEHA_LOGO, 40, 40, { width: 150 });
    if (fs.existsSync(KINGDOM_TEXT)) doc.image(KINGDOM_TEXT, (pageWidth - 180) / 2, 70, { width: 180, align: "center" });
    if (fs.existsSync(GEOMETRIC)) doc.image(GEOMETRIC, pageWidth - 180, 40, { width: 170 });

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
    // استخدم الأقواس العربية العريضة （） التي تُعرض بشكل صحيح في اتجاه RTL
    // Use fullwidth parentheses that render correctly in RTL context
    const durationAr = `${durText} （${startDateFormatted} الى ${endDateFormatted}）`;

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

    doc.font(fontArReg).fontSize(durFontSize - 1);
    const durValH2 = doc.heightOfString(durationAr, { width: subColW - 20 });
    const durValY2 = currentY + (rowH - durValH2) / 2;
    drawTextAr(durationAr, startX + col1W + subColW + 10, durValY2, {
      width: subColW - 20,
      align: "center",
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
      // في RTL، استخدم النقطتين العربيتين ៖ والترتيب الطبيعي عربيًا
      const fullLine = `رقم الترخيص：${payload.licenseNumber}`;
      doc.font(fontArBold).fontSize(12);
      const lineW = doc.widthOfString(fullLine);
      const startXLic = rightCenterX - lineW / 2;
      drawTextAr(fullLine, startXLic, footerY + 165, {
        align: "center",
        weight: "bold",
        fontSize: 12,
        color: "#000000",
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
