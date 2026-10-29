'use strict';

const api = window.safeshot;
const $ = (sel) => document.querySelector(sel);

const MODE_LABELS = { blur: 'Bulanıklaştır', pixelate: 'Pikselleştir', solid: 'Karart' };
const MODE_ICONS = { blur: '◍', pixelate: '▦', solid: '■' };
const TOOL_LABELS = { rect: 'Dikdörtgen', brush: 'Serbest' };

function readDefaults() {
  try {
    const raw = JSON.parse(localStorage.getItem('defaults') || 'null');
    if (!raw) return null;
    return {
      method: MODE_LABELS[raw.method] ? raw.method : 'blur',
      strength: Object.assign({ blur: 1, pixelate: 1, solid: 1 }, raw.strength || {}),
      color: /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : '#0b1220',
    };
  } catch (_) {
    return null;
  }
}

const saved = readDefaults();

const state = {
  file: null,
  name: '',
  url: '',
  bytes: 0,
  img: null,
  width: 0,
  height: 0,
  regions: [], // { id, shape, box{x,y,w,h}, points?, brush?, method, strength, color }
  selected: null,
  tool: localStorage.getItem('tool') === 'brush' ? 'brush' : 'rect',
  brush: Math.min(0.08, Math.max(0.01, Number(localStorage.getItem('brush')) || 0.035)),
  defaults: saved || { method: 'blur', strength: { blur: 1, pixelate: 1, solid: 1 }, color: '#0b1220' },
  drag: null,
  history: [],
  format: localStorage.getItem('format') || 'orijinal',
  quality: Number(localStorage.getItem('quality') || 92),
  busy: false,
};

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const tiny = document.createElement('canvas');
const tinyCtx = tiny.getContext('2d');

/* ------------------------- yardımcılar ------------------------- */

