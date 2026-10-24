// src/core/types.ts
var EMPTY_CELL = -1;
function createImage(width, height) {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}
function cloneImage(img) {
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

// src/core/color/convert.ts
var D65_WHITE = { x: 95.047, y: 100, z: 108.883 };
var DELTA = 6 / 29;
var DELTA_POW3 = DELTA * DELTA * DELTA;
var LAB_F_T = (t) => t > DELTA_POW3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
function clampByte(v) {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}
function hexToRgb(hex) {
  let s = (hex || "").trim().replace(/^#/, "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length === 8) s = s.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    return { r: 0, g: 0, b: 0 };
  }
  const n = parseInt(s, 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }) {
  const to2 = (v) => clampByte(v).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}
function srgbChannelToLinear(c) {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearChannelToSrgb(c) {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return v <= 31308e-7 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
function srgbToLinear({ r, g, b }) {
  return {
    x: srgbChannelToLinear(r / 255),
    y: srgbChannelToLinear(g / 255),
    z: srgbChannelToLinear(b / 255)
  };
}
function rgbToXyz(rgb) {
  const { x: r, y: g, z: b } = srgbToLinear(rgb);
  return {
    x: (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    y: (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100,
    z: (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100
  };
}
function xyzToLab(xyz, white = D65_WHITE) {
  const fx = LAB_F_T(xyz.x / white.x);
  const fy = LAB_F_T(xyz.y / white.y);
  const fz = LAB_F_T(xyz.z / white.z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}
function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}
function labToXyz(lab, white = D65_WHITE) {
  const fy = (lab.L + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const finv = (f) => f ** 3 > DELTA_POW3 ? f ** 3 : 3 * DELTA * DELTA * (f - 4 / 29);
  return {
    x: finv(fx) * white.x,
    y: finv(fy) * white.y,
    z: finv(fz) * white.z
  };
}
function labToRgb(lab) {
  const { x, y, z } = labToXyz(lab);
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return {
    r: clampByte(linearChannelToSrgb(r / 100) * 255),
    g: clampByte(linearChannelToSrgb(g / 100) * 255),
    b: clampByte(linearChannelToSrgb(b / 100) * 255)
  };
}

// src/core/color/distance.ts
function deltaE76(a, b) {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}
function deltaE2000(lab1, lab2) {
  const { L: l1, a: a1, b: b1 } = lab1;
  const { L: l2, a: a2, b: b2 } = lab2;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.sqrt(a1p * a1p + b1 * b1);
  const c2p = Math.sqrt(a2p * a2p + b2 * b2);
  const h1p = c1p === 0 ? 0 : normalizeHue(Math.atan2(b1, a1p) * 180 / Math.PI);
  const h2p = c2p === 0 ? 0 : normalizeHue(Math.atan2(b2, a2p) * 180 / Math.PI);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(dhp / 2 * Math.PI / 180);
  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP;
  if (c1p * c2p === 0) {
    hBarP = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hBarP = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hBarP = (h1p + h2p + 360) / 2;
  } else {
    hBarP = (h1p + h2p - 360) / 2;
  }
  const t = 1 - 0.17 * Math.cos((hBarP - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hBarP * Math.PI / 180) + 0.32 * Math.cos((3 * hBarP + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hBarP - 63) * Math.PI / 180);
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * (lBarP - 50) ** 2 / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(2 * dTheta * Math.PI / 180) * rc;
  const lTerm = dLp / sl;
  const cTerm = dCp / sc;
  const hTerm = dHp / sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm);
}
function normalizeHue(h) {
  const v = h % 360;
  return v < 0 ? v + 360 : v;
}
function deltaE2000Weighted(a, b, _w = {}) {
  return deltaE2000(a, b);
}
function rgbDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// src/core/color/match.ts
function buildLabIndex(colors) {
  return colors.map((entry, index) => {
    const rgb = hexToRgb(entry.hex);
    return { entry, index, rgb, lab: rgbToLab(rgb) };
  });
}
function nearestColorIndex(lab, index) {
  return nearestLabIndex(lab, index);
}
function nearestLabIndex(lab, labs) {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < labs.length; i++) {
    const d = deltaE2000(lab, labs[i].lab);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
      if (d === 0) break;
    }
  }
  return best;
}
function nearestLabIndexFast(lab, labs, candidates = 8) {
  if (labs.length <= 64 || candidates >= labs.length) return nearestLabIndex(lab, labs);
  const scored = [];
  for (let i = 0; i < labs.length; i++) scored.push({ i, d: deltaE76(lab, labs[i].lab) });
  scored.sort((a, b) => a.d - b.d);
  const shortlist = scored.slice(0, candidates);
  let best = shortlist[0].i;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const { i } of shortlist) {
    const d = deltaE2000(lab, labs[i].lab);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
var PaletteMatcher = class {
  constructor(colors) {
    this.colors = colors;
    this.index = buildLabIndex(colors);
  }
  get size() {
    return this.colors.length;
  }
  /** 返回色板索引，空色板返回 -1 */
  matchRgb(rgb) {
    return nearestLabIndex(rgbToLab(rgb), this.index);
  }
  matchLab(lab) {
    return nearestLabIndex(lab, this.index);
  }
  labAt(index) {
    return this.index[index]?.lab;
  }
  rgbAt(index) {
    return this.index[index]?.rgb;
  }
  codeAt(index) {
    return this.index[index]?.entry.code;
  }
};
var matcherCache = /* @__PURE__ */ new Map();
function getMatcher(paletteId, colors) {
  const cached = matcherCache.get(paletteId);
  if (cached) return cached;
  if (!colors) {
    throw new Error(`[match] palette "${paletteId}" \u672A\u7F13\u5B58\uFF0C\u9996\u6B21\u8C03\u7528\u5FC5\u987B\u4F20\u5165 colors`);
  }
  const matcher = new PaletteMatcher(colors);
  matcherCache.set(paletteId, matcher);
  return matcher;
}
function clearMatcherCache() {
  matcherCache.clear();
}

// src/core/quantize/downscale.ts
function downscaleBox(src, dstWidth, dstHeight, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const sw = src.width;
  const sh = src.height;
  const dw = Math.max(1, Math.floor(dstWidth));
  const dh = Math.max(1, Math.floor(dstHeight));
  const out = new Uint8ClampedArray(dw * dh * 4);
  const scaleX = sw / dw;
  const scaleY = sh / dh;
  const sd = src.data;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = (dy + 1) * scaleY;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(sh, Math.ceil(sy1));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = (dx + 1) * scaleX;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(sw, Math.ceil(sx1));
      let areaSum = 0;
      let colorSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const o2 = (sy * sw + sx) * 4;
          const a = sd[o2 + 3];
          areaSum += w;
          aSum += a * w;
          if (a >= alphaThreshold) {
            const cw = w * (a / 255);
            colorSum += cw;
            rSum += sd[o2] * cw;
            gSum += sd[o2 + 1] * cw;
            bSum += sd[o2 + 2] * cw;
          }
        }
      }
      const o = (dy * dw + dx) * 4;
      if (areaSum === 0) {
        out[o + 3] = 0;
        continue;
      }
      if (colorSum > 0) {
        out[o] = rSum / colorSum;
        out[o + 1] = gSum / colorSum;
        out[o + 2] = bSum / colorSum;
      } else {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
      }
      out[o + 3] = Math.round(aSum / areaSum);
    }
  }
  return { data: out, width: dw, height: dh };
}
function downscaleToMax(src, maxSize, options) {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxSize) return src;
  const ratio = maxSize / longest;
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  return downscaleBox(src, w, h, options);
}

// src/core/quantize/median-cut.ts
function medianCut(img, maxColors, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const space = options.space ?? "lab";
  const colorCount = Math.max(1, Math.floor(maxColors));
  const samples = collectSamples(img, alphaThreshold, options.maxSamples ?? 4e4);
  const n = samples.count;
  if (n === 0) return [];
  if (n <= colorCount) {
    return Array.from({ length: n }, (_, i) => ({
      rgb: { r: samples.r[i], g: samples.g[i], b: samples.b[i] },
      lab: rgbToLab({ r: samples.r[i], g: samples.g[i], b: samples.b[i] }),
      count: 1,
      share: 1 / n
    })).sort(sortByCountDesc);
  }
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const channels = buildChannels(samples, space);
  const boxes = [{ start: 0, end: n }];
  while (boxes.length < colorCount) {
    let target = -1;
    let bestPriority = 0;
    let bestChannel = -1;
    for (let bi = 0; bi < boxes.length; bi++) {
      const box2 = boxes[bi];
      const count = box2.end - box2.start;
      if (count < 2) continue;
      let ch = -1;
      let range = 0;
      for (let c = 0; c < 3; c++) {
        const r = channelRange(channels[c], order, box2);
        if (r > range) {
          range = r;
          ch = c;
        }
      }
      if (ch < 0) continue;
      const priority = range * count;
      if (priority > bestPriority) {
        bestPriority = priority;
        target = bi;
        bestChannel = ch;
      }
    }
    if (target < 0) break;
    const box = boxes[target];
    sortSegment(channels[bestChannel], order, box);
    const mid = box.start + (box.end - box.start >> 1);
    boxes.splice(target, 1, { start: box.start, end: mid }, { start: mid, end: box.end });
  }
  return boxes.map((box) => summarize(box, order, samples, n)).sort(sortByCountDesc);
}
function sortByCountDesc(a, b) {
  return b.count - a.count;
}
function buildChannels(samples, space) {
  const n = samples.count;
  const c0 = new Float32Array(n);
  const c1 = new Float32Array(n);
  const c2 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (space === "lab") {
      const lab = rgbToLab({ r: samples.r[i], g: samples.g[i], b: samples.b[i] });
      c0[i] = lab.L;
      c1[i] = lab.a;
      c2[i] = lab.b;
    } else {
      c0[i] = samples.r[i];
      c1[i] = samples.g[i];
      c2[i] = samples.b[i];
    }
  }
  return [c0, c1, c2];
}
function channelRange(values, order, box) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = box.start; i < box.end; i++) {
    const v = values[order[i]];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}
