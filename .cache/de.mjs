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
export {
  deltaE2000,
  deltaE2000Weighted,
  deltaE76,
  rgbDistance
};
