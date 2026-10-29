'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.jfif': 'image/jpeg',
};

function isImageFile(file) {
  return !!MIME_BY_EXT[path.extname(file).toLowerCase()];
}

/** Orijinali yeniden sikistirmadan, EXIF yonune gore duzeltilmis ham piksel. */
async function loadRaw(file) {
  const { data, info } = await sharp(file)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function pxBox(r, width, height) {
  const b = r.box || r;
  return {
    x0: Math.max(0, Math.floor(b.x * width)),
    y0: Math.max(0, Math.floor(b.y * height)),
    x1: Math.min(width, Math.ceil((b.x + b.w) * width)),
    y1: Math.min(height, Math.ceil((b.y + b.h) * height)),
  };
}

function hexToRgb(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Bölgenin şeklini (dikdörtgen veya serbest fırça) beyaz maske olarak üretir. */
async function shapeMask(region, ox, oy, w, h, width, height) {
  if (region.shape === 'brush' && Array.isArray(region.points) && region.points.length) {
    const bw = Math.max(2, (region.brush || 0.03) * Math.min(width, height));
    if (region.points.length === 1) {
      const p = region.points[0];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${
        (p.x * width - ox).toFixed(1)
      }" cy="${(p.y * height - oy).toFixed(1)}" r="${(bw / 2).toFixed(1)}" fill="#fff"/></svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    const pts = region.points
      .map((p) => `${(p.x * width - ox).toFixed(1)},${(p.y * height - oy).toFixed(1)}`)
      .join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="#fff" stroke-width="${bw.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  const b = pxBox(region, width, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${b.x0 - ox}" y="${
    b.y0 - oy
  }" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="#fff"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Bulanıklaştırma: bölge küçültülüp yumuşak (cubic) büyütülür. "Küçültme oranı" güçle artar.
 * Gaussian sigma yerine bunu kullanıyoruz; güç yükseldikçe sonuç gerçekten daha bulanık
 * görünür, düz bir lekeye dönüşüp "hiçbir şey yapılmamış" izlenimi vermez.
 */
function blurFactor(minSide, strength) {
  const s = Math.max(0.1, Number(strength) || 1);
  return Math.max(2, Math.min(minSide * 0.4, Math.round(minSide * (0.06 + 0.12 * s))));
}

/** Pikselleştirme: blok kenarı (piksel). */
function pixelFactor(minSide, strength) {
  const s = Math.max(0.1, Number(strength) || 1);
  return Math.max(3, Math.min(minSide / 3.5, Math.round((minSide / 6) * s)));
}

/**
 * Bölgeleri bulanıklaştırır / pikselleştirir / karartır.
 * Her bölge kendi yöntemini, gücünü ve rengini taşır.
 * @returns {Promise<{buffer:Buffer,width:number,height:number}>} png tamponu
 */
async function blurRegions(file, regions, { mode = 'blur', strength = 1, color = '#0b1220' } = {}) {
  const { data, width, height, channels } = await loadRaw(file);
  const base = sharp(data, { raw: { width, height, channels } });
  const patches = [];

  for (const region of regions || []) {
    const b = pxBox(region, width, height);
    const m = region.method || mode;
    const s = Math.max(0.1, Number(region.strength) || strength || 1);
    const col = hexToRgb(region.color || color);
    const brushPx = region.shape === 'brush' ? Math.max(2, (region.brush || 0.03) * Math.min(width, height)) : 0;
    const half = brushPx / 2;

    const x0 = Math.max(0, Math.floor(b.x0 - half));
    const y0 = Math.max(0, Math.floor(b.y0 - half));
    const x1 = Math.min(width, Math.ceil(b.x1 + half));
    const y1 = Math.min(height, Math.ceil(b.y1 + half));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 2 || h < 2) continue;

    // Kırpılan alan üzerinde efekt; maske şekli kırpar
    const ew = w;
    const eh = h;
    const ex0 = x0;
    const ey0 = y0;

    let effect;
    if (m === 'solid') {
      const alpha = Math.max(0.15, Math.min(1, s));
      effect = await sharp({
        create: {
          width: ew,
          height: eh,
          channels: 4,
          background: { ...col, alpha: Math.round(alpha * 255) },
        },
      })
        .png()
        .toBuffer();
    } else {
      // Hem bulanıklaştırma hem pikselleştirme "küçült + büyüt" ile yapılır:
      // güç arttıkça küçültme oranı büyür, sonuç net biçimde daha bulanık/mozaik olur.
      const minSide = Math.min(ew, eh);
      const factor = m === 'pixelate' ? pixelFactor(minSide, s) : blurFactor(minSide, s);
      const kernel = m === 'pixelate' ? 'nearest' : 'cubic';
      const smallW = Math.max(1, Math.round(ew / factor));
      const smallH = Math.max(1, Math.round(eh / factor));
      const down = await base
        .clone()
        .extract({ left: ex0, top: ey0, width: ew, height: eh })
        .resize({ width: smallW, height: smallH, fit: 'fill', kernel })
        .png()
        .toBuffer();
      effect = await sharp(down)
        .resize({ width: ew, height: eh, fit: 'fill', kernel })
        .png()
        .toBuffer();
    }

    const mask = await shapeMask(region, ex0, ey0, ew, eh, width, height);
    const patch = await sharp(effect)
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    patches.push({ input: patch, left: ex0, top: ey0 });
  }

  const out = await base.composite(patches).png().toBuffer();
  return { buffer: out, width, height };
}

function uniquePath(dir, baseName, ext) {
  let candidate = path.join(dir, `${baseName}.${ext}`);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}-${i}.${ext}`);
    i++;
  }
  return candidate;
}

function encodeFormat(pipeline, format, quality, sourceFormat) {
  const q = Math.max(30, Math.min(100, quality || 90));
  const fmt = format === 'orijinal' ? sourceFormat || 'jpeg' : format;
  switch (fmt) {
    case 'png':
      return { pipeline: pipeline.png({ compressionLevel: 9 }), ext: 'png' };
    case 'webp':
      return { pipeline: pipeline.webp({ quality: q }), ext: 'webp' };
    case 'tiff':
    case 'tif':
      return { pipeline: pipeline.tiff({ quality: q }), ext: 'tif' };
    case 'avif':
      return { pipeline: pipeline.avif({ quality: q }), ext: 'avif' };
    default:
      return { pipeline: pipeline.jpeg({ quality: q, mozjpeg: true }), ext: 'jpg' };
  }
}

async function toPdf(buffer, width, height) {
  const jpeg = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
  const doc = await PDFDocument.create();
  const ptW = width * 0.75;
  const ptH = height * 0.75;
  const img = await doc.embedJpg(jpeg);
  const page = doc.addPage([ptW, ptH]);
  page.drawImage(img, { x: 0, y: 0, width: ptW, height: ptH });
  doc.setProducer('Safeshot');
  doc.setCreator('Safeshot');
  return Buffer.from(await doc.save());
}

/**
 * Bulaniklastirip secilen formatta kaydeder.
 * @returns {Promise<{path:string,bytes:number}>}
 */
async function exportImage({ file, regions, format = 'orijinal', quality = 92, mode = 'blur', strength = 1, color = '#0b1220', outPath }) {
  const { buffer, width, height } = await blurRegions(file, regions, { mode, strength, color });
  const dir = path.dirname(file);
  const ext = path.extname(file).toLowerCase();
  const sourceFormat = MIME_BY_EXT[ext] === 'image/png' ? 'png' : MIME_BY_EXT[ext] === 'image/webp' ? 'webp' : 'jpeg';

  let target = outPath;
  if (!target) {
    const baseName = `${path.basename(file, path.extname(file))}-gizli`;
    target = uniquePath(dir, baseName, format === 'pdf' ? 'pdf' : encodeFormat(sharp(buffer), format, quality, sourceFormat).ext);
  }

  let data;
  if (format === 'pdf') {
    data = await toPdf(buffer, width, height);
  } else {
    const { pipeline, ext: outExt } = encodeFormat(sharp(buffer), format, quality, sourceFormat);
    data = await pipeline.toBuffer();
    if (!path.extname(target)) target += `.${outExt}`;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  return { path: target, bytes: data.length };
}

module.exports = { exportImage, blurRegions, isImageFile, MIME_BY_EXT, uniquePath };
