/* Last Refuge - mapa: generación procedural con semilla y dibujo por trozos. */
"use strict";

const ck = (x, y) => y * 4096 + x;           // clave de casilla
const ckx = k => k % 4096, cky = k => Math.floor(k / 4096);

class GameMap {
  constructor(seed, k) {
    this.k = k || MAP_K;
    setMapSize(this.k);
    this.N = N;
    this.seed = seed;
    this.rnd = new RNG(seed);
    this.t = new Uint8Array(N * N);
    this.road = new Uint8Array(N * N);
    this.buildings = [];
    this.containers = new Map();
    this.mods = new Map();
    this.chunks = new Map();
    this.generate();
  }

  tile(x, y) { return (x >= 0 && y >= 0 && x < N && y < N) ? this.t[y * N + x] : WALL; }
  setTile(x, y, v) {
    this.t[y * N + x] = v;
    this.mods.set(ck(x, y), v);
    this.dirty(x, y);
  }
  dirty(x, y) {
    const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
    this.chunks.delete(cx * 1000 + cy);
    if ((y + 1) % CH === 0) this.chunks.delete(cx * 1000 + cy + 1);   // sombras/caras del trozo de abajo
    if (y % CH === 0) this.chunks.delete(cx * 1000 + cy - 1);
  }
  free(px, py, r) {
    const x0 = Math.floor((px - r) / TS), x1 = Math.floor((px + r) / TS);
    const y0 = Math.floor((py - r) / TS), y1 = Math.floor((py + r) / TS);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (SOLID.has(this.tile(tx, ty))) return false;
    return true;
  }
  lineClear(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const steps = Math.floor(hypot(dx, dy) / 10) + 1;
    for (let i = 1; i < steps; i++) {
      const px = x1 + dx * i / steps, py = y1 + dy * i / steps;
      if (LOS_BLOCK.has(this.tile(Math.floor(px / TS), Math.floor(py / TS)))) return false;
    }
    return true;
  }
  rayDistance(x, y, ang, maxd) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 1; i <= Math.floor(maxd / 6); i++) {
      const d = i * 6;
      if (LOS_BLOCK.has(this.tile(Math.floor((x + c * d) / TS), Math.floor((y + s * d) / TS)))) return d;
    }
    return maxd;
  }
  buildingAt(tx, ty) {
    for (const b of this.buildings) if (b.x0 <= tx && tx <= b.x1 && b.y0 <= ty && ty <= b.y1) return b;
    return null;
  }
  buildingIndexAt(tx, ty) {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.x0 <= tx && tx <= b.x1 && b.y0 <= ty && ty <= b.y1) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------ generación
  set(x, y, v) { this.t[y * N + x] = v; }
  get(x, y) { return this.t[y * N + x]; }

  generate() {
    const rnd = this.rnd, K = this.k;
    const sLake = rnd.randint(1, 1e6), sForest = rnd.randint(1, 1e6);
    for (let i = 0; i <= K; i++) {                     // carreteras de 4 tiles
      const r = 5 + 33 * i;
      for (let y = r; y < r + 4; y++) for (let x = 0; x < N; x++) { this.set(x, y, ROAD); this.road[y * N + x] |= 1; }
      for (let x = r; x < r + 4; x++) for (let y = 0; y < N; y++) { this.set(x, y, ROAD); this.road[y * N + x] |= 2; }
    }
    const blocks = [];
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) blocks.push([9 + 33 * i, 9 + 33 * j]);
    rnd.shuffle(blocks);
    const kinds = Object.keys(SPECIAL);
    const guaranteed = kinds.slice(0, Math.min(kinds.length, Math.max(1, Math.floor(blocks.length / 3))));
    for (const [bx, by] of blocks) {
      if (guaranteed.length) { this.makeSpecial(bx, by, guaranteed.shift()); continue; }
      const roll = rnd.random();
      if (roll < 0.12) this.makeSpecial(bx, by, rnd.choice(kinds));
      else if (roll < 0.28) {
        const w = rnd.randint(20, 25), h = rnd.randint(20, 25);
        this.makeBuilding(bx + rnd.randint(1, 29 - w - 1), by + rnd.randint(1, 29 - h - 1), w, h, 3, 3, rnd.randint(2, 3));
      } else if (roll < 0.38) continue;
      else {
        for (const ox of [0, 15]) for (const oy of [0, 15]) if (rnd.random() < 0.85) this.makeHouse(bx + ox, by + oy, 14, 14);
      }
    }
    const near = new Uint8Array(N * N);
    for (const b of this.buildings)
      for (let y = Math.max(0, b.y0 - 3); y < Math.min(N, b.y1 + 4); y++)
        for (let x = Math.max(0, b.x0 - 3); x < Math.min(N, b.x1 + 4); x++) near[y * N + x] = 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.get(x, y) !== GRASS || near[y * N + x]) continue;
      const edge = x < 4 || y < 4 || x >= N - 4 || y >= N - 4;
      if (vnoise(x / 13, y / 13, sLake) > 0.70 && !edge && !this.roadNear(x, y, 2)) { this.set(x, y, WATER); continue; }
      const f = vnoise(x / 8, y / 8, sForest);
      const p = 0.025 + Math.max(0, f - 0.55) * 1.1;
      if ((edge && rnd.random() < 0.85) || rnd.random() < p) this.set(x, y, TREE);
    }
  }
  roadNear(x, y, r) {
    for (let yy = Math.max(0, y - r); yy < Math.min(N, y + r + 1); yy++)
      for (let xx = Math.max(0, x - r); xx < Math.min(N, x + r + 1); xx++)
        if (this.road[yy * N + xx]) return true;
    return false;
  }
  makeSpecial(bx, by, kind) {
    const rnd = this.rnd, sp = SPECIAL[kind];
    const w = rnd.randint(sp.w[0], sp.w[1]), h = rnd.randint(sp.h[0], sp.h[1]);
    this.makeBuilding(bx + rnd.randint(1, 29 - w - 1), by + rnd.randint(1, 29 - h - 1), w, h, sp.q, sp.maxd, sp.doors, kind);
  }
  makeHouse(lx, ly, lw, lh) {
    const rnd = this.rnd;
    const tier = weighted(rnd, [[0, 50], [1, 35], [2, 15]])[0];
    const size = [[8, 9], [10, 11], [12, 13]][tier];
    const w = rnd.randint(size[0], size[1]), h = rnd.randint(size[0], size[1]);
    const x0 = lx + rnd.randint(0, lw - w), y0 = ly + rnd.randint(0, lh - h);
    this.makeBuilding(x0, y0, w, h, tier, tier < 2 ? 1 : 2, tier === 0 ? 1 : rnd.randint(1, 2));
  }
  splitRoom(ix0, iy0, ix1, iy1, depth, maxd, partDoors) {
    const rnd = this.rnd;
    const w = ix1 - ix0 + 1, h = iy1 - iy0 + 1;
    if (depth >= maxd || (w < 7 && h < 7)) return;
    if (w >= h && w >= 7) {
      const wx = rnd.randint(ix0 + 3, ix1 - 3);
      for (let y = iy0; y <= iy1; y++) this.set(wx, y, WALL);
      const dy = rnd.randint(iy0 + 1, iy1 - 1);
      this.set(wx, dy, DOOR_O);
      partDoors.push([wx, dy, "v"]);
      this.splitRoom(ix0, iy0, wx - 1, iy1, depth + 1, maxd, partDoors);
      this.splitRoom(wx + 1, iy0, ix1, iy1, depth + 1, maxd, partDoors);
    } else if (h >= 7) {
      const wy = rnd.randint(iy0 + 3, iy1 - 3);
      for (let x = ix0; x <= ix1; x++) this.set(x, wy, WALL);
      const dx = rnd.randint(ix0 + 1, ix1 - 1);
      this.set(dx, wy, DOOR_O);
      partDoors.push([dx, wy, "h"]);
      this.splitRoom(ix0, iy0, ix1, wy - 1, depth + 1, maxd, partDoors);
      this.splitRoom(ix0, wy + 1, ix1, iy1, depth + 1, maxd, partDoors);
    }
  }
  keepsAccess(x, y) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const freeSides = (cx, cy, ix, iy) => {
      let n = 0;
      for (const [dx, dy] of dirs) {
        if (cx + dx === ix && cy + dy === iy) continue;
        const t = this.get(cx + dx, cy + dy);
        if (t === FLOOR || t === DOOR_O || t === DOOR_C) n++;
      }
      return n;
    };
    if (freeSides(x, y, -9, -9) < 1) return false;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (this.get(nx, ny) === CONT && freeSides(nx, ny, x, y) < 1) return false;
    }
    return true;
  }
  makeBuilding(x0, y0, w, h, q, maxd, doors, skind) {
    const rnd = this.rnd;
    const x1 = x0 + w - 1, y1 = y0 + h - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
      if (edge && !corner && rnd.random() < 0.3) this.set(x, y, WINDOW);
      else this.set(x, y, edge ? WALL : FLOOR);
    }
    const partDoors = [];
    this.splitRoom(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 0, maxd, partDoors);
    for (const [dx, dy, o] of partDoors) {
      const adj = o === "v" ? [[dx - 1, dy], [dx + 1, dy]] : [[dx, dy - 1], [dx, dy + 1]];
      for (const [ax, ay] of adj) if (this.get(ax, ay) === WALL) this.set(ax, ay, DOOR_O);
    }
    const ring = [];
    for (let x = x0 + 1; x < x1; x++) { ring.push([x, y0, 0, 1]); ring.push([x, y1, 0, -1]); }
    for (let y = y0 + 1; y < y1; y++) { ring.push([x0, y, 1, 0]); ring.push([x1, y, -1, 0]); }
    rnd.shuffle(ring);
    const placed = [];
    for (const [x, y, ix, iy] of ring) {
      if (placed.length >= doors) break;
      if (this.get(x + ix, y + iy) !== FLOOR) continue;
      if (placed.some(([px, py]) => Math.abs(x - px) + Math.abs(y - py) < 4)) continue;
      this.set(x, y, rnd.random() < 0.7 ? DOOR_C : DOOR_O);
      placed.push([x, y]);
    }
    if (!placed.length) {
      const r = ring.find(r => this.get(r[0] + r[2], r[1] + r[3]) === FLOOR);
      if (r) this.set(r[0], r[1], DOOR_O);
    }
    const allDoors = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = this.get(x, y);
      if (t === DOOR_C || t === DOOR_O) allDoors.push([x, y]);
    }
    const cand = [];
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
      if (this.get(x, y) !== FLOOR) continue;
      if (!(this.get(x + 1, y) === WALL || this.get(x - 1, y) === WALL || this.get(x, y + 1) === WALL || this.get(x, y - 1) === WALL)) continue;
      if (allDoors.some(([dx, dy]) => Math.max(Math.abs(x - dx), Math.abs(y - dy)) <= 2)) continue;
      if (x === x0 + 1 && y === y0 + 1) continue;          // ahí va el interruptor de la luz
      cand.push([x, y]);
    }
    rnd.shuffle(cand);
    const count = [[3, 5], [4, 7], [6, 10], [10, 15]][q];
    let weights = q < 2 ? CONT_WEIGHTS : CONT_WEIGHTS.map(([k, wg]) => [k, wg + (["cabinet", "shelf", "wardrobe"].includes(k) ? 2 : 0)]);
    let placedC = 0, want = rnd.randint(count[0], count[1]);
    if (skind) { weights = SPECIAL[skind].cw; want += SPECIAL[skind].bonus; }
    for (const [x, y] of cand) {
      if (placedC >= want) break;
      if (!this.keepsAccess(x, y)) continue;
      this.set(x, y, CONT);
      this.containers.set(ck(x, y), { kind: weighted(rnd, weights)[0], looted: false, q, rolled: false, inv: {} });
      placedC++;
    }
    this.buildings.push({ x0, y0, x1, y1, kind: skind || null, roof: skind ? SPECIAL[skind].roof : rnd.choice(ROOF_COLORS), q });
  }

  // ------------------------------------------------------------ dibujo
  getChunk(cx, cy) {
    const key = cx * 1000 + cy;
    let c = this.chunks.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = c.height = CH * TS;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      for (let ty = cy * CH; ty < cy * CH + CH; ty++)
        for (let tx = cx * CH; tx < cx * CH + CH; tx++)
          this.drawTile(g, tx, ty, (tx - cx * CH) * TS, (ty - cy * CH) * TS);
      this.chunks.set(key, c);
    }
    return c;
  }
  drawTile(g, tx, ty, px, py) {
    const t = this.tile(tx, ty);
    const j = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) & 15;
    const v = j & 3;
    const solid = t === WALL || t === WINDOW || t === DOOR_C;
    if (t === GRASS) g.drawImage(ART.grass(v), px, py);
    else if (t === TREE) g.drawImage(ART.tree(v), px, py);
    else if (t === WATER) g.drawImage(ART.water(v), px, py);
    else if (t === ROAD) {
      const r = (tx >= 0 && ty >= 0 && tx < N && ty < N) ? this.road[ty * N + tx] : 0;
      let dash = "";
      if (r === 1 && (ty - 5) % 33 === 2 && tx % 2 === 0) dash = "h";
      else if (r === 2 && (tx - 5) % 33 === 2 && ty % 2 === 0) dash = "v";
      g.drawImage(ART.road(v, dash), px, py);
    } else if (t === FLOOR || t === DOOR_O || t === CONT) {
      if (t === DOOR_O) g.drawImage(ART.doorOpen(v), px, py);
      else if (t === CONT) {
        const c = this.containers.get(ck(tx, ty)) || { kind: "shelf", looted: false };
        g.drawImage(ART.cont(c.kind, !!c.looted, v), px, py);
      } else g.drawImage(ART.floor(v), px, py);
    } else if (solid) {
      const below = this.tile(tx, ty + 1);
      const face = !(below === WALL || below === WINDOW || below === DOOR_C);
      g.drawImage(ART.wall(face, t === WINDOW, t === DOOR_C, v), px, py);
    }
    if (!solid) {
      const above = this.tile(tx, ty - 1);
      if (above === WALL || above === WINDOW || above === DOOR_C) g.drawImage(ART.shadowTop(), px, py);
    }
  }
  minimap() {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    const img = g.createImageData(N, N);
    const cols = { [GRASS]: [70, 112, 60], [ROAD]: [86, 86, 92], [FLOOR]: [150, 115, 80], [WALL]: [58, 42, 36], [TREE]: [40, 82, 42],
      [DOOR_C]: [130, 90, 50], [DOOR_O]: [150, 115, 80], [CONT]: [150, 115, 80], [WINDOW]: [110, 150, 170], [WATER]: [50, 110, 190] };
    for (let i = 0; i < N * N; i++) {
      const col = cols[this.t[i]];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
