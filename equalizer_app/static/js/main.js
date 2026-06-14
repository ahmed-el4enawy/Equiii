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

// ... [Draw Logic functions] ...
function drawGridLogic(ctx, W, H, marginL, marginR, xLabels, yLabels, xTitle, yTitle, gridColor = "#444", textColor = "#aaa") {
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const marginBottom = 30;
    const drawH = H - marginBottom;
    const drawW = W - marginL - marginR;
    ctx.beginPath();
    ctx.moveTo(0, drawH);
    ctx.lineTo(W, drawH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(marginL, 0);
    ctx.lineTo(marginL, H);
    ctx.stroke();
    xLabels.forEach(lbl => {
        const x = marginL + (lbl.pos * drawW);
        ctx.beginPath();
        ctx.moveTo(x, drawH);
        ctx.lineTo(x, drawH + 5);
        ctx.stroke();
        ctx.fillText(lbl.text, x, drawH + 15);
    });
    ctx.textAlign = "right";
    yLabels.forEach(lbl => {
        const y = drawH - (lbl.pos * drawH);
        ctx.beginPath();
        ctx.moveTo(marginL - 5, y);
        ctx.lineTo(marginL, y);
        ctx.stroke();
        ctx.fillText(lbl.text, marginL - 8, y + 3);
    });
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    if (xTitle) {
        ctx.textAlign = "center";
        ctx.fillText(xTitle, marginL + drawW / 2, H - 5);
    }
    if (yTitle) {
        ctx.save();
        ctx.translate(15, drawH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(yTitle, 0, 0);
        ctx.restore();
    }
}

function drawSpectrum(mags, fmax, canvas, ctx) {
    if (!canvas || !ctx || !Array.isArray(mags)) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const marginL = 40, marginR = 20, marginTop = 30, marginBottom = 30;
    const drawW = W - marginL - marginR;
    const drawH = H - marginTop - marginBottom;
    const xLabels = [];
    for (let i = 0; i <= 5; i++) {
        const freq = (fmax * i / 5);
        const text = freq >= 1000 ? (freq / 1000).toFixed(1) + "k" : freq.toFixed(0);
        xLabels.push({pos: i / 5, text: text});
    }
    let yLabels = [];
    let yTitle = "Amplitude";
    if (state.scale === 'audiogram') {
        yLabels = [{pos: 0, text: "-80dB"}, {pos: 0.25, text: "-60dB"}, {pos: 0.5, text: "-40dB"}, {
            pos: 0.75,
            text: "-20dB"
        }, {pos: 1, text: "0dB"}];
        yTitle = "Magnitude (dB)";
    } else {
        yLabels = [{pos: 0, text: "0"}, {pos: 1, text: "1.0"}];
    }
    drawGridLogic(ctx, W, H, marginL, marginR, xLabels, yLabels, "Frequency (Hz/kHz)", yTitle);
    ctx.strokeStyle = state.scale === "audiogram" ? "#fa7e1e" : "#d62976";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < mags.length; i++) {
        const x = marginL + (i / (mags.length - 1)) * drawW;
        const y = marginTop + drawH - (mags[i] * drawH);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (state.mode === "generic" && state.subbands.length > 0) {
        state.subbands.forEach(sb => {
            const x1 = marginL + (sb.fmin / state.fmax) * drawW;
            const x2 = marginL + (sb.fmax / state.fmax) * drawW;
            ctx.fillStyle = "rgba(214, 41, 118, 0.20)";
            ctx.fillRect(x1, 0, x2 - x1, drawH + marginTop);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x1, 0, x2 - x1, drawH + marginTop);
        });
    }
    if (state.mode === "generic" && state.selecting) {
        const x1 = Math.min(state.selStartX, state.selEndX), x2 = Math.max(state.selStartX, state.selEndX);
        ctx.fillStyle = "rgba(255, 255, 255, 0.20)";
        ctx.fillRect(Math.max(marginL, x1), 0, x2 - Math.max(marginL, x1), drawH + marginTop);
    }
}

function drawWavePreview(canvas, ctx, samples, playheadRatio = null) {
    if (!canvas || !ctx || !Array.isArray(samples)) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const marginL = 50, marginR = 20, marginBottom = 30;
    const drawW = W - marginL - marginR, drawH = H - marginBottom, mid = drawH / 2;
    const xLabels = [];
    const duration = state.duration || 0;
    for (let i = 0; i <= 5; i++) xLabels.push({pos: i / 5, text: (duration * i / 5).toFixed(1)});
    drawGridLogic(ctx, W, H, marginL, marginR, xLabels, [{pos: 0, text: "-1"}, {pos: 0.5, text: "0"}, {
        pos: 1,
        text: "1"
    }], "Time (s)", "Amplitude");
    ctx.strokeStyle = "#a8a8a8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.ceil(samples.length / drawW));
    for (let i = 0; i < samples.length; i += step) {
        const x = marginL + (i / (samples.length - 1)) * drawW;
        const y = mid - (samples[i] * mid);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (playheadRatio !== null && playheadRatio >= 0 && playheadRatio <= 1) {
        const cX = marginL + playheadRatio * drawW;
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cX, 0);
        ctx.lineTo(cX, drawH);
        ctx.stroke();
    }
}

function drawSpectrogram(canvas, ctx, b64Data, isInput = true, playheadRatio = null) {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const marginL = 50, marginR = 20, marginBottom = 30;
    const drawW = W - marginL - marginR;
    const drawH = H - marginBottom;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const yLabels = [];
    for (let i = 0; i <= 4; i++) {
        const norm = i / 4;
        const freq = (state.fmax || 10000) * norm;
        yLabels.push({pos: norm, text: (freq / 1000).toFixed(1) + "k"});
    }
    const xLabels = [];
    const duration = state.duration || 10;
    for (let i = 0; i <= 5; i++) xLabels.push({pos: i / 5, text: (duration * i / 5).toFixed(1)});
    drawGridLogic(ctx, W, H, marginL, marginR, xLabels, yLabels, "Time (s)", "Frequency (kHz)");
    const bitmap = isInput ? state.specInBitmap : state.specOutBitmap;
    if (b64Data) {
        const img = new Image();
        img.onload = () => {
            const tmpCvs = document.createElement("canvas");
            tmpCvs.width = W;
            tmpCvs.height = H;
            const tCtx = tmpCvs.getContext("2d");
            tCtx.drawImage(img, 0, 0, drawW, drawH);
            const imgD = tCtx.getImageData(0, 0, drawW, drawH);
            const data = imgD.data;
            const interpolateColor = (t, arr) => {
                const i = arr.length - 1;
                const s = 1 / i;
                const a = Math.floor(t / s);
                const n = (t - s * a) / s;
                const c1 = arr[Math.min(a, i)];
                const c2 = arr[Math.min(a + 1, i)];
                return [c1[0] + n * (c2[0] - c1[0]), c1[1] + n * (c2[1] - c1[1]), c1[2] + n * (c2[2] - c1[2])];
            };
            for (let i = 0; i < data.length; i += 4) {
                const val = data[i] / 255;
                const rgb = interpolateColor(val, redPalette);
                data[i] = rgb[0];
                data[i + 1] = rgb[1];
                data[i + 2] = rgb[2];
            }
            createImageBitmap(imgD).then(bmp => {
                if (isInput) state.specInBitmap = bmp; else state.specOutBitmap = bmp;
                drawSpectrogram(canvas, ctx, null, isInput, playheadRatio);
            });
        };
        img.src = `data:image/png;base64,${b64Data}`;
        return;
    }
    if (bitmap) {
        ctx.drawImage(bitmap, marginL, 0, drawW, drawH);
    }
    if (playheadRatio !== null && playheadRatio >= 0 && playheadRatio <= 1) {
        const cX = marginL + playheadRatio * drawW;
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cX, 0);
        ctx.lineTo(cX, drawH);
        ctx.stroke();
    }
}

