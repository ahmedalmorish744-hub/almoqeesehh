/**
 * POST /api/upload-leave
 * Body: LeaveFormData (JSON)
 *
 * يحفظ بيانات الإجازة المرضية مباشرة في قاعدة بيانات Vercel Postgres.
 * لا اعتماد على Railway إطلاقاً — كل البيانات تُخزَّن على Vercel.
 *
 * يُنشئ أو يربط سجلات Nationality / Hospital / Doctor عند الحاجة،
 * ويُخزّن السجل الرئيسي في جدول sick_leaves.
 */

import { NextRequest, NextResponse } from "next/server";
import { LeaveFormData, DEFAULTS } from "@/lib/leave-form";
import {
  normalizeDateToDDMMYYYY,
  calculateDays,
  generateLeaveId,
  toISODate,
  toTimeDisplay,
} from "@/lib/parser";
import {
  sql,
  emptyToNull,
  SCHEMA_SQL,
  isDemoMode,
  demoUpsertLeave,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LeaveFormData;
    const filled: LeaveFormData = { ...DEFAULTS, ...body } as any;

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

    const entryDate = toISODate(normalizeDateToDDMMYYYY(filled.admission_date_gregorian));
    const exitDate = toISODate(normalizeDateToDDMMYYYY(filled.discharge_date_gregorian));
    const issueDate = entryDate || new Date().toISOString().slice(0, 10);
    const timeDisplay = toTimeDisplay(filled.time) || filled.time;

    // قيم نظيفة (تُستخدم في كلا الوضعين: DEMO و Vercel Postgres)
    const natAr = emptyToNull(filled.nationality_ar);
    const natEn = emptyToNull(filled.nationality_en);
    const hospAr = emptyToNull(filled.hospital_name_ar);
    const hospEn = emptyToNull(filled.hospital_name_en);
    const licenseNumber = emptyToNull(filled.license_number);
    const docAr = emptyToNull(filled.doctor_name_ar);
    const docEn = emptyToNull(filled.doctor_name_en);
    const specAr = emptyToNull(filled.position_ar);
    const specEn = emptyToNull(filled.position_en);

    // اضمن وجود الجداول (آمن للاستدعاء المتكرر) — أو احفظ في الذاكرة في وضع DEMO
    if (isDemoMode()) {
      const saved = demoUpsertLeave({
        gsl_code: leaveNumber,
        identity_number: filled.id_number,
        name_ar: filled.patient_name_ar,
        name_en: emptyToNull(filled.patient_name_en) ?? filled.patient_name_ar,
        date_from: entryDate || new Date().toISOString().slice(0, 10),
        date_to: exitDate || new Date().toISOString().slice(0, 10),
        day_count: dayCount,
        issue_date: issueDate,
        time_from: timeDisplay,
        nationality_ar: natAr,
        nationality_en: natEn,
        employer: emptyToNull(filled.employer_ar),
        employer_en: emptyToNull(filled.employer_en),
        doctor_name_ar: docAr,
        doctor_name_en: docEn,
        doctor_specialty_ar: specAr,
        doctor_specialty_en: specEn,
        hospital_name_ar: hospAr,
        hospital_name_en: hospEn,
        license_number: licenseNumber,
        leave_type: "sick",
      });
      return NextResponse.json({
        success: true,
        message: "[وضع العرض] تم حفظ الإجازة في الذاكرة المؤقتة — على Vercel ستُحفظ فعلياً في Vercel Postgres.",
        leave_id: leaveNumber,
        day_count: dayCount,
        record_id: saved.id,
      });
    }

    try {
      await sql.query(SCHEMA_SQL);
    } catch (dbErr: any) {
      const msg = String(dbErr?.message || dbErr || "");
      if (msg.includes("missing_connection_string") || msg.includes("connect")) {
        return NextResponse.json(
          {
            success: false,
            message:
              "قاعدة بيانات Vercel Postgres غير مربوطة. اربط قاعدة بيانات من Vercel Dashboard → Storage ثم نفّذ schema.sql مرة واحدة لإنشاء الجداول.",
            leave_id: leaveNumber,
          },
          { status: 503 },
        );
      }
      throw dbErr;
    }

    // 1) تأكد من وجود مستخدم افتراضي للسجلات القادمة من الويب
    await sql`
      INSERT INTO users (username, password, role, is_active)
      VALUES ('web_user', ${`web_internal_${Date.now()}`}, 'admin', TRUE)
      ON CONFLICT (username) DO NOTHING
    `;
    const userResult = await sql`SELECT id FROM users WHERE username = 'web_user'`;
    const userId = userResult.rows[0]?.id ?? 1;

    // 2) الجنسية: ابحث أو أنشئ
    let nationalityId: number | null = null;
    if (natAr || natEn) {
      let natRows;
      if (natAr) {
        natRows = await sql`SELECT id FROM nationalities WHERE name_ar = ${natAr} LIMIT 1`;
      }
      if (!natRows || natRows.rowCount === 0) {
        if (natEn) {
          natRows = await sql`SELECT id FROM nationalities WHERE name_en = ${natEn} LIMIT 1`;
        }
      }
      if (natRows && natRows.rowCount && (natRows.rowCount as number) > 0) {
        nationalityId = natRows.rows[0].id as number;
      } else {
        const ins = await sql`
          INSERT INTO nationalities (name_ar, name_en)
          VALUES (${natAr}, ${natEn})
          RETURNING id
        `;
        nationalityId = ins.rows[0].id as number;
      }
    }

    // 3) المنشأة: ابحث أو أنشئ
    let hospitalId: number | null = null;
    if (hospAr || hospEn) {
      let hospRows;
      if (hospAr) {
        hospRows = await sql`SELECT id, license_number FROM hospitals WHERE name_ar = ${hospAr} LIMIT 1`;
      }
      if (!hospRows || hospRows.rowCount === 0) {
        if (hospEn) {
          hospRows = await sql`SELECT id, license_number FROM hospitals WHERE name_en = ${hospEn} LIMIT 1`;
        }
      }
      if (hospRows && hospRows.rowCount && (hospRows.rowCount as number) > 0) {
        hospitalId = hospRows.rows[0].id as number;
        // حدّث رقم الترخيص إن كان مفقوداً
        if (licenseNumber && !hospRows.rows[0].license_number) {
          await sql`UPDATE hospitals SET license_number = ${licenseNumber} WHERE id = ${hospitalId}`;
        }
      } else {
        const ins = await sql`
          INSERT INTO hospitals (name_ar, name_en, type, license_number, user_id)
          VALUES (${hospAr}, ${hospEn}, 'private', ${licenseNumber}, ${userId})
          RETURNING id
        `;
        hospitalId = ins.rows[0].id as number;
      }
    }

    // 4) الطبيب: ابحث أو أنشئ
    let doctorId: number | null = null;
    if (docAr || docEn) {
      let docRows;
      if (docAr) {
        docRows = await sql`SELECT id FROM doctors WHERE name_ar = ${docAr} LIMIT 1`;
      }
      if (!docRows || docRows.rowCount === 0) {
        if (docEn) {
          docRows = await sql`SELECT id FROM doctors WHERE name_en = ${docEn} LIMIT 1`;
        }
      }
      if (docRows && docRows.rowCount && (docRows.rowCount as number) > 0) {
        doctorId = docRows.rows[0].id as number;
      } else {
        const ins = await sql`
          INSERT INTO doctors (name_ar, name_en, specialty_ar, specialty_en, hospital_id, user_id)
          VALUES (${docAr}, ${docEn}, ${specAr}, ${specEn}, ${hospitalId}, ${userId})
          RETURNING id
        `;
        doctorId = ins.rows[0].id as number;
      }
    }

    // 5) السجل الرئيسي: حدّث إن وُجد بنفس gsl_code + identity_number، وإلا أنشئ
    const existing = await sql`
      SELECT id FROM sick_leaves
      WHERE gsl_code = ${leaveNumber} AND identity_number = ${filled.id_number}
      LIMIT 1
    `;

    let recordId: number;
    if (existing.rowCount && (existing.rowCount as number) > 0) {
      recordId = existing.rows[0].id as number;
      await sql`
        UPDATE sick_leaves SET
          name_ar = ${filled.patient_name_ar},
          name_en = ${emptyToNull(filled.patient_name_en) ?? filled.patient_name_ar},
          date_from = ${entryDate},
          date_to = ${exitDate},
          day_count = ${dayCount},
          issue_date = ${issueDate},
          time_from = ${timeDisplay},
          nationality_id = ${nationalityId},
          nationality_ar = ${natAr},
          nationality_en = ${natEn},
          employer = ${emptyToNull(filled.employer_ar)},
          employer_en = ${emptyToNull(filled.employer_en)},
          doctor_id = ${doctorId},
          doctor_name_ar = ${docAr},
          doctor_name_en = ${docEn},
          doctor_specialty_ar = ${specAr},
          doctor_specialty_en = ${specEn},
          hospital_id = ${hospitalId},
          hospital_name_ar = ${hospAr},
          hospital_name_en = ${hospEn},
          license_number = ${licenseNumber},
          leave_type = 'sick',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${recordId}
      `;
    } else {
      const ins = await sql`
        INSERT INTO sick_leaves (
          gsl_code, identity_number, name_ar, name_en,
          date_from, date_to, day_count, issue_date, time_from,
          nationality_id, nationality_ar, nationality_en,
          employer, employer_en,
          doctor_id, doctor_name_ar, doctor_name_en,
          doctor_specialty_ar, doctor_specialty_en,
          hospital_id, hospital_name_ar, hospital_name_en,
          license_number, leave_type, user_id
        ) VALUES (
          ${leaveNumber}, ${filled.id_number}, ${filled.patient_name_ar},
          ${emptyToNull(filled.patient_name_en) ?? filled.patient_name_ar},
          ${entryDate}, ${exitDate}, ${dayCount}, ${issueDate}, ${timeDisplay},
          ${nationalityId}, ${natAr}, ${natEn},
          ${emptyToNull(filled.employer_ar)}, ${emptyToNull(filled.employer_en)},
          ${doctorId}, ${docAr}, ${docEn},
          ${specAr}, ${specEn},
          ${hospitalId}, ${hospAr}, ${hospEn},
          ${licenseNumber}, 'sick', ${userId}
        )
        RETURNING id
      `;
      recordId = ins.rows[0].id as number;
    }

    return NextResponse.json({
      success: true,
      message: "تم حفظ بيانات الإجازة في قاعدة بيانات Vercel Postgres بنجاح",
      leave_id: leaveNumber,
      day_count: dayCount,
      record_id: recordId,
    });
  } catch (err: any) {
    console.error("[upload-leave] Error:", err);
    return NextResponse.json(
      {
        success: false,
        message: `فشل الحفظ: ${err?.message || "خطأ غير متوقع"}`,
      },
      { status: 500 },
    );
  }
}
