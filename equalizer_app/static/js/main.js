/* static/js/main.js — single entry */

// ---------- tiny helpers ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
function firstSel(...sels){ for(const s of sels){ const el=$(s); if(el) return el; } return null; }
function setStatus(msg){ const el = firstSel("#statusbar","[data-role=status]"); if(el) el.textContent = msg; console.log(msg); }
function downloadBlob(data, filename, type="application/octet-stream"){
  const blob = new Blob([data], {type}); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  URL.revokeObjectURL(url); a.remove();
}

// ---------- DOM bindings (match base.html) ----------
const btnOpen         = firstSel("#btn-open","#openSignalBtn","[data-action=open-signal]","#openSignal");
const fileInput       = firstSel("#file-hidden","#fileInput","input[type=file][name=signal]","input[type=file]");
const dropZone        = firstSel("#drop-zone","#dropZone","[data-role=dropzone]");

const btnSaveSettings = firstSel("#btn-save-settings","#saveSettingsBtn","[data-action=save-settings]");
const btnLoadSettings = firstSel("#btn-load-settings","#loadSettingsBtn","[data-action=load-settings]");
const modeSelect      = firstSel("#mode-select","#modeSelect","select[data-role=mode]");
const btnScaleSwitch  = firstSel("#fft-scale","#fftScaleSwitch","[data-action=toggle-scale]");
const chkShowSpec     = firstSel("#chk-spec","#toggleSpectrograms","[data-role=show-spectrograms]");
const btnAIPanel      = firstSel("#btn-ai-panel","#toggleAI","[data-action=toggle-ai]");

const eqPanel         = firstSel("#eq-sliders","[data-panel=eq]");

const spectrumCanvas  = firstSel("#fft-canvas","#spectrumCanvas","canvas[data-role=spectrum]");
const spectrumCtx     = spectrumCanvas ? spectrumCanvas.getContext("2d") : null;

const inputCanvas     = firstSel("#wave-in","#inputCanvas","[data-viewer=input] canvas");
const outputCanvas    = firstSel("#wave-out","#outputCanvas","[data-viewer=output] canvas");
const inCtx           = inputCanvas ? inputCanvas.getContext("2d") : null;
const outCtx          = outputCanvas ? outputCanvas.getContext("2d") : null;

const specInCanvas    = firstSel("#spec-in","canvas[data-role=spec-in]");
const specOutCanvas   = firstSel("#spec-out","canvas[data-role=spec-out]");
const specInCtx       = specInCanvas ? specInCanvas.getContext("2d") : null;
const specOutCtx      = specOutCanvas ? specOutCanvas.getContext("2d") : null;

const btnAddSubBand   = firstSel("#btn-add-subband","#addSubBandBtn","[data-action=add-subband]");
const btnSaveScheme   = firstSel("#btn-scheme-save","#saveSchemeBtn","[data-action=save-scheme]");
const btnLoadScheme   = firstSel("#btn-scheme-load","#loadSchemeBtn","[data-action=load-scheme]");

// Playback buttons present in UI
const btnPlayInput    = firstSel("#play-input","[data-action=play-input]");
const btnPlayOutput   = firstSel("#play-output","[data-action=play-output]");

// ---------- app state ----------
const state = {
  signalId:null, sr:0, duration:0, nSamples:0,
  scale:"linear", showSpectrograms:true, mode:"generic",
  subbands:[], customSliders:[],
  audioCtx:null, inBuffer:null, outBuffer:null, playing:false, playStartTime:0, pausedAt:0, speed:1,
  selecting:false, selStartX:0, selEndX:0
};

// ---------- net ----------
async function apiPost(url, data, isJson=true){
  const r = await fetch(url, {method:"POST", headers:isJson?{"Content-Type":"application/json"}:undefined, body:isJson?JSON.stringify(data):data});
  if(!r.ok) throw new Error(await r.text());
  const ct = r.headers.get("content-type")||"";
  return ct.includes("application/json") ? r.json() : r.arrayBuffer();
}
async function apiGet(url){
  const r = await fetch(url); if(!r.ok) throw new Error(await r.text());
  const ct = r.headers.get("content-type")||"";
  return ct.includes("application/json") ? r.json() : r.arrayBuffer();
}

