const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pdfAPI", {
  mergePDFs: (buffers) =>
    ipcRenderer.invoke("merge-pdf", buffers),

  compressPDF: (buffer, level) =>
    ipcRenderer.invoke("compress-pdf", { buffer, level }),

  organisePDF: (data) =>
    ipcRenderer.invoke("organise-pdf", data),

  organiseMultiPDF: (data) =>
    ipcRenderer.invoke("organise-multi-pdf", data),

  splitPDF: (buffer, splitPoints) =>
    ipcRenderer.invoke("split-pdf", { buffer, splitPoints }),

  scanPDF: (buffer) =>
    ipcRenderer.invoke("scan-pdf", buffer)
});