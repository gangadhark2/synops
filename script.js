// ============================
// SynOps — script.js
// Handles file upload, preview, scan request, and result display
// ============================

// --- Config ---
// Change this to your deployed backend URL when deploying to Render
const BACKEND_URL = "http://127.0.0.1:5000/analyze";

// --- DOM refs ---
const fileInput     = document.getElementById("fileInput");
const uploadZone    = document.getElementById("uploadZone");
const previewWrap   = document.getElementById("previewWrap");
const previewImg    = document.getElementById("previewImg");
const previewFilename = document.getElementById("previewFilename");
const removeBtn     = document.getElementById("removeBtn");
const scanBtn       = document.getElementById("scanBtn");
const resultSection = document.getElementById("resultSection");
const loadingState  = document.getElementById("loadingState");
const loadingText   = document.getElementById("loadingText");
const resultContent = document.getElementById("resultContent");
const errorState    = document.getElementById("errorState");
const errorText     = document.getElementById("errorText");
const resultBadge   = document.getElementById("resultBadge");
const descText      = document.getElementById("descText");
const sportsText    = document.getElementById("sportsText");
const dupeText      = document.getElementById("dupeText");
const rawPre        = document.getElementById("rawPre");
const toggleRaw     = document.getElementById("toggleRaw");

let selectedFile = null;

// --- Loading messages to cycle through ---
const loadingMessages = [
  "Uploading image…",
  "Sending to Gemini AI…",
  "Analyzing content…",
  "Checking for sports media…",
  "Almost done…"
];

// =====================
// FILE SELECTION
// =====================

// When user picks a file via the input
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) {
    handleFile(fileInput.files[0]);
  }
});

// Drag & drop support
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    handleFile(file);
  } else {
    showError("Please drop a valid image file (PNG, JPG, WEBP).");
  }
});

// Handle the file: show preview and enable scan
function handleFile(file) {
  // Max 10MB check
  if (file.size > 10 * 1024 * 1024) {
    showError("File is too large. Please use an image under 10MB.");
    return;
  }

  selectedFile = file;

  // Show image preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewWrap.classList.add("show");
    uploadZone.style.display = "none";
    previewFilename.textContent = file.name;
  };
  reader.readAsDataURL(file);

  // Enable scan button
  scanBtn.disabled = false;

  // Hide any previous results
  resetResults();
}

// Remove image / reset
removeBtn.addEventListener("click", () => {
  selectedFile = null;
  previewWrap.classList.remove("show");
  uploadZone.style.display = "";
  previewImg.src = "";
  fileInput.value = "";
  scanBtn.disabled = true;
  resetResults();
});

// =====================
// SCAN
// =====================

scanBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  await runScan();
});

async function runScan() {
  // --- UI: scanning state ---
  scanBtn.disabled = true;
  scanBtn.classList.add("scanning");
  scanBtn.querySelector(".btn-label").textContent = "Scanning…";

  resultSection.classList.add("show");
  loadingState.classList.add("show");
  resultContent.classList.remove("show");
  errorState.classList.remove("show");

  // Cycle through loading messages
  let msgIdx = 0;
  loadingText.textContent = loadingMessages[0];
  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % loadingMessages.length;
    loadingText.textContent = loadingMessages[msgIdx];
  }, 1800);

  // --- Build form data ---
  const formData = new FormData();
  formData.append("image", selectedFile);

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      body: formData
    });

    clearInterval(msgInterval);

    if (!response.ok) {
      // Try to get error message from backend
      let errMsg = `Server error: ${response.status}`;
      try {
        const errData = await response.json();
        if (errData.error) errMsg = errData.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    displayResults(data);

  } catch (err) {
    clearInterval(msgInterval);
    loadingState.classList.remove("show");
    showError(err.message || "Could not connect to the backend. Is it running?");
  } finally {
    // Restore scan button
    scanBtn.classList.remove("scanning");
    scanBtn.querySelector(".btn-label").textContent = "Scan Image";
    scanBtn.disabled = false;
  }
}

// =====================
// DISPLAY RESULTS
// =====================

function displayResults(data) {
  loadingState.classList.remove("show");
  resultContent.classList.add("show");

  // --- Description ---
  descText.textContent = data.description || "No description returned.";

  // --- Sports related ---
  const isSports = data.is_sports_related;
  sportsText.textContent = data.sports_explanation || (isSports ? "Yes" : "No");

  // --- Duplication risk ---
  dupeText.textContent = data.reuse_risk || "No reuse assessment returned.";

  // --- Badge ---
  resultBadge.textContent = isSports ? "⚽ Sports Content" : "✗ Not Sports";
  resultBadge.className = "result-badge " + (isSports ? "sports" : "nonsports");

  // If there's a risk flag, override badge
  if (data.risk_level && data.risk_level.toLowerCase().includes("high")) {
    resultBadge.textContent = "⚠ High Risk";
    resultBadge.className = "result-badge risk";
  }

  // --- Raw JSON ---
  rawPre.textContent = JSON.stringify(data, null, 2);
}

// =====================
// ERROR STATE
// =====================

function showError(message) {
  resultSection.classList.add("show");
  loadingState.classList.remove("show");
  resultContent.classList.remove("show");
  errorState.classList.add("show");
  errorText.textContent = message;
}

function resetResults() {
  resultSection.classList.remove("show");
  loadingState.classList.remove("show");
  resultContent.classList.remove("show");
  errorState.classList.remove("show");
  rawPre.classList.remove("show");
  toggleRaw.textContent = "Show raw response ↓";
}

// =====================
// RAW TOGGLE
// =====================

toggleRaw.addEventListener("click", () => {
  const isOpen = rawPre.classList.toggle("show");
  toggleRaw.textContent = isOpen ? "Hide raw response ↑" : "Show raw response ↓";
});
