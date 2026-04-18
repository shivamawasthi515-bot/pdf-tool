const { PDFDocument, degrees } = require("pdf-lib");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const pdfPoppler = require("pdf-poppler");


// =========================
// MERGE PDF
// =========================
async function mergePDFs(files) {
  const mergedPdf = await PDFDocument.create();

  for (let file of files) {
    const pdf = await PDFDocument.load(file);

    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(p => mergedPdf.addPage(p));
  }

  return await mergedPdf.save();
}

// =========================
// LEVEL 1
// =========================
async function compressLevel1(buffer) {
  const pdf = await PDFDocument.load(buffer);

  return await pdf.save({
    useObjectStreams: true
  });
}

// =========================
// LEVEL 2
// =========================
async function compressLevel2(buffer) {
  const pdf = await PDFDocument.load(buffer);

  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");

  return await pdf.save({
    useObjectStreams: true,
    addDefaultPage: false
  });
}

// =========================
// LEVEL 3
// =========================
async function compressLevel3(inputBuffer) {
 const os = require("os");

const tempDir = path.join(os.tmpdir(), "pdf-tool-temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}


  const buffer = Buffer.isBuffer(inputBuffer)
    ? inputBuffer
    : Buffer.from(inputBuffer);

  const inputPath = path.join(tempDir, "input.pdf");

  // STEP 1: write file
  fs.writeFileSync(inputPath, buffer);

  // STEP 2: convert PDF → images
  await pdfPoppler.convert(inputPath, {
    format: "jpeg",
    out_dir: tempDir,
    out_prefix: "page",
    page: null
  });

  // STEP 3: safely get images in correct order
  const images = fs
    .readdirSync(tempDir)
    .filter(f => f.startsWith("page") && f.endsWith(".jpg"))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.match(/\d+/)?.[0] || 0);
      return aNum - bNum;
    });

  // STEP 4: rebuild PDF
  const pdfDoc = await PDFDocument.create();

  for (let img of images) {
    const imgPath = path.join(tempDir, img);

    const compressed = await sharp(imgPath)
      .resize({ width: 1200 })
      .jpeg({ quality: 40 })
      .toBuffer();

    const embed = await pdfDoc.embedJpg(compressed);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    page.drawImage(embed, {
      x: 0,
      y: 0,
      width,
      height
    });
  }

  // STEP 5: generate final PDF
  const output = await pdfDoc.save();

  // STEP 6: SAFE cleanup (ONLY images, NOT input.pdf immediately)
  fs.readdirSync(tempDir).forEach(file => {
    if (file.startsWith("page") && file.endsWith(".jpg")) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  });

  return output;
}


// =========================
// ORGANISE PDF (REORDER + DELETE PAGES)
// =========================

async function organisePDF(buffer, pageOrder) {
  const srcPdf = await PDFDocument.load(buffer);

  const newPdf = await PDFDocument.create();

  const pages = await newPdf.copyPages(
    srcPdf,
    srcPdf.getPageIndices()
  );

  for (let item of pageOrder) {
    const page = pages[item.index];

    if (item.rotate && item.rotate !== 0) {
      page.setRotation(degrees(item.rotate));
    }

    newPdf.addPage(page);
  }

  return await newPdf.save();
}

//Scan PDF
async function scanPDF(inputBuffer) {
const os = require("os");
const tempDir = path.join(os.tmpdir(), "pdf-tool-temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

  const buffer = Buffer.from(inputBuffer);
  const inputPath = path.join(tempDir, "input.pdf");

  fs.writeFileSync(inputPath, buffer);

  await pdfPoppler.convert(inputPath, {
    format: "jpeg",
    out_dir: tempDir,
    out_prefix: "scan",
    page: null
  });

  const images = fs
    .readdirSync(tempDir)
    .filter(f => f.startsWith("scan") && f.endsWith(".jpg"))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const pdfDoc = await PDFDocument.create();

  for (let img of images) {
    const imgPath = path.join(tempDir, img);

    const compressed = await sharp(imgPath)
      .jpeg({ quality: 80 })
      .toBuffer();

    const embed = await pdfDoc.embedJpg(compressed);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    page.drawImage(embed, {
      x: 0,
      y: 0,
      width,
      height
    });
  }

  const output = await pdfDoc.save();

  // cleanup
  function safeCleanup(tempDir) {
  try {
    if (!fs.existsSync(tempDir)) return;

    fs.readdirSync(tempDir).forEach(file => {
      const filePath = path.join(tempDir, file);

      try {
        const stat = fs.lstatSync(filePath);

        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn("Skip file:", filePath);
      }
    });
  } catch (err) {
    console.warn("Cleanup failed:", err.message);
  }
}
    safeCleanup(tempDir);

  return output;
}

// =========================
// EXPORT (ONLY ONCE)
// =========================
module.exports = {
  mergePDFs,
  compressLevel1,
  compressLevel2,
  compressLevel3,
  organisePDF,
  scanPDF
};