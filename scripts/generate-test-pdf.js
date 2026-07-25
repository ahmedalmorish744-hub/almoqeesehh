/**
 * Generate a test PDF by calling the local dev server's /api/generate-pdf endpoint.
 */

const fs = require("fs");
const path = require("path");

const payload = {
  id_number: "1122923749",
  patient_name_ar: "أحمد محمد السعيد",
  patient_name_en: "AHMED Mohammed Alsaeed",
  nationality_ar: "سعودي",
  nationality_en: "Saudi Arabia",
  employer_ar: "طالب جامعي",
  employer_en: "University Student",
  doctor_name_ar: "نبيل حنا نصر حنا",
  doctor_name_en: "NABIL HANNA NASR HANNA",
  position_ar: "طبيب عام",
  position_en: "General",
  admission_date_gregorian: "09-06-2026",
  discharge_date_gregorian: "09-06-2026",
  admission_date_hijri: "14-11-1447",
  discharge_date_hijri: "14-11-1447",
  issue_date_gregorian: "26-07-2026",
  hospital_name_ar: "مجمع عائلتي الطبي",
  hospital_name_en: "My Family Medical Center",
  license_number: "1410101201200443",
  time: "06:23 AM",
  hospital_logo: "",
};

(async () => {
  try {
    console.log("Sending POST to http://localhost:3000/api/generate-pdf...");
    const res = await fetch("http://localhost:3000/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("Response status:", res.status, res.statusText);
    if (!res.ok) {
      const text = await res.text();
      console.error("Error response body:", text.slice(0, 500));
      process.exit(1);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = path.join("/home/z/my-project/download", "full-test.pdf");
    fs.writeFileSync(outPath, buf);
    console.log(`Wrote ${buf.length} bytes to ${outPath}`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
