/**
 * Standalone test that mimics the route.ts renderVisualPieces logic
 * to verify the fix produces the correct visual output.
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const FONT_AR = path.join(__dirname, "..", "public", "fonts", "NotoSansArabic-Regular.ttf");
const FONT_AR_BOLD = path.join(__dirname, "..", "public", "fonts", "NotoSansArabic-Bold.ttf");

const doc = new PDFDocument({
  size: [841.89, 1150],
  margins: { top: 40, bottom: 40, left: 40, right: 40 },
});
doc.pipe(fs.createWriteStream("/tmp/test-route-fix.pdf"));

const fontArReg = FONT_AR;
const fontArBold = FONT_AR_BOLD;
const fontEnReg = "Times-Roman";
const fontEnBold = "Times-Bold";

/**
 * Mirror of route.ts renderVisualPieces function.
 */
const renderVisualPieces = (opts) => {
  const { pieces, x, y, width, height, fontSize, color, align = "center" } = opts;
  if (pieces.length === 0) return;

  const widths = pieces.map((p) => {
    doc.font(p.font).fontSize(fontSize);
    return doc.widthOfString(p.text);
  });
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  if (totalWidth <= 0) return;

  doc.fontSize(fontSize);
  const textH = doc.currentLineHeight(true);
  const pieceY = y + (height - textH) / 2;

  let cursorX;
  if (align === "center") {
    cursorX = x + (width - totalWidth) / 2;
  } else if (align === "right") {
    cursorX = x + width - totalWidth;
  } else {
    cursorX = x;
  }

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    doc.font(piece.font).fillColor(color).fontSize(fontSize);
    doc.text(piece.text, cursorX, pieceY, { lineBreak: false });
    cursorX += widths[i];
  }
};

// === Test 1: Duration cell ===
// Test with day count = 1, dates 2026-06-09 to 2026-06-09
const dayCount = 1;
const getArabicDuration = (count) => {
  if (count === 0) return "0 يوم";
  if (count === 1) return "1 يوم";
  if (count === 2) return "2 يومان";
  if (count >= 3 && count <= 10) return `${count} أيام`;
  return `${count} يوم`;
};
const durText = getArabicDuration(dayCount);

// Dates: DD-MM-YYYY format → convert to YYYY-MM-DD for Arabic cell
const startDateFormatted = "09-06-2026"; // DD-MM-YYYY
const endDateFormatted = "09-06-2026";   // DD-MM-YYYY
const toArabicDate = (ddmmyyyy) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return ddmmyyyy;
};
const startDateAr = toArabicDate(startDateFormatted);
const endDateAr = toArabicDate(endDateFormatted);

const durParts = /^(\d+)\s+(.+)$/.exec(durText);
const durDigit = durParts ? durParts[1] : String(dayCount);
const durWord = durParts ? durParts[2] : "يوم";

console.log("durText:", durText);
console.log("durDigit:", durDigit, "durWord:", durWord);
console.log("startDateAr:", startDateAr, "endDateAr:", endDateAr);

// Header text
doc.font("Times-Roman").fontSize(16).fillColor("black");
doc.text("Test 1: Duration cell with dayCount=1 (cell with blue background)", 40, 40);

// Simulate duration cell - dark blue background, white text
const cellX = 200;
const cellY = 80;
const cellW = 440;
const cellH = 45;

doc.save();
doc.rect(cellX, cellY, cellW, cellH).fill("#2c3e77");
doc.restore();

const durPieces = [
  { text: ")", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: endDateAr, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "إلى", font: fontArReg },
  { text: " ", font: fontEnReg },
  { text: startDateAr, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "(", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: durWord, font: fontArReg },
  { text: " ", font: fontEnReg },
  { text: durDigit, font: fontEnReg },
];
renderVisualPieces({
  pieces: durPieces,
  x: cellX,
  y: cellY,
  width: cellW,
  height: cellH,
  fontSize: 13,
  color: "#ffffff",
  align: "center",
});

// Test 2: dayCount=2
doc.font("Times-Roman").fontSize(16).fillColor("black");
doc.text("Test 2: Duration cell with dayCount=2 (يومان)", 40, 150);

const durText2 = getArabicDuration(2);
const durParts2 = /^(\d+)\s+(.+)$/.exec(durText2);
const durDigit2 = durParts2[1];
const durWord2 = durParts2[2];

const startDateAr2 = toArabicDate("09-06-2026");
const endDateAr2 = toArabicDate("11-06-2026");

doc.save();
doc.rect(cellX, 190, cellW, cellH).fill("#2c3e77");
doc.restore();

const durPieces2 = [
  { text: ")", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: endDateAr2, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "إلى", font: fontArReg },
  { text: " ", font: fontEnReg },
  { text: startDateAr2, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "(", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: durWord2, font: fontArReg },
  { text: " ", font: fontEnReg },
  { text: durDigit2, font: fontEnReg },
];
renderVisualPieces({
  pieces: durPieces2,
  x: cellX,
  y: 190,
  width: cellW,
  height: cellH,
  fontSize: 13,
  color: "#ffffff",
  align: "center",
});

// Test 3: License number
doc.font("Times-Roman").fontSize(16).fillColor("black");
doc.text("Test 3: License number (centered, on white background)", 40, 270);

const licenseNumber = "1410101201200443";
const licensePieces = [
  { text: licenseNumber, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: ":", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "رقم الترخيص", font: fontArReg },
];
renderVisualPieces({
  pieces: licensePieces,
  x: cellX,
  y: 310,
  width: cellW,
  height: 25,
  fontSize: 12,
  color: "#000000",
  align: "center",
});

// Test 4: License number with bold weight (mirror bot which uses NotoSansArabic-Bold)
doc.font("Times-Roman").fontSize(16).fillColor("black");
doc.text("Test 4: License number with bold Arabic label (matches bot)", 40, 360);

const licensePiecesBold = [
  { text: licenseNumber, font: fontEnBold },
  { text: " ", font: fontEnBold },
  { text: ":", font: fontEnBold },
  { text: " ", font: fontEnBold },
  { text: "رقم الترخيص", font: fontArBold },
];
renderVisualPieces({
  pieces: licensePiecesBold,
  x: cellX,
  y: 400,
  width: cellW,
  height: 25,
  fontSize: 12,
  color: "#000000",
  align: "center",
});

// Test 5: dayCount=5 (أيام)
doc.font("Times-Roman").fontSize(16).fillColor("black");
doc.text("Test 5: Duration cell with dayCount=5 (أيام)", 40, 450);

const durText5 = getArabicDuration(5);
const durParts5 = /^(\d+)\s+(.+)$/.exec(durText5);
const durDigit5 = durParts5[1];
const durWord5 = durParts5[2];

const startDateAr5 = toArabicDate("09-06-2026");
const endDateAr5 = toArabicDate("13-06-2026");

doc.save();
doc.rect(cellX, 490, cellW, cellH).fill("#2c3e77");
doc.restore();

const durPieces5 = [
  { text: ")", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: endDateAr5, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "إلى", font: fontArReg },
  { text: " ", font: fontEnReg },
  { text: startDateAr5, font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: "(", font: fontEnReg },
  { text: " ", font: fontEnReg },
  { text: durWord5, font: fontArReg },
  { text: " ", font: fontEnReg },
  { text: durDigit5, font: fontEnReg },
];
renderVisualPieces({
  pieces: durPieces5,
  x: cellX,
  y: 490,
  width: cellW,
  height: cellH,
  fontSize: 13,
  color: "#ffffff",
  align: "center",
});

doc.end();
console.log("Wrote /tmp/test-route-fix.pdf");