function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function toast(msg, kind = '', path = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${escapeHtml(msg)}</span>${path ? `<span class="path">${escapeHtml(path)}</span>` : ''}`;
  if (path) {
    el.title = 'Klasörde göster';
    el.addEventListener('click', () => api.showInFolder(path));
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 5200);
}

function uid() {
  return `r${Date.now()}${Math.round(Math.random() * 9999)}`;
}

function savePrefs() {
  localStorage.setItem('tool', state.tool);
  localStorage.setItem('brush', String(state.brush));
  localStorage.setItem('format', state.format);
  localStorage.setItem('quality', String(state.quality));
  localStorage.setItem('defaults', JSON.stringify(state.defaults));
}

function pushHistory(snapshot) {
  state.history.push(snapshot || JSON.stringify(state.regions));
  if (state.history.length > 60) state.history.shift();
}

function undo() {
  const prev = state.history.pop();
  if (!prev) return;
  state.regions = JSON.parse(prev);
  if (!state.regions.some((r) => r.id === state.selected)) state.selected = null;
  syncSettingsUI();
  updateChrome();
  render();
}

function selectedRegion() {
  return state.regions.find((r) => r.id === state.selected) || null;
}

/* ------------------------- güç aralıkları ------------------------- */

function strengthRange(m) {
  if (m === 'solid') return { min: 0.4, max: 1 };
  if (m === 'blur') return { min: 0.2, max: 2 };
  return { min: 0.2, max: 3 };
}

function clampStrength(m, v) {
  const r = strengthRange(m);
  const n = Number(v);
  if (!Number.isFinite(n)) return r.max;
  return Math.min(r.max, Math.max(r.min, n));
}

function strengthText(m, s) {
  return m === 'solid' ? `%${Math.round(s * 100)}` : `${s.toFixed(1)}×`;
}

/** Önizleme ve kaydetme aynı formülleri kullanır (bkz. image/export.js). */
function blurFactor(minSide, strength) {
  const s = Math.max(0.1, Number(strength) || 1);
  return Math.max(2, Math.min(minSide * 0.4, Math.round(minSide * (0.06 + 0.12 * s))));
}

function pixelFactor(minSide, strength) {
  const s = Math.max(0.1, Number(strength) || 1);
  return Math.max(3, Math.min(minSide / 3.5, Math.round((minSide / 6) * s)));
}

/* ------------------------- görsel açma ------------------------- */

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function openFile(file) {
  try {
    const info = await api.fileInfo(file);
    const img = await loadImage(info.url);
    if (!img) throw new Error('Görsel açılamadı');
    state.file = info.file;
    state.name = info.name;
    state.url = info.url;
    state.bytes = info.bytes;
    state.img = img;
    state.width = img.naturalWidth;
    state.height = img.naturalHeight;
    state.regions = [];
    state.selected = null;
    state.history = [];
    state.drag = null;
    $('#dropzone').classList.add('hidden');
    $('#viewer').classList.remove('hidden');
    updateChrome();
    syncSettingsUI();
    updateQualityField();
    render();
  } catch (err) {
    toast(`Açılamadı: ${err && err.message ? err.message : err}`, 'err');
  }
}

/* ------------------------- ölçü / şekil ------------------------- */

function layoutSize() {
  const viewer = $('#viewer');
  const availW = Math.max(50, viewer.clientWidth);
  const availH = Math.max(50, viewer.clientHeight);
  const ratio = (state.width || 4) / (state.height || 3);
  let dw = availW;
  let dh = dw / ratio;
  if (dh > availH) {
    dh = availH;
    dw = dh * ratio;
  }
  return { dw: Math.floor(dw), dh: Math.floor(dh) };
}

function displayBox(r, dw, dh) {
  const half = r.shape === 'brush' ? (r.brush * Math.min(dw, dh)) / 2 : 0;
  return {
    x: r.box.x * dw - half,
    y: r.box.y * dh - half,
    w: r.box.w * dw + half * 2,
    h: r.box.h * dh + half * 2,
    half,
  };
}

function pointsDisplay(r, dw, dh) {
  return (r.points || []).map((p) => ({ x: p.x * dw, y: p.y * dh }));
}

function tracePath(c, pts) {
  c.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  });
}

function bboxOfPoints(points) {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/* ------------------------- çizim ------------------------- */

function render() {
  if (!state.img) return;
  const { dw, dh } = layoutSize();
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${dw}px`;
  canvas.style.height = `${dh}px`;
  canvas.width = Math.round(dw * dpr);
  canvas.height = Math.round(dh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, dw, dh);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.img, 0, 0, dw, dh);

  for (const r of state.regions) drawRegion(r, dw, dh);
  for (const r of state.regions) drawOutline(r, dw, dh);
  drawPending(dw, dh);
}