function sortSegment(values, order, box) {
  const segment = Array.from(order.subarray(box.start, box.end));
  segment.sort((a, b) => values[a] - values[b]);
  for (let i = 0; i < segment.length; i++) order[box.start + i] = segment[i];
}
function summarize(box, order, samples, total) {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const count = box.end - box.start;
  for (let i = box.start; i < box.end; i++) {
    const idx = order[i];
    rSum += samples.r[idx];
    gSum += samples.g[idx];
    bSum += samples.b[idx];
  }
  const rgb = {
    r: Math.round(rSum / Math.max(1, count)),
    g: Math.round(gSum / Math.max(1, count)),
    b: Math.round(bSum / Math.max(1, count))
  };
  return { rgb, lab: rgbToLab(rgb), count, share: count / Math.max(1, total) };
}
function collectSamples(img, alphaThreshold, maxSamples) {
  const total = img.width * img.height;
  const step = Math.max(1, Math.ceil(total / Math.max(1, maxSamples)));
  const capacity = Math.ceil(total / step) + 1;
  const r = new Float32Array(capacity);
  const g = new Float32Array(capacity);
  const b = new Float32Array(capacity);
  const data = img.data;
  let count = 0;
  for (let p = 0; p < total; p += step) {
    const o = p * 4;
    if (data[o + 3] < alphaThreshold) continue;
    r[count] = data[o];
    g[count] = data[o + 1];
    b[count] = data[o + 2];
    count++;
  }
  return { r, g, b, count };
}

// src/core/quantize/map.ts
function mapPixelsToPalette(img, matcher, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const { width: w, height: h, data } = img;
  const out = new Int16Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    if (data[o + 3] < alphaThreshold) {
      out[p] = EMPTY_CELL;
      continue;
    }
    out[p] = nearestLabIndex(rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] }), matcher.index);
  }
  return out;
}
function mapPixelsToAnchors(img, anchors, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const { width: w, height: h, data } = img;
  const out = new Int16Array(w * h);
  if (anchors.length === 0) {
    out.fill(EMPTY_CELL);
    return out;
  }
  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    if (data[o + 3] < alphaThreshold) {
      out[p] = EMPTY_CELL;
      continue;
    }
    out[p] = nearestLabIndex(rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] }), anchors);
  }
  return out;
}
function anchorsToPaletteIndices(anchors, matcher) {
  return anchors.map((a) => matcher.matchLab(a.lab));
}
function applyAnchorPalette(anchorIndex, paletteOfAnchor) {
  const out = new Int16Array(anchorIndex.length);
  for (let i = 0; i < anchorIndex.length; i++) {
    const a = anchorIndex[i];
    out[i] = a < 0 ? EMPTY_CELL : paletteOfAnchor[a] ?? EMPTY_CELL;
  }
  return out;
}
function applyAnchorPaletteInPlace(anchorIndex, paletteOfAnchor) {
  for (let i = 0; i < anchorIndex.length; i++) {
    const a = anchorIndex[i];
    if (a >= 0) anchorIndex[i] = paletteOfAnchor[a] ?? EMPTY_CELL;
  }
  return anchorIndex;
}
function anchorDistance(a, b) {
  return deltaE2000(a.lab, b.lab);
}

