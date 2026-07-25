/**
 * Test script to verify the logo upload feature works in the PDF generation API.
 * Sends a request with a base64-encoded PNG logo and saves the resulting PDF.
 */
const fs = require("fs");

async function main() {
  const logoPath = "/tmp/test-logo.png";
  const logoBuffer = fs.readFileSync(logoPath);
  const logoBase64 = logoBuffer.toString("base64");
  const logoDataUrl = `data:image/png;base64,${logoBase64}`;

  const payload = {
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
    admission_date_gregorian: "20-09-2025",
    discharge_date_gregorian: "21-09-2025",
    hospital_name_ar: "مستشفى الملك فيصل التخصصي",
    hospital_name_en: "King Faisal Specialist Hospital",
    license_number: "1410101201200443",
    time: "10:20 AM",
    hospital_logo: logoDataUrl,
  };

  console.log("Sending PDF request with logo...");
  console.log(`Logo base64 size: ${logoBase64.length} chars`);

  const resp = await fetch("http://localhost:3000/api/generate-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`HTTP ${resp.status}:`, errText);
    process.exit(1);
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const outPath = "/tmp/after-fix-with-logo.pdf";
  fs.writeFileSync(outPath, buf);
  console.log(`PDF saved to ${outPath} (${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