/** Bölgenin efektini kendi maskesiyle uygular (dikdörtgen veya serbest fırça). */
function drawRegion(r, dw, dh) {
  const s = clampStrength(r.method, r.strength);
  const box = displayBox(r, dw, dh);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(dw, Math.ceil(box.x + box.w));
  const y1 = Math.min(dh, Math.ceil(box.y + box.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return;

  const ex0 = x0;
  const ey0 = y0;
  const ew = w;
  const eh = h;
  if (ew < 1 || eh < 1) return;

  const off = document.createElement('canvas');
  off.width = ew;
  off.height = eh;
  const o = off.getContext('2d');

  if (r.method === 'blur' || r.method === 'pixelate') {
    // Kaydetmeyle aynı mantık: bölge küçültülüp geri büyütülür (blur: yumuşak, piksel: keskin).
    const minSide = Math.min(ew, eh);
    const factor = r.method === 'pixelate' ? pixelFactor(minSide, s) : blurFactor(minSide, s);
    const sw = Math.max(1, Math.round(ew / factor));
    const sh = Math.max(1, Math.round(eh / factor));
    const sc = state.width / dw;
    tiny.width = sw;
    tiny.height = sh;
    tinyCtx.imageSmoothingEnabled = true;
    tinyCtx.imageSmoothingQuality = 'high';
    tinyCtx.clearRect(0, 0, sw, sh);
    tinyCtx.drawImage(state.img, ex0 * sc, ey0 * sc, ew * sc, eh * sc, 0, 0, sw, sh);

    const smooth = r.method === 'blur';
    o.imageSmoothingEnabled = smooth;
    o.imageSmoothingQuality = 'high';
    o.drawImage(tiny, 0, 0, sw, sh, 0, 0, ew, eh);
    o.imageSmoothingEnabled = true;
  } else {
    o.fillStyle = r.color || state.defaults.color;
    o.globalAlpha = Math.max(0.15, Math.min(1, s));
    o.fillRect(0, 0, ew, eh);
    o.globalAlpha = 1;
  }

  // şekil maskesi
  const mask = document.createElement('canvas');
  mask.width = ew;
  mask.height = eh;
  const mc = mask.getContext('2d');
  mc.fillStyle = '#fff';
  mc.strokeStyle = '#fff';
  if (r.shape === 'brush') {
    const pts = pointsDisplay(r, dw, dh).map((p) => ({ x: p.x - ex0, y: p.y - ey0 }));
    if (pts.length === 1) {
      mc.beginPath();
      mc.arc(pts[0].x, pts[0].y, Math.max(2, (r.brush * Math.min(dw, dh)) / 2), 0, Math.PI * 2);
      mc.fill();
    } else {
      mc.lineWidth = Math.max(2, r.brush * Math.min(dw, dh));
      mc.lineCap = 'round';
      mc.lineJoin = 'round';
      tracePath(mc, pts);
      mc.stroke();
    }
  } else {
    mc.fillRect(x0 - ex0, y0 - ey0, w, h);
  }

  o.globalCompositeOperation = 'destination-in';
  o.drawImage(mask, 0, 0);
  o.globalCompositeOperation = 'source-over';

  ctx.drawImage(off, ex0, ey0);
}

function drawOutline(r, dw, dh) {
  if (r.shape === 'brush') return; // serbest çizimde hat yok, sadece alan görünür
  const active = r.id === state.selected;
  const p = displayBox(r, dw, dh);
  ctx.save();
  ctx.lineWidth = active ? 2 : 1.4;
  ctx.strokeStyle = active ? '#7ae0c8' : 'rgba(255,255,255,0.75)';
  ctx.setLineDash(active ? [] : [6, 4]);
  ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
  if (active) {
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(122,224,200,0.9)';
    for (const [hx, hy] of [
      [p.x, p.y],
      [p.x + p.w, p.y],
      [p.x, p.y + p.h],
      [p.x + p.w, p.y + p.h],
    ]) {
      ctx.fillRect(hx - 3, hy - 3, 6, 6);
    }
  }
  ctx.restore();
}

function drawPending(dw, dh) {
  const d = state.drag;
  if (!d) return;
  ctx.save();
  ctx.strokeStyle = '#5b8cff';
  ctx.fillStyle = 'rgba(91,140,255,0.14)';
  if (d.mode === 'rect') {
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  } else if (d.mode === 'brush') {
    ctx.lineWidth = Math.max(2, state.brush * Math.min(dw, dh));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(91,140,255,0.55)';
    ctx.beginPath();
    d.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------- fare ------------------------- */

function canvasPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  const { dw, dh } = layoutSize();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * dw,
    y: ((ev.clientY - rect.top) / rect.height) * dh,
  };
}

function segDistance(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function hitTest(p) {
  const { dw, dh } = layoutSize();
  for (let i = state.regions.length - 1; i >= 0; i--) {
    const r = state.regions[i];
    const b = displayBox(r, dw, dh);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return r;
  }
  return null;
}

/** Seçili dikdörtgen alanın köşe tutamaçları (piksel koordinatı). */
function handleAt(p) {
  const r = selectedRegion();
  if (!r || r.shape !== 'rect') return null;
  const { dw, dh } = layoutSize();
  const b = displayBox(r, dw, dh);
  const corners = {
    nw: [b.x, b.y],
    ne: [b.x + b.w, b.y],
    sw: [b.x, b.y + b.h],
    se: [b.x + b.w, b.y + b.h],
  };
  for (const [name, [x, y]] of Object.entries(corners)) {
    if (Math.hypot(p.x - x, p.y - y) <= 10) return name;
  }
  return null;
}

function resizeRegion(r, orig, corner, dxN, dyN) {
  const b = orig.box;
  const min = 0.012;
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (corner.includes('w')) x0 = Math.min(x1 - min, Math.max(0, b.x + dxN));
  if (corner.includes('e')) x1 = Math.max(x0 + min, Math.min(1, b.x + b.w + dxN));
  if (corner.includes('n')) y0 = Math.min(y1 - min, Math.max(0, b.y + dyN));
  if (corner.includes('s')) y1 = Math.max(y0 + min, Math.min(1, b.y + b.h + dyN));
  r.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function moveRegionTo(r, orig, dxN, dyN) {
  const b = orig.box;
  const nx = Math.min(Math.max(0, 1 - b.w), Math.max(0, b.x + dxN));
  const ny = Math.min(Math.max(0, 1 - b.h), Math.max(0, b.y + dyN));
  const ddx = nx - b.x;
  const ddy = ny - b.y;
  r.box = { x: nx, y: ny, w: b.w, h: b.h };
  if (r.shape === 'brush') {
    r.points = orig.points.map((p) => ({ x: p.x + ddx, y: p.y + ddy }));
  }
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!state.img || ev.button !== 0) return;
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch (_) {
    /* sentetik olaylarda desteklenmeyebilir */
  }
  const p = canvasPoint(ev);
  const handle = handleAt(p);
  const hit = handle ? selectedRegion() : hitTest(p);
  const snapshot = JSON.stringify(state.regions);

  if (hit) {
    state.selected = hit.id;
    state.drag = {
      mode: handle ? 'resize' : 'move',
      id: hit.id,
      corner: handle || null,
      start: p,
      orig: JSON.parse(JSON.stringify(hit)),
      snapshot,
      moved: false,
    };
    syncSettingsUI();
    renderList();
    render();
    return;
  }

  state.selected = null;
  if (state.tool === 'brush') {
    state.drag = { mode: 'brush', points: [p], snapshot };
  } else {
    state.drag = { mode: 'rect', x0: p.x, y0: p.y, x1: p.x, y1: p.y, snapshot };
  }
  syncSettingsUI();
  renderList();
  render();
});

canvas.addEventListener('pointermove', (ev) => {
  const { dw, dh } = layoutSize();
  if (!state.drag) {
    if (!state.img) return;
    const p = canvasPoint(ev);
    const handle = handleAt(p);
    if (handle) canvas.style.cursor = handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';
    else canvas.style.cursor = hitTest(p) ? 'move' : state.tool === 'brush' ? 'cell' : 'crosshair';
    return;
  }
  const p = canvasPoint(ev);
  const d = state.drag;

  if (d.mode === 'move') {
    const r = state.regions.find((x) => x.id === d.id);
    if (!r) return;
    const dxN = (p.x - d.start.x) / dw;
    const dyN = (p.y - d.start.y) / dh;
    if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 2) return;
    d.moved = true;
    moveRegionTo(r, d.orig, dxN, dyN);
    renderList();
    render();
  } else if (d.mode === 'resize') {
    const r = state.regions.find((x) => x.id === d.id);
    if (!r) return;
    d.moved = true;
    resizeRegion(r, d.orig, d.corner, (p.x - d.start.x) / dw, (p.y - d.start.y) / dh);
    renderList();
    render();
  } else if (d.mode === 'rect') {
    d.x1 = p.x;
    d.y1 = p.y;
    render();
  } else if (d.mode === 'brush') {
    const last = d.points[d.points.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) d.points.push(p);
    render();
  }
});

canvas.addEventListener('pointerup', () => {
  const { dw, dh } = layoutSize();
  const d = state.drag;
  state.drag = null;
  if (!d) return;

  if (d.mode === 'move' || d.mode === 'resize') {
    if (d.moved) pushHistory(d.snapshot);
    updateChrome();
    render();
    return;
  }

  if (d.mode === 'rect') {
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w < 6 || h < 6) {
      render();
      return;
    }
    pushHistory(d.snapshot);
    const region = {
      id: uid(),
      shape: 'rect',
      box: { x: x / dw, y: y / dh, w: w / dw, h: h / dh },
      method: state.defaults.method,
      strength: clampStrength(state.defaults.method, state.defaults.strength[state.defaults.method]),
      color: state.defaults.color,
    };
    state.regions.push(region);
    state.selected = region.id;
  } else if (d.mode === 'brush') {
    if (d.points.length < 2) {
      render();
      return;
    }
    const pts = d.points.map((p) => ({ x: p.x / dw, y: p.y / dh }));
    pushHistory(d.snapshot);
    const region = {
      id: uid(),
      shape: 'brush',
      box: bboxOfPoints(pts),
      points: pts,
      brush: state.brush,
      method: state.defaults.method,
      strength: clampStrength(state.defaults.method, state.defaults.strength[state.defaults.method]),
      color: state.defaults.color,
    };
    state.regions.push(region);
    state.selected = region.id;
  }

  syncSettingsUI();
  updateChrome();
  render();
});

