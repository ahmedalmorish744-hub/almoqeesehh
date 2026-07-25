/**
 * GET /api/inquire?gsl=GSL123...&id=1234567890&q=text
 *
 * يبحث في قاعدة بيانات Vercel Postgres عن الإجازات المرضية السابقة:
 *   - إن وُجد gsl → بحث برقم الإجازة
 *   - إن وُجد id  → بحث برقم الهوية (يرجع كل السجلات المطابقة)
 *   - إن وُجد q   → بحث نصي في الاسم / رقم الإجازة / رقم الهوية
 *
 * الرد: مصفوفة من السجلات مع كل الحقول اللازمة لإعادة التعبئة أو الطباعة.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, isDemoMode, demoSearchLeave } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gsl = searchParams.get("gsl")?.trim();
    const id = searchParams.get("id")?.trim();
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    // وضع العرض: ابحث في الذاكرة
    if (isDemoMode()) {
      const demoRows = demoSearchLeave({ gsl, id, q, limit });
      const formatted = demoRows.map((r) => ({
        id: r.id,
        gslCode: r.gsl_code,
        identityNumber: r.identity_number,
        nameAr: r.name_ar,
        nameEn: r.name_en,
        dateFrom: r.date_from,
        dateTo: r.date_to,
        dayCount: r.day_count,
        issueDate: r.issue_date,
        timeFrom: r.time_from,
        nationalityAr: r.nationality_ar,
        nationalityEn: r.nationality_en,
        employer: r.employer,
        employerEn: r.employer_en,
        doctorNameAr: r.doctor_name_ar,
        doctorNameEn: r.doctor_name_en,
        doctorSpecialtyAr: r.doctor_specialty_ar,
        doctorSpecialtyEn: r.doctor_specialty_en,
        hospitalNameAr: r.hospital_name_ar,
        hospitalNameEn: r.hospital_name_en,
        licenseNumber: r.license_number,
        leaveType: r.leave_type,
        createdAt: r.created_at,
      }));
      return NextResponse.json({ success: true, count: formatted.length, records: formatted });
    }

    let rows: any[] = [];

    try {
      if (gsl) {
        const res = await sql`
          SELECT * FROM sick_leaves
          WHERE gsl_code ILIKE ${"%" + gsl + "%"}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        rows = res.rows as any[];
      } else if (id) {
        const res = await sql`
          SELECT * FROM sick_leaves
          WHERE identity_number ILIKE ${"%" + id + "%"}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        rows = res.rows as any[];
      } else if (q) {
        const res = await sql`
          SELECT * FROM sick_leaves
          WHERE gsl_code ILIKE ${"%" + q + "%"}
             OR identity_number ILIKE ${"%" + q + "%"}
             OR name_ar ILIKE ${"%" + q + "%"}
             OR name_en ILIKE ${"%" + q + "%"}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        rows = res.rows as any[];
      } else {
        const res = await sql`
          SELECT * FROM sick_leaves
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        rows = res.rows as any[];
      }
    } catch (dbErr: any) {
      const msg = String(dbErr?.message || dbErr || "");
      if (msg.includes("missing_connection_string") || msg.includes("connect")) {
        return NextResponse.json(
          {
            success: false,
            message:
              "قاعدة بيانات Vercel Postgres غير مربوطة بعد. اربط قاعدة بيانات من Vercel Dashboard → Storage وأنشئ الجداول بتنفيذ schema.sql.",
            records: [],
            count: 0,
          },
          { status: 503 },
        );
      }
      throw dbErr;
    }

    const formatted = rows.map((r) => ({
      id: r.id,
      gslCode: r.gsl_code,
      identityNumber: r.identity_number,
      nameAr: r.name_ar,
      nameEn: r.name_en,
      dateFrom: typeof r.date_from === "string" ? r.date_from : r.date_from?.toISOString().slice(0, 10),
      dateTo: typeof r.date_to === "string" ? r.date_to : r.date_to?.toISOString().slice(0, 10),
      dayCount: r.day_count,
      issueDate: r.issue_date
        ? typeof r.issue_date === "string"
          ? r.issue_date
          : r.issue_date.toISOString().slice(0, 10)
        : null,
      timeFrom: r.time_from,
      nationalityAr: r.nationality_ar,
      nationalityEn: r.nationality_en,
      employer: r.employer,
      employerEn: r.employer_en,
      doctorNameAr: r.doctor_name_ar,
      doctorNameEn: r.doctor_name_en,
      doctorSpecialtyAr: r.doctor_specialty_ar,
      doctorSpecialtyEn: r.doctor_specialty_en,
      hospitalNameAr: r.hospital_name_ar,
      hospitalNameEn: r.hospital_name_en,
      licenseNumber: r.license_number,
      leaveType: r.leave_type,
      createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at?.toISOString(),
    }));

    return NextResponse.json({ success: true, count: formatted.length, records: formatted });
  } catch (err: any) {
    console.error("[inquire] Error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "خطأ في الاستعلام" },
      { status: 500 },
    );
  }
}
