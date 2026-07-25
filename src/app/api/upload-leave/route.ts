/**
 * POST /api/upload-leave
 * Body: LeaveFormData (JSON)
 *
 * Forwards the data to the existing Railway-hosted backend at
 * /api/bot/add_leave, using the same API key + payload the Python bot used.
 *
 * This route exists so the browser never exposes the API key, and so CORS
 * is handled server-side (Railway backend may not allow direct browser calls).
 */

import { NextRequest, NextResponse } from "next/server";
import { LeaveFormData } from "@/lib/leave-form";
import { buildApiPayload } from "../generate-pdf/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Environment variables — set these on Vercel
const API_BASE_URL =
  process.env.API_BASE_URL || "https://alehtiat-almorish-production.up.railway.app";
const API_ENDPOINT = process.env.API_ENDPOINT || "/api/bot/add_leave";
const BOT_API_KEY = process.env.BOT_API_KEY || "seha_bot_secret_key_2025";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LeaveFormData;
    const payload = buildApiPayload(body);

    const url = API_BASE_URL + API_ENDPOINT;
    console.log("[upload-leave] POST ->", url, "leave:", payload.leaveNumber);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let apiResult: any;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json",
          "X-API-Key": BOT_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await resp.text();
      try {
        apiResult = JSON.parse(text);
      } catch {
        apiResult = { success: false, message: text };
      }
      apiResult = apiResult || {};
      apiResult.httpStatus = resp.status;
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr?.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            message: "انتهت مهلة الاتصال بالخادم (Railway). تأكد أن الموقع يعمل.",
            leave_id: payload.leaveNumber,
          },
          { status: 504 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          message: `فشل الاتصال بالخادم: ${fetchErr?.message || fetchErr}`,
          leave_id: payload.leaveNumber,
        },
        { status: 502 },
      );
    }

    // Normalize Railway backend response to a friendly shape for the UI
    const friendly = {
      success: !!apiResult.success,
      message: apiResult.message || (apiResult.success ? "تم رفع البيانات بنجاح" : "فشل رفع البيانات"),
      leave_id: payload.leaveNumber,
      day_count: payload.dayCount,
      backend: apiResult,
    };

    return NextResponse.json(friendly, {
      status: friendly.success ? 200 : 502,
    });
  } catch (err: any) {
    console.error("[upload-leave] Error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "خطأ غير متوقع" },
      { status: 500 },
    );
  }
}
