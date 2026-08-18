const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const canvasArea = document.getElementById('canvasArea');
const toleranceEl = document.getElementById('tolerance');
const featherEl = document.getElementById('feather');
const transparentBgEl = document.getElementById('transparentBg');
const autoCropBgEl = document.getElementById('autoCropBg');
const padColorEl = document.getElementById('padColor');
const downloadBtn = document.getElementById('downloadBtn');
const pickedColorLabel = document.getElementById('pickedColorLabel');

let img = null;
let srcCanvas = null, srcCtx = null;
let outCanvas = null, outCtx = null;
let pickPoint = null;
let targetW = 512, targetH = 512;
let autoUpscaleQuality = 1;

document.querySelectorAll('.size-opt').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('.size-opt').forEach(o=>o.classList.remove('active'));
    el.classList.add('active');
    el.querySelector('input').checked = true;
    targetW = parseInt(el.dataset.w);
    targetH = parseInt(el.dataset.h);
    render();
  });
});

dropZone.addEventListener('click', ()=> fileInput.click());
dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e=>{
  e.preventDefault();
  dropZone.classList.remove('drag');
  if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e=>{
  if(e.target.files[0]) loadFile(e.target.files[0]);
});

function detectImageQuality(width, height) {
  const minDim = Math.min(width, height);
  if (minDim <= 200) return 4;
  if (minDim <= 300) return 3;
  if (minDim <= 450) return 2;
  return 1;
}

function loadFile(file){
  if (file.type === 'application/pdf') {
    handlePdf(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = ev=>{
    const image = new Image();
    image.onload = ()=>{
      img = image;
      pickPoint = null;
      pickedColorLabel.textContent = 'canto superior esquerdo';
      autoUpscaleQuality = detectImageQuality(img.width, img.height);
      document.getElementById('upscaleQuality').value = autoUpscaleQuality;
      updateQualityLabel();
      buildLayout();
      render();
      downloadBtn.disabled = false;
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function resizeCanvasProportional(canvas, maxDim = 1024) {
  const maxDimension = Math.max(canvas.width, canvas.height);
  if (maxDimension <= maxDim) return canvas;

  const scale = maxDim / maxDimension;
  const newW = Math.round(canvas.width * scale);
  const newH = Math.round(canvas.height * scale);

  const resized = document.createElement('canvas');
  resized.width = newW;
  resized.height = newH;
  const ctx = resized.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, newW, newH);
  return resized;
}

async function handlePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

  const pageSelect = document.getElementById('pdfPage');
  pageSelect.innerHTML = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Página ${i}`;
    pageSelect.appendChild(opt);
  }
  document.getElementById('pdfSection').style.display = 'block';

  document.getElementById('pdfConfirmBtn').onclick = async () => {
    const pageNum = parseInt(pageSelect.value);
    const dpi = parseInt(document.getElementById('pdfDpi').value);
    const page = await pdf.getPage(pageNum);
    const scale = dpi / 72;
    const viewport = page.getViewport({scale});

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    const resized = resizeCanvasProportional(canvas, 1024);

    const image = new Image();
    image.onload = () => {
      img = image;
      pickPoint = null;
      pickedColorLabel.textContent = 'canto superior esquerdo';
      buildLayout();
      render();
      downloadBtn.disabled = false;
      document.getElementById('pdfSection').style.display = 'none';
    };
    image.src = resized.toDataURL();
  };
}

function buildLayout(){
  canvasArea.innerHTML = `
    <div style="display:flex; gap:28px; flex-wrap:wrap; justify-content:center; width:100%;">
      <div>
        <div class="stage-label">Original — clique pra marcar o fundo</div>
        <div class="ruler-frame">
          <canvas id="srcCanvas" class="checker"></canvas>
        </div>
      </div>
      <div>
        <div class="stage-label">Resultado <span class="dim" id="dimLabel"></span></div>
        <div class="ruler-frame">
          <div class="tick-row" id="tickRow"></div>
          <div class="tick-col" id="tickCol"></div>
          <canvas id="outCanvas" class="checker"></canvas>
        </div>
      </div>
    </div>
  `;
  srcCanvas = document.getElementById('srcCanvas');
  srcCtx = srcCanvas.getContext('2d', {willReadFrequently:true});
  outCanvas = document.getElementById('outCanvas');
  outCtx = outCanvas.getContext('2d', {willReadFrequently:true});

  const maxW = 340;
  const scale = Math.min(1, maxW / img.width);
  srcCanvas.width = Math.round(img.width * scale);
  srcCanvas.height = Math.round(img.height * scale);
  srcCtx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);

  srcCanvas.addEventListener('click', e=>{
    const rect = srcCanvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (srcCanvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (srcCanvas.height / rect.height));
    pickPoint = {x, y};
    pickedColorLabel.textContent = `x:${x}, y:${y}`;
    render();
  });
}

function getBgColor(){
  const w = srcCanvas.width, h = srcCanvas.height;
  const data = srcCtx.getImageData(0,0,w,h).data;
  let px, py;
  if(pickPoint){ px = pickPoint.x; py = pickPoint.y; }
  else { px = 0; py = 0; }
  px = Math.min(Math.max(px,0), w-1);
  py = Math.min(Math.max(py,0), h-1);
  const i = (py*w+px)*4;
  return [data[i], data[i+1], data[i+2]];
}

function removeBackground(){
  const w = img.width, h = img.height;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d', {willReadFrequently:true});
  tctx.drawImage(img, 0, 0, w, h);
  const imageData = tctx.getImageData(0,0,w,h);
  const data = imageData.data;

  const [br, bg, bb] = getBgColor();
  const tol = parseInt(toleranceEl.value);
  const feather = parseInt(featherEl.value);

  for(let i=0; i<data.length; i+=4){
    const r=data[i], g=data[i+1], b=data[i+2];
    const dist = Math.sqrt((r-br)**2 + (g-bg)**2 + (b-bb)**2);
    if(dist < tol){
      data[i+3] = 0;
    } else if(dist < tol + feather){
      const t = (dist - tol) / feather;
      data[i+3] = Math.round(data[i+3] * t);
    }
  }
  tctx.putImageData(imageData, 0, 0);
  return tmp;
}

function getContentBounds(canvas){
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

  for(let i=0; i<data.length; i+=4){
    if(data[i+3] > 220){
      const pixelIndex = i / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if(maxX < 0) return null;
  const padding = 3;
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    w: Math.min(canvas.width, maxX - minX + 1 + padding * 2),
    h: Math.min(canvas.height, maxY - minY + 1 + padding * 2)
  };
}

function cleanupSoftEdges(canvas){
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for(let i=0; i<data.length; i+=4){
    if(data[i+3] < 220){
      data[i+3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function cropCanvas(canvas, bounds){
  if(!bounds) return canvas;
  const cropped = document.createElement('canvas');
  cropped.width = bounds.w;
  cropped.height = bounds.h;
  const ctx = cropped.getContext('2d');
  ctx.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
  return cropped;
}

function applyPreviewUpscaling(canvas, qualityLevel) {
  const upscale = getUpscaleFactor(canvas.width, canvas.height, qualityLevel);
  if (upscale <= 1) return canvas;

  const upscaled = multiPassUpscale(canvas, upscale, qualityLevel);

  const downscaled = document.createElement('canvas');
  downscaled.width = canvas.width;
  downscaled.height = canvas.height;
  const dctx = downscaled.getContext('2d');
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(upscaled, 0, 0, upscaled.width, upscaled.height, 0, 0, canvas.width, canvas.height);
  return downscaled;
}

function render(){
  if(!img) return;
  let cleaned = removeBackground();

  cleaned = applyPreviewUpscaling(cleaned, autoUpscaleQuality);

  if(autoCropBgEl.checked){
    cleaned = cleanupSoftEdges(cleaned);
    const bounds = getContentBounds(cleaned);
    if(bounds) cleaned = cropCanvas(cleaned, bounds);
  }

  const maxOutW = 340;
  const dispScale = Math.min(1, maxOutW / targetW);
  outCanvas.width = Math.round(targetW * dispScale);
  outCanvas.height = Math.round(targetH * dispScale);

  outCtx.clearRect(0,0,outCanvas.width, outCanvas.height);
  if(!transparentBgEl.checked){
    outCtx.fillStyle = padColorEl.value;
    outCtx.fillRect(0,0,outCanvas.width, outCanvas.height);
  }

  const scale = Math.min(outCanvas.width / cleaned.width, outCanvas.height / cleaned.height);
  const drawW = cleaned.width * scale;
  const drawH = cleaned.height * scale;
  const dx = (outCanvas.width - drawW) / 2;
  const dy = (outCanvas.height - drawH) / 2;
  outCtx.drawImage(cleaned, dx, dy, drawW, drawH);

  document.getElementById('dimLabel').textContent = `${targetW}×${targetH}`;
  drawTicks(targetW, targetH);
}

function drawTicks(w, h){
  const tickRow = document.getElementById('tickRow');
  const tickCol = document.getElementById('tickCol');
  if(!tickRow || !tickCol) return;
  tickRow.innerHTML = `<span>0</span><span>${w}</span>`;
  tickCol.innerHTML = `<span>0</span><span>${h}</span>`;
}

toleranceEl.addEventListener('input', render);
featherEl.addEventListener('input', render);
transparentBgEl.addEventListener('change', render);
autoCropBgEl.addEventListener('change', ()=>{
  if(autoCropBgEl.checked){
    transparentBgEl.checked = false;
    padColorEl.value = '#ffffff';
  }
  render();
});
padColorEl.addEventListener('input', render);

document.getElementById('upscaleQuality').addEventListener('input', ()=>{
  updateQualityLabel();
  render();
});

function getUpscaleFactor(imgWidth, imgHeight, qualityLevel = autoUpscaleQuality) {
  const minDim = Math.min(imgWidth, imgHeight);
  const baseFactors = {
    1: minDim <= 256 ? 1 : 1,
    1.5: minDim <= 256 ? 2 : 1.5,
    2: minDim <= 256 ? 3 : (minDim <= 384 ? 2 : 1.5),
    2.5: minDim <= 256 ? 4 : (minDim <= 384 ? 3 : 2),
    3: minDim <= 256 ? 5 : (minDim <= 384 ? 4 : 3),
    3.5: minDim <= 256 ? 6 : (minDim <= 384 ? 5 : 4),
    4: minDim <= 256 ? 8 : (minDim <= 384 ? 6 : 5),
  };
  return baseFactors[qualityLevel] || 1;
}

function updateQualityLabel() {
  const level = parseFloat(document.getElementById('upscaleQuality').value);
  const labels = {
    1: 'Baixa (1x)',
    1.5: 'Média (1.5x)',
    2: 'Alta (2x)',
    2.5: 'Muito alta (2.5x)',
    3: 'Ultra (3x)',
    3.5: 'Ultra+ (3.5x)',
    4: 'Máxima (4x)',
  };
  document.getElementById('qualityLabel').textContent = labels[level] || 'Automático';
  autoUpscaleQuality = level;
}

function applyUnsharpMask(canvas, strength = 1.2) {
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width, h = canvas.height;

  const strengthMap = {
    1: 1.2,
    1.5: 1.5,
    2: 1.8,
    2.5: 2.1,
    3: 2.4,
    3.5: 2.7,
    4: 3.0,
  };
  const finalStrength = strengthMap[autoUpscaleQuality] !== undefined ? strengthMap[autoUpscaleQuality] : strength;

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % w;
    const y = Math.floor(pixelIndex / w);

    if (x > 0 && x < w-1 && y > 0 && y < h-1) {
      for (let c = 0; c < 3; c++) {
        const center = data[i + c];
        const top = data[(i - w*4) + c];
        const bottom = data[(i + w*4) + c];
        const left = data[(i - 4) + c];
        const right = data[(i + 4) + c];

        const avg = (top + bottom + left + right) / 4;
        const diff = center - avg;
        data[i + c] = Math.min(255, Math.max(0, center + diff * finalStrength));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyEdgeEnhance(canvas) {
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width, h = canvas.height;

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % w;
    const y = Math.floor(pixelIndex / w);

    if (x > 0 && x < w-1 && y > 0 && y < h-1) {
      for (let c = 0; c < 3; c++) {
        const center = data[i + c];
        const neighbors = [
          data[(i - w*4 - 4) + c], data[(i - w*4) + c], data[(i - w*4 + 4) + c],
          data[(i - 4) + c], data[(i + 4) + c],
          data[(i + w*4 - 4) + c], data[(i + w*4) + c], data[(i + w*4 + 4) + c]
        ];
        const avg = neighbors.reduce((a, b) => a + b) / neighbors.length;
        const edge = Math.abs(center - avg);
        if (edge > 30) {
          data[i + c] = Math.min(255, Math.max(0, center + (center > avg ? 15 : -15)));
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function multiPassUpscale(canvas, targetScale, qualityLevel) {
  if (targetScale <= 1) return canvas;

  let current = canvas;
  const passes = qualityLevel >= 3 ? 3 : (qualityLevel >= 2 ? 2 : 1);
  const scalePerPass = Math.pow(targetScale, 1 / passes);

  for (let pass = 0; pass < passes; pass++) {
    const newW = Math.round(current.width * scalePerPass);
    const newH = Math.round(current.height * scalePerPass);

    const scaled = document.createElement('canvas');
    scaled.width = newW;
    scaled.height = newH;
    const sctx = scaled.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(current, 0, 0, newW, newH);

    applyUnsharpMask(scaled);
    if (pass === passes - 1) applyEdgeEnhance(scaled);

    current = scaled;
  }

  return current;
}

downloadBtn.addEventListener('click', ()=>{
  if(!img) return;
  let cleaned = removeBackground();

  if(autoCropBgEl.checked){
    cleaned = cleanupSoftEdges(cleaned);
    const bounds = getContentBounds(cleaned);
    if(bounds) cleaned = cropCanvas(cleaned, bounds);
  }

  const upscale = getUpscaleFactor(img.width, img.height, autoUpscaleQuality);
  const upscaled = multiPassUpscale(cleaned, upscale, autoUpscaleQuality);

  const finalW = targetW * upscale;
  const finalH = targetH * upscale;
  const canvas = document.createElement('canvas');
  canvas.width = finalW;
  canvas.height = finalH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  if(!transparentBgEl.checked){
    ctx.fillStyle = padColorEl.value;
    ctx.fillRect(0,0,finalW, finalH);
  }
  const scale = Math.min(finalW / upscaled.width, finalH / upscaled.height);
  const drawW = upscaled.width * scale;
  const drawH = upscaled.height * scale;
  const dx = (finalW - drawW) / 2;
  const dy = (finalH - drawH) / 2;
  ctx.drawImage(upscaled, dx, dy, drawW, drawH);

  const final = document.createElement('canvas');
  final.width = targetW;
  final.height = targetH;
  const fctx = final.getContext('2d');
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(canvas, 0, 0, finalW, finalH, 0, 0, targetW, targetH);

  final.toBlob(blob=>{
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logo-${targetW}x${targetH}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});