async function refreshSpectrograms() {
    if (!state.signalId) return;
    const specs = await apiGet(`/api/spectrograms/${state.signalId}/?scale_type=logarithmic&backend=${state.fftBackend}&t=${Date.now()}`);
    const jSpecs = typeof specs === "object" ? specs : JSON.parse(new TextDecoder().decode(specs));
    drawSpectrogram(specInCanvas, specInCtx, jSpecs.in_png, true);
    drawSpectrogram(specOutCanvas, specOutCtx, jSpecs.out_png, false);
}

async function refreshOutputs() {
    if (!state.signalId) return;
    if (spectrumLoader) spectrumLoader.classList.remove("hidden");
    audioOut.src = `/api/audio/${state.signalId}/output.wav?t=${Date.now()}`;
    const spec = await apiGet(`/api/spectrum/${state.signalId}/?scale=${state.scale}&backend=${state.fftBackend}&t=${Date.now()}`);
    const jSpec = typeof spec === "object" ? spec : JSON.parse(new TextDecoder().decode(spec));
    state.fmax = jSpec.fmax;
    state.spectrumMags = jSpec.mags;
    drawSpectrum(jSpec.mags, jSpec.fmax, spectrumCanvas, spectrumCtx);
    const waves = await apiGet(`/api/wave_previews/${state.signalId}/?t=${Date.now()}`);
    const jWaves = typeof waves === "object" ? waves : JSON.parse(new TextDecoder().decode(waves));
    state.outputSamples = jWaves.output;
    drawWavePreview(outputCanvas, outCtx, jWaves.output, 0);
    await refreshSpectrograms();
    if (spectrumLoader) spectrumLoader.classList.add("hidden");
}

async function refreshAll() {
    if (!state.signalId) return;
    if (spectrumLoader) spectrumLoader.classList.remove("hidden");
    const ts = Date.now();
    audioIn.src = `/api/audio/${state.signalId}/input.wav?t=${ts}`;
    audioOut.src = `/api/audio/${state.signalId}/output.wav?t=${ts}`;
    const spec = await apiGet(`/api/spectrum/${state.signalId}/?scale=${state.scale}&backend=${state.fftBackend}&t=${ts}`);
    const jSpec = typeof spec === "object" ? spec : JSON.parse(new TextDecoder().decode(spec));
    state.fmax = jSpec.fmax;
    state.spectrumMags = jSpec.mags;
    drawSpectrum(jSpec.mags, jSpec.fmax, spectrumCanvas, spectrumCtx);
    const waves = await apiGet(`/api/wave_previews/${state.signalId}/?t=${ts}`);
    const jWaves = typeof waves === "object" ? waves : JSON.parse(new TextDecoder().decode(waves));
    state.inputSamples = jWaves.input;
    state.outputSamples = jWaves.output;
    drawWavePreview(inputCanvas, inCtx, jWaves.input, 0);
    drawWavePreview(outputCanvas, outCtx, jWaves.output, 0);

    if (!state.aiMode) renderEqSliders();
    await refreshSpectrograms();
    if (spectrumLoader) spectrumLoader.classList.add("hidden");
}
