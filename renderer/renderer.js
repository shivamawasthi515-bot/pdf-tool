const pdfjsLib = window.pdfjsLib;

if (!pdfjsLib) {
  console.error("pdfjsLib not loaded");
}

// 🔥 IMPORTANT: SET WORKER HERE
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


let selectedFiles = [];
let orgBuffer = null;
let pageOrder = [];

// ADD FILES
function addFiles() {
  const input = document.getElementById("pdfs");
  const files = Array.from(input.files);

  files.forEach(file => selectedFiles.push(file));

  renderFileList();
  input.value = "";
}

// SHOW FILE LIST
function renderFileList() {
  const list = document.getElementById("fileList");
  list.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const li = document.createElement("li");

    li.innerHTML = `
      📄 ${file.name}
      <button onclick="removeFile(${index})">❌ Remove</button>
    `;

    list.appendChild(li);
  });
}

// REMOVE FILE

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

async function mergePDFs() {
  try {
    if (selectedFiles.length === 0) {
      alert("No files selected!");
      return;
    }

    const buffers = await Promise.all(
      selectedFiles.map(f => f.arrayBuffer())
    );

    const result = await window.pdfAPI.mergePDFs(buffers);

    download(result, "merged.pdf");

  } catch (err) {
    console.error(err);
    alert("Merge failed!");
  }
}

//Compress PDF

async function compressPDF(level = 1) {
  const file = document.getElementById("compressPdf").files[0];

  if (!file) {
    alert("Select a PDF first!");
    return;
  }

  const arrayBuffer = await file.arrayBuffer();

  const result = await window.pdfAPI.compressPDF(arrayBuffer, level);

  const blob = new Blob([result], { type: "application/pdf" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `compressed-level-${level}.pdf`;
  link.click();
}

//Load Organise PDF
async function loadOrganisePDF() {
  const file = document.getElementById("orgPdf").files[0];

  if (!file) {
    alert("Select a PDF first!");
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  orgBuffer = arrayBuffer.slice(0);

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  pageOrder = Array.from({ length: pdf.numPages }, (_, i) => ({
  index: i,
  rotate: 0
}));


  window.pdfDoc = pdf;

  renderPages();
}

//Rotate Function
function rotatePage(i) {
  pageOrder[i].rotate = (pageOrder[i].rotate + 90) % 360;
  renderPages();
}

//Thumbnail Function

async function renderPages() {
  const list = document.getElementById("pageList");
  list.innerHTML = "";

  for (let i = 0; i < pageOrder.length; i++) {

    const pageObj = pageOrder[i];
    const pageIndex = pageObj.index;

    const page = await window.pdfDoc.getPage(pageIndex + 1);

    const viewport = page.getViewport({
      scale: 0.3,
      rotation: pageObj.rotate
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport
    }).promise;

    const li = document.createElement("li");

    const img = document.createElement("img");
    img.src = canvas.toDataURL();
    img.style.width = "120px";

    const text = document.createTextNode(
      `Page ${pageIndex + 1} (${pageObj.rotate}°)`
    );

    // 🔥 MOVE BUTTONS
    const upBtn = document.createElement("button");
    upBtn.textContent = "⬆";
    upBtn.onclick = () => moveUp(i);

    const downBtn = document.createElement("button");
    downBtn.textContent = "⬇";
    downBtn.onclick = () => moveDown(i);

    const delBtn = document.createElement("button");
    delBtn.textContent = "❌";
    delBtn.onclick = () => removePage(i);

    // 🔥 ROTATE BUTTON (MISSING FIX)
    const rotateBtn = document.createElement("button");
    rotateBtn.textContent = "🔄";
    rotateBtn.onclick = () => rotatePage(i);

    // append everything
    li.appendChild(img);
    li.appendChild(document.createTextNode(" "));
    li.appendChild(text);
    li.appendChild(document.createElement("br"));

    li.appendChild(upBtn);
    li.appendChild(downBtn);
    li.appendChild(delBtn);
    li.appendChild(rotateBtn);

    list.appendChild(li);
  }
}
//Page Control 
function removePage(index) {
  pageOrder.splice(index, 1);
  renderPages();
}

function moveUp(index) {
  if (index === 0) return;
  [pageOrder[index - 1], pageOrder[index]] =
    [pageOrder[index], pageOrder[index - 1]];
  renderPages();
}

function moveDown(index) {
  if (index === pageOrder.length - 1) return;
  [pageOrder[index + 1], pageOrder[index]] =
    [pageOrder[index], pageOrder[index + 1]];
  renderPages();
}

//Download Organise PDF
async function downloadOrganisedPDF() {
  if (!orgBuffer || pageOrder.length === 0) {
    alert("No PDF loaded!");
    return;
  }

  const result = await window.pdfAPI.organisePDF({
    buffer: orgBuffer,
    pageOrder: [...pageOrder]
  });

  download(result, "organised.pdf");
}

// download helper
function download(data, name) {
  const blob = new Blob([data], { type: "application/pdf" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}

//Scan PDF Function.
async function scanPDF() {
  const input = document.getElementById("scanPdfInput");

  console.log("INPUT ELEMENT:", input);
  console.log("FILES:", input?.files);

  if (!input || !input.files || input.files.length === 0) {
    alert("Please select a PDF first!");
    return;
  }

  const file = input.files[0];

  const buffer = await file.arrayBuffer();

  const result = await window.pdfAPI.scanPDF(buffer);

  const blob = new Blob([result], { type: "application/pdf" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "scanned.pdf";
  link.click();
}

// 🔥 SAFE EVENT BINDING (NO INLINE JS)
document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("addBtn").addEventListener("click", addFiles);
  document.getElementById("mergeBtn").addEventListener("click", mergePDFs);

  document.getElementById("fastBtn").addEventListener("click", () => compressPDF(1));
  document.getElementById("mediumBtn").addEventListener("click", () => compressPDF(2));
  document.getElementById("ultraBtn").addEventListener("click", () => compressPDF(3));

  document.getElementById("loadOrgBtn")
    .addEventListener("click", loadOrganisePDF);

  document.getElementById("downloadOrgBtn")
    .addEventListener("click", downloadOrganisedPDF);

  document.getElementById("scanBtn")
    .addEventListener("click", scanPDF);

});