canvas.addEventListener('pointercancel', () => {
  state.drag = null;
  render();
});

/* ------------------------- liste ------------------------- */

function updateChrome() {
  const has = !!state.img;
  $('#fileTitle').textContent = has
    ? `${state.name} — ${state.width}×${state.height}${state.bytes ? ' · ' + fmtBytes(state.bytes) : ''}`
    : 'Fotoğraf açılmadı';
  $('#countPill').textContent = String(state.regions.length);
  $('#saveBtn').disabled = !has || state.busy;
  $('#saveAsBtn').disabled = !has || state.busy;
  $('#undoBtn').disabled = !state.history.length;
  $('#clearBtn').disabled = !state.regions.length;
  renderList();
}

function renderList() {
  const list = $('#list');
  list.innerHTML = '';
  if (!state.img) {
    list.innerHTML = '<div class="empty">Henüz fotoğraf yok.<br/>Bir görsel aç, gizlenecek alanı çiz.</div>';
    return;
  }
  if (!state.regions.length) {
    list.innerHTML = '<div class="empty">Henüz alan yok.<br/>Görselin üzerinde sürükle.</div>';
    return;
  }

  state.regions.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = `row${state.selected === r.id ? ' focused' : ''}`;
    const strength = clampStrength(r.method, r.strength);
    row.innerHTML = `<div class="idx">${i + 1}</div><div class="body"><div class="label">Alan ${i + 1} <span class="tag">${
      TOOL_LABELS[r.shape]
    }</span></div><div class="value">${MODE_ICONS[r.method]} ${MODE_LABELS[r.method]} · ${strengthText(
      r.method,
      strength,
    )}</div></div>`;

    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Bu alanı sil';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      pushHistory();
      state.regions = state.regions.filter((x) => x.id !== r.id);
      if (state.selected === r.id) state.selected = null;
      syncSettingsUI();
      updateChrome();
      render();
    });

    const right = document.createElement('div');
    right.className = 'right';
    right.append(del);
    row.append(right);

    row.addEventListener('click', () => {
      state.selected = r.id;
      syncSettingsUI();
      renderList();
      render();
    });
    list.append(row);
  });
}