// src/core/quantize/dither.ts
var FS_WEIGHTS = [
  { dx: 1, dy: 0, w: 7 / 16 },
  { dx: -1, dy: 1, w: 3 / 16 },
  { dx: 0, dy: 1, w: 5 / 16 },
  { dx: 1, dy: 1, w: 1 / 16 }
];
function ditherToAnchors(img, anchors, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const strength = options.strength ?? 1;
  const { width: w, height: h, data } = img;
  const n = w * h;
  const out = new Int16Array(n);
  if (anchors.length === 0) {
    out.fill(EMPTY_CELL);
    return out;
  }
  if (anchors.length === 1) {
    for (let p = 0; p < n; p++) out[p] = data[p * 4 + 3] < alphaThreshold ? EMPTY_CELL : 0;
    return out;
  }
  const anchorLabs = anchors.map((a) => a.lab);
  const buf = new Float32Array(n * 3);
  const valid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    if (data[o + 3] < alphaThreshold) continue;
    valid[p] = 1;
    const lab = rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] });
    buf[p * 3] = lab.L;
    buf[p * 3 + 1] = lab.a;
    buf[p * 3 + 2] = lab.b;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!valid[p]) {
        out[p] = EMPTY_CELL;
        continue;
      }
      const cur = { L: buf[p * 3], a: buf[p * 3 + 1], b: buf[p * 3 + 2] };
      const idx = nearestAnchor(cur, anchorLabs);
      out[p] = idx;
      if (strength === 0) continue;
      const target = anchors[idx].lab;
      const errL = (cur.L - target.L) * strength;
      const errA = (cur.a - target.a) * strength;
      const errB = (cur.b - target.b) * strength;
      for (const { dx, dy, w: weight } of FS_WEIGHTS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (!valid[np]) continue;
        buf[np * 3] += errL * weight;
        buf[np * 3 + 1] += errA * weight;
        buf[np * 3 + 2] += errB * weight;
      }
    }
  }
  return out;
}
function nearestAnchor(lab, anchorLabs) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < anchorLabs.length; i++) {
    const d = deltaE2000(lab, anchorLabs[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

// src/core/pattern/model.ts
var PATTERN_VERSION = 1;
var MAX_DIMENSION = 100;
function assertPatternSize(width, height) {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error(`[pattern] \u5C3A\u5BF8\u975E\u6CD5\uFF1A${width} x ${height}`);
  }
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    throw new Error(`[pattern] \u8D85\u8FC7\u5355\u56FE\u7EB8\u4E0A\u9650 ${MAX_DIMENSION} x ${MAX_DIMENSION}`);
  }
}
function createPatternId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `p_${Date.now().toString(36)}_${rand}`;
}
function createPattern(width, height, paletteId, fill = EMPTY_CELL, id = createPatternId()) {
  assertPatternSize(width, height);
  const w = Math.floor(width);
  const h = Math.floor(height);
  return {
    id,
    version: PATTERN_VERSION,
    width: w,
    height: h,
    paletteId,
    cells: new Array(w * h).fill(fill)
  };
}
function toInt16(pattern) {
  const cells = Array.isArray(pattern) ? pattern : pattern.cells;
  return Int16Array.from(cells);
}
function toCellArray(cells) {
  return Array.from(cells, (v) => v);
}
function index2d(pattern, col, row) {
  return row * pattern.width + col;
}
function isInside(pattern, col, row) {
  return col >= 0 && row >= 0 && col < pattern.width && row < pattern.height;
}
function getCell(pattern, col, row) {
  if (!isInside(pattern, col, row)) return EMPTY_CELL;
  return pattern.cells[row * pattern.width + col];
}
function setCell(pattern, col, row, value) {
  if (!isInside(pattern, col, row)) return pattern;
  const cells = pattern.cells.slice();
  cells[row * pattern.width + col] = value;
  return { ...pattern, cells };
}
function clonePattern(pattern) {
  return { ...pattern, cells: pattern.cells.slice() };
}
function countFilled(pattern) {
  const cells = Array.isArray(pattern) ? pattern : pattern.cells;
  let filled = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) filled++;
  return filled;
}
function usedColorIndices(pattern) {
  const cells = Array.isArray(pattern) ? pattern : pattern.cells;
  const set = /* @__PURE__ */ new Set();
  for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) set.add(cells[i]);
  return [...set].sort((a, b) => a - b);
}
function runsOf(cells) {
  const runs = [];
  if (cells.length === 0) return runs;
  let current = cells[0];
  let count = 1;
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] === current) {
      count++;
    } else {
      runs.push({ c: current, n: count });
      current = cells[i];
      count = 1;
    }
  }
  runs.push({ c: current, n: count });
  return runs;
}
function cellsFromRuns(runs, width, height) {
  const total = width * height;
  const out = new Int16Array(total);
  let p = 0;
  for (const run of runs) {
    const n = Math.max(0, Math.floor(run.n));
    for (let i = 0; i < n && p < total; i++) out[p++] = run.c;
  }
  if (p !== total) throw new Error(`[pattern] RLE \u957F\u5EA6\u4E0D\u5339\u914D\uFF1A\u671F\u671B ${total}\uFF0C\u5B9E\u9645 ${p}`);
  return out;
}
function encodeRle(pattern) {
  const cells = isPatternLike(pattern) ? pattern.cells : pattern;
  return runsOf(cells).map((run) => run.n === 1 ? `${run.c}` : `${run.n}:${run.c}`).join(",");
}
function decodeRle(rle, width, height) {
  const total = width * height;
  const out = new Int16Array(total);
  if (!rle) {
    out.fill(EMPTY_CELL);
    return out;
  }
  let p = 0;
  for (const chunk of rle.split(",")) {
    if (!chunk) continue;
    const sep = chunk.indexOf(":");
    const n = sep < 0 ? 1 : Number(chunk.slice(0, sep));
    const c = sep < 0 ? Number(chunk) : Number(chunk.slice(sep + 1));
    if (!Number.isFinite(n) || !Number.isFinite(c) || n <= 0) {
      throw new Error(`[pattern] RLE \u7247\u6BB5\u975E\u6CD5\uFF1A${chunk}`);
    }
    for (let i = 0; i < n && p < total; i++) out[p++] = c;
  }
  if (p !== total) throw new Error(`[pattern] RLE \u957F\u5EA6\u4E0D\u5339\u914D\uFF1A\u671F\u671B ${total}\uFF0C\u5B9E\u9645 ${p}`);
  return out;
}
function decodeRuns(rle) {
  return rle.split(",").filter(Boolean).map((chunk) => {
    const sep = chunk.indexOf(":");
    if (sep < 0) return { n: 1, c: Number(chunk) };
    return { n: Number(chunk.slice(0, sep)), c: Number(chunk.slice(sep + 1)) };
  });
}
function rleRatio(rle, cellCount) {
  return cellCount === 0 ? 0 : rle.length / cellCount;
}
function serializePattern(pattern) {
  return {
    id: pattern.id,
    v: PATTERN_VERSION,
    w: pattern.width,
    h: pattern.height,
    paletteId: pattern.paletteId,
    rle: encodeRle(pattern)
  };
}
function deserializePattern(data) {
  const obj = typeof data === "string" ? JSON.parse(data) : data;
  if (!obj || typeof obj !== "object") throw new Error("[pattern] \u53CD\u5E8F\u5217\u5316\u5931\u8D25\uFF1A\u6570\u636E\u4E3A\u7A7A");
  if (obj.v !== PATTERN_VERSION) throw new Error(`[pattern] \u7248\u672C\u4E0D\u652F\u6301\uFF1A${obj.v}`);
  assertPatternSize(obj.w, obj.h);
  const cells = decodeRle(obj.rle, obj.w, obj.h);
  return {
    id: obj.id,
    version: PATTERN_VERSION,
    width: obj.w,
    height: obj.h,
    paletteId: obj.paletteId,
    cells: toCellArray(cells)
  };
}
function patternMeta(pattern, extra = {}) {
  const now2 = Date.now();
  return {
    id: pattern.id,
    width: pattern.width,
    height: pattern.height,
    paletteId: pattern.paletteId,
    filled: countFilled(pattern),
    colorCount: usedColorIndices(pattern).length,
    createdAt: now2,
    updatedAt: now2,
    ...extra
  };
}
function cropPattern(pattern, x, y, width, height) {
  assertPatternSize(width, height);
  const cells = new Array(width * height).fill(EMPTY_CELL);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells[row * width + col] = getCell(pattern, x + col, y + row);
    }
  }
  return { ...pattern, width, height, cells };
}
function resizePattern(pattern, width, height) {
  assertPatternSize(width, height);
  const cells = new Array(width * height).fill(EMPTY_CELL);
  for (let row = 0; row < height; row++) {
    const sy = Math.min(pattern.height - 1, Math.floor((row + 0.5) * pattern.height / height));
    for (let col = 0; col < width; col++) {
      const sx = Math.min(pattern.width - 1, Math.floor((col + 0.5) * pattern.width / width));
      cells[row * width + col] = pattern.cells[sy * pattern.width + sx];
    }
  }
  return { ...pattern, width, height, cells };
}
function isPatternLike(value) {
  return !!value && typeof value === "object" && Array.isArray(value.cells);
}