// ---------- upload ----------
function bindUpload(){
  if(btnOpen) btnOpen.addEventListener("click", () => fileInput && fileInput.click());

  if(dropZone){
    // click to browse (كانت ناقصة — سبب المشكلة)
    dropZone.addEventListener("click", () => fileInput && fileInput.click());

    ["dragenter","dragover"].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add("drag"); }));
    ["dragleave","drop"].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove("drag"); }));
    dropZone.addEventListener("drop", (e) => {
      const f = e.dataTransfer?.files?.[0]; if(f) doUploadFile(f);
    });
  }

  if(fileInput){
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files?.[0]; if(f) doUploadFile(f);
    });
  }
}

async function doUploadFile(file){
  try{
    setStatus(`Uploading: ${file.name} ...`);
    const fd = new FormData(); fd.append("signal", file);
    const res = await apiPost("/api/upload/", fd, false); // server returns JSON
    const j   = typeof res === "object" ? res : JSON.parse(new TextDecoder().decode(res));
    state.signalId = j.signal_id; state.sr = j.sr; state.duration = j.duration; state.nSamples = j.n;
    setStatus(`Loaded ${j.file_name} — sr=${j.sr}Hz, len=${j.duration.toFixed(2)}s`);
    await refreshAll();
  }catch(err){ console.error(err); setStatus(`Upload error: ${err.message}`); }
}