/* ------------------------- yöntem / güç ------------------------- */

function syncMethodButtons(m) {
  document.querySelectorAll('.method').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.mode === m ? 'true' : 'false');
  });
}

function syncToolButtons() {
  document.querySelectorAll('.tool').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.tool === state.tool ? 'true' : 'false');
  });
  $('#brushField').classList.toggle('hidden', state.tool !== 'brush');
  $('#brushVal').textContent = `${(state.brush * 100).toFixed(1)}%`;
  $('#brush').value = String(Math.round(state.brush * 1000));
}

function syncSettingsUI() {
  const r = selectedRegion();
  const m = r ? r.method : state.defaults.method;
  const s = clampStrength(m, r ? r.strength : state.defaults.strength[m]);
  if (r) {
    r.strength = s;
    // Seçili alanın ayarları aynı zamanda yeni çizilecek alanların şablonu olur
    state.defaults.method = r.method;
    state.defaults.strength[r.method] = s;
    state.defaults.color = r.color || state.defaults.color;
  }

  const slider = $('#strength');
  const range = strengthRange(m);
  slider.min = String(Math.round(range.min * 100));
  slider.max = String(Math.round(range.max * 100));
  slider.step = '5';
  slider.value = String(Math.round(s * 100));
  $('#strengthVal').textContent = strengthText(m, s);

  $('#color').value = r ? r.color : state.defaults.color;
  $('#colorWrap').classList.toggle('hidden', m !== 'solid');
  syncMethodButtons(m);
  syncToolButtons();

  $('#selectionInfo').textContent = r
    ? `Seçili alan: ${MODE_LABELS[r.method]} · ${strengthText(r.method, s)}`
    : 'Yeni alanlar için varsayılan ayar';
}

