/**
 * Quick test: hit /api/generate-pdf with sample data and verify the response is a PDF.
 */
const SAMPLE = {
  patient_name_ar: "عبدالله محمد علي",
  patient_name_en: "Abdullah Mohammed Ali",
  id_number: "828287654",
  nationality_ar: "السعودية",
  nationality_en: "Saudi Arabia",
  employer_ar: "طالب جامعي",
  employer_en: "University Student",
  doctor_name_ar: "المقبني",
  doctor_name_en: "Almakbany",
  position_ar: "طبيب عام",
  position_en: "General Practitioner",
  admission_date_gregorian: "2025-09-20",
  discharge_date_gregorian: "2025-09-21",
  hospital_name_ar: "مستشفى الملك فيصل التخصصي ومركز الأبحاث",
  hospital_name_en: "King Faisal Specialist Hospital and Research Centre",
  license_number: "1410101201200443",
  time: "10:20",
};

const resp = await fetch("http://localhost:3000/api/generate-pdf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(SAMPLE),
});

console.log("Status:", resp.status);
console.log("Content-Type:", resp.headers.get("content-type"));
console.log("Content-Disposition:", resp.headers.get("content-disposition"));

if (!resp.ok) {
  console.log("Body:", await resp.text());
  process.exit(1);
}

const buf = Buffer.from(await resp.arrayBuffer());
console.log("PDF size (bytes):", buf.length);
console.log("First 8 bytes (hex):", buf.subarray(0, 8).toString("hex"));
console.log("PDF magic:", buf.subarray(0, 5).toString("latin1"));

if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
  console.error("NOT a PDF!");
  process.exit(2);
}

import { writeFileSync } from "fs";
writeFileSync("/home/z/my-project/download/test-sick-leave.pdf", buf);
console.log("Saved to /home/z/my-project/download/test-sick-leave.pdf");
