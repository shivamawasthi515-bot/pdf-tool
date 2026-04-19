const pdfjsLib = window.pdfjsLib;

if (!pdfjsLib) {
  console.error("pdfjsLib not loaded");
}

// 🔥 IMPORTANT: SET WORKER HERE
pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";

// ─── MERGE ────────────────────────────────────────────────────────────────────
let selectedFiles = [];

function addFiles() {
  const input = document.getElementById("pdfs");
  Array.from(input.files).forEach(f => selectedFiles.push(f));
  renderFileList();
  input.value = "";
}

function renderFileList() {
  const list = document.getElementById("fileList");
  list.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const li = document.createElement("li");

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "📄";

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "❌ Remove";
    removeBtn.className = "btn btn-danger";
    removeBtn.addEventListener("click", () => { selectedFiles.splice(index, 1); renderFileList(); });

    li.appendChild(icon);
    li.appendChild(name);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

async function mergePDFs() {
  try {
    if (selectedFiles.length === 0) { alert("No files selected!"); return; }
    const buffers = await Promise.all(selectedFiles.map(f => f.arrayBuffer()));
    const result = await window.pdfAPI.mergePDFs(buffers);
    download(result, "merged.pdf");
  } catch (err) {
    console.error(err);
    alert("Merge failed!");
  }
}

// ─── COMPRESS ─────────────────────────────────────────────────────────────────
async function compressPDF(level = 1) {
  const file = document.getElementById("compressPdf").files[0];
  if (!file) { alert("Select a PDF first!"); return; }
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.pdfAPI.compressPDF(arrayBuffer, level);
  const blob = new Blob([result], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `compressed-level-${level}.pdf`;
  link.click();
}

// ─── ORGANISE (MULTI-FILE) ────────────────────────────────────────────────────
// Distinct colours used to identify each loaded file visually
const FILE_COLORS = [
  { bg: '#ede9fe', border: '#7c3aed', dot: '#7c3aed' },
  { bg: '#dbeafe', border: '#2563eb', dot: '#2563eb' },
  { bg: '#dcfce7', border: '#16a34a', dot: '#16a34a' },
  { bg: '#fef9c3', border: '#ca8a04', dot: '#ca8a04' },
  { bg: '#fee2e2', border: '#dc2626', dot: '#dc2626' },
  { bg: '#fce7f3', border: '#db2777', dot: '#db2777' },
  { bg: '#e0f2fe', border: '#0284c7', dot: '#0284c7' },
  { bg: '#fff7ed', border: '#ea580c', dot: '#ea580c' },
];

// orgFiles[i] = { file, buffer (ArrayBuffer), pdfDoc, colorIndex }
let orgFiles = [];
// orgItems[i] = { bufferIndex, pageIndex, rotate }  — used in Pages Mode
let orgItems = [];
// order of file indices shown in Files Mode
let orgFileOrder = [];
let orgMode = 'pages';
let orgPagesSortable = null;
let orgFilesSortable = null;

async function addOrgFiles() {
  const input = document.getElementById("orgPdfs");
  const files = Array.from(input.files);
  if (!files.length) return;

  for (const file of files) {
    const colorIndex = orgFiles.length % FILE_COLORS.length;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = arrayBuffer.slice(0);
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const bufferIndex = orgFiles.length;
    orgFiles.push({ file, buffer, pdfDoc, colorIndex });
    orgFileOrder.push(bufferIndex);
    for (let p = 0; p < pdfDoc.numPages; p++) {
      orgItems.push({ bufferIndex, pageIndex: p, rotate: 0 });
    }
  }

  input.value = "";
  renderOrgFilesList();
  const toggle = document.getElementById("orgModeToggle");
  const hint   = document.getElementById("orgDragHint");
  toggle.style.display = orgFiles.length > 0 ? "flex" : "none";
  hint.style.display   = orgFiles.length > 0 ? "flex" : "none";
  if (orgMode === 'pages') renderOrgPages();
  else renderOrgFilesMode();
}

function clearOrgAll() {
  orgFiles = [];
  orgItems = [];
  orgFileOrder = [];
  if (orgPagesSortable) { orgPagesSortable.destroy(); orgPagesSortable = null; }
  if (orgFilesSortable) { orgFilesSortable.destroy(); orgFilesSortable = null; }
  document.getElementById("pageList").innerHTML = "";
  document.getElementById("orgFilesOrder").innerHTML = "";
  document.getElementById("orgFilesList").innerHTML = "";
  document.getElementById("orgModeToggle").style.display = "none";
  document.getElementById("orgDragHint").style.display   = "none";
}

function renderOrgFilesList() {
  const container = document.getElementById("orgFilesList");
  container.innerHTML = "";
  orgFiles.forEach((entry, i) => {
    const c = FILE_COLORS[entry.colorIndex];
    const div = document.createElement("div");
    div.className = "org-file-item";
    div.style.background = c.bg;
    div.style.border = `1.5px solid ${c.border}`;

    const dot = document.createElement("span");
    dot.className = "org-file-badge";
    dot.style.background = c.dot;

    const name = document.createElement("span");
    name.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
    name.style.color = c.dot;
    name.textContent = `${entry.file.name}  (${entry.pdfDoc.numPages} pages)`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-danger btn-sm";
    removeBtn.textContent = "❌";
    removeBtn.title = "Remove this file";
    removeBtn.addEventListener("click", () => removeOrgFile(i));

    div.appendChild(dot);
    div.appendChild(name);
    div.appendChild(removeBtn);
    container.appendChild(div);
  });
}

function removeOrgFile(fileIdx) {
  orgFiles.splice(fileIdx, 1);
  // Reassign colour indices so they stay consecutive
  orgFiles.forEach((f, i) => { f.colorIndex = i % FILE_COLORS.length; });
  // Remove pages belonging to deleted file; shift bufferIndex for later files
  orgItems = orgItems
    .filter(item => item.bufferIndex !== fileIdx)
    .map(item => ({ ...item, bufferIndex: item.bufferIndex > fileIdx ? item.bufferIndex - 1 : item.bufferIndex }));
  orgFileOrder = orgFileOrder
    .filter(idx => idx !== fileIdx)
    .map(idx => idx > fileIdx ? idx - 1 : idx);

  renderOrgFilesList();
  const toggle = document.getElementById("orgModeToggle");
  const hint   = document.getElementById("orgDragHint");
  toggle.style.display = orgFiles.length > 0 ? "flex" : "none";
  hint.style.display   = orgFiles.length > 0 ? "flex" : "none";
  if (orgMode === 'pages') renderOrgPages();
  else renderOrgFilesMode();
}

function setOrgMode(mode) {
  orgMode = mode;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  const pageList   = document.getElementById("pageList");
  const filesOrder = document.getElementById("orgFilesOrder");
  if (mode === 'pages') {
    pageList.style.display   = "";
    filesOrder.style.display = "none";
    renderOrgPages();
  } else {
    pageList.style.display   = "none";
    filesOrder.style.display = "";
    renderOrgFilesMode();
  }
}

async function renderOrgPages() {
  const list = document.getElementById("pageList");
  list.innerHTML = "";
  if (orgPagesSortable) { orgPagesSortable.destroy(); orgPagesSortable = null; }

  for (let i = 0; i < orgItems.length; i++) {
    const item  = orgItems[i];
    const entry = orgFiles[item.bufferIndex];
    const c     = FILE_COLORS[entry.colorIndex];

    const page     = await entry.pdfDoc.getPage(item.pageIndex + 1);
    const viewport = page.getViewport({ scale: 0.3, rotation: item.rotate });
    const canvas   = document.createElement("canvas");
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    const li = document.createElement("li");
    li.dataset.idx = String(i);
    li.style.borderColor = c.border;
    li.style.position    = "relative";
    li.style.overflow    = "hidden";

    // Coloured bar at top to identify source file
    const bar = document.createElement("div");
    bar.className       = "file-color-bar";
    bar.style.background = c.border;

    const img = document.createElement("img");
    img.src = canvas.toDataURL();

    const label = document.createElement("span");
    label.className  = "page-label";
    label.style.color = c.dot;
    label.textContent = `Page ${item.pageIndex + 1}  ·  ${item.rotate}°`;

    const fileTag = document.createElement("span");
    fileTag.className = "page-label";
    fileTag.style.cssText = "font-size:0.68rem; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted);";
    fileTag.textContent = entry.file.name;

    const actions = document.createElement("div");
    actions.className = "page-actions";

    const rotateBtn = document.createElement("button");
    rotateBtn.className   = "btn btn-outline btn-sm";
    rotateBtn.textContent = "🔄";
    rotateBtn.title       = "Rotate 90°";
    rotateBtn.addEventListener("click", () => { orgItems[i].rotate = (orgItems[i].rotate + 90) % 360; renderOrgPages(); });

    const delBtn = document.createElement("button");
    delBtn.className   = "btn btn-danger btn-sm";
    delBtn.textContent = "❌";
    delBtn.title       = "Delete page";
    delBtn.addEventListener("click", () => { orgItems.splice(i, 1); renderOrgPages(); });

    actions.appendChild(rotateBtn);
    actions.appendChild(delBtn);
    li.appendChild(bar);
    li.appendChild(img);
    li.appendChild(label);
    li.appendChild(fileTag);
    li.appendChild(actions);
    list.appendChild(li);
  }

  if (window.Sortable && orgItems.length > 0) {
    orgPagesSortable = new Sortable(list, {
      animation: 200,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd(evt) {
        const moved = orgItems.splice(evt.oldIndex, 1)[0];
        orgItems.splice(evt.newIndex, 0, moved);
        renderOrgPages();
      }
    });
  }
}

function renderOrgFilesMode() {
  const list = document.getElementById("orgFilesOrder");
  list.innerHTML = "";
  if (orgFilesSortable) { orgFilesSortable.destroy(); orgFilesSortable = null; }

  orgFileOrder.forEach((fileIdx, i) => {
    const entry = orgFiles[fileIdx];
    const c     = FILE_COLORS[entry.colorIndex];

    const li = document.createElement("li");
    li.dataset.idx       = String(i);
    li.style.background  = c.bg;
    li.style.borderColor = c.border;

    const grip = document.createElement("span");
    grip.textContent = "⠿";
    grip.style.cssText = `font-size:1.2rem; color:${c.dot}; cursor:grab; flex-shrink:0;`;

    const dot = document.createElement("span");
    dot.style.cssText = `width:16px; height:16px; border-radius:50%; background:${c.dot}; flex-shrink:0;`;

    const info = document.createElement("div");
    info.style.flex     = "1";
    info.style.overflow = "hidden";

    const fname = document.createElement("div");
    fname.style.cssText = `color:${c.dot}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700;`;
    fname.textContent = entry.file.name;

    const fmeta = document.createElement("div");
    fmeta.style.cssText = "font-size:0.78rem; color:var(--muted); font-weight:400;";
    fmeta.textContent = `${entry.pdfDoc.numPages} pages`;

    info.appendChild(fname);
    info.appendChild(fmeta);

    const removeBtn = document.createElement("button");
    removeBtn.className   = "btn btn-danger btn-sm";
    removeBtn.textContent = "❌";
    removeBtn.title       = "Remove file";
    removeBtn.addEventListener("click", () => removeOrgFile(fileIdx));

    li.appendChild(grip);
    li.appendChild(dot);
    li.appendChild(info);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });

  if (window.Sortable && orgFileOrder.length > 0) {
    orgFilesSortable = new Sortable(list, {
      animation: 200,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd(evt) {
        const moved = orgFileOrder.splice(evt.oldIndex, 1)[0];
        orgFileOrder.splice(evt.newIndex, 0, moved);
        renderOrgFilesMode();
      }
    });
  }
}

async function downloadOrganisedPDF() {
  if (orgFiles.length === 0) { alert("No PDFs loaded!"); return; }

  let items;
  if (orgMode === 'files') {
    // Assemble all pages from each file in the current file order
    items = [];
    orgFileOrder.forEach(fileIdx => {
      const entry = orgFiles[fileIdx];
      for (let p = 0; p < entry.pdfDoc.numPages; p++) {
        items.push({ bufferIndex: fileIdx, pageIndex: p, rotate: 0 });
      }
    });
  } else {
    items = orgItems;
  }

  if (items.length === 0) { alert("No pages to save!"); return; }

  // Re-read fresh ArrayBuffers for IPC transfer
  const rawBuffers = await Promise.all(orgFiles.map(e => e.file.arrayBuffer()));
  const result = await window.pdfAPI.organiseMultiPDF({ buffers: rawBuffers, items });
  download(result, "organised.pdf");
}

// ─── SPLIT PDF ────────────────────────────────────────────────────────────────
let splitFile       = null;
let splitTotalPages = 0;

async function onSplitFileChange() {
  const input = document.getElementById("splitPdfInput");
  const file  = input.files[0];
  if (!file) return;

  splitFile = file;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  splitTotalPages = pdf.numPages;

  const info = document.getElementById("splitFileInfo");
  info.style.display = "";
  info.innerHTML = `<strong>📄 ${file.name}</strong> &nbsp; <span style="color:var(--muted); font-size:0.88rem;">${splitTotalPages} pages total</span>`;
  document.getElementById("splitResults").innerHTML = "";
}

async function doSplitPDF() {
  if (!splitFile) { alert("Select a PDF first!"); return; }

  const raw = document.getElementById("splitPointsInput").value.trim();
  if (!raw) { alert("Enter at least one page number to split at!"); return; }

  const points = raw.split(/[\s,]+/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 1 && n < splitTotalPages);

  if (points.length === 0) {
    alert(`Enter valid page numbers between 1 and ${splitTotalPages - 1}.`);
    return;
  }

  const buffer = await splitFile.arrayBuffer();
  const parts  = await window.pdfAPI.splitPDF(buffer, points);
  renderSplitResults(parts, points);
}

async function splitEqualParts() {
  if (!splitFile) { alert("Select a PDF first!"); return; }
  if (splitTotalPages < 2) { alert("PDF must have at least 2 pages to split!"); return; }
  const mid = Math.floor(splitTotalPages / 2);
  document.getElementById("splitPointsInput").value = String(mid);
  await doSplitPDF();
}

function renderSplitResults(parts, splitPoints) {
  const container = document.getElementById("splitResults");
  container.innerHTML = `<p style="font-weight:600; margin-bottom:10px;">✅ Split into ${parts.length} part(s):</p>`;

  // Reconstruct page ranges for display labels
  const sorted     = [...splitPoints].sort((a, b) => a - b);
  const boundaries = [1, ...sorted.map(p => p + 1), splitTotalPages + 1];

  parts.forEach((partData, i) => {
    const from = boundaries[i];
    const to   = boundaries[i + 1] - 1;

    const div = document.createElement("div");
    div.className = "split-part";

    const label = document.createElement("span");
    label.innerHTML = `<strong>Part ${i + 1}</strong> &nbsp; <span style="color:var(--muted); font-size:0.82rem;">pages ${from}–${to}</span>`;

    const dlBtn = document.createElement("button");
    dlBtn.className   = "btn btn-split btn-sm";
    dlBtn.textContent = `💾 Download Part ${i + 1}`;
    dlBtn.addEventListener("click", () => download(partData, `split-part-${i + 1}.pdf`));

    div.appendChild(label);
    div.appendChild(dlBtn);
    container.appendChild(div);
  });
}

// ─── SCAN PDF ─────────────────────────────────────────────────────────────────
async function scanPDF() {
  const input = document.getElementById("scanPdfInput");
  if (!input || !input.files || input.files.length === 0) {
    alert("Please select a PDF first!");
    return;
  }
  const file   = input.files[0];
  const buffer = await file.arrayBuffer();
  const result = await window.pdfAPI.scanPDF(buffer);
  const blob   = new Blob([result], { type: "application/pdf" });
  const link   = document.createElement("a");
  link.href     = URL.createObjectURL(blob);
  link.download = "scanned.pdf";
  link.click();
}

// ─── DOWNLOAD HELPER ──────────────────────────────────────────────────────────
function download(data, name) {
  const blob = new Blob([data], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href     = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}

// ─── EVENT BINDING ────────────────────────────────────────────────────────────
// renderer.js is loaded at the bottom of <body>, so the DOM is already parsed
// when this script executes.  Using a readyState guard means initUI() is called
// immediately (readyState === 'interactive') rather than relying on a
// DOMContentLoaded callback that may have already fired in some Electron builds.
function initUI() {

  // Tab switching
  const tabButtons = document.querySelectorAll("nav.tabs button");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });

  // Drop-zone hover highlight
  document.querySelectorAll(".drop-zone").forEach(zone => {
    zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", ()  => zone.classList.remove("drag-over"));
    zone.addEventListener("drop",      ()  => zone.classList.remove("drag-over"));
  });

  // ── Merge ──
  // "Add Files" opens the file picker; the change event processes the selection
  const pdfsInput = document.getElementById("pdfs");
  document.getElementById("addBtn").addEventListener("click", () => pdfsInput.click());
  pdfsInput.addEventListener("change", addFiles);
  document.getElementById("mergeBtn").addEventListener("click", mergePDFs);

  // ── Compress ──
  document.getElementById("fastBtn").addEventListener("click",   () => compressPDF(1));
  document.getElementById("mediumBtn").addEventListener("click", () => compressPDF(2));
  document.getElementById("ultraBtn").addEventListener("click",  () => compressPDF(3));

  // ── Organise ──
  // "Add PDFs" opens the file picker; the change event processes the selection
  const orgPdfsInput = document.getElementById("orgPdfs");
  document.getElementById("addOrgFilesBtn").addEventListener("click", () => orgPdfsInput.click());
  orgPdfsInput.addEventListener("change", addOrgFiles);
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => setOrgMode(btn.dataset.mode));
  });
  document.getElementById("clearOrgBtn").addEventListener("click",    clearOrgAll);
  document.getElementById("downloadOrgBtn").addEventListener("click", downloadOrganisedPDF);

  // ── Split ──
  document.getElementById("splitPdfInput").addEventListener("change",  onSplitFileChange);
  document.getElementById("splitBtn").addEventListener("click",        doSplitPDF);
  document.getElementById("splitEqualBtn").addEventListener("click",   splitEqualParts);

  // ── Scan ──
  document.getElementById("scanBtn").addEventListener("click", scanPDF);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUI);
} else {
  initUI();
}