// ---------- drawing ----------
function clearCanvas(ctx, cvs){ if(!ctx||!cvs) return; ctx.clearRect(0,0,cvs.width,cvs.height); ctx.fillStyle="#0b0b0f"; ctx.fillRect(0,0,cvs.width,cvs.height); }
function drawSpectrum(mags,fmax,canvas,ctx,scale="linear"){
  if(!canvas||!ctx||!Array.isArray(mags)) return; clearCanvas(ctx,canvas);
  const W=canvas.width,H=canvas.height; ctx.strokeStyle="#7fd"; ctx.beginPath(); const N=mags.length;
  for(let i=0;i<N;i++){ const x=(i/(N-1))*W; let yv=mags[i]; yv=Math.log10(1+9*yv); const y=H-yv*H; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.stroke();
  if(state.mode==="generic" && state.selecting){ const x1=Math.min(state.selStartX,state.selEndX), x2=Math.max(state.selStartX,state.selEndX); ctx.fillStyle="rgba(255,255,255,0.15)"; ctx.fillRect(x1,0,x2-x1,H); }
  ctx.strokeStyle="#444"; ctx.beginPath(); ctx.moveTo(0,H-0.5); ctx.lineTo(W,H-0.5); ctx.stroke();
}
function drawWavePreview(canvas,ctx,samples){
  if(!canvas||!ctx||!Array.isArray(samples)) return; clearCanvas(ctx,canvas);
  const W=canvas.width,H=canvas.height, mid=H/2; ctx.strokeStyle="#8f8"; ctx.beginPath(); const N=samples.length;
  for(let i=0;i<N;i++){ const x=(i/(N-1))*W; const y=mid - samples[i]*mid; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.stroke();
}
function drawImageBase64(canvas,ctx,b64){ const img=new Image(); img.onload=()=>{ canvas.width=img.width; canvas.height=img.height; ctx.drawImage(img,0,0); }; img.src=`data:image/png;base64,${b64}`; }

// ---------- backend refresh ----------
async function refreshAll(){
  if(!state.signalId) return;

  const meta   = await apiGet(`/api/summary/${state.signalId}/`);
  const spec   = await apiGet(`/api/spectrum/${state.signalId}/?scale=${state.scale}`);
  const waves  = await apiGet(`/api/wave_previews/${state.signalId}/`);
  const specs  = state.showSpectrograms ? await apiGet(`/api/spectrograms/${state.signalId}/`) : null;

  const jSpec  = typeof spec  === "object" ? spec  : JSON.parse(new TextDecoder().decode(spec));
  const jWaves = typeof waves === "object" ? waves : JSON.parse(new TextDecoder().decode(waves));

  drawSpectrum(jSpec.mags, jSpec.fmax, spectrumCanvas, spectrumCtx, state.scale);
  drawWavePreview(inputCanvas, inCtx, jWaves.input);
  drawWavePreview(outputCanvas, outCtx, jWaves.output);

  if(specs){
    const jSpecs = typeof specs === "object" ? specs : JSON.parse(new TextDecoder().decode(specs));
    if(specInCtx && jSpecs.in_png)  drawImageBase64(specInCanvas,  specInCtx,  jSpecs.in_png);
    if(specOutCtx && jSpecs.out_png)drawImageBase64(specOutCanvas, specOutCtx, jSpecs.out_png);
  }

  if(typeof meta === "object"){
    const sb = $("#sb-file"), fs=$("#sb-fs"), ln=$("#sb-len");
    if(sb) sb.textContent = meta.file_name || "—";
    if(fs) fs.textContent = meta.sr || "—";
    if(ln) ln.textContent = (meta.duration ?? 0).toFixed(2);
  }
}

// ---------- spectrum interaction (generic) ----------
function bindSpectrumSelection(){
  if(!spectrumCanvas) return; const cvs=spectrumCanvas;
  cvs.addEventListener("mousedown",(e)=>{ if(state.mode!=="generic") return; state.selecting=true; const r=cvs.getBoundingClientRect(); state.selStartX=e.clientX-r.left; state.selEndX=state.selStartX; redrawSpectrum(); });
  cvs.addEventListener("mousemove",(e)=>{ if(!state.selecting) return; const r=cvs.getBoundingClientRect(); state.selEndX=e.clientX-r.left; redrawSpectrum(); });
  window.addEventListener("mouseup", async ()=>{ if(!state.selecting) return; state.selecting=false; redrawSpectrum(); const band=await promptBandFromSelection(); if(band){ state.subbands.push(band); renderGenericSubbands(); await applyEqualizer(); }});
}
function redrawSpectrum(){ if(!state.signalId) return; apiGet(`/api/spectrum/${state.signalId}/?scale=${state.scale}`).then(buf=>{ const j=typeof buf==="object"?buf:JSON.parse(new TextDecoder().decode(buf)); drawSpectrum(j.mags,j.fmax,spectrumCanvas,spectrumCtx,state.scale); }).catch(()=>{}); }
function pxToFreq(x,W,fmax){ const frac=Math.min(1,Math.max(0,x/W)); return frac*fmax; }
async function promptBandFromSelection(){
  const buf = await apiGet(`/api/spectrum/${state.signalId}/?scale=${state.scale}`); const j=typeof buf==="object"?buf:JSON.parse(new TextDecoder().decode(buf));
  const W = spectrumCanvas.width; const x1=Math.min(state.selStartX,state.selEndX), x2=Math.max(state.selStartX,state.selEndX);
  let fmin=+pxToFreq(x1,W,j.fmax).toFixed(1), fmax=+pxToFreq(x2,W,j.fmax).toFixed(1);
  const resp = window.prompt(`Sub-band:\nMin Hz, Max Hz, Gain (0..2)\n`, `${fmin}, ${fmax}, 1.0`); if(!resp) return null;
  const p = resp.split(",").map(s=>+s.trim()); if(p.length<3||p.some(Number.isNaN)) return null;
  const [mn,mx,g]=p; return {id:`sb${Date.now()}`, fmin:Math.min(mn,mx), fmax:Math.max(mn,mx), gain:Math.max(0,Math.min(2,g))};
}

// ---------- equalizer UI ----------
function renderGenericSubbands(){
  if(!eqPanel) return;
  let box = eqPanel.querySelector("[data-box=generic-subbands]"); if(!box){ box=document.createElement("div"); box.setAttribute("data-box","generic-subbands"); eqPanel.appendChild(box); }
  box.innerHTML="";
  state.subbands.forEach((b,idx)=>{
    const row=document.createElement("div"); row.className="sb-row";
    row.innerHTML = `
      <div class="sb-title">SubBand ${idx+1} [${b.fmin.toFixed(1)}–${b.fmax.toFixed(1)} Hz]</div>
      <input type="range" min="0" max="2" step="0.01" value="${b.gain}" data-id="${b.id}"/>
      <span class="sb-gain">${b.gain.toFixed(2)}x</span>
      <button data-act="edit" data-id="${b.id}">Edit</button>
      <button data-act="del"  data-id="${b.id}">Delete</button>`;
    box.appendChild(row);
  });
  box.oninput = async (e)=>{ const r=e.target; if(r.tagName==="INPUT"&&r.type==="range"){ const id=r.dataset.id; const sb=state.subbands.find(s=>s.id===id); if(sb){ sb.gain=+r.value; r.parentElement.querySelector(".sb-gain").textContent=`${sb.gain.toFixed(2)}x`; await applyEqualizerDebounced(); }}};
  box.onclick  = async (e)=>{ const b=e.target.closest("button"); if(!b) return; const id=b.dataset.id; const sb=state.subbands.find(s=>s.id===id); if(!sb) return;
    if(b.dataset.act==="del"){ state.subbands=state.subbands.filter(s=>s.id!==id); renderGenericSubbands(); await applyEqualizer(); }
    else { const resp=window.prompt(`Edit [min,max,gain]`, `${sb.fmin}, ${sb.fmax}, ${sb.gain}`); if(!resp) return; const p=resp.split(",").map(s=>+s.trim()); if(p.length<3) return; sb.fmin=Math.min(p[0],p[1]); sb.fmax=Math.max(p[0],p[1]); sb.gain=Math.max(0,Math.min(2,p[2])); renderGenericSubbands(); await applyEqualizer(); }
  };
}

// (customized sliders placeholder — same as قبل)
function renderCustomizedSliders(){ /* optional in this step */ }

// ---------- apply equalizer ----------
let eqTimer=null;
async function applyEqualizerDebounced(){ if(eqTimer) clearTimeout(eqTimer); eqTimer=setTimeout(applyEqualizer,120); }
async function applyEqualizer(){
  if(!state.signalId) return;
  const payload = state.mode==="generic" ? {mode:"generic", subbands:state.subbands} : {mode:state.mode, sliders:state.customSliders};
  try{ await apiPost(`/api/equalize/${state.signalId}/`, payload); await refreshAll(); }
  catch(err){ console.error(err); setStatus(`Equalize error: ${err.message}`); }
}

// ---------- toggles / mode ----------
if(btnScaleSwitch) btnScaleSwitch.addEventListener("click", async ()=>{ state.scale = state.scale==="linear" ? "audiogram" : "linear"; btnScaleSwitch.textContent = `Audiogram: ${state.scale==="audiogram"?"On":"Off"}`; await refreshAll(); });
if(chkShowSpec)   chkShowSpec.addEventListener("change", async e => { state.showSpectrograms = !!e.target.checked; await refreshAll(); });
if(modeSelect)    modeSelect.addEventListener("change", async e => { state.mode = e.target.value; state.subbands=[]; state.customSliders=[]; await refreshAll(); });
if(btnAddSubBand) btnAddSubBand.addEventListener("click", ()=> alert("Select an interval on the spectrum by dragging with the mouse."));

// ---------- save/load scheme & settings ----------
if(btnSaveScheme) btnSaveScheme.addEventListener("click", async ()=>{
  const scheme = state.mode==="generic" ? {mode:"generic", subbands:state.subbands} : {mode:state.mode, sliders:state.customSliders};
  const buf = await apiPost(`/api/save_scheme/${state.signalId}/`, scheme);
  const j   = typeof buf==="object" ? buf : JSON.parse(new TextDecoder().decode(buf));
  downloadBlob(new TextEncoder().encode(JSON.stringify(j.data,null,2)), j.filename, "application/json");
});
if(btnLoadScheme) btnLoadScheme.addEventListener("click", async ()=>{
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=async()=>{ const f=inp.files?.[0]; if(!f) return; const data=JSON.parse(await f.text()); await apiPost(`/api/load_scheme/${state.signalId}/`, data); state.mode=data.mode||"generic"; state.subbands=data.subbands||[]; state.customSliders=data.sliders||[]; if(modeSelect) modeSelect.value=state.mode; await refreshAll(); };
  inp.click();
});
if(btnSaveSettings) btnSaveSettings.addEventListener("click", async ()=>{
  const full = { scale:state.scale, showSpectrograms:state.showSpectrograms, ...(state.mode==="generic"?{mode:"generic",subbands:state.subbands}:{mode:state.mode,sliders:state.customSliders}) };
  const buf = await apiPost(`/api/save_settings/${state.signalId}/`, full);
  const j   = typeof buf==="object" ? buf : JSON.parse(new TextDecoder().decode(buf));
  downloadBlob(new TextEncoder().encode(JSON.stringify(j.data,null,2)), j.filename, "application/json");
});
if(btnLoadSettings) btnLoadSettings.addEventListener("click", async ()=>{
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
  inp.onchange=async()=>{ const f=inp.files?.[0]; if(!f) return; const data=JSON.parse(await f.text()); await apiPost(`/api/load_settings/${state.signalId}/`, data);
    state.scale=data.scale||"linear"; state.showSpectrograms=!!data.showSpectrograms; state.mode=data.mode||"generic"; state.subbands=data.subbands||[]; state.customSliders=data.sliders||[];
    if(chkShowSpec) chkShowSpec.checked=state.showSpectrograms; if(modeSelect) modeSelect.value=state.mode; await refreshAll(); };
  inp.click();
});

// ---------- playback (simple: input/output) ----------
async function ensureAudioCtx(){ if(!state.audioCtx) state.audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
async function fetchAudioBuffer(url){ await ensureAudioCtx(); const arr = await apiGet(url); return await state.audioCtx.decodeAudioData(arr.slice(0)); }
async function prepareBuffers(){ if(!state.signalId) return; if(!state.inBuffer) state.inBuffer = await fetchAudioBuffer(`/api/audio/${state.signalId}/input.wav`); state.outBuffer = await fetchAudioBuffer(`/api/audio/${state.signalId}/output.wav`); }
let inSrc=null, outSrc=null; function stopSources(){ if(inSrc){ try{inSrc.stop();}catch{} inSrc.disconnect(); inSrc=null; } if(outSrc){ try{outSrc.stop();}catch{} outSrc.disconnect(); outSrc=null; } }
async function play(which="input"){
  if(!state.signalId) return; await ensureAudioCtx(); await prepareBuffers(); stopSources();
  inSrc=state.audioCtx.createBufferSource(); outSrc=state.audioCtx.createBufferSource(); inSrc.buffer=state.inBuffer; outSrc.buffer=state.outBuffer;
  const gin=state.audioCtx.createGain(), gout=state.audioCtx.createGain(); gin.gain.value=which==="input"?1:0; gout.gain.value=which==="output"?1:0;
  inSrc.connect(gin).connect(state.audioCtx.destination); outSrc.connect(gout).connect(state.audioCtx.destination); inSrc.start(0); outSrc.start(0);
}
if(btnPlayInput)  btnPlayInput.addEventListener("click", ()=>play("input"));
if(btnPlayOutput) btnPlayOutput.addEventListener("click", ()=>play("output"));

// ---------- init ----------
function init(){
  bindUpload();
  bindSpectrumSelection();
  setStatus("Ready.");
}
document.addEventListener("DOMContentLoaded", init);