document.querySelectorAll('.method').forEach((btn) => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.mode;
    state.defaults.method = m;
    const r = selectedRegion();
    if (r) {
      r.method = m;
      r.strength = clampStrength(m, state.defaults.strength[m]);
    }
    savePrefs();
    syncSettingsUI();
    renderList();
    render();
  });
});

$('#strength').addEventListener('input', () => {
  const r = selectedRegion();
  const m = r ? r.method : state.defaults.method;
  const v = clampStrength(m, Number($('#strength').value) / 100);
  state.defaults.strength[m] = v;
  if (r) r.strength = v;
  $('#strengthVal').textContent = strengthText(m, v);
  savePrefs();
  renderList();
  render();
});

$('#color').addEventListener('input', () => {
  const v = $('#color').value;
  state.defaults.color = v;
  const r = selectedRegion();
  if (r) r.color = v;
  savePrefs();
  render();
});

document.querySelectorAll('.tool').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tool = btn.dataset.tool;
    savePrefs();
    syncToolButtons();
  });
});

$('#brush').addEventListener('input', () => {
  state.brush = Math.min(0.08, Math.max(0.01, Number($('#brush').value) / 1000));
  $('#brushVal').textContent = `${(state.brush * 100).toFixed(1)}%`;
  savePrefs();
});

$('#format').addEventListener('change', () => {
  state.format = $('#format').value;
  savePrefs();
  updateQualityField();
});

$('#quality').addEventListener('input', () => {
  state.quality = Number($('#quality').value);
  $('#qualityVal').textContent = String(state.quality);
  savePrefs();
});

function effectiveFormat() {
  if (state.format !== 'orijinal') return state.format;
  const ext = String(state.name || '').split('.').pop().toLowerCase();
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  return 'jpeg';
}

function updateQualityField() {
  const f = effectiveFormat();
  const relevant = f === 'jpeg' || f === 'webp' || f === 'tiff' || f === 'avif';
  $('#qualityField').classList.toggle('hidden', !relevant);
}

/* ------------------------- kaydet ------------------------- */

function setBusy(v) {
  state.busy = v;
  $('#progress').classList.toggle('hidden', !v);
  $('#progressText').textContent = 'Kaydediliyor…';
  updateChrome();
}

