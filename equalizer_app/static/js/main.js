/* static/js/main.js */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function firstSel(...sels) {
    for (const s of sels) {
        const el = $(s);
        if (el) return el;
    }
    return null;
}

function setStatus(msg) {
    const el = firstSel("#statusbar", "[data-role=status]");
    if (el) el.textContent = msg;
    console.log(msg);
}

function downloadBlob(data, filename, type = "application/octet-stream") {
    const blob = new Blob([data], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}

// ---------- DOM bindings ----------
const fileInput = firstSel("#file-hidden");
const dropZone = firstSel("#drop-zone");
const modeSelect = firstSel("#mode-select");

const aiSwitchContainer = firstSel("#ai-switch-container");
const radioCustom = firstSel("#mode-custom");
const radioAI = firstSel("#mode-ai");

const eqPanel = firstSel("#eq-sliders");

// Canvas Elements
const spectrumCanvas = firstSel("#fft-canvas");
const spectrumCtx = spectrumCanvas ? spectrumCanvas.getContext("2d") : null;
const spectrumLoader = firstSel("#spectrum-loader");
const inputCanvas = firstSel("#wave-in");
const outputCanvas = firstSel("#wave-out");
const inCtx = inputCanvas ? inputCanvas.getContext("2d") : null;
const outCtx = outputCanvas ? outputCanvas.getContext("2d") : null;

// New Toggles
const toggleAudiogram = firstSel("#toggle-audiogram");
const toggleBackend = firstSel("#toggle-backend");

// Spectrograms (Unified Canvas)
const specInCanvas = firstSel("#spec-in");
const specOutCanvas = firstSel("#spec-out");
const specInCtx = specInCanvas ? specInCanvas.getContext("2d") : null;
const specOutCtx = specOutCanvas ? specOutCanvas.getContext("2d") : null;

// Equalizer Buttons
const btnClearSubBand = firstSel("#btn-clear-subband");
const btnSaveScheme = firstSel("#btn-scheme-save");
const btnLoadScheme = firstSel("#btn-scheme-load");
const fileSchemeInput = firstSel("#file-scheme");
const btnResetEq = firstSel("#btn-reset-eq");

// AI / Players
const audioIn = firstSel("#audio-in");
const audioOut = firstSel("#audio-out");
const btnPlayInput = firstSel("#play-input");
const btnPlayOutput = firstSel("#play-output");
const btnSyncReset = firstSel("#sync-reset");

// ---------- App State ----------
const state = {
    signalId: null, sr: 0, duration: 0, nSamples: 0, fmax: 0,
    spectrumMags: [],
    scale: "linear",
    fftBackend: "numpy",
    showSpectrograms: true,
    mode: "generic", subbands: [], customSliders: [],
    selecting: false, selStartX: 0, selEndX: 0,
    rawSpecIn: null, rawSpecOut: null,
    inputSamples: [], outputSamples: [],
    specInBitmap: null, specOutBitmap: null,

    // AI State
    aiMode: false,
    aiStems: [],
    stemGains: {}
};

const redPalette = [
    [0, 0, 0], [75, 0, 159], [104, 0, 251], [131, 0, 255],
    [155, 18, 157], [175, 42, 0], [191, 59, 0], [223, 132, 0], [255, 252, 0]
];

// ---------- API Helpers ----------
async function apiPost(url, data, isJson = true) {
    const r = await fetch(url, {
        method: "POST",
        headers: isJson ? {"Content-Type": "application/json"} : undefined,
        body: isJson ? JSON.stringify(data) : data
    });
    if (!r.ok) throw new Error(await r.text());
    const ct = r.headers.get("content-type") || "";
    return ct.includes("application/json") ? r.json() : r.arrayBuffer();
}

async function apiGet(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    const ct = r.headers.get("content-type") || "";
    return ct.includes("application/json") ? r.json() : r.arrayBuffer();
}

// ---------- UI Helpers ----------
function updateButtonVisibility() {
    const genericTools = $('#generic-tools'); // Container for Save/Load/Clear

    if (state.mode === 'generic') {
        // Generic Mode: Show Save/Load/Clear, Hide Reset
        if (genericTools) genericTools.style.display = 'flex';
        if (btnResetEq) btnResetEq.style.display = 'none';
    } else {
        // Other Modes: Hide Save/Load/Clear, Show Reset
        if (genericTools) genericTools.style.display = 'none';
        if (btnResetEq) btnResetEq.style.display = 'inline-block';
    }
}

// ---------- Global State Management ----------
function setGlobalState(enabled) {
    const disabled = !enabled;

    if (modeSelect) modeSelect.disabled = false;

    if (btnSaveScheme) btnSaveScheme.disabled = disabled;
    if (fileSchemeInput) fileSchemeInput.disabled = disabled;
    if (btnResetEq) btnResetEq.disabled = disabled;

    const loadLabel = document.querySelector(".file-btn");
    if (loadLabel) {
        if (disabled) loadLabel.classList.add("disabled");
        else loadLabel.classList.remove("disabled");
    }

    if (disabled && btnClearSubBand) btnClearSubBand.disabled = true;

    // Switch Inputs logic
    if (radioCustom) radioCustom.disabled = disabled;
    if (radioAI) radioAI.disabled = disabled;

    if (btnPlayInput) btnPlayInput.disabled = disabled;
    if (btnPlayOutput) btnPlayOutput.disabled = disabled;
    if (btnSyncReset) btnSyncReset.disabled = disabled;

    [toggleAudiogram, toggleBackend].forEach(input => {
        if (input) {
            input.disabled = disabled;
            const label = input.closest('.toggle-switch');
            if (label) {
                if (disabled) label.classList.add('disabled');
                else label.classList.remove('disabled');
            }
        }
    });
}

// ---------- Helper: AI Switch Visibility ----------
function updateAIVisibility(mode) {
    if (!aiSwitchContainer) return;

    // Check if mode supports AI
    if (mode === 'music' || mode === 'human') {
        aiSwitchContainer.style.display = 'flex';
    } else {
        aiSwitchContainer.style.display = 'none';
        forceSwitchToCustom(); // Ensure we don't get stuck in AI mode hidden
    }
}

function forceSwitchToCustom() {
    state.aiMode = false;
    if (radioCustom) radioCustom.checked = true;
    // Hide panel if visible
    const p = firstSel("#ai-panel");
    if (p && !p.classList.contains("hidden")) p.classList.add("hidden");

    // Ensure visibility is consistent
    updateButtonVisibility();
}

// ---------- File Upload Logic ----------
function bindUpload() {
    if (dropZone) {
        dropZone.addEventListener("click", () => fileInput && fileInput.click());
        ["dragenter", "dragover"].forEach(ev => dropZone.addEventListener(ev, e => {
            e.preventDefault();
            dropZone.classList.add("drag");
        }));
        ["dragleave", "drop"].forEach(ev => dropZone.addEventListener(ev, e => {
            e.preventDefault();
            dropZone.classList.remove("drag");
        }));
        dropZone.addEventListener("drop", (e) => {
            const f = e.dataTransfer?.files?.[0];
            if (f) doUploadFile(f);
        });
    }
    if (fileInput) fileInput.addEventListener("change", (e) => {
        const f = e.target.files?.[0];
        if (f) doUploadFile(f);
    });
}

async function doUploadFile(file) {
    try {
        setStatus(`Uploading: ${file.name} ...`);
        if (spectrumLoader) spectrumLoader.classList.remove("hidden");
        const fd = new FormData();
        fd.append("signal", file);

        const res = await apiPost("/api/upload/", fd, false);
        const j = typeof res === "object" ? res : JSON.parse(new TextDecoder().decode(res));

        state.signalId = j.signal_id;
        state.sr = j.sr;
        state.duration = j.duration;
        state.nSamples = j.n;

        // Reset AI state on new upload
        state.aiMode = false;
        state.aiStems = [];
        state.stemGains = {};
        if (radioCustom) radioCustom.checked = true;

        setStatus(`Loaded ${j.file_name} — sr=${j.sr}Hz, len=${j.duration.toFixed(2)}s`);

        setGlobalState(true);

        if (state.mode !== 'generic') {
            await renderCustomizedSliders();
            await applyEqualizer();
        }
        await refreshAll();
    } catch (err) {
        console.error(err);
        setStatus(`Upload error: ${err.message}`);
        if (spectrumLoader) spectrumLoader.classList.add("hidden");
    }
}
