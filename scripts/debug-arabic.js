/**
 * Debug script: test if Arabic font rendering works when switching fonts per piece.
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const FONT_AR = path.join(__dirname, "..", "public", "fonts", "NotoSansArabic-Regular.ttf");

console.log("Font exists?", fs.existsSync(FONT_AR));

const doc = new PDFDocument({ size: [800, 400], margins: { top: 20, bottom: 20, left: 20, right: 20 } });
doc.pipe(fs.createWriteStream("/tmp/debug-arabic.pdf"));

// Test 1: Render Arabic alone
doc.font("Times-Roman").fontSize(14).fillColor("black");
doc.text("Test 1: Arabic word alone with NotoSansArabic:", 20, 20);

doc.font(FONT_AR).fontSize(20).fillColor("blue");
doc.text("إلى", 20, 50, { lineBreak: false });
console.log("Width of 'إلى' with NotoSansArabic:", (() => { doc.font(FONT_AR).fontSize(20); return doc.widthOfString("إلى"); })());

// Test 2: Render Latin, then Arabic, then Latin
doc.font("Times-Roman").fontSize(14).fillColor("black");
doc.text("Test 2: Latin, Arabic, Latin (with calculated positions):", 20, 100);

const pieces = [
  { text: "(", font: "Times-Roman" },
  { text: "إلى", font: FONT_AR },
  { text: ")", font: "Times-Roman" },
];

let cursorX = 20;
const cursorY = 130;
for (const piece of pieces) {
  doc.font(piece.font).fontSize(20).fillColor("black");
  const w = doc.widthOfString(piece.text);
  console.log(`Piece '${piece.text}' width: ${w}`);
  doc.text(piece.text, cursorX, cursorY, { lineBreak: false });
  cursorX += w;
}

// Test 3: Render Arabic with width specified
doc.font("Times-Roman").fontSize(14).fillColor("black");
doc.text("Test 3: Same as Test 2 but with explicit width:", 20, 180);

cursorX = 20;
const cursorY3 = 210;
for (const piece of pieces) {
  doc.font(piece.font).fontSize(20).fillColor("black");
  const w = doc.widthOfString(piece.text);
  doc.text(piece.text, cursorX, cursorY3, { lineBreak: false, width: w });
  cursorX += w + 5;
}

// Test 4: Use continued: true to chain
doc.font("Times-Roman").fontSize(14).fillColor("black");
doc.text("Test 4: Using continued: true to chain pieces:", 20, 260);

doc.font("Times-Roman").fontSize(20).fillColor("black");
doc.text("(", 20, 290, { continued: true, lineBreak: false });
doc.font(FONT_AR).fontSize(20).fillColor("black");
doc.text("إلى", { continued: true, lineBreak: false });
doc.font("Times-Roman").fontSize(20).fillColor("black");
doc.text(")", { continued: false, lineBreak: false });

doc.end();
console.log("Wrote /tmp/debug-arabic.pdf");
