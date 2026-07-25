/**
 * Test script to understand pdfkit's RTL behavior with mixed Arabic/Latin text.
 * Generates several test PDFs to compare different rendering approaches.
 */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const FONT_AR = path.join(__dirname, "..", "public", "fonts", "NotoSansArabic-Regular.ttf");

function makePdf(filename, renderFn) {
  const doc = new PDFDocument({ size: [600, 400], margins: { top: 20, bottom: 20, left: 20, right: 20 } });
  doc.pipe(fs.createWriteStream(path.join("/tmp", filename)));
  renderFn(doc);
  doc.end();
  console.log(`Wrote /tmp/${filename}`);
}

const LRM = "\u200E";
const text = `2 يومان ( ${LRM}20-09-2025${LRM} الى ${LRM}21-09-2025${LRM} )`;
console.log("Source text:", JSON.stringify(text));

// Test 1: Arabic font with rtla feature, default alignment
makePdf("test1.pdf", (doc) => {
  doc.font(FONT_AR).fontSize(14);
  doc.text("Test 1: Arabic font + rtla + default align", 20, 20);
  doc.font(FONT_AR).fontSize(14);
  doc.text(text, 20, 60, { features: ["rtla"] });
});

// Test 2: Arabic font without rtla feature
makePdf("test2.pdf", (doc) => {
  doc.font(FONT_AR).fontSize(14);
  doc.text("Test 2: Arabic font + no features", 20, 20);
  doc.font(FONT_AR).fontSize(14);
  doc.text(text, 20, 60, {});
});

// Test 3: Mixed fonts with continued:true
makePdf("test3.pdf", (doc) => {
  doc.font("Times-Roman").fontSize(14);
  doc.text("Test 3: Mixed fonts + continued:true", 20, 20);

  // Split into segments
  const isArabic = (ch) => {
    const c = ch.codePointAt(0);
    return (c >= 0x600 && c <= 0x6ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff);
  };

  // Strip LRM/RLM
  const cleanText = text.replace(/[\u200e\u200f\u200d\u200c]/g, "");
  console.log("Clean text:", JSON.stringify(cleanText));

  const segments = [];
  let current = "";
  let currentIsArabic = null;
  for (const ch of cleanText) {
    const ar = isArabic(ch);
    if (currentIsArabic === null) {
      currentIsArabic = ar;
      current = ch;
    } else if (ar === currentIsArabic) {
      current += ch;
    } else {
      segments.push({ text: current, isArabic: currentIsArabic });
      current = ch;
      currentIsArabic = ar;
    }
  }
  if (current) segments.push({ text: current, isArabic: currentIsArabic });
  console.log("Segments:", segments);

  // Compute widths
  const segWidths = segments.map((s) => {
    doc.font(s.isArabic ? FONT_AR : "Times-Roman").fontSize(14);
    return doc.widthOfString(s.text);
  });
  const totalWidth = segWidths.reduce((a, b) => a + b, 0);
  console.log("Total width:", totalWidth);

  doc.fillColor("black");
  const startX = 20;
  const startY = 60;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    doc.font(seg.isArabic ? FONT_AR : "Times-Roman").fontSize(14);
    const opts = { continued: !isLast, lineBreak: false };
    if (seg.isArabic) opts.features = ["rtla"];
    if (i === 0) {
      doc.text(seg.text, startX, startY, { ...opts, width: 500 });
    } else {
      doc.text(seg.text, opts);
    }
  }
  doc.text("", { continued: false, lineBreak: false });
});

// Test 4: Mixed fonts with absolute positioning per segment, no width
makePdf("test4.pdf", (doc) => {
  doc.font("Times-Roman").fontSize(14);
  doc.text("Test 4: Mixed fonts + absolute positioning + no width", 20, 20);

  const isArabic = (ch) => {
    const c = ch.codePointAt(0);
    return (c >= 0x600 && c <= 0x6ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff);
  };

  const cleanText = text.replace(/[\u200e\u200f\u200d\u200c]/g, "");
  const segments = [];
  let current = "";
  let currentIsArabic = null;
  for (const ch of cleanText) {
    const ar = isArabic(ch);
    if (currentIsArabic === null) {
      currentIsArabic = ar;
      current = ch;
    } else if (ar === currentIsArabic) {
      current += ch;
    } else {
      segments.push({ text: current, isArabic: currentIsArabic });
      current = ch;
      currentIsArabic = ar;
    }
  }
  if (current) segments.push({ text: current, isArabic: currentIsArabic });

  const segWidths = segments.map((s) => {
    doc.font(s.isArabic ? FONT_AR : "Times-Roman").fontSize(14);
    return doc.widthOfString(s.text);
  });

  doc.fillColor("black");
  let cursorX = 20;
  const cursorY = 60;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    doc.font(seg.isArabic ? FONT_AR : "Times-Roman").fontSize(14);
    const opts = { lineBreak: false };
    if (seg.isArabic) opts.features = ["rtla"];
    doc.text(seg.text, cursorX, cursorY, opts);
    cursorX += segWidths[i];
  }
});

console.log("Done.");
