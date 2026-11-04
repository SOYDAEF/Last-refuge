/* Last Refuge - arte en píxeles generado por código (sin archivos de imagen). Todo se guarda en caché. */
"use strict";

const ART = (() => {
  const T = 32;
  const cache = new Map();
  function surf(w = T, h = T) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    c.g = g;
    return c;
  }
  const css = c => c.length > 3 ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : `rgb(${c[0]},${c[1]},${c[2]})`;
  function R(s, x0, y0, x1, y1, c) {                   // rectángulo (coordenadas incluidas)
    if (x1 >= x0 && y1 >= y0) { s.g.fillStyle = css(c); s.g.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1); }
  }
  function P(s, x, y, c) { if (x >= 0 && y >= 0 && x < s.width && y < s.height) { s.g.fillStyle = css(c); s.g.fillRect(x, y, 1, 1); } }
  function circle(s, cx, cy, r, c) {
    s.g.fillStyle = css(c);
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      s.g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function ellipse(s, x, y, w, h, c) {
    s.g.fillStyle = css(c);
    const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    for (let yy = 0; yy < h; yy++) {
      const dy = (yy + 0.5 - ry) / ry;
      const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      s.g.fillRect(Math.round(cx - half), y + yy, Math.round(half * 2), 1);
    }
  }
  const sh = (c, f) => [clamp(c[0] * f, 0, 255) | 0, clamp(c[1] * f, 0, 255) | 0, clamp(c[2] * f, 0, 255) | 0];
  const jit = (rng, c, a = 8) => { const k = rng.randint(-a, a); return [clamp(c[0] + k, 0, 255), clamp(c[1] + k, 0, 255), clamp(c[2] + k, 0, 255)]; };
  function cached(key, make) { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; }
  function copy(src) { const s = surf(src.width, src.height); s.g.drawImage(src, 0, 0); return s; }
  function noiseFill(s, rng, base, a) {               // relleno píxel a píxel con variación
    const img = s.g.getImageData(0, 0, s.width, s.height);
    for (let i = 0; i < s.width * s.height; i++) {
      const c = jit(rng, base, a);
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    s.g.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------------ suelos
  function grass(v) {
    return cached("grass" + v, () => {
      const rng = new RNG(100 + v), s = surf();
      noiseFill(s, rng, [78, 126, 62], 7);
      for (let i = 0; i < 9; i++) {
        const x = rng.randint(1, 30), y = rng.randint(3, 30);
        P(s, x, y, [104, 156, 76]); P(s, x, y - 1, [110, 162, 80]); P(s, x + 1, y, [60, 104, 52]);
      }
      if (v % 3 === 0) P(s, rng.randint(3, 28), rng.randint(3, 28), rng.choice([[240, 230, 120], [240, 240, 240], [230, 130, 150]]));
      return s;
    });
  }
  function water(v) {
    return cached("water" + v, () => {
      const rng = new RNG(200 + v), s = surf();
      noiseFill(s, rng, [46, 96, 162], 6);
      for (let i = 0; i < 3; i++) { const x = rng.randint(2, 20), y = rng.randint(3, 28); R(s, x, y, x + rng.randint(3, 8), y, [112, 170, 228]); }
      return s;
    });
  }
  function road(v, dash) {
    return cached("road" + v + dash, () => {
      const rng = new RNG(300 + v), s = surf();
      noiseFill(s, rng, [72, 74, 82], 5);
      for (let i = 0; i < 12; i++) P(s, rng.randint(0, 31), rng.randint(0, 31), [58, 60, 66]);
      if (dash === "h") R(s, 4, 15, 21, 16, [214, 192, 96]);
      else if (dash === "v") R(s, 15, 4, 16, 21, [214, 192, 96]);
      return s;
    });
  }
  function floor(v) {
    return cached("floor" + v, () => {
      const rng = new RNG(400 + v), s = surf(), base = [160, 112, 70];
      for (let p = 0; p < 4; p++) {
        const tone = jit(rng, base, 10);
        R(s, 0, p * 8, 31, p * 8 + 7, tone);
        R(s, 0, p * 8, 31, p * 8, sh(tone, 0.72));
        const jx = (v * 11 + p * 9) % 28 + 2;
        R(s, jx, p * 8, jx, p * 8 + 7, sh(tone, 0.72));
        for (let i = 0; i < 3; i++) P(s, rng.randint(0, 31), p * 8 + rng.randint(1, 6), sh(tone, 0.88));
      }
      return s;
    });
  }
  function doorOpen(v) {
    return cached("dopen" + v, () => {
      const s = copy(floor(v));
      R(s, 1, 2, 7, 29, [96, 62, 36]); R(s, 2, 3, 6, 28, [138, 92, 52]); R(s, 2, 3, 2, 28, [176, 124, 72]); R(s, 5, 14, 5, 17, [232, 196, 90]);
      return s;
    });
  }
  function shadowTop() {
    return cached("shtop", () => {
      const s = surf(T, 8);
      [110, 85, 60, 40, 24, 12].forEach((a, i) => R(s, 0, i, 31, i, [0, 0, 0, a]));
      return s;
    });
  }
  // ------------------------------------------------------------------ paredes
  function wall(face, win, door, v) {
    return cached("wall" + (face | 0) + (win | 0) + (door | 0) + v, () => {
      const rng = new RNG(500 + v), s = surf(), cap = [104, 76, 58];
      if (!face) {
        R(s, 0, 0, 31, 31, cap);
        for (let y = 0; y < 32; y += 8) R(s, 0, y, 31, y, sh(cap, 0.85));
        R(s, 0, 0, 31, 0, [146, 112, 84]); R(s, 0, 0, 0, 31, [128, 96, 72]); R(s, 31, 0, 31, 31, [76, 54, 42]);
        for (let i = 0; i < 10; i++) P(s, rng.randint(1, 30), rng.randint(1, 30), sh(cap, 0.9));
        if (win) { R(s, 6, 11, 25, 20, [226, 224, 214]); R(s, 8, 13, 23, 18, [92, 134, 168]); R(s, 9, 14, 13, 14, [170, 208, 230]); }
        else if (door) { R(s, 4, 4, 27, 27, [96, 62, 36]); R(s, 6, 6, 25, 25, [140, 92, 52]); R(s, 15, 6, 16, 25, [96, 62, 36]); R(s, 21, 15, 23, 17, [232, 196, 90]); }
        return s;
      }
      const capH = 10;
      R(s, 0, 0, 31, capH - 1, cap); R(s, 0, 0, 31, 0, [146, 112, 84]); R(s, 0, capH - 1, 31, capH - 1, [70, 50, 40]);
      for (let x = 0; x < 32; x += 6) P(s, x, 4, [88, 64, 50]);
      for (let r = 0; r < 5; r++) {
        const yy = capH + r * 4, off = r % 2 ? 4 : 0;
        for (let b = -1; b < 5; b++) {
          const bx = off + b * 8, tone = jit(rng, [158, 78, 60], 14);
          const xa = Math.max(0, bx + 1), xb = Math.min(31, bx + 7);
          if (xb >= xa) { R(s, xa, yy, xb, yy + 2, tone); R(s, xa, yy, xb, yy, sh(tone, 1.15)); R(s, xa, yy + 2, xb, yy + 2, sh(tone, 0.8)); }
        }
        R(s, 0, yy + 3, 31, yy + 3, [176, 164, 148]);
      }
      R(s, 0, 30, 31, 31, [96, 44, 36]);
      if (win) {
        R(s, 6, capH + 2, 25, 27, [226, 224, 214]); R(s, 8, capH + 4, 23, 25, [92, 134, 168]);
        for (let i = 0; i < 6; i++) { P(s, 9 + i * 2, capH + 5 + i, [170, 208, 230]); P(s, 10 + i * 2, capH + 5 + i, [170, 208, 230]); }
        R(s, 15, capH + 4, 16, 25, [226, 224, 214]); R(s, 8, 15, 23, 16, [226, 224, 214]); R(s, 5, 27, 26, 29, [190, 186, 176]);
      }
      if (door) {
        R(s, 4, 2, 27, 31, [96, 62, 36]); R(s, 6, 4, 25, 31, [140, 92, 52]);
        for (const yy of [8, 19]) { R(s, 9, yy, 22, yy + 8, [120, 78, 42]); R(s, 9, yy, 22, yy, [88, 56, 30]); }
        R(s, 21, 17, 23, 19, [232, 196, 90]);
      }
      return s;
    });
  }
  function tree(v) {
    return cached("tree" + v, () => {
      const rng = new RNG(600 + v), s = copy(grass(v));
      ellipse(s, 6, 20, 24, 10, [0, 0, 0, 70]);
      R(s, 14, 18, 18, 29, [96, 64, 40]); R(s, 14, 18, 15, 29, [70, 46, 30]); R(s, 17, 18, 18, 29, [118, 80, 50]);
      for (const [cx, cy, r, col] of [[16, 14, 12, [36, 92, 46]], [9, 17, 7, [40, 100, 50]], [23, 17, 7, [34, 86, 44]], [16, 8, 8, [52, 120, 60]], [12, 9, 4, [66, 142, 72]]])
        circle(s, cx, cy, r, col);
      for (let i = 0; i < 30; i++) {
        const a = rng.random() * TAU, rr = rng.random() * 11;
        P(s, 16 + Math.floor(Math.cos(a) * rr), 12 + Math.floor(Math.sin(a) * rr * 0.8), rng.choice([[84, 168, 86], [30, 76, 40], [96, 180, 90]]));
      }
      return s;
    });
  }
  // ------------------------------------------------------------------ muebles
  function cont(kind, looted, v) {
    return cached("cont" + kind + (looted | 0) + v, () => {
      const s = copy(floor(v));
      R(s, 3, 27, 30, 30, [0, 0, 0, 60]);
      const rng = new RNG(700 + v);
      if (kind === "fridge") {
        R(s, 4, 2, 27, 29, [210, 214, 220]); R(s, 4, 2, 27, 9, [234, 238, 242]); R(s, 4, 2, 27, 2, [255, 255, 255]);
        R(s, 4, 10, 27, 10, [130, 134, 142]); R(s, 23, 4, 24, 8, [110, 114, 122]); R(s, 23, 13, 24, 22, [110, 114, 122]); R(s, 4, 26, 27, 29, [170, 174, 182]);
      } else if (kind === "shelf") {
        R(s, 2, 3, 29, 29, [112, 76, 48]); R(s, 2, 3, 29, 4, [150, 104, 66]);
        for (const ys of [6, 16]) {
          R(s, 4, ys, 27, ys + 8, [66, 44, 30]);
          for (let i = 0; i < 5; i++) {
            const col = rng.choice([[210, 70, 60], [230, 190, 70], [90, 150, 210], [230, 230, 230], [110, 190, 100]]);
            R(s, 5 + i * 5, ys + 2, 8 + i * 5, ys + 8, col); R(s, 5 + i * 5, ys + 2, 8 + i * 5, ys + 2, sh(col, 1.25));
          }
          R(s, 2, ys + 9, 29, ys + 10, [140, 96, 60]);
        }
      } else if (kind === "wardrobe") {
        R(s, 3, 1, 28, 29, [90, 58, 38]); R(s, 3, 1, 28, 2, [130, 88, 58]); R(s, 5, 4, 15, 27, [110, 72, 46]); R(s, 16, 4, 26, 27, [110, 72, 46]);
        R(s, 15, 4, 15, 27, [60, 38, 24]); R(s, 13, 14, 14, 17, [232, 196, 90]); R(s, 17, 14, 18, 17, [232, 196, 90]);
      } else if (kind === "counter") {
        R(s, 1, 6, 30, 29, [150, 140, 120]); R(s, 1, 6, 30, 12, [200, 192, 172]); R(s, 1, 6, 30, 6, [232, 226, 208]);
        R(s, 1, 12, 30, 12, [110, 102, 88]); R(s, 6, 16, 12, 24, [130, 120, 100]); R(s, 19, 16, 25, 24, [130, 120, 100]);
      } else if (kind === "cabinet") {
        R(s, 4, 2, 27, 29, [118, 124, 136]); R(s, 4, 2, 27, 3, [164, 170, 182]);
        for (const ys of [5, 12, 19]) { R(s, 6, ys, 25, ys + 5, [96, 102, 114]); R(s, 14, ys + 2, 17, ys + 3, [210, 214, 224]); }
      } else if (kind === "chest") {
        R(s, 3, 8, 28, 28, [150, 104, 52]); R(s, 3, 8, 28, 13, [186, 134, 74]); R(s, 3, 8, 28, 8, [214, 164, 96]);
        R(s, 3, 18, 28, 19, [70, 70, 78]); R(s, 14, 15, 17, 22, [232, 196, 90]);
      } else if (kind === "toolbox") {
        R(s, 3, 10, 28, 28, [190, 62, 52]); R(s, 3, 10, 28, 14, [224, 92, 78]); R(s, 3, 10, 28, 10, [244, 130, 116]);
        R(s, 9, 6, 22, 8, [60, 60, 66]); R(s, 9, 6, 10, 10, [60, 60, 66]); R(s, 21, 6, 22, 10, [60, 60, 66]); R(s, 13, 18, 18, 21, [232, 196, 90]);
      } else if (kind === "gunrack") {
        R(s, 2, 3, 29, 29, [66, 78, 58]); R(s, 2, 3, 29, 4, [100, 116, 86]);
        for (let i = 0; i < 4; i++) { R(s, 6 + i * 6, 7, 7 + i * 6, 24, [36, 36, 40]); R(s, 5 + i * 6, 22, 8 + i * 6, 25, [110, 76, 44]); }
      } else if (kind === "medcab") {
        R(s, 4, 2, 27, 29, [236, 242, 246]); R(s, 4, 2, 27, 3, [255, 255, 255]); R(s, 4, 28, 27, 29, [176, 184, 192]);
        R(s, 14, 9, 17, 22, [214, 52, 52]); R(s, 9, 14, 22, 17, [214, 52, 52]);
      } else if (kind === "pantry") {
        R(s, 3, 2, 28, 29, [206, 154, 84]); R(s, 3, 2, 28, 3, [236, 190, 116]);
        for (const ys of [6, 16]) {
          for (let i = 0; i < 5; i++) {
            const col = rng.choice([[200, 70, 60], [90, 160, 90], [230, 200, 90], [150, 150, 160]]);
            R(s, 5 + i * 5, ys, 8 + i * 5, ys + 8, col); R(s, 5 + i * 5, ys, 8 + i * 5, ys + 1, sh(col, 1.3));
          }
          R(s, 3, ys + 9, 28, ys + 10, [140, 100, 56]);
        }
      } else R(s, 4, 4, 27, 27, [150, 108, 52]);
      if (looted) R(s, 0, 0, 31, 31, [20, 16, 24, 120]);
      return s;
    });
  }
  // ------------------------------------------------------------------ techos
  function roof(w, h, color) {
    return cached("roof" + w + "," + h + color, () => {
      const rng = new RNG(w * 31 + h), s = surf(w, h);
      R(s, 0, 0, w - 1, h - 1, color);
      const dark = sh(color, 0.78), light = sh(color, 1.14);
      for (let y = 0; y < h; y += 6) {
        R(s, 0, y, w - 1, y, dark);
        const off = Math.floor(y / 6) % 2 === 0 ? 0 : 6;
        for (let x = off; x < w; x += 12) R(s, x, y, x, Math.min(h - 1, y + 5), dark);
      }
      for (let i = 0; i < Math.floor(w * h / 90); i++) P(s, rng.randrange(w), rng.randrange(h), rng.random() < 0.5 ? dark : light);
      R(s, 0, 0, w - 1, 2, light); R(s, 0, h - 3, w - 1, h - 1, sh(color, 0.6)); R(s, 0, 0, 2, h - 1, light); R(s, w - 3, 0, w - 1, h - 1, sh(color, 0.62));
      const mx = Math.floor(w / 2);
      R(s, mx - 2, 0, mx + 1, h - 1, sh(color, 0.66)); R(s, mx - 3, 0, mx - 3, h - 1, light);
      return s;
    });
  }
  // ------------------------------------------------------------------ personajes
  function outline(s, col = [24, 20, 28]) {
    const w = s.width, h = s.height, src = s.g.getImageData(0, 0, w, h), out = s.g.getImageData(0, 0, w, h);
    const a = (x, y) => src.data[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a(x, y) !== 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && a(nx, ny) > 200) {
          const i = (y * w + x) * 4;
          out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = 255;
          break;
        }
      }
    }
    s.g.putImageData(out, 0, 0);
    return s;
  }
  function hatDraw(s, hat, d) {
    if (hat === "lumberjack") {
      R(s, 10, 1, 21, 5, [170, 30, 30]);
      for (let x = 11; x < 21; x += 3) R(s, x, 1, x, 5, [30, 30, 30]);
      R(s, 10, 3, 10, 9, [150, 26, 26]); R(s, 21, 3, 21, 9, [150, 26, 26]);
    } else if (hat === "police") {
      R(s, 10, 1, 21, 4, [28, 40, 90]);
      if (d === "side") R(s, 14, 5, 25, 6, [12, 12, 20]);
      else if (d === "down") { R(s, 10, 5, 21, 6, [12, 12, 20]); R(s, 15, 2, 16, 3, [225, 200, 80]); }
    } else if (hat === "firefighter") {
      R(s, 10, 0, 21, 5, [210, 42, 32]); R(s, 10, 3, 21, 3, [250, 220, 60]); R(s, 8, 5, 23, 6, [150, 25, 20]);
    } else if (hat === "farmer") {
      R(s, 12, 0, 19, 3, [238, 212, 136]); R(s, 12, 3, 19, 3, [140, 72, 40]); R(s, 5, 4, 26, 5, [228, 198, 112]); R(s, 5, 5, 26, 5, [170, 128, 60]);
    }
  }
  function person(shirt, pants, skin, hair, d, frame, zombie, blood, hat, kind) {
    const key = "p" + shirt + "|" + pants + "|" + skin + "|" + hair + d + frame + (zombie | 0) + blood + hat + kind;
    return cached(key, () => {
      const rng = new RNG((shirt[0] * 7 + skin[1] * 13 + shirt[2]) & 0xffff);
      const s = surf(), step = frame ? 1 : 0;
      if (d === "side") {
        R(s, 12, 22, 16, 29 - step, pants); R(s, 15, 22, 19, 28 + step, sh(pants, 0.8));
        R(s, 12, 29 - step, 17, 30 - step, [36, 30, 34]); R(s, 15, 28 + step, 20, 29 + step, [36, 30, 34]);
        R(s, 11, 12, 20, 22, shirt); R(s, 11, 12, 13, 22, sh(shirt, 0.8)); R(s, 11, 21, 20, 22, sh(shirt, 0.7));
        R(s, 12, 3, 20, 12, skin); R(s, 11, 2, 19, 6, hair); R(s, 11, 6, 13, 9, hair);
        P(s, 18, 8, zombie ? [220, 40, 36] : [30, 30, 40]);
        R(s, 18, 11, 20, 11, zombie ? [70, 14, 14] : sh(skin, 0.7));
        if (zombie) { R(s, 18, 13, 27, 15, sh(shirt, 0.8)); R(s, 26, 13, 29, 16, skin); R(s, 18, 17, 25, 19, sh(shirt, 0.8)); R(s, 24, 17, 27, 20, skin); }
        else { R(s, 18, 14, 25, 16, sh(shirt, 1.1)); R(s, 24, 14, 27, 16, skin); }
      } else {
        const ll = 29 - step, lr = 28 + step;
        R(s, 11, 22, 14, ll, pants); R(s, 17, 22, 20, lr, sh(pants, 0.82));
        R(s, 11, ll, 14, ll + 1, [36, 30, 34]); R(s, 17, lr, 20, lr + 1, [36, 30, 34]);
        R(s, 9, 12, 22, 22, shirt); R(s, 9, 12, 12, 22, sh(shirt, 0.82)); R(s, 19, 12, 22, 22, sh(shirt, 1.12)); R(s, 9, 21, 22, 22, sh(shirt, 0.7));
        if (zombie) { R(s, 5, 13, 8, 22, sh(shirt, 0.78)); R(s, 23, 13, 26, 22, sh(shirt, 0.78)); R(s, 5, 21, 8, 24, skin); R(s, 23, 21, 26, 24, skin); }
        else {
          R(s, 6, 13, 8, 21 + step, sh(shirt, 0.8)); R(s, 23, 13, 25, 21 - step + 1, sh(shirt, 0.8));
          R(s, 6, 22 + step, 8, 24 + step, skin); R(s, 23, 22 - step + 1, 25, 24 - step + 1, skin);
        }
        R(s, 11, 3, 20, 12, skin); R(s, 11, 3, 12, 12, sh(skin, 0.86));
        if (d === "up") R(s, 11, 2, 20, 11, hair);
        else {
          R(s, 11, 2, 20, 5, hair); R(s, 10, 4, 10, 7, hair); R(s, 21, 4, 21, 7, hair);
          if (zombie) { P(s, 13, 8, [220, 40, 36]); P(s, 18, 8, [220, 40, 36]); R(s, 14, 11, 17, 11, [70, 14, 14]); }
          else { P(s, 13, 8, [30, 30, 40]); P(s, 18, 8, [30, 30, 40]); R(s, 14, 11, 17, 11, sh(skin, 0.7)); }
        }
      }
      if (kind === "breaker") {
        for (const cx of (d !== "side" ? [6, 25] : [13, 19])) { R(s, cx - 2, 10, cx + 3, 14, [150, 152, 168]); R(s, cx - 1, 11, cx + 2, 12, [214, 150, 60]); }
      } else if (kind === "brute") R(s, 7, 11, 24, 12, sh(shirt, 1.25));
      else if (kind === "thrower") { R(s, 20, 15, 25, 22, [110, 80, 50]); R(s, 20, 15, 25, 15, [150, 112, 70]); }
      for (let i = 0; i < blood; i++) P(s, rng.randint(10, 21), rng.randint(13, 21), [120, 18, 18]);
      if (hat && hat !== "none") hatDraw(s, hat, d);
      outline(s);
      // versión espejada (mirando a la izquierda)
      const m = surf();
      m.g.translate(T, 0); m.g.scale(-1, 1); m.g.drawImage(s, 0, 0);
      s.flip = m;
      return s;
    });
  }
  function shadow() {
    return cached("shadow", () => { const s = surf(22, 8); ellipse(s, 0, 0, 22, 8, [0, 0, 0, 80]); return s; });
  }
  function car(color, damaged) {
    return cached("car" + color + (damaged | 0), () => {
      const s = surf(44, 26), col = damaged ? sh(color, 0.62) : color;
      R(s, 2, 3, 41, 22, [20, 20, 24]);
      for (const wx of [7, 31]) { R(s, wx, 1, wx + 8, 4, [16, 16, 18]); R(s, wx, 21, wx + 8, 24, [16, 16, 18]); }
      R(s, 2, 4, 41, 21, col); R(s, 2, 4, 41, 6, sh(col, 1.25)); R(s, 2, 19, 41, 21, sh(col, 0.65));
      R(s, 15, 6, 29, 19, sh(col, 0.88)); R(s, 15, 6, 29, 7, sh(col, 1.2));
      R(s, 28, 7, 33, 18, [52, 66, 88]); R(s, 29, 8, 31, 12, [110, 138, 168]);
      R(s, 10, 7, 13, 18, [46, 58, 78]);
      R(s, 40, 6, 42, 9, [255, 244, 190]); R(s, 40, 16, 42, 19, [255, 244, 190]);
      R(s, 1, 6, 2, 9, [226, 56, 48]); R(s, 1, 16, 2, 19, [226, 56, 48]);
      R(s, 34, 11, 39, 14, sh(col, 0.75));
      return outline(s);
    });
  }
  // icono de objeto (para el inventario y el suelo)
  function itemIcon(item) {
    return cached("icon" + item, () => {
      const s = surf(16, 16), k = (ITEMS[item] || {}).kind;
      const c = ITEM_COLORS[k] || [180, 180, 120];
      const dark = [30, 28, 34];
      if (k === "weapon" && GUNS[item]) { R(s, 1, 6, 14, 9, [60, 62, 70]); R(s, 2, 9, 5, 14, [110, 76, 44]); R(s, 1, 6, 14, 6, [120, 122, 130]); }
      else if (item === "axe") { R(s, 7, 2, 8, 15, [130, 90, 50]); R(s, 3, 2, 8, 6, [170, 175, 185]); }
      else if (item === "bat") { R(s, 6, 1, 9, 12, [196, 150, 96]); R(s, 7, 12, 8, 15, [120, 80, 50]); }
      else if (item === "pan") { circle(s, 6, 8, 5, [60, 60, 66]); R(s, 10, 7, 15, 9, [40, 40, 44]); }
      else if (item === "knife") { R(s, 7, 1, 8, 10, [200, 205, 215]); R(s, 6, 10, 9, 14, [80, 60, 40]); }
      else if (item === "rod") { R(s, 3, 13, 4, 14, [60, 40, 30]); for (let i = 0; i < 11; i++) P(s, 4 + i, 13 - i, [140, 100, 60]); P(s, 14, 4, [230, 230, 230]); }
      else if (k === "food") { R(s, 3, 4, 12, 13, c); R(s, 3, 4, 12, 5, shade(c, 1.3)); R(s, 5, 7, 10, 10, [240, 230, 200]); }
      else if (k === "drink" || item === "bottle") { R(s, 6, 1, 9, 3, [220, 220, 230]); R(s, 4, 4, 11, 14, item === "bottle" ? [170, 220, 200] : c); R(s, 5, 6, 6, 12, [230, 245, 255]); }
      else if (k === "med") { R(s, 2, 3, 13, 13, [240, 240, 244]); R(s, 7, 5, 8, 11, [214, 52, 52]); R(s, 4, 7, 11, 8, [214, 52, 52]); }
      else if (k === "ammo") { for (let i = 0; i < 3; i++) { R(s, 3 + i * 4, 4, 5 + i * 4, 13, [210, 170, 70]); R(s, 3 + i * 4, 3, 5 + i * 4, 5, [170, 110, 60]); } }
      else if (k === "pack") { R(s, 3, 3, 12, 14, c); R(s, 4, 7, 11, 11, shade(c, 0.75)); R(s, 6, 1, 9, 3, shade(c, 0.6)); }
      else if (item === "grenade") { circle(s, 8, 9, 5, [70, 100, 60]); R(s, 7, 2, 9, 4, [150, 150, 150]); }
      else if (item === "dynamite") { R(s, 3, 5, 12, 12, [200, 40, 40]); R(s, 7, 1, 8, 5, [230, 220, 200]); }
      else if (item === "molotov") { R(s, 5, 5, 10, 14, [210, 150, 60]); R(s, 7, 1, 8, 5, [240, 240, 240]); P(s, 7, 0, [255, 140, 40]); }
      else if (item === "firecracker") { R(s, 2, 6, 13, 10, [230, 60, 50]); R(s, 2, 8, 13, 8, [250, 220, 60]); }
      else if (item === "torch") { R(s, 7, 6, 8, 15, [110, 76, 44]); circle(s, 7, 4, 3, [240, 130, 40]); P(s, 7, 3, [255, 230, 120]); }
      else if (item === "flashlight") { R(s, 2, 6, 11, 9, [60, 62, 70]); R(s, 11, 5, 14, 10, [200, 200, 140]); }
      else if (item === "battery") { R(s, 4, 3, 11, 14, [60, 120, 200]); R(s, 6, 1, 9, 3, [200, 200, 200]); }
      else if (item === "planks") { R(s, 1, 4, 14, 6, [176, 126, 74]); R(s, 1, 9, 14, 11, [156, 110, 64]); }
      else if (item === "fuel") { R(s, 3, 3, 12, 14, [200, 50, 40]); R(s, 10, 1, 12, 3, [60, 60, 60]); }
      else R(s, 3, 3, 12, 12, c);
      return outline(s, dark);
    });
  }
  return { grass, water, road, floor, doorOpen, shadowTop, wall, tree, cont, roof, person, shadow, car, itemIcon, cache };
})();
