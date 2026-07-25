#!/usr/bin/env bun
/**
 * سكربت تهيئة قاعدة البيانات على Vercel Postgres
 * يُشغّل مرة واحدة بعد ربط المشروع بقاعدة بيانات Vercel Postgres.
 *
 * الاستخدام:
 *   1. اضبط متغيرات البيئة: POSTGRES_URL, POSTGRES_PRISMA_URL, ... (من Vercel Dashboard)
 *   2. bun run scripts/init-db.ts
 */

import { initDatabase } from "../src/lib/db";

console.log("🚀 Initializing Vercel Postgres schema...");
try {
  await initDatabase();
  console.log("✅ Database schema initialized successfully!");
  console.log("📋 Tables created: users, nationalities, hospitals, doctors, sick_leaves");
  console.log("👤 Default user 'web_user' is ready.");
} catch (err: any) {
  console.error("❌ Failed to initialize database:", err?.message || err);
  console.error("\nMake sure you have set the POSTGRES_* environment variables.");
  process.exit(1);
}
