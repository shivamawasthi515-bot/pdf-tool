const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

// ✅ IMPORT SERVICE (IMPORTANT FIX)
const pdfService = require("./services/pdfService");

// Create Window
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("renderer/index.html");
}

// =========================
// 🔥 MERGE PDF HANDLER
// =========================
ipcMain.handle("merge-pdf", async (event, buffers) => {
  try {
    const mergedPdf = await PDFDocument.create();

    for (let buf of buffers) {
      const pdf = await PDFDocument.load(buf);

      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    return await mergedPdf.save();
  } catch (err) {
    console.error("❌ Merge PDF Error:", err);
    throw err;
  }
});

// =========================
// 🔥 COMPRESS PDF HANDLER (ONLY ONCE)
// =========================
ipcMain.handle("compress-pdf", async (event, { buffer, level }) => {
  try {
    // 🔴 VALIDATION (IMPORTANT - prevents your error)
    if (!buffer) {
      throw new Error("❌ PDF buffer is missing or undefined from renderer");
    }

    // Convert if needed (safety for Electron IPC)
    const pdfBuffer = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer);

    console.log("✅ Compress PDF started");
    console.log("Level:", level);
    console.log("Buffer size:", pdfBuffer.length);

    // 🔥 LEVEL HANDLING
    let result;

    switch (level) {
      case 1:
        result = await pdfService.compressLevel1(pdfBuffer);
        break;

      case 2:
        result = await pdfService.compressLevel2(pdfBuffer);
        break;

      case 3:
        result = await pdfService.compressLevel3(pdfBuffer);
        break;

      default:
        result = await pdfService.compressLevel1(pdfBuffer);
        break;
    }

    console.log("✅ Compression done");
    return result;

  } catch (err) {
    console.error("❌ Compress PDF Error:", err);
    throw err;
  }
});

//orgnaise pdf
ipcMain.handle("organise-pdf", async (event, { buffer, pageOrder }) => {
 return await pdfService.organisePDF(buffer, pageOrder);
});

//page Load
ipcMain.handle("load-pdf-info", async (event, buffer) => {
  const pdf = await PDFDocument.load(buffer);
  return pdf.getPageCount();
});

//Scan PDF
ipcMain.handle("scan-pdf", async (event, buffer) => {
  return await pdfService.scanPDF(buffer);
});

// App Start
app.whenReady().then(createWindow);

// Safe exit
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