async function save(asNew) {
  if (!state.file) return;
  if (!state.regions.length) {
    toast('Önce gizlenecek alanı çiz (görselin üzerinde sürükle).', 'warn');
    return;
  }
  setBusy(true);
  try {
    let outPath = null;
    if (asNew) {
      outPath = await api.pickExportPath(state.file, state.format);
      if (!outPath) return;
    }
    const res = await api.exportImage({
      file: state.file,
      regions: state.regions,
      format: state.format,
      quality: state.quality,
      outPath,
    });
    toast('Kaydedildi', 'ok', res.path);
  } catch (err) {
    toast(`Kaydedilemedi: ${err && err.message ? err.message : err}`, 'err');
  } finally {
    setBusy(false);
  }
}

$('#saveBtn').addEventListener('click', () => save(false));
$('#saveAsBtn').addEventListener('click', () => save(true));
$('#undoBtn').addEventListener('click', undo);
$('#clearBtn').addEventListener('click', () => {
  if (!state.regions.length) return;
  pushHistory();
  state.regions = [];
  state.selected = null;
  syncSettingsUI();
  updateChrome();
  render();
});

/* ------------------------- dosya açma ------------------------- */

async function pickAndOpen() {
  const files = await api.pickFiles();
  if (files && files.length) openFile(files[0]);
}

$('#openBtn').addEventListener('click', pickAndOpen);
$('#dropPick').addEventListener('click', pickAndOpen);

const drop = $('#dropzone');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  const p = api.pathForFile(file);
  if (p) openFile(p);
});

api.onOpenFiles((files) => {
  if (files && files.length) openFile(files[0]);
});

/* ------------------------- klavye ------------------------- */

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save(false);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    pickAndOpen();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!state.selected) return;
    pushHistory();
    state.regions = state.regions.filter((r) => r.id !== state.selected);
    state.selected = null;
    syncSettingsUI();
    updateChrome();
    render();
  } else if (e.key === 'Escape') {
    state.selected = null;
    state.drag = null;
    syncSettingsUI();
    updateChrome();
    render();
  }
});

/* ------------------------- tema ------------------------- */

const THEMES = [
  { id: 'gece', name: 'Gece', icon: '☾' },
  { id: 'gunduz', name: 'Gündüz', icon: '☀' },
  { id: 'grafit', name: 'Grafit', icon: '◆' },
  { id: 'kum', name: 'Kum', icon: '❖' },
];

function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  const icon = $('#themeIcon');
  const name = $('#themeName');
  if (icon) icon.textContent = theme.icon;
  if (name) name.textContent = theme.name;
  const btn = $('#themeBtn');
  if (btn) btn.title = `Tema: ${theme.name} — değiştirmek için tıkla`;
  try {
    localStorage.setItem('theme', theme.id);
  } catch (_) {
    /* yoksay */
  }
}

function nextTheme() {
  const current = document.documentElement.dataset.theme || 'gece';
  const i = THEMES.findIndex((t) => t.id === current);
  applyTheme(THEMES[(i + 1) % THEMES.length].id);
}

applyTheme(localStorage.getItem('theme') || 'gece');
const themeBtn = $('#themeBtn');
if (themeBtn) themeBtn.addEventListener('click', nextTheme);

/* ------------------------- başlangıç ------------------------- */

window.addEventListener('resize', () => render());

$('#format').value = state.format;
$('#quality').value = String(state.quality);
$('#qualityVal').textContent = String(state.quality);
$('#color').value = state.defaults.color;
$('#brush').value = String(Math.round(state.brush * 1000));
$('#brushVal').textContent = `${(state.brush * 100).toFixed(1)}%`;
updateQualityField();
syncSettingsUI();
updateChrome();

api.takePendingFiles().then((files) => {
  if (files && files.length) openFile(files[0]);
});
