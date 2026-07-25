/**
 * Test different PDFKit RTL rendering approaches to find one that matches
 * the Python bot's `safe_arabic_mixed` output (arabic_reshaper + python-bidi).
 *
 * The bot's approach:
 *   1. Build logical text: "1 يوم  ( 09-06-2026 إلى 09-06-2026 ) "
 *   2. Apply arabic_reshaper + python-bidi → produces visual-order text
 *   3. Render char-by-char with font switching (NotoSansArabic for Arabic, Times for Latin)
 *
 * PDFKit equivalent (no BiDi library in Node):
 *   - Build logical text
 *   - Call doc.text() ONCE with NotoSansArabic font (NO rtla feature)
 *   - PDFKit's built-in BiDi (via fribidi) should produce same visual order as python-bidi
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const FONT_AR = path.join(__dirname, "..", "public", "fonts", "NotoSansArabic-Regular.ttf");
const FONT_AR_BOLD = path.join(__dirname, "..", "public", "fonts", "NotoSansArabic-Bold.ttf");

const duration = "1 يوم  ( 09-06-2026 إلى 09-06-2026 ) ";
const license = "رقم الترخيص : 1410101201200443";

function makePdf(filename, renderFn) {
  const doc = new PDFDocument({
    size: [800, 600],
    margins: { top: 20, bottom: 20, left: 20, right: 20 },
  });
  doc.pipe(fs.createWriteStream(path.join("/tmp", filename)));
  renderFn(doc);
  doc.end();
  console.log(`Wrote /tmp/${filename}`);
}

// Approach A: Single doc.text() with Arabic font, no rtla feature, default alignment
makePdf("approach-a-single-text.pdf", (doc) => {
  doc.font("Times-Roman").fontSize(14).fillColor("black");
  doc.text("Approach A: Single doc.text() with NotoSansArabic, NO rtla feature", 20, 20);

  // Strip LRM marks (NotoSansArabic may render them as tofu)
  const cleanDuration = duration.replace(/[\u200e\u200f\u200d\u200c]/g, "");

  doc.font(FONT_AR).fontSize(14).fillColor("black");
  doc.text("Duration cell:", 20, 60);
  doc.text(cleanDuration, 20, 80, { width: 500, align: "center", lineBreak: false });

  doc.text("License line:", 20, 140);
  doc.text(license, 20, 160, { width: 500, align: "center", lineBreak: false });
});

// Approach B: Single doc.text() with Arabic font, with rtla feature
makePdf("approach-b-rtla.pdf", (doc) => {
  doc.font("Times-Roman").fontSize(14).fillColor("black");
  doc.text("Approach B: Single doc.text() with NotoSansArabic + rtla feature", 20, 20);

  const cleanDuration = duration.replace(/[\u200e\u200f\u200d\u200c]/g, "");

  doc.font(FONT_AR).fontSize(14).fillColor("black");
  doc.text("Duration cell:", 20, 60);
  doc.text(cleanDuration, 20, 80, { width: 500, align: "center", lineBreak: false, features: ["rtla"] });

  doc.text("License line:", 20, 140);
  doc.text(license, 20, 160, { width: 500, align: "center", lineBreak: false, features: ["rtla"] });
});

// Approach C: Char-by-char rendering with font switching (mimics bot's render_mixed_font_cell_v2)
// This requires pre-applying BiDi. Since we don't have a BiDi library, we'll use PDFKit's BiDi
// by calling doc.text() once on the whole string, which produces the visual order internally.
// Then we manually iterate through chars... but we can't easily extract the visual order from PDFKit.
//
// Instead, we'll do a HYBRID: split text into Arabic and non-Arabic segments, render each
// segment separately with the appropriate font, placing them left-to-right in the order
// PDFKit's BiDi would produce. Since we don't know the visual order, this approach won't work
// directly. We'd need to manually compute the visual order.
//
// For now, just test Approach A and B.

// Approach D: Manual visual order (computed by us) + piece-by-piece with NO BiDi
// We hardcode the visual order for our specific patterns.
makePdf("approach-d-manual-visual.pdf", (doc) => {
  doc.font("Times-Roman").fontSize(14).fillColor("black");
  doc.text("Approach D: Manual visual order, piece-by-piece, NO BiDi (each piece is pure direction)", 20, 20);

  // Visual L→R for "1 يوم  ( 09-06-2026 إلى 09-06-2026 ) " in RTL paragraph:
  //   ") 09-06-2026 إلى 09-06-2026 (  يوم 1"
  // (extra spaces in source preserved, but collapsed here)
  //
  // We split into PURE-direction pieces so PDFKit BiDi won't reorder within each piece.
  const pieces = [
    { text: ")", font: "Times-Roman" },                  // visual leftmost  ← placed first (L→R)
    { text: " ", font: "Times-Roman" },
    { text: "09-06-2026", font: "Times-Roman" },         // second date
    { text: " ", font: "Times-Roman" },
    { text: "إلى", font: FONT_AR },                      // Arabic word
    { text: " ", font: "Times-Roman" },
    { text: "09-06-2026", font: "Times-Roman" },         // first date
    { text: " ", font: "Times-Roman" },
    { text: "(", font: "Times-Roman" },
    { text: " ", font: "Times-Roman" },
    { text: "يوم", font: FONT_AR },                      // Arabic word (without the "1")
    { text: " ", font: "Times-Roman" },
    { text: "1", font: "Times-Roman" },                  // digit (visual rightmost)
  ];

  // Compute widths and total
  const widths = pieces.map((p) => {
    doc.font(p.font).fontSize(14);
    return doc.widthOfString(p.text);
  });
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  // Center horizontally in a 500-wide area
  const cellX = 20;
  const cellWidth = 500;
  const startX = cellX + (cellWidth - totalWidth) / 2;
  const startY = 80;

  doc.fillColor("black");
  let cursorX = startX;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    doc.font(piece.font).fontSize(14).fillColor("black");
    doc.text(piece.text, cursorX, startY, { lineBreak: false });
    cursorX += widths[i];
  }

  // License: visual L→R for "رقم الترخيص : 1410101201200443" in RTL paragraph:
  //   "1410101201200443 : رقم الترخيص"
  doc.font("Times-Roman").fontSize(14).fillColor("black");
  doc.text("License line:", 20, 140);

  const licensePieces = [
    { text: "1410101201200443", font: "Times-Roman" },   // visual leftmost  ← placed first (L→R)
    { text: " ", font: "Times-Roman" },
    { text: ":", font: "Times-Roman" },
    { text: " ", font: "Times-Roman" },
    { text: "رقم الترخيص", font: FONT_AR },              // Arabic word (visual rightmost)
  ];

  const licenseWidths = licensePieces.map((p) => {
    doc.font(p.font).fontSize(14);
    return doc.widthOfString(p.text);
  });
  const licenseTotalWidth = licenseWidths.reduce((a, b) => a + b, 0);

  const licenseStartX = cellX + (cellWidth - licenseTotalWidth) / 2;
  let licenseCursorX = licenseStartX;
  const licenseStartY = 180;

  doc.fillColor("black");
  for (let i = 0; i < licensePieces.length; i++) {
    const piece = licensePieces[i];
    doc.font(piece.font).fontSize(14).fillColor("black");
    doc.text(piece.text, licenseCursorX, licenseStartY, { lineBreak: false });
    licenseCursorX += licenseWidths[i];
  }
});

console.log("Done. Compare the three PDFs to see which approach matches the bot's output.");
