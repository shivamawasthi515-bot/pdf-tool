const { PDFDocument, degrees } = require("pdf-lib");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
// pdf-poppler is required lazily inside the functions that use it so that a
// missing Poppler binary does not prevent the rest of the module from loading.


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
// SHARED IMAGE-BASED COMPRESSION HELPER
// Renders every page via pdf-poppler, recompresses with sharp, rebuilds PDF.
// options: { resolution, jpegQuality, maxWidth }
//   resolution  – DPI used by pdf-poppler (higher = better quality / larger file)
//   jpegQuality – 0-100 JPEG quality passed to sharp
//   maxWidth    – resize page image to this width (null = keep original size)
// =========================
async function _compressViaImages(inputBuffer, { resolution, jpegQuality, maxWidth }) {
  const os = require("os");
  const pdfPoppler = require("pdf-poppler");

  const tempDir = path.join(os.tmpdir(), "pdf-tool-temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const buffer = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
  const inputPath = path.join(tempDir, "input.pdf");
  fs.writeFileSync(inputPath, buffer);

  // STEP 1: render PDF pages to JPEG images
  await pdfPoppler.convert(inputPath, {
    format: "jpeg",
    out_dir: tempDir,
    out_prefix: "page",
    page: null,
    resolution
  });

  // STEP 2: collect images in page order
  const images = fs
    .readdirSync(tempDir)
    .filter(f => f.startsWith("page") && f.endsWith(".jpg"))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)?.[0] || 0);
      const bNum = parseInt(b.match(/\d+/)?.[0] || 0);
      return aNum - bNum;
    });

  // STEP 3: recompress each image and rebuild PDF
  const pdfDoc = await PDFDocument.create();

  for (const img of images) {
    const imgPath = path.join(tempDir, img);

    let pipeline = sharp(imgPath);
    if (maxWidth) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }
    const compressed = await pipeline.jpeg({ quality: jpegQuality }).toBuffer();

    const embed = await pdfDoc.embedJpg(compressed);
    // Size page exactly to the embedded image so aspect ratio is preserved
    const page = pdfDoc.addPage([embed.width, embed.height]);
    page.drawImage(embed, { x: 0, y: 0, width: embed.width, height: embed.height });
  }

  // STEP 4: save output
  const output = await pdfDoc.save();

  // STEP 5: clean up temp images
  fs.readdirSync(tempDir).forEach(file => {
    if (file.startsWith("page") && file.endsWith(".jpg")) {
      try { fs.unlinkSync(path.join(tempDir, file)); } catch (_) {}
    }
  });

  return output;
}

// =========================
// LEVEL 1 – very light compression (5–10 % size reduction)
// 200 DPI render, JPEG quality 92, no resize.
// Virtually no visible quality change.
// =========================
async function compressLevel1(buffer) {
  return _compressViaImages(buffer, { resolution: 200, jpegQuality: 92, maxWidth: null });
}

// =========================
// LEVEL 2 – moderate compression (20–40 % size reduction)
// 150 DPI render, JPEG quality 80, no resize.
// Minor quality reduction, clearly smaller file.
// =========================
async function compressLevel2(buffer) {
  return _compressViaImages(buffer, { resolution: 150, jpegQuality: 80, maxWidth: null });
}

// =========================
// LEVEL 3 – strong compression (40–60 % size reduction)
// 120 DPI render, JPEG quality 65, max-width 1800 px.
// Noticeable but acceptable quality reduction for significant space saving.
// =========================
async function compressLevel3(inputBuffer) {
  return _compressViaImages(inputBuffer, { resolution: 120, jpegQuality: 65, maxWidth: 1800 });
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
const pdfPoppler = require("pdf-poppler");
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
// ORGANISE MULTI-PDF
// (pages from multiple source files, arbitrary order + rotation)
// =========================
async function organiseMultiPDF({ buffers, items }) {
  // Load each source PDF once
  const loadedPdfs = await Promise.all(
    buffers.map(buf =>
      PDFDocument.load(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    )
  );

  const newPdf = await PDFDocument.create();

  for (const item of items) {
    const srcPdf = loadedPdfs[item.bufferIndex];
    const [page] = await newPdf.copyPages(srcPdf, [item.pageIndex]);
    if (item.rotate && item.rotate !== 0) {
      page.setRotation(degrees(item.rotate));
    }
    newPdf.addPage(page);
  }

  return await newPdf.save();
}

// =========================
// SPLIT PDF
// splitPoints: sorted array of 1-indexed page numbers after which to split
// e.g. splitPoints=[3]   on a 10-page PDF → Part 1: pages 1-3, Part 2: pages 4-10
// e.g. splitPoints=[3,7] on a 10-page PDF → Parts: 1-3, 4-7, 8-10
// =========================
async function splitPDF(buffer, splitPoints) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const srcPdf = await PDFDocument.load(buf);
  const total = srcPdf.getPageCount();

  // Build 0-indexed range boundaries
  const sorted = [...splitPoints]
    .map(p => Math.min(Math.max(Math.floor(p), 1), total - 1))
    .sort((a, b) => a - b)
    .filter((v, i, arr) => i === 0 || v !== arr[i - 1]); // deduplicate

  const boundaries = [0, ...sorted, total];

  const results = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to   = boundaries[i + 1];
    if (from >= to) continue; // skip empty parts

    const partPdf = await PDFDocument.create();
    const indices = Array.from({ length: to - from }, (_, j) => from + j);
    const pages   = await partPdf.copyPages(srcPdf, indices);
    pages.forEach(p => partPdf.addPage(p));
    results.push(await partPdf.save());
  }

  return results;
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
  organiseMultiPDF,
  splitPDF,
  scanPDF
};