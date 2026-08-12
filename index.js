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

function loadFile(file){
  const reader = new FileReader();
  reader.onload = ev=>{
    const image = new Image();
    image.onload = ()=>{
      img = image;
      pickPoint = null;
      pickedColorLabel.textContent = 'canto superior esquerdo';
      buildLayout();
      render();
      downloadBtn.disabled = false;
    };
    image.src = ev.target.result;
  };
  reader.readAsDataURL(file);
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
    if(data[i+3] > 200){
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
    if(data[i+3] < 150){
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

function render(){
  if(!img) return;
  let cleaned = removeBackground();

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
transparentBgEl.addEventListener('change', ()=>{
  padColorEl.disabled = transparentBgEl.checked;
  render();
});
autoCropBgEl.addEventListener('change', ()=>{
  if(autoCropBgEl.checked){
    transparentBgEl.checked = false;
    padColorEl.disabled = false;
    padColorEl.value = '#ffffff';
  }
  render();
});
padColorEl.addEventListener('input', render);

downloadBtn.addEventListener('click', ()=>{
  if(!img) return;
  let cleaned = removeBackground();

  if(autoCropBgEl.checked){
    cleaned = cleanupSoftEdges(cleaned);
    const bounds = getContentBounds(cleaned);
    if(bounds) cleaned = cropCanvas(cleaned, bounds);
  }

  const final = document.createElement('canvas');
  final.width = targetW;
  final.height = targetH;
  const fctx = final.getContext('2d');
  if(!transparentBgEl.checked){
    fctx.fillStyle = padColorEl.value;
    fctx.fillRect(0,0,targetW,targetH);
  }
  const scale = Math.min(targetW / cleaned.width, targetH / cleaned.height);
  const drawW = cleaned.width * scale;
  const drawH = cleaned.height * scale;
  const dx = (targetW - drawW) / 2;
  const dy = (targetH - drawH) / 2;
  fctx.drawImage(cleaned, dx, dy, drawW, drawH);

  final.toBlob(blob=>{
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logo-${targetW}x${targetH}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});