// src/core/pattern/ops.ts
function floodFill(cells, width, height, col, row, value) {
  const out = Int16Array.from(cells);
  if (col < 0 || row < 0 || col >= width || row >= height) return out;
  const start = row * width + col;
  const target = out[start];
  if (target === value) return out;
  const stack = [start];
  const seen = new Uint8Array(width * height);
  seen[start] = 1;
  while (stack.length) {
    const p = stack.pop();
    out[p] = value;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }
  return out;
  function push(p) {
    if (seen[p]) return;
    if (out[p] !== target) return;
    seen[p] = 1;
    stack.push(p);
  }
}
function replaceColor(cells, oldValue, newValue) {
  const out = Int16Array.from(cells);
  if (oldValue === newValue) return out;
  for (let i = 0; i < out.length; i++) if (out[i] === oldValue) out[i] = newValue;
  return out;
}
function clearCells(cells, indices) {
  const out = Int16Array.from(cells);
  for (const i of indices) if (i >= 0 && i < out.length) out[i] = EMPTY_CELL;
  return out;
}
function paintCells(cells, indices, value) {
  const out = Int16Array.from(cells);
  for (const i of indices) if (i >= 0 && i < out.length) out[i] = value;
  return out;
}
function lineIndices(width, height, col0, row0, col1, row1) {
  const points = [];
  let x0 = col0;
  let y0 = row0;
  const dx = Math.abs(col1 - x0);
  const dy = Math.abs(row1 - y0);
  const sx = x0 < col1 ? 1 : -1;
  const sy = y0 < row1 ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < width * height + 2; guard++) {
    if (x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) points.push(y0 * width + x0);
    if (x0 === col1 && y0 === row1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

// src/core/pattern/bom.ts
var WASTE_RATIO_MIN = 0.05;
var WASTE_RATIO_MAX = 0.1;
var DEFAULT_WASTE_RATIO = 0.08;
var DEFAULT_BOARD_SIZE = 29;
function computeBom(pattern, palette, options = {}) {
  const wasteRatio = clampWaste(options.wasteRatio ?? DEFAULT_WASTE_RATIO);
  const boardSize = Math.max(1, Math.floor(options.boardSize ?? DEFAULT_BOARD_SIZE));
  const inventory = options.inventory ?? {};
  const totalCells = pattern.width * pattern.height;
  const counts = new Int32Array(palette.length);
  for (let i = 0; i < pattern.cells.length; i++) {
    const v = pattern.cells[i];
    if (v >= 0 && v < counts.length) counts[v]++;
  }
  const filledCells = countFilled(pattern);
  const entries = usedColorIndices(pattern).map((colorIndex) => {
    const color = palette[colorIndex];
    const count = counts[colorIndex];
    const withWaste = Math.ceil(count * (1 + wasteRatio));
    const owned = inventory[color?.code] ?? 0;
    return {
      colorIndex,
      code: color?.code ?? `#${colorIndex}`,
      name: color?.name ?? color?.code ?? `\u8272\u53F7 ${colorIndex}`,
      hex: color?.hex ?? "#000000",
      count,
      withWaste,
      owned,
      shortage: Math.max(0, withWaste - owned),
      share: filledCells > 0 ? count / filledCells : 0
    };
  });
  entries.sort((a, b) => b.count - a.count || a.colorIndex - b.colorIndex);
  const totalBeads = entries.reduce((sum, e) => sum + e.count, 0);
  const totalWithWaste = entries.reduce((sum, e) => sum + e.withWaste, 0);
  return {
    patternId: pattern.id,
    width: pattern.width,
    height: pattern.height,
    paletteId: pattern.paletteId,
    totalCells,
    filledCells,
    emptyCells: totalCells - filledCells,
    colorCount: entries.length,
    entries,
    totalBeads,
    totalWithWaste,
    wasteRatio,
    boards: boardLayout(pattern.width, pattern.height, boardSize)
  };
}
function boardLayout(width, height, boardSize = DEFAULT_BOARD_SIZE) {
  const size = Math.max(1, Math.floor(boardSize));
  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  return { cols, rows, total: cols * rows, boardSize: size };
}
function clampWaste(ratio) {
  if (!Number.isFinite(ratio)) return DEFAULT_WASTE_RATIO;
  if (ratio < WASTE_RATIO_MIN) return WASTE_RATIO_MIN;
  if (ratio > WASTE_RATIO_MAX) return WASTE_RATIO_MAX;
  return ratio;
}
function formatBomLine(entry) {
  const waste = entry.withWaste !== entry.count ? `\uFF08\u542B\u635F\u8017 ${entry.withWaste}\uFF09` : "";
  return `${entry.code} ${entry.hex} ${entry.count} \u9897${waste}`;
}
function formatBomText(bom) {
  const lines = [
    `\u56FE\u7EB8 ${bom.width}\xD7${bom.height}\uFF5C\u5171 ${bom.totalBeads} \u9897\uFF5C${bom.colorCount} \u4E2A\u8272\u53F7`,
    `\u6309 ${(bom.wasteRatio * 100).toFixed(0)}% \u635F\u8017\u5907\u8C46\uFF1A${bom.totalWithWaste} \u9897`,
    `\u9700\u8981 ${bom.boards.total} \u5757 ${bom.boards.boardSize}\xD7${bom.boards.boardSize} \u677F`,
    ""
  ];
  bom.entries.forEach((e, i) => lines.push(`${i + 1}. ${formatBomLine(e)}`));
  return lines.join("\n");
}
function shortages(bom) {
  return bom.entries.filter((e) => e.shortage > 0).sort((a, b) => b.shortage - a.shortage);
}
function emptyRatio(bom) {
  return bom.totalCells === 0 ? 0 : bom.emptyCells / bom.totalCells;
}
function isEmptyCell(value) {
  return value === EMPTY_CELL;
}

// src/core/image/background.ts
function detectCornerColors(img, sampleSize = 4) {
  const s = Math.max(1, Math.min(sampleSize, Math.floor(Math.min(img.width, img.height) / 2) || 1));
  const spots = [
    { x: 0, y: 0 },
    { x: img.width - s, y: 0 },
    { x: 0, y: img.height - s },
    { x: img.width - s, y: img.height - s }
  ];
  return spots.map(({ x, y }) => averagePatch(img, x, y, s));
}
function averagePatch(img, x0, y0, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = y0; y < y0 + size && y < img.height; y++) {
    for (let x = x0; x < x0 + size && x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      r += img.data[o];
      g += img.data[o + 1];
      b += img.data[o + 2];
      count++;
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return { r: r / count, g: g / count, b: b / count };
}
function withinTolerance(a, r, g, b, tolerance) {
  return Math.abs(a.r - r) <= tolerance && Math.abs(a.g - g) <= tolerance && Math.abs(a.b - b) <= tolerance;
}
function removeBackground(img, options = {}) {
  const tolerance = options.tolerance ?? 32;
  const alphaThreshold = options.alphaThreshold ?? 8;
  const contiguous = options.contiguous ?? true;
  const { width: w, height: h, data } = img;
  const corners = detectCornerColors(img, options.sampleSize ?? 4);
  const n = w * h;
  const mask = new Uint8Array(n).fill(1);
  const isBackgroundCandidate = (p) => {
    const o = p * 4;
    if (data[o + 3] < alphaThreshold) return true;
    for (const c of corners) {
      if (withinTolerance(c, data[o], data[o + 1], data[o + 2], tolerance)) return true;
    }
    return false;
  };
  let removed = 0;
  const mark = (p) => {
    if (mask[p] === 0) return;
    mask[p] = 0;
    removed++;
  };
  if (!contiguous) {
    for (let p = 0; p < n; p++) if (isBackgroundCandidate(p)) mark(p);
    return { mask, corners, removed };
  }
  const stack = [];
  const pushIfCandidate = (p) => {
    if (mask[p] === 1 && isBackgroundCandidate(p)) stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    pushIfCandidate(x);
    pushIfCandidate((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    pushIfCandidate(y * w);
    pushIfCandidate(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    if (mask[p] === 0) continue;
    mark(p);
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) pushIfCandidate(p - 1);
    if (x < w - 1) pushIfCandidate(p + 1);
    if (y > 0) pushIfCandidate(p - w);
    if (y < h - 1) pushIfCandidate(p + w);
  }
  return { mask, corners, removed };
}
function applyMaskToAlpha(img, mask) {
  const out = new Uint8ClampedArray(img.data);
  for (let p = 0; p < img.width * img.height; p++) {
    if (mask[p] === 0) out[p * 4 + 3] = 0;
  }
  return { data: out, width: img.width, height: img.height };
}
function hasRemovedCells(mask) {
  for (let i = 0; i < mask.length; i++) if (mask[i] === 0) return true;
  return false;
}

// src/core/image/transform.ts
function cropImage(img, rect) {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(rect.x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(rect.y)));
  const w = Math.max(1, Math.min(img.width - x0, Math.floor(rect.width)));
  const h = Math.max(1, Math.min(img.height - y0, Math.floor(rect.height)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = ((y + y0) * img.width + x0) * 4;
    out.set(img.data.subarray(srcRow, srcRow + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}
function rotateImage(img, degrees = 90) {
  if (degrees % 360 === 0) return cloneImage(img);
  const { width: w, height: h, data } = img;
  const swap = degrees === 90 || degrees === 270;
  const outW = swap ? h : w;
  const outH = swap ? w : h;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx;
      let ny;
      if (degrees === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (degrees === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      const so = (y * w + x) * 4;
      const to = (ny * outW + nx) * 4;
      out[to] = data[so];
      out[to + 1] = data[so + 1];
      out[to + 2] = data[so + 2];
      out[to + 3] = data[so + 3];
    }
  }
  return { data: out, width: outW, height: outH };
}
function centerSquare(img) {
  const size = Math.min(img.width, img.height);
  if (size === img.width && size === img.height) return img;
  return cropImage(img, {
    x: Math.floor((img.width - size) / 2),
    y: Math.floor((img.height - size) / 2),
    width: size,
    height: size
  });
}

// src/core/image/sample.ts
var HEART_PATCHES = [
  { color: [228, 87, 61], rect: [0.24, 0.26, 0.76, 0.68], round: true },
  { color: [242, 92, 84], rect: [0.32, 0.2, 0.68, 0.34], round: true },
  { color: [255, 224, 214], rect: [0.38, 0.34, 0.46, 0.42], round: true }
];
function createSampleImage(size = 256) {
  const img = createImage(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const t = (x + y) / (size * 2);
      data[o] = 244 + t * 8;
      data[o + 1] = 242 + t * 10;
      data[o + 2] = 236 + t * 12;
      data[o + 3] = 255;
    }
  }
  for (const patch of HEART_PATCHES) {
    const [x0, y0, x1, y1] = patch.rect;
    const px0 = Math.floor(x0 * size);
    const px1 = Math.floor(x1 * size);
    const py0 = Math.floor(y0 * size);
    const py1 = Math.floor(y1 * size);
    for (let y = py0; y < py1; y++) {
      for (let x = px0; x < px1; x++) {
        if (patch.round) {
          const nx = (x - (px0 + px1) / 2) / ((px1 - px0) / 2);
          const ny = (y - (py0 + py1) / 2) / ((py1 - py0) / 2);
          if (nx * nx + ny * ny > 1) continue;
        }
        const o = (y * size + x) * 4;
        data[o] = patch.color[0];
        data[o + 1] = patch.color[1];
        data[o + 2] = patch.color[2];
        data[o + 3] = 255;
      }
    }
  }
  const stroke = Math.max(2, Math.round(size * 0.02));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (d >= stroke) continue;
      const o = (y * size + x) * 4;
      data[o] = 58;
      data[o + 1] = 51;
      data[o + 2] = 45;
      data[o + 3] = 255;
    }
  }
  return img;
}

// src/constants/palettes.ts
var MARD_BRAND_ID = "mard";
var MARD_BRAND_NAME = "\u6469\u8FBE MARD";
var MARD_PALETTE_ID = "mard-v1";
var DEFAULT_PALETTE_ID = MARD_PALETTE_ID;
var MARD_COLORS = [
  { code: "A1", name: "A1", hex: "#FAF4C8", brand: "mard" },
  { code: "A2", name: "A2", hex: "#FFFFD5", brand: "mard" },
  { code: "A3", name: "A3", hex: "#FEFF8B", brand: "mard" },
  { code: "A4", name: "A4", hex: "#FBED56", brand: "mard" },
  { code: "A5", name: "A5", hex: "#F4D738", brand: "mard" },
  { code: "A6", name: "A6", hex: "#FEAC4C", brand: "mard" },
  { code: "A7", name: "A7", hex: "#FE8B4C", brand: "mard" },
  { code: "A8", name: "A8", hex: "#FFDA45", brand: "mard" },
  { code: "A9", name: "A9", hex: "#FF995B", brand: "mard" },
  { code: "A10", name: "A10", hex: "#F77C31", brand: "mard" },
  { code: "A11", name: "A11", hex: "#FFDD99", brand: "mard" },
  { code: "A12", name: "A12", hex: "#FE9F72", brand: "mard" },
  { code: "A13", name: "A13", hex: "#FFC365", brand: "mard" },
  { code: "A14", name: "A14", hex: "#FD543D", brand: "mard" },
  { code: "A15", name: "A15", hex: "#FFF365", brand: "mard" },
  { code: "A16", name: "A16", hex: "#FFFF9F", brand: "mard" },
  { code: "A17", name: "A17", hex: "#FFE36E", brand: "mard" },
  { code: "A18", name: "A18", hex: "#FEBE7D", brand: "mard" },
  { code: "A19", name: "A19", hex: "#FD7C72", brand: "mard" },
  { code: "A20", name: "A20", hex: "#FFD568", brand: "mard" },
  { code: "A21", name: "A21", hex: "#FFE395", brand: "mard" },
  { code: "A22", name: "A22", hex: "#F4F57D", brand: "mard" },
  { code: "A23", name: "A23", hex: "#E6C9B7", brand: "mard" },
  { code: "A24", name: "A24", hex: "#F7F8A2", brand: "mard" },
  { code: "A25", name: "A25", hex: "#FFD67D", brand: "mard" },
  { code: "A26", name: "A26", hex: "#FFC830", brand: "mard" },
  { code: "B1", name: "B1", hex: "#E6EE31", brand: "mard" },
  { code: "B2", name: "B2", hex: "#63F347", brand: "mard" },
  { code: "B3", name: "B3", hex: "#9EF780", brand: "mard" },
  { code: "B4", name: "B4", hex: "#5DE035", brand: "mard" },
  { code: "B5", name: "B5", hex: "#35E352", brand: "mard" },
  { code: "B6", name: "B6", hex: "#65E2A6", brand: "mard" },
  { code: "B7", name: "B7", hex: "#3DAF80", brand: "mard" },
  { code: "B8", name: "B8", hex: "#1C9C4F", brand: "mard" },
  { code: "B9", name: "B9", hex: "#27523A", brand: "mard" },
  { code: "B10", name: "B10", hex: "#95D3C2", brand: "mard" },
  { code: "B11", name: "B11", hex: "#5D722A", brand: "mard" },
  { code: "B12", name: "B12", hex: "#166F41", brand: "mard" },
  { code: "B13", name: "B13", hex: "#CAEB7B", brand: "mard" },
  { code: "B14", name: "B14", hex: "#ADE946", brand: "mard" },
  { code: "B15", name: "B15", hex: "#2E5132", brand: "mard" },
  { code: "B16", name: "B16", hex: "#C5ED9C", brand: "mard" },
  { code: "B17", name: "B17", hex: "#9BB13A", brand: "mard" },
  { code: "B18", name: "B18", hex: "#E6EE49", brand: "mard" },
  { code: "B19", name: "B19", hex: "#24B88C", brand: "mard" },
  { code: "B20", name: "B20", hex: "#C2F0CC", brand: "mard" },
  { code: "B21", name: "B21", hex: "#156A6B", brand: "mard" },
  { code: "B22", name: "B22", hex: "#0B3C43", brand: "mard" },
  { code: "B23", name: "B23", hex: "#303A21", brand: "mard" },
  { code: "B24", name: "B24", hex: "#EEFCA5", brand: "mard" },
  { code: "B25", name: "B25", hex: "#4E846D", brand: "mard" },
  { code: "B26", name: "B26", hex: "#8D7A35", brand: "mard" },
  { code: "B27", name: "B27", hex: "#CCE1AF", brand: "mard" },
  { code: "B28", name: "B28", hex: "#9EE5B9", brand: "mard" },
  { code: "B29", name: "B29", hex: "#C5E254", brand: "mard" },
  { code: "B30", name: "B30", hex: "#E2FCB1", brand: "mard" },
  { code: "B31", name: "B31", hex: "#B0E792", brand: "mard" },
  { code: "B32", name: "B32", hex: "#9CAB5A", brand: "mard" },
  { code: "C1", name: "C1", hex: "#E8FFE7", brand: "mard" },
  { code: "C2", name: "C2", hex: "#A9F9FC", brand: "mard" },
  { code: "C3", name: "C3", hex: "#A0E2FB", brand: "mard" },
  { code: "C4", name: "C4", hex: "#41CCFF", brand: "mard" },
  { code: "C5", name: "C5", hex: "#01ACEB", brand: "mard" },
  { code: "C6", name: "C6", hex: "#50AAF0", brand: "mard" },
  { code: "C7", name: "C7", hex: "#3677D2", brand: "mard" },
  { code: "C8", name: "C8", hex: "#0F54C0", brand: "mard" },
  { code: "C9", name: "C9", hex: "#324BCA", brand: "mard" },
  { code: "C10", name: "C10", hex: "#3EBCE2", brand: "mard" },
  { code: "C11", name: "C11", hex: "#28DDDE", brand: "mard" },
  { code: "C12", name: "C12", hex: "#1C334D", brand: "mard" },
  { code: "C13", name: "C13", hex: "#CDE8FF", brand: "mard" },
  { code: "C14", name: "C14", hex: "#D5FDFF", brand: "mard" },
  { code: "C15", name: "C15", hex: "#22C4C6", brand: "mard" },
  { code: "C16", name: "C16", hex: "#1557A8", brand: "mard" },
  { code: "C17", name: "C17", hex: "#04D1F6", brand: "mard" },
  { code: "C18", name: "C18", hex: "#1D3344", brand: "mard" },
  { code: "C19", name: "C19", hex: "#1887A2", brand: "mard" },
  { code: "C20", name: "C20", hex: "#176DAF", brand: "mard" },
  { code: "C21", name: "C21", hex: "#BEDDFF", brand: "mard" },
  { code: "C22", name: "C22", hex: "#67B4BE", brand: "mard" },
  { code: "C23", name: "C23", hex: "#C8E2FF", brand: "mard" },
  { code: "C24", name: "C24", hex: "#7CC4FF", brand: "mard" },
  { code: "C25", name: "C25", hex: "#A9E5E5", brand: "mard" },
  { code: "C26", name: "C26", hex: "#3CAED8", brand: "mard" },
  { code: "C27", name: "C27", hex: "#D3DFFA", brand: "mard" },
  { code: "C28", name: "C28", hex: "#BBCFED", brand: "mard" },
  { code: "C29", name: "C29", hex: "#34488E", brand: "mard" },
  { code: "D1", name: "D1", hex: "#AEB4F2", brand: "mard" },
  { code: "D2", name: "D2", hex: "#858EDD", brand: "mard" },
  { code: "D3", name: "D3", hex: "#2F54AF", brand: "mard" },
  { code: "D4", name: "D4", hex: "#182A84", brand: "mard" },
  { code: "D5", name: "D5", hex: "#B843C5", brand: "mard" },
  { code: "D6", name: "D6", hex: "#AC7BDE", brand: "mard" },
  { code: "D7", name: "D7", hex: "#8854B3", brand: "mard" },
  { code: "D8", name: "D8", hex: "#E2D3FF", brand: "mard" },
  { code: "D9", name: "D9", hex: "#D5B9F8", brand: "mard" },
  { code: "D10", name: "D10", hex: "#361851", brand: "mard" },
  { code: "D11", name: "D11", hex: "#B9BAE1", brand: "mard" },
  { code: "D12", name: "D12", hex: "#DE9AD4", brand: "mard" },
  { code: "D13", name: "D13", hex: "#B90095", brand: "mard" },
  { code: "D14", name: "D14", hex: "#8B279B", brand: "mard" },
  { code: "D15", name: "D15", hex: "#2F1F90", brand: "mard" },
  { code: "D16", name: "D16", hex: "#E3E1EE", brand: "mard" },
  { code: "D17", name: "D17", hex: "#C4D4F6", brand: "mard" },
  { code: "D18", name: "D18", hex: "#A45EC7", brand: "mard" },
  { code: "D19", name: "D19", hex: "#D8C3D7", brand: "mard" },
  { code: "D20", name: "D20", hex: "#9C32B2", brand: "mard" },
  { code: "D21", name: "D21", hex: "#9A009B", brand: "mard" },
  { code: "D22", name: "D22", hex: "#333A95", brand: "mard" },
  { code: "D23", name: "D23", hex: "#EBDAFC", brand: "mard" },
  { code: "D24", name: "D24", hex: "#7786E5", brand: "mard" },
  { code: "D25", name: "D25", hex: "#494FC7", brand: "mard" },
  { code: "D26", name: "D26", hex: "#DFC2F8", brand: "mard" },
  { code: "E1", name: "E1", hex: "#FDD3CC", brand: "mard" },
  { code: "E2", name: "E2", hex: "#FEC0DF", brand: "mard" },
  { code: "E3", name: "E3", hex: "#FFB7E7", brand: "mard" },
  { code: "E4", name: "E4", hex: "#E8649E", brand: "mard" },
  { code: "E5", name: "E5", hex: "#F551A2", brand: "mard" },
  { code: "E6", name: "E6", hex: "#F13D74", brand: "mard" },
  { code: "E7", name: "E7", hex: "#C63478", brand: "mard" },
  { code: "E8", name: "E8", hex: "#FFDBE9", brand: "mard" },
  { code: "E9", name: "E9", hex: "#E970CC", brand: "mard" },
  { code: "E10", name: "E10", hex: "#D33793", brand: "mard" },
  { code: "E11", name: "E11", hex: "#FCDDD2", brand: "mard" },
  { code: "E12", name: "E12", hex: "#F78FC3", brand: "mard" },
  { code: "E13", name: "E13", hex: "#B5006D", brand: "mard" },
  { code: "E14", name: "E14", hex: "#FFD1BA", brand: "mard" },
  { code: "E15", name: "E15", hex: "#F8C7C9", brand: "mard" },
  { code: "E16", name: "E16", hex: "#FFF3EB", brand: "mard" },
  { code: "E17", name: "E17", hex: "#FFE2EA", brand: "mard" },
  { code: "E18", name: "E18", hex: "#FFC7DB", brand: "mard" },
  { code: "E19", name: "E19", hex: "#FEBAD5", brand: "mard" },
  { code: "E20", name: "E20", hex: "#D8C7D1", brand: "mard" },
  { code: "E21", name: "E21", hex: "#BD9DA1", brand: "mard" },
  { code: "E22", name: "E22", hex: "#B785A1", brand: "mard" },
  { code: "E23", name: "E23", hex: "#937A8D", brand: "mard" },
  { code: "E24", name: "E24", hex: "#E1BCE8", brand: "mard" },
  { code: "F1", name: "F1", hex: "#FD957B", brand: "mard" },
  { code: "F2", name: "F2", hex: "#FC3D46", brand: "mard" },
  { code: "F3", name: "F3", hex: "#F74941", brand: "mard" },
  { code: "F4", name: "F4", hex: "#FC283C", brand: "mard" },
  { code: "F5", name: "F5", hex: "#E7002F", brand: "mard" },
  { code: "F6", name: "F6", hex: "#943630", brand: "mard" },
  { code: "F7", name: "F7", hex: "#971937", brand: "mard" },
  { code: "F8", name: "F8", hex: "#BC0028", brand: "mard" },
  { code: "F9", name: "F9", hex: "#E2677A", brand: "mard" },
  { code: "F10", name: "F10", hex: "#8A4526", brand: "mard" },
  { code: "F11", name: "F11", hex: "#5A2121", brand: "mard" },
  { code: "F12", name: "F12", hex: "#FD4E6A", brand: "mard" },
  { code: "F13", name: "F13", hex: "#F35744", brand: "mard" },
  { code: "F14", name: "F14", hex: "#FFA9AD", brand: "mard" },
  { code: "F15", name: "F15", hex: "#D30022", brand: "mard" },
  { code: "F16", name: "F16", hex: "#FEC2A6", brand: "mard" },
  { code: "F17", name: "F17", hex: "#E69C79", brand: "mard" },
  { code: "F18", name: "F18", hex: "#D37C46", brand: "mard" },
  { code: "F19", name: "F19", hex: "#C1444A", brand: "mard" },
  { code: "F20", name: "F20", hex: "#CD9391", brand: "mard" },
  { code: "F21", name: "F21", hex: "#F7B4C6", brand: "mard" },
  { code: "F22", name: "F22", hex: "#FDC0D0", brand: "mard" },
  { code: "F23", name: "F23", hex: "#F67E66", brand: "mard" },
  { code: "F24", name: "F24", hex: "#E698AA", brand: "mard" },
  { code: "F25", name: "F25", hex: "#E54B4F", brand: "mard" },
  { code: "G1", name: "G1", hex: "#FFE2CE", brand: "mard" },
  { code: "G2", name: "G2", hex: "#FFC4AA", brand: "mard" },
  { code: "G3", name: "G3", hex: "#F4C3A5", brand: "mard" },
  { code: "G4", name: "G4", hex: "#E1B383", brand: "mard" },
  { code: "G5", name: "G5", hex: "#EDB045", brand: "mard" },
  { code: "G6", name: "G6", hex: "#E99C17", brand: "mard" },
  { code: "G7", name: "G7", hex: "#9D5B3E", brand: "mard" },
  { code: "G8", name: "G8", hex: "#753832", brand: "mard" },
  { code: "G9", name: "G9", hex: "#E6B483", brand: "mard" },
  { code: "G10", name: "G10", hex: "#D98C39", brand: "mard" },
  { code: "G11", name: "G11", hex: "#E0C593", brand: "mard" },
  { code: "G12", name: "G12", hex: "#FFC890", brand: "mard" },
  { code: "G13", name: "G13", hex: "#B7714A", brand: "mard" },
  { code: "G14", name: "G14", hex: "#8D614C", brand: "mard" },
  { code: "G15", name: "G15", hex: "#FCF9E0", brand: "mard" },
  { code: "G16", name: "G16", hex: "#F2D9BA", brand: "mard" },
  { code: "G17", name: "G17", hex: "#78524B", brand: "mard" },
  { code: "G18", name: "G18", hex: "#FFE4CC", brand: "mard" },
  { code: "G19", name: "G19", hex: "#E07935", brand: "mard" },
  { code: "G20", name: "G20", hex: "#A94023", brand: "mard" },
  { code: "G21", name: "G21", hex: "#B88558", brand: "mard" },
  { code: "H1", name: "H1", hex: "#FDFBFF", brand: "mard" },
  { code: "H2", name: "H2", hex: "#FEFFFF", brand: "mard" },
  { code: "H3", name: "H3", hex: "#B6B1BA", brand: "mard" },
  { code: "H4", name: "H4", hex: "#89858C", brand: "mard" },
  { code: "H5", name: "H5", hex: "#48464E", brand: "mard" },
  { code: "H6", name: "H6", hex: "#2F2B2F", brand: "mard" },
  { code: "H7", name: "H7", hex: "#000000", brand: "mard" },
  { code: "H8", name: "H8", hex: "#E7D6DB", brand: "mard" },
  { code: "H9", name: "H9", hex: "#EDEDED", brand: "mard" },
  { code: "H10", name: "H10", hex: "#EEE9EA", brand: "mard" },
  { code: "H11", name: "H11", hex: "#CECDD5", brand: "mard" },
  { code: "H12", name: "H12", hex: "#FFF5ED", brand: "mard" },
  { code: "H13", name: "H13", hex: "#F5ECD2", brand: "mard" },
  { code: "H14", name: "H14", hex: "#CFD7D3", brand: "mard" },
  { code: "H15", name: "H15", hex: "#98A6A8", brand: "mard" },
  { code: "H16", name: "H16", hex: "#1D1414", brand: "mard" },
  { code: "H17", name: "H17", hex: "#F1EDED", brand: "mard" },
  { code: "H18", name: "H18", hex: "#FFFDF0", brand: "mard" },
  { code: "H19", name: "H19", hex: "#F6EFE2", brand: "mard" },
  { code: "H20", name: "H20", hex: "#949FA3", brand: "mard" },
  { code: "H21", name: "H21", hex: "#FFFBE1", brand: "mard" },
  { code: "H22", name: "H22", hex: "#CACAD4", brand: "mard" },
  { code: "H23", name: "H23", hex: "#9A9D94", brand: "mard" },
  { code: "M1", name: "M1", hex: "#BCC6B8", brand: "mard" },
  { code: "M2", name: "M2", hex: "#8AA386", brand: "mard" },
  { code: "M3", name: "M3", hex: "#697D80", brand: "mard" },
  { code: "M4", name: "M4", hex: "#E3D2BC", brand: "mard" },
  { code: "M5", name: "M5", hex: "#D0CCAA", brand: "mard" },
  { code: "M6", name: "M6", hex: "#B0A782", brand: "mard" },
  { code: "M7", name: "M7", hex: "#B4A497", brand: "mard" },
  { code: "M8", name: "M8", hex: "#B38281", brand: "mard" },
  { code: "M9", name: "M9", hex: "#A58767", brand: "mard" },
  { code: "M10", name: "M10", hex: "#C5B2BC", brand: "mard" },
  { code: "M11", name: "M11", hex: "#9F7594", brand: "mard" },
  { code: "M12", name: "M12", hex: "#644749", brand: "mard" },
  { code: "M13", name: "M13", hex: "#D19066", brand: "mard" },
  { code: "M14", name: "M14", hex: "#C77362", brand: "mard" },
  { code: "M15", name: "M15", hex: "#757D78", brand: "mard" },
  { code: "P1", name: "P1", hex: "#FCF7F8", brand: "mard" },
  { code: "P2", name: "P2", hex: "#B0A9AC", brand: "mard" },
  { code: "P3", name: "P3", hex: "#AFDCAB", brand: "mard" },
  { code: "P4", name: "P4", hex: "#FEA49F", brand: "mard" },
  { code: "P5", name: "P5", hex: "#EE8C3E", brand: "mard" },
  { code: "P6", name: "P6", hex: "#5FD0A7", brand: "mard" },
  { code: "P7", name: "P7", hex: "#EB9270", brand: "mard" },
  { code: "P8", name: "P8", hex: "#F0D958", brand: "mard" },
  { code: "P9", name: "P9", hex: "#D9D9D9", brand: "mard" },
  { code: "P10", name: "P10", hex: "#D9C7EA", brand: "mard" },
  { code: "P11", name: "P11", hex: "#F3ECC9", brand: "mard" },
  { code: "P12", name: "P12", hex: "#E6EEF2", brand: "mard" },
  { code: "P13", name: "P13", hex: "#AACBEF", brand: "mard" },
  { code: "P14", name: "P14", hex: "#337680", brand: "mard" },
  { code: "P15", name: "P15", hex: "#668575", brand: "mard" },
  { code: "P16", name: "P16", hex: "#FEBF45", brand: "mard" },
  { code: "P17", name: "P17", hex: "#FEA324", brand: "mard" },
  { code: "P18", name: "P18", hex: "#FEB89F", brand: "mard" },
  { code: "P19", name: "P19", hex: "#FFFEEC", brand: "mard" },
  { code: "P20", name: "P20", hex: "#FEBECF", brand: "mard" },
  { code: "P21", name: "P21", hex: "#ECBEBF", brand: "mard" },
  { code: "P22", name: "P22", hex: "#E4A89F", brand: "mard" },
  { code: "P23", name: "P23", hex: "#A56268", brand: "mard" },
  { code: "Q1", name: "Q1", hex: "#F2A5E8", brand: "mard" },
  { code: "Q2", name: "Q2", hex: "#E9EC91", brand: "mard" },
  { code: "Q3", name: "Q3", hex: "#FFFF00", brand: "mard" },
  { code: "Q4", name: "Q4", hex: "#FFEBFA", brand: "mard" },
  { code: "Q5", name: "Q5", hex: "#76CEDE", brand: "mard" },
  { code: "R1", name: "R1", hex: "#D50D21", brand: "mard" },
  { code: "R2", name: "R2", hex: "#F92F83", brand: "mard" },
  { code: "R3", name: "R3", hex: "#FD8324", brand: "mard" },
  { code: "R4", name: "R4", hex: "#F8EC31", brand: "mard" },
  { code: "R5", name: "R5", hex: "#35C75B", brand: "mard" },
  { code: "R6", name: "R6", hex: "#238891", brand: "mard" },
  { code: "R7", name: "R7", hex: "#19779D", brand: "mard" },
  { code: "R8", name: "R8", hex: "#1A60C3", brand: "mard" },
  { code: "R9", name: "R9", hex: "#9A56B4", brand: "mard" },
  { code: "R10", name: "R10", hex: "#FFDB4C", brand: "mard" },
  { code: "R11", name: "R11", hex: "#FFEBFA", brand: "mard" },
  { code: "R12", name: "R12", hex: "#D8D5CE", brand: "mard" },
  { code: "R13", name: "R13", hex: "#55514C", brand: "mard" },
  { code: "R14", name: "R14", hex: "#9FE4DF", brand: "mard" },
  { code: "R15", name: "R15", hex: "#77CEE9", brand: "mard" },
  { code: "R16", name: "R16", hex: "#3ECFCA", brand: "mard" },
  { code: "R17", name: "R17", hex: "#4A867A", brand: "mard" },
  { code: "R18", name: "R18", hex: "#7FCD9D", brand: "mard" },
  { code: "R19", name: "R19", hex: "#CDE55D", brand: "mard" },
  { code: "R20", name: "R20", hex: "#E8C7B4", brand: "mard" },
  { code: "R21", name: "R21", hex: "#AD6F3C", brand: "mard" },
  { code: "R22", name: "R22", hex: "#6C372F", brand: "mard" },
  { code: "R23", name: "R23", hex: "#FEB872", brand: "mard" },
  { code: "R24", name: "R24", hex: "#F3C1C0", brand: "mard" },
  { code: "R25", name: "R25", hex: "#C9675E", brand: "mard" },
  { code: "R26", name: "R26", hex: "#D293BE", brand: "mard" },
  { code: "R27", name: "R27", hex: "#EA8CB1", brand: "mard" },
  { code: "R28", name: "R28", hex: "#9C87D6", brand: "mard" },
  { code: "T1", name: "T1", hex: "#FFFFFF", brand: "mard" },
  { code: "Y1", name: "Y1", hex: "#FD6FB4", brand: "mard" },
  { code: "Y2", name: "Y2", hex: "#FEB481", brand: "mard" },
  { code: "Y3", name: "Y3", hex: "#D7FAA0", brand: "mard" },
  { code: "Y4", name: "Y4", hex: "#8BDBFA", brand: "mard" },
  { code: "Y5", name: "Y5", hex: "#E987EA", brand: "mard" },
  { code: "ZG1", name: "ZG1", hex: "#DAABB3", brand: "mard" },
  { code: "ZG2", name: "ZG2", hex: "#D6AA87", brand: "mard" },
  { code: "ZG3", name: "ZG3", hex: "#C1BD8D", brand: "mard" },
  { code: "ZG4", name: "ZG4", hex: "#96869F", brand: "mard" },
  { code: "ZG5", name: "ZG5", hex: "#8490A6", brand: "mard" },
  { code: "ZG6", name: "ZG6", hex: "#94BFE2", brand: "mard" },
  { code: "ZG7", name: "ZG7", hex: "#E2A9D2", brand: "mard" },
  { code: "ZG8", name: "ZG8", hex: "#AB91C0", brand: "mard" }
];
var PALETTES = {
  [MARD_PALETTE_ID]: {
    id: MARD_PALETTE_ID,
    brandId: MARD_BRAND_ID,
    brandName: MARD_BRAND_NAME,
    name: "MARD 291 \u8272",
    version: 1,
    colors: MARD_COLORS
  }
};
function getPalette(paletteId = DEFAULT_PALETTE_ID) {
  return PALETTES[paletteId] || PALETTES[DEFAULT_PALETTE_ID];
}
function getPaletteColors(paletteId) {
  return getPalette(paletteId).colors;
}

// src/core/pipeline.ts
var now = () => typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
function buildPatternFromImage(image, options) {
  const { width: gridW, height: gridH } = resolveGrid(options.grid);
  assertPatternSize(gridW, gridH);
  const paletteId = options.paletteId ?? DEFAULT_PALETTE_ID;
  const palette = options.palette ?? getPaletteColors(paletteId);
  const emptyAlphaThreshold = options.emptyAlphaThreshold ?? 96;
  const colorCount = Math.max(1, Math.floor(options.colorCount ?? 16));
  const steps = [];
  const startedAt = now();
  const step = (name, fn) => {
    const t0 = now();
    const result = fn();
    steps.push({ name, ms: round2(now() - t0) });
    return result;
  };
  let source = step("\u88C1\u526A/\u65CB\u8F6C", () => {
    let img = image;
    if (options.rotate) img = rotateImage(img, options.rotate);
    const crop = options.crop ?? "center-square";
    if (crop === "center-square") img = centerSquare(img);
    else if (crop !== "none") img = cropImage(img, crop);
    return img;
  });
  let background;
  if (options.removeBackground ?? true) {
    const result = step("\u80CC\u666F\u53BB\u9664", () => removeBackground(source, { tolerance: options.backgroundTolerance ?? 32 }));
    source = applyMaskToAlpha(source, result.mask);
    const total = source.width * source.height;
    background = { cornerColors: result.corners, removedRatio: total ? result.removed / total : 0 };
  }
  const gridImage = step("\u4E0B\u91C7\u6837", () => {
    const maxSize = options.sourceMaxSize ?? 1024;
    const longest = Math.max(source.width, source.height);
    const pre = longest > maxSize * 2 ? downscaleToMax(source, maxSize) : source;
    return downscaleBox(pre, gridW, gridH);
  });
  const anchors = step("\u4E3B\u8272\u63D0\u53D6", () => medianCut(gridImage, colorCount));
  if (anchors.length === 0) {
    steps.push({ name: "\u989C\u8272\u6620\u5C04", ms: 0 }, { name: "\u6296\u52A8", ms: 0 });
    const empty = createPattern(gridW, gridH, paletteId, EMPTY_CELL, options.id);
    return {
      pattern: empty,
      anchors: [],
      usedColorIndices: [],
      background,
      steps,
      timingMs: round2(now() - startedAt),
      title: options.title
    };
  }
  const matcher = getMatcher(paletteId, palette);
  const paletteOfAnchor = step("\u989C\u8272\u6620\u5C04", () => anchorsToPaletteIndices(anchors, matcher));
  const anchorIndex = step(
    options.dither ? "\u6296\u52A8" : "\u989C\u8272\u6620\u5C04",
    () => options.dither ? ditherToAnchors(gridImage, anchors, { strength: options.ditherStrength ?? 1, alphaThreshold: emptyAlphaThreshold }) : mapPixelsToAnchors(gridImage, anchors, { alphaThreshold: emptyAlphaThreshold })
  );
  const cells = applyAnchorPalette(anchorIndex, paletteOfAnchor);
  const pattern = {
    ...createPattern(gridW, gridH, paletteId, EMPTY_CELL, options.id),
    cells: Array.from(cells)
  };
  return {
    pattern,
    anchors,
    usedColorIndices: usedColorIndices(pattern),
    background,
    steps,
    timingMs: round2(now() - startedAt),
    title: options.title
  };
}
function buildPatternFromRawRgba(input, options) {
  return buildPatternFromImage({ data: input.data, width: input.width, height: input.height }, options);
}
var BOARD_PRESETS = {
  small: 29,
  medium: 52,
  large: 96
};
function resolveGrid(grid) {
  if (typeof grid === "number") {
    const size = Math.max(1, Math.floor(grid));
    return { width: size, height: size };
  }
  return { width: Math.max(1, Math.floor(grid.width)), height: Math.max(1, Math.floor(grid.height)) };
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
export {
  BOARD_PRESETS,
  D65_WHITE,
  DEFAULT_BOARD_SIZE,
  DEFAULT_WASTE_RATIO,
  EMPTY_CELL,
  MAX_DIMENSION,
  PATTERN_VERSION,
  PaletteMatcher,
  WASTE_RATIO_MAX,
  WASTE_RATIO_MIN,
  anchorDistance,
  anchorsToPaletteIndices,
  applyAnchorPalette,
  applyAnchorPaletteInPlace,
  applyMaskToAlpha,
  assertPatternSize,
  boardLayout,
  buildLabIndex,
  buildPatternFromImage,
  buildPatternFromRawRgba,
  cellsFromRuns,
  centerSquare,
  clampByte,
  clampWaste,
  clearCells,
  clearMatcherCache,
  cloneImage,
  clonePattern,
  computeBom,
  countFilled,
  createImage,
  createPattern,
  createPatternId,
  createSampleImage,
  cropImage,
  cropPattern,
  decodeRle,
  decodeRuns,
  deltaE2000,
  deltaE2000Weighted,
  deltaE76,
  deserializePattern,
  detectCornerColors,
  ditherToAnchors,
  downscaleBox,
  downscaleToMax,
  emptyRatio,
  encodeRle,
  floodFill,
  formatBomLine,
  formatBomText,
  getCell,
  getMatcher,
  hasRemovedCells,
  hexToRgb,
  index2d,
  isEmptyCell,
  isInside,
  labToRgb,
  labToXyz,
  lineIndices,
  linearChannelToSrgb,
  mapPixelsToAnchors,
  mapPixelsToPalette,
  medianCut,
  nearestColorIndex,
  nearestLabIndex,
  nearestLabIndexFast,
  paintCells,
  patternMeta,
  removeBackground,
  replaceColor,
  resizePattern,
  resolveGrid,
  rgbDistance,
  rgbToHex,
  rgbToLab,
  rgbToXyz,
  rleRatio,
  rotateImage,
  runsOf,
  serializePattern,
  setCell,
  shortages,
  srgbChannelToLinear,
  srgbToLinear,
  toCellArray,
  toInt16,
  usedColorIndices,
  xyzToLab
};
