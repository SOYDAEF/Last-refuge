/* Last Refuge - lógica del juego (no dibuja nada). Sirve para jugar solo y para el anfitrión online. */
"use strict";

class Player {
  constructor(x, y, pid = 0, name = "Jugador", remote = false) {
    this.x = x; this.y = y; this.pid = pid; this.name = name; this.remote = remote;
    this.angle = 0; this.hp = 100; this.hunger = 10; this.thirst = 10; this.stamina = 100;
    this.exhausted = false; this.bleeding = false; this.bleedT = 0; this.infected = false; this.infT = 0;
    this.inv = { bandage: 1, water: 1, canned: 1, flashlight: 1, planks: 6, rod: 1, torch: 2 };
    this.cond = {}; this.weapon = "fists"; this.mag = 0; this.mags = {};
    this.flashOn = false; this.battery = 100; this.sneak = false; this.aiming = false; this.moving = false; this.running = false;
    this.atkCd = 0; this.reloadT = 0; this.swingT = 0; this.noiseT = 0; this.throwCd = 0; this.drinkCd = 0;
    this.back = ""; this.thr = "bottle";
    this.demoNoise = 0; this.toolWear = 0; this.search = null; this.fish = null; this.open = null; this.cview = null;
    this.hat = "none"; this.work = null; this.kills = 0; this.alive = true; this.cause = ""; this.hurtT = 0;
    this.msgs = []; this.outbox = [];
    this.inp = { x, y, a: 0, mv: 0, run: 0, aim: 0, hold: 0, sn: 0, mx: x, my: y, dm: 0, dv: [0, 0], tf: 0 };
    this.car = null; this.fix = false; this.hurtEv = false; this.tx = x; this.ty = y;
  }
  reset(x, y) {
    const keep = { msgs: this.msgs, outbox: this.outbox, inp: this.inp, hat: this.hat };
    Object.assign(this, new Player(x, y, this.pid, this.name, this.remote), keep);
    this.inp.x = x; this.inp.y = y;
    this.fix = true;
  }
}
const PLAYER_SAVE = ["x", "y", "angle", "hp", "hunger", "thirst", "stamina", "exhausted", "bleeding", "bleedT", "infected", "infT",
  "inv", "cond", "weapon", "mag", "mags", "flashOn", "battery", "sneak", "kills", "back", "thr"];

class Zombie {
  constructor(id, x, y, rnd, kind = "walker") {
    this.id = id; this.x = x; this.y = y; this.kind = kind;
    const k = ZK[kind];
    this.r = k.r; this.dmgMult = k.dmg; this.speed = rnd.uniform(k.spd[0], k.spd[1]);
    this.maxHp = rnd.uniform(k.hp[0], k.hp[1]); this.hp = this.maxHp;
    this.state = "idle"; this.tx = 0; this.ty = 0; this.toPlayer = false; this.angle = rnd.uniform(0, TAU);
    this.stagger = 0; this.kx = 0; this.ky = 0; this.atkCd = 0; this.lookT = rnd.random() * 0.4; this.sees = false;
    this.lostT = 0; this.wanderT = rnd.random() * 3; this.wdir = null; this.stuckT = 0; this.steerT = 0; this.steerA = 0;
    this.throwCd = rnd.uniform(1, 3); this.lungeT = 0; this.lungeCd = rnd.uniform(0, 3); this.screamCd = 0; this.bashNoise = 0;
    this.d = 9999; this.tp = null; this.alive = true;
    this.skinI = rnd.randrange(Z_SKINS.length); this.clothI = rnd.randrange(Z_CLOTHES.length);
    this.skin = Z_SKINS[this.skinI]; this.cloth = Z_CLOTHES[this.clothI];
  }
}

class Car {
  constructor(id, x, y, angle, ci, fuel) {
    this.id = id; this.x = x; this.y = y; this.angle = angle; this.v = 0; this.fuel = fuel; this.hp = 100;
    this.driver = null; this.ci = ci; this.color = CAR_COLORS[ci % CAR_COLORS.length]; this.thr = 0; this.steer = 0; this.noiseT = 0;
  }
}

class Game {
  constructor(seed, opts = {}) {
    this.setSettings(opts.settings);
    this.seed = seed;
    this.rnd = new RNG(seed + 1);
    this.map = new GameMap(seed, this.k);
    this.players = new Map(); this.nextPid = 0; this.p = null;
    this.minutes = START_MINUTES;
    this.zombies = []; this.nextZid = 0;
    this.corpses = []; this.tracers = []; this.projs = []; this.fx = [];
    this.bombs = []; this.fires = []; this.torches = []; this.lit = new Set();
    this.tileHp = new Map(); this.shake = 0;
    this.flows = new Map(); this.flowTs = new Map(); this.flowTile = new Map(); this.flowAge = new Map();
    this.zt = 0; this.popT = 0; this.darkNow = 0;
    this.items = new Map(); this.nextIid = 0; this.lastDay = 1;
    this.clearEvents();
    this.cars = []; this.nextCid = 0;
    if (opts.view) return;                    // vista de cliente online: el mundo lo manda el anfitrión
    this.populate();
    this.populateCars();
    if (opts.local !== false) {
      this.p = this.addPlayer(opts.name || "Tú");
      this.p.hat = HATS.includes(opts.hat) ? opts.hat : "none";
      this.msg("Sobrevive. Tienes una caña de pescar: equípala y pesca en un lago para comer.", [255, 255, 255], this.p);
    }
  }

  setSettings(s) {
    this.settings = normSettings(s);
    const st = this.settings, mo = MODES[st.mode];
    this.zmul = Z_OPTS[st.zi][1]; this.lmul = LOOT_OPTS[st.li][1]; this.tmul = TIME_OPTS[st.ti][1];
    this.k = MAP_OPTS[st.ms][1];
    if (!this.map) setMapSize(this.k);
    this.dmgm = mo.dmg; this.bitem = mo.bite; this.bkm = mo.bk; this.revive = mo.revive;
    const area = Math.pow(this.k * this.k / 9, 0.7);
    this.zday = Math.min(190, Math.max(6, Math.floor(ZOMBIE_DAY * this.zmul * area)));
    this.znight = Math.min(380, Math.max(10, Math.floor(ZOMBIE_NIGHT * this.zmul * area)));
  }

  // ------------------------------------------------------------ guardado
  toSave() {
    const p = this.p, m = this.map;
    const player = {};
    for (const k of PLAYER_SAVE) player[k] = p[k];
    return {
      v: 1, seed: this.seed, settings: this.settings, minutes: this.minutes, lastDay: this.lastDay, player, car: p.car,
      tiles: [...m.mods].map(([k, v]) => [ckx(k), cky(k), v]),
      tileHp: [...this.tileHp].map(([k, v]) => [ckx(k), cky(k), r1(v)]),
      conts: [...m.containers].map(([k, c]) => [ckx(k), cky(k), c.kind, c.q || 0, !!c.looted, !!c.rolled, c.inv || {}]),
      torches: this.torches.map(t => [t[0], t[1]]), lit: [...this.lit],
      zombies: this.zombies.filter(z => z.alive).map(z => [r1(z.x), r1(z.y), z.kind, r1(z.hp), r1(z.maxHp)]),
      cars: this.cars.map(c => [c.id, r1(c.x), r1(c.y), Math.round(c.angle * 1000) / 1000, c.ci, r1(c.fuel), r1(c.hp), c.driver]),
      items: [...this.items.values()].map(it => [r1(it[0]), r1(it[1]), it[2], it[3]]),
      corpses: this.corpses.map(c => [r1(c[0]), r1(c[1]), r2(c[2]), c[3]]),
    };
  }
  static fromSave(d, name, hat) {
    const g = new Game(d.seed, { settings: d.settings, name, hat });
    const m = g.map, p = g.p;
    g.minutes = +d.minutes; g.lastDay = d.lastDay | 0 || 1;
    for (const [x, y, v] of d.tiles) m.setTile(x, y, v);
    g.tileHp = new Map(d.tileHp.map(([x, y, hp]) => [ck(x, y), hp]));
    m.containers.clear();
    for (const [x, y, kind, q, looted, rolled, inv] of d.conts)
      if (m.tile(x, y) === CONT) m.containers.set(ck(x, y), { kind, q, looted, rolled, inv: Object.assign({}, inv) });
    m.chunks.clear();
    for (const k in d.player) p[k] = d.player[k];
    if (!PACKS[p.back]) p.back = "";
    if (!THROWABLES.includes(p.thr)) p.thr = "bottle";
    p.alive = p.hp > 0;
    g.torches = (d.torches || []).slice(0, MAX_TORCHES).map(t => [+t[0], +t[1]]);
    g.lit = new Set((d.lit || []).filter(i => Number.isInteger(i) && i >= 0 && i < m.buildings.length));
    g.zombies = [];
    for (const [x, y, kind, hp, mhp] of d.zombies) { const z = g.newZombie(x, y, kind); z.hp = hp; z.maxHp = mhp; }
    g.cars = [];
    for (const [id, x, y, a, ci, fuel, hp, driver] of d.cars) {
      const c = new Car(id, x, y, a, ci, fuel); c.hp = hp; c.driver = driver; g.cars.push(c);
      g.nextCid = Math.max(g.nextCid, id + 1);
    }
    p.car = d.car === undefined ? null : d.car;
    g.items.clear();
    for (const [x, y, item, qty] of d.items) g.spawnItem(x, y, item, qty);
    g.corpses = d.corpses.map(c => [c[0], c[1], c[2], c[3]]);
    p.msgs = [];
    g.msg("Partida cargada.", [200, 255, 200], p);
    return g;
  }

  // ------------------------------------------------------------ jugadores
  spawnPos() {
    for (let i = 0; i < 40; i++) {
      const x = (SPAWN_TILE[0] + 0.5) * TS + this.rnd.uniform(-60, 60), y = (SPAWN_TILE[1] + 0.5) * TS + this.rnd.uniform(-60, 60);
      if (this.map.free(x, y, PLAYER_R)) return [x, y];
    }
    return [(SPAWN_TILE[0] + 0.5) * TS, (SPAWN_TILE[1] + 0.5) * TS];
  }
  addPlayer(name, remote = false) {
    const [x, y] = this.spawnPos();
    const pl = new Player(x, y, this.nextPid++, name, remote);
    this.players.set(pl.pid, pl);
    return pl;
  }
  respawnPlayer(p) {
    if (!p.alive && !this.revive) { this.msg("Hardcore: no puedes revivir.", [255, 140, 120], p); return; }
    if (!p.alive) {
      this.releaseCar(p.pid);
      const [x, y] = this.spawnPos();
      p.reset(x, y);
      this.msg(`${p.name} ha vuelto a la partida.`, [200, 255, 200]);
    }
  }
  otherPlayers() { return [...this.players.values()].filter(pl => pl !== this.p && pl.alive); }

  // ------------------------------------------------------------ utilidades
  msg(text, color = [255, 255, 255], p = null) {
    const targets = p ? [p] : [...this.players.values()];
    for (const t of targets) {
      t.msgs.push([text, 5, color]);
      if (t.msgs.length > 5) t.msgs.splice(0, t.msgs.length - 5);
      if (t.remote) { t.outbox.push([text, color]); if (t.outbox.length > 12) t.outbox.splice(0, t.outbox.length - 12); }
    }
  }
  darkness() {
    const h = (this.minutes / 60) % 24;
    if (h >= 7 && h < 18) return 0;
    if (h >= 18 && h < 21) return (h - 18) / 3;
    if (h >= 21 || h < 5) return 1;
    return 1 - (h - 5) / 2;
  }
  day() { return Math.floor(this.minutes / 1440) + 1; }
  clock() {
    const m = Math.floor(this.minutes % 1440);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  owned(p) { p = p || this.p; return ITEM_ORDER.filter(i => (p.inv[i] || 0) > 0); }
  setTile(x, y, v) { this.map.setTile(x, y, v); this.evTiles.push([x, y, v]); }
  addTracer(x1, y1, x2, y2, col, w) {
    this.tracers.push([x1, y1, x2, y2, col, w, 0.08]);
    this.evTracers.push([r1(x1), r1(y1), r1(x2), r1(y2), col, w]);
  }
  addCorpse(x, y, a, col) {
    this.corpses.push([x, y, a, col]);
    if (this.corpses.length > 260) this.corpses.shift();
    this.evCorpses.push([r1(x), r1(y), r2(a), col]);
  }
  addFx(x, y, kind) { this.fx.push([x, y, kind, 0.6]); this.evFx.push([r1(x), r1(y), kind]); }
  clearEvents() { this.evTracers = []; this.evCorpses = []; this.evTiles = []; this.evLoot = []; this.evFx = []; this.evCont = []; }

  isLit(x, y) {
    if (this.darkness() < 0.25) return true;
    for (const t of this.torches) if (hypot(x - t[0], y - t[1]) < TORCH_R) return true;
    if (this.lit.size) {
      const bi = this.map.buildingIndexAt(Math.floor(x / TS), Math.floor(y / TS));
      if (bi >= 0 && this.lit.has(bi)) return true;
    }
    for (const pl of this.players.values()) {
      if (!pl.alive) continue;
      const d = hypot(x - pl.x, y - pl.y);
      if (d < 130) return true;
      if (pl.flashOn && pl.battery > 0 && d < 320 && Math.abs(angdiff(Math.atan2(y - pl.y, x - pl.x), pl.angle)) < 0.65) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ población
  pickKind(dark) {
    return weighted(this.rnd, [["walker", 70], ["runner", 6 + 24 * dark], ["thrower", 5 + 13 * dark], ["brute", 2 + 8 * dark],
      ["breaker", (1 + 5 * dark) * this.bkm]])[0];
  }
  newZombie(x, y, kind) {
    const z = new Zombie(this.nextZid++, x, y, this.rnd, kind || this.pickKind(this.darkness()));
    this.zombies.push(z);
    return z;
  }
  populate() {
    const rnd = this.rnd, m = this.map;
    const sx = (SPAWN_TILE[0] + 0.5) * TS, sy = (SPAWN_TILE[1] + 0.5) * TS;
    let tries = 0;
    while (this.zombies.length < this.zday + 15 && tries < 6000) {
      tries++;
      const tx = rnd.randint(4, N - 5), ty = rnd.randint(4, N - 5);
      const t = m.tile(tx, ty);
      const ok = rnd.random() < 0.45 ? t === FLOOR : (t === GRASS || t === ROAD);
      if (!ok) continue;
      const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
      if (hypot(x - sx, y - sy) < 550) continue;
      this.newZombie(x, y, rnd.random() < 0.85 ? "walker" : null);
    }
  }
  populateCars() {
    const rnd = this.rnd, m = this.map;
    const sx = (SPAWN_TILE[0] + 0.5) * TS, sy = (SPAWN_TILE[1] + 0.5) * TS;
    const want = Math.min(26, Math.max(4, Math.round(N_CARS * this.k * this.k / 9)));
    let tries = 0;
    while (this.cars.length < want && tries < 6000) {
      tries++;
      const tx = rnd.randint(4, N - 5), ty = rnd.randint(4, N - 5);
      if (m.tile(tx, ty) !== ROAD) continue;
      const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
      const first = this.cars.length === 0, dist = hypot(x - sx, y - sy);
      if ((first && !(dist > 250 && dist < 700)) || (!first && dist < 150)) continue;
      if (this.cars.some(c => hypot(x - c.x, y - c.y) < 260) || !m.free(x, y, CAR_R + 3)) continue;
      let best = null;
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const v = m.rayDistance(x, y, a, 300) + rnd.random() * 30;
        if (!best || v > best[0]) best = [v, a];
      }
      this.cars.push(new Car(this.nextCid++, x, y, best[1], rnd.randrange(CAR_COLORS.length), first ? 70 : rnd.uniform(10, 65)));
    }
  }

  // ------------------------------------------------------------ autos
  carById(id) { return this.cars.find(c => c.id === id) || null; }
  myCar() { return this.p && this.p.car !== null ? this.carById(this.p.car) : null; }
  carNear(p, dist = 50) {
    let best = null;
    for (const c of this.cars) if (c.driver === null) {
      const d = hypot(c.x - p.x, c.y - p.y);
      if (d <= dist && (!best || d < best[0])) best = [d, c];
    }
    return best ? best[1] : null;
  }
  enterCar(p, c) {
    p.car = c.id; c.driver = p.pid;
    p.search = p.fish = p.work = p.open = null;
    p.flashOn = false; p.fix = true;
    p.x = c.x; p.y = c.y; p.angle = c.angle;
    this.msg(IS_TOUCH ? "Subiste al auto: el joystick acelera, frena y gira. [Interactuar] para bajar."
      : "Subiste al auto: W acelera, S frena/reversa, A/D giran. [E] para bajar.", [200, 230, 255], p);
  }
  releaseCar(pid) {
    const p = this.players.get(pid);
    for (const c of this.cars) if (c.driver === pid) { c.driver = null; c.thr = 0; c.steer = 0; }
    if (p) p.car = null;
  }
  exitCar(p) {
    const c = this.carById(p.car);
    this.releaseCar(p.pid);
    if (!c) return;
    let placed = false;
    for (const side of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const a = c.angle + side;
      const x = c.x + Math.cos(a) * (CAR_R + PLAYER_R + 4), y = c.y + Math.sin(a) * (CAR_R + PLAYER_R + 4);
      if (this.map.free(x, y, PLAYER_R)) { p.x = x; p.y = y; placed = true; break; }
    }
    if (!placed) { p.x = c.x; p.y = c.y; }
    p.fix = true;
  }
  setDrive(p, thr, steer) {
    const c = this.carById(p.car);
    if (c) { c.thr = clamp(+thr || 0, -1, 1); c.steer = clamp(+steer || 0, -1, 1); }
  }
  refuel(p, c) {
    c.fuel = Math.min(100, c.fuel + 45);
    this.removeItem(p, "fuel");
    this.msg(`Llenaste el tanque (${c.fuel | 0}%).`, [200, 255, 200], p);
  }
  explodeCar(c, d) {
    this.addFx(c.x, c.y, "boom");
    this.makeNoise(c.x, c.y, 650);
    for (const z of this.zombies)
      if (z.alive && hypot(z.x - c.x, z.y - c.y) < 95 && d) this.hitZombie(z, 170, Math.atan2(z.y - c.y, z.x - c.x), 320, d, 0.8);
    const i = this.cars.indexOf(c);
    if (i >= 0) this.cars.splice(i, 1);
    if (d) { this.releaseCar(d.pid); d.x = c.x; d.y = c.y; d.fix = true; this.hurtPlayer(d, 45, "Explosión del auto"); }
    this.msg("¡El auto explotó!", [255, 170, 90]);
  }
  updateCars(dt) {
    for (const c of [...this.cars]) {
      let d = c.driver !== null ? this.players.get(c.driver) : null;
      if (c.driver !== null && (!d || !d.alive)) { this.releaseCar(c.driver); d = null; }
      let thr = d ? c.thr : 0;
      if (c.fuel <= 0) thr = 0;
      if (thr) {
        if (thr > 0) c.v += thr * CAR_ACC * dt * (c.v < 0 ? 2.0 : 1.0);
        else c.v += thr * CAR_ACC * dt * (c.v > 0 ? 2.2 : 1.0);
        c.fuel -= Math.abs(thr) * 2.2 * dt;
      } else {
        const f = (d ? 120 : 200) * dt;
        c.v = Math.abs(c.v) <= f ? 0 : c.v - Math.sign(c.v) * f;
        if (d) c.fuel -= 0.05 * dt;
      }
      c.v = clamp(c.v, CAR_REV, CAR_MAX);
      c.fuel = Math.max(0, c.fuel);
      if (d) c.angle += c.steer * CAR_TURN * clamp(c.v / 110, -1, 1) * dt;
      if (Math.abs(c.v) > 0.5) {
        const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
        const nx = c.x + ca * c.v * dt, ny = c.y + sa * c.v * dt;
        if (this.map.free(nx, ny, CAR_R)) { c.x = nx; c.y = ny; }
        else {
          const ftx = Math.floor((c.x + ca * (CAR_R + 6)) / TS), fty = Math.floor((c.y + sa * (CAR_R + 6)) / TS);
          const ft = this.map.tile(ftx, fty), sp = Math.abs(c.v);
          if (sp > 90) {
            c.hp -= sp * 0.10;
            this.makeNoise(c.x, c.y, 320);
            this.addFx(c.x + ca * CAR_R, c.y + sa * CAR_R, "crash");
            if (d && sp > 200) this.hurtPlayer(d, (sp - 200) * 0.12, "Choque");
            if ((ft === DOOR_C || ft === WINDOW) && sp > 120) this.damageTile(ftx, fty, sp * 0.6, null);
          }
          c.v *= sp > 90 ? -0.25 : 0;
        }
        if (d && Math.abs(c.v) > 70) {
          for (const z of this.zombies) {
            if (z.alive && z.stagger < 0.2 && hypot(z.x - c.x, z.y - c.y) <= CAR_R + z.r + 2) {
              this.hitZombie(z, Math.abs(c.v) * 0.5, c.angle, 300, d, 0.7);
              const heavy = z.kind === "brute" || z.kind === "breaker";
              c.v *= heavy ? 0.78 : 0.965;
              c.hp -= heavy ? 6 : 1.2;
              if (!z.alive) this.addFx(z.x, z.y, "crash");
            }
          }
        }
      }
      if (d) {
        d.x = c.x; d.y = c.y; d.angle = c.angle; d.moving = false;
        c.noiseT -= dt;
        if (c.noiseT <= 0) { c.noiseT = 0.6; this.makeNoise(c.x, c.y, 120 + Math.abs(c.v) * 0.9); }
      }
      if (d && Math.abs(c.v) > 100) {
        for (const pl of this.players.values()) {
          if (pl === d || !pl.alive || pl.car !== null || pl.hurtT > 0) continue;
          if (hypot(pl.x - c.x, pl.y - c.y) <= CAR_R + 10) {
            this.hurtPlayer(pl, (Math.abs(c.v) - 60) * 0.12, "Atropellado");
            c.v *= 0.9; this.addFx(pl.x, pl.y, "crash");
          }
        }
      }
      if (c.hp <= 0) this.explodeCar(c, d);
    }
    this.carCollisions();
  }
  carCollisions() {
    const cs = this.cars, rr = CAR_R * 2 + 2;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        let dx = b.x - a.x, dy = b.y - a.y, dist = hypot(dx, dy);
        if (dist >= rr) continue;
        if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }
        const nx = dx / dist, ny = dy / dist;
        const avx = Math.cos(a.angle) * a.v, avy = Math.sin(a.angle) * a.v;
        const bvx = Math.cos(b.angle) * b.v, bvy = Math.sin(b.angle) * b.v;
        const rel = (avx - bvx) * nx + (avy - bvy) * ny, push = rr - dist;
        for (const [car, sg] of [[a, -1], [b, 1]]) {
          const x2 = car.x + nx * push * 0.55 * sg, y2 = car.y + ny * push * 0.55 * sg;
          if (this.map.free(x2, y2, CAR_R)) { car.x = x2; car.y = y2; }
          else {
            const o = car === a ? b : a;
            const x3 = o.x - nx * push * 1.1 * sg, y3 = o.y - ny * push * 1.1 * sg;
            if (this.map.free(x3, y3, CAR_R)) { o.x = x3; o.y = y3; }
          }
        }
        if (rel > 25) {
          const ma = avx * Math.cos(b.angle) + avy * Math.sin(b.angle), mb = bvx * Math.cos(a.angle) + bvy * Math.sin(a.angle);
          a.v = clamp(a.v * 0.3 + mb * 0.55, CAR_REV, CAR_MAX);
          b.v = clamp(b.v * 0.3 + ma * 0.55, CAR_REV, CAR_MAX);
          if (rel > 90) {
            const dmg = rel * 0.09;
            a.hp -= dmg; b.hp -= dmg;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            this.makeNoise(mx, my, 340); this.addFx(mx, my, "crash");
            for (const car of [a, b]) {
              const dr = car.driver !== null ? this.players.get(car.driver) : null;
              if (dr && rel > 200) this.hurtPlayer(dr, (rel - 200) * 0.12, "Choque");
            }
          }
        }
      }
    }
  }

  managePopulation(dt) {
    this.popT -= dt;
    if (this.popT > 0) return;
    this.popT = 1;
    const alive = [...this.players.values()].filter(pl => pl.alive);
    if (!alive.length) return;
    const dark = this.darkness();
    const target = this.zday + Math.floor((this.znight - this.zday) * dark);
    const n = this.zombies.length;
    if (n > target) {
      const cand = this.rnd.shuffle(this.zombies.filter(z => z.state !== "chase" && z.d > 420));
      for (const z of cand.slice(0, Math.max(1, Math.floor((n - target) / 5) + 1))) z.alive = false;
    } else if (n < target && dark > 0.25) {
      for (let i = 0; i < Math.min(5, target - n); i++) this.trySpawn(alive);
    }
    if (dark < 0.15) for (const z of this.zombies) if (z.state === "idle" && z.d > 260 && this.rnd.random() < 0.04) z.alive = false;
  }
  trySpawn(alive) {
    const rnd = this.rnd;
    for (let i = 0; i < 25; i++) {
      const p = rnd.choice(alive), a = rnd.uniform(0, TAU), d = rnd.uniform(520, 1000);
      const tx = Math.floor((p.x + Math.cos(a) * d) / TS), ty = Math.floor((p.y + Math.sin(a) * d) / TS);
      const t = this.map.tile(tx, ty);
      if (t !== GRASS && t !== ROAD && t !== FLOOR) continue;
      const cx = (tx + 0.5) * TS, cy = (ty + 0.5) * TS;
      if (this.isLit(cx, cy) || alive.some(o => hypot(cx - o.x, cy - o.y) < 380)) continue;
      this.newZombie(cx, cy);
      return true;
    }
    return false;
  }
  makeNoise(x, y, radius) {
    for (const z of this.zombies) {
      if (hypot(z.x - x, z.y - y) < radius && !(z.state === "chase" && z.sees)) {
        z.state = "chase"; z.tx = x; z.ty = y; z.toPlayer = false; z.lostT = 7;
      }
    }
  }
  moveEntity(e, dx, dy, r) {
    let mx = false, my = false;
    if (dx) { const nx = e.x + dx; if (this.map.free(nx, e.y, r)) { e.x = nx; mx = true; } }
    if (dy) { const ny = e.y + dy; if (this.map.free(e.x, ny, r)) { e.y = ny; my = true; } }
    return mx || my;
  }

  // ------------------------------------------------------------ bucle principal
  tickEffects(dt) {
    for (const f of this.tracers) f[6] -= dt;
    this.tracers = this.tracers.filter(f => f[6] > 0);
    for (const f of this.fx) f[3] -= dt;
    this.fx = this.fx.filter(f => f[3] > 0);
    for (const pl of this.players.values()) { for (const f of pl.msgs) f[1] -= dt; pl.msgs = pl.msgs.filter(f => f[1] > 0); }
    this.shake = Math.max(0, this.shake - dt);
  }
  update(dt, inp) {
    this.tickEffects(dt);
    const aliveAny = [...this.players.values()].some(pl => pl.alive);
    if (aliveAny) {
      this.minutes += dt * GAME_MIN_PER_SEC * this.tmul;
      if (this.day() !== this.lastDay) { this.lastDay = this.day(); this.restock(); }
    }
    for (const pl of [...this.players.values()]) if (pl.alive) this.updatePlayer(pl, dt, pl === this.p ? inp : null);
    this.updateCars(dt);
    this.updateZombies(dt);
    this.updateProjectiles(dt);
    this.updateBombs(dt);
    if (aliveAny) this.managePopulation(dt);
  }

  // ------------------------------------------------------------ jugador
  controlMove(p, dt, inp) {
    p.angle = Math.atan2(inp.mouse[1] - p.y, inp.mouse[0] - p.x);
    let dx = inp.move[0], dy = inp.move[1];
    p.moving = !!(dx || dy);
    const mag = Math.min(1, hypot(dx, dy));
    if (p.moving) { const n = hypot(dx, dy); dx /= n; dy /= n; }
    p.sneak = !!inp.sneak;
    p.aiming = !!inp.aim && !!GUNS[p.weapon];
    p.running = !!inp.run && p.moving && !p.sneak && !p.exhausted && p.stamina > 0 && !p.aiming;
    let speed = p.sneak ? SNEAK : (p.running ? RUN : WALK);
    if (p.aiming) speed *= 0.6;
    speed *= this.loadFactor(p) * (inp.analog ? Math.max(0.35, mag) : 1);
    if (p.moving) this.moveEntity(p, dx * speed * dt, dy * speed * dt, PLAYER_R);
  }
  updatePlayer(p, dt, inp) {
    let hold = false, demoHeld = false, mouse, touchFire = false;
    if (p.car !== null) {
      if (p.remote) { const dv = p.inp.dv || [0, 0]; this.setDrive(p, dv[0], dv[1]); mouse = [p.inp.mx, p.inp.my]; }
      else { this.setDrive(p, -inp.move[1], inp.move[0]); mouse = inp.mouse; }
      p.moving = p.sneak = p.aiming = p.running = false;
    } else if (p.remote) {
      const i = p.inp;
      p.angle = i.a; p.moving = !!i.mv; p.sneak = !!i.sn;
      p.aiming = !!i.aim && !!GUNS[p.weapon];
      p.running = !!i.run && p.moving && !p.sneak && !p.exhausted && p.stamina > 0 && !p.aiming;
      if (i.x !== p.x || i.y !== p.y) {
        if (hypot(i.x - p.x, i.y - p.y) < 200 && this.map.free(i.x, i.y, PLAYER_R)) { p.x = i.x; p.y = i.y; }
        else p.fix = true;
      }
      hold = !!i.hold; demoHeld = !!i.dm; mouse = [i.mx, i.my]; touchFire = !!i.tf;
    } else {
      this.controlMove(p, dt, inp);
      hold = !!inp.attackHeld; demoHeld = !!inp.demolish; mouse = inp.mouse; touchFire = !!inp.touchFire;
    }
    if (p.moving && p.search) { p.search = null; this.msg("Dejaste de buscar.", [200, 200, 200], p); }
    if (p.moving && p.fish) { p.fish = null; this.msg("Dejaste de pescar.", [200, 200, 200], p); }
    if (p.fish) this.updateFishing(p, dt);
    if (p.open) {
      if (!this.map.containers.has(ck(p.open[0], p.open[1])) ||
        hypot((p.open[0] + 0.5) * TS - p.x, (p.open[1] + 0.5) * TS - p.y) > INTERACT_DIST + 40) p.open = null;
    }
    if (p.running) {
      p.stamina -= 14 * dt / Math.max(0.5, this.loadFactor(p));
      if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; this.msg("¡Estás agotado!", [255, 190, 90], p); }
    } else {
      p.stamina = Math.min(100, p.stamina + (p.moving ? 12 : 24) * dt);
      if (p.exhausted && p.stamina > 25) p.exhausted = false;
    }
    p.noiseT -= dt;
    if (p.moving && p.noiseT <= 0) { this.makeNoise(p.x, p.y, p.running ? 190 : (p.sneak ? 22 : 65)); p.noiseT = 0.5; }
    p.atkCd -= dt; p.swingT -= dt; p.hurtT -= dt; p.throwCd -= dt; p.drinkCd -= dt;
    const gun = GUNS[p.weapon];
    if (hold && !gun && p.atkCd <= 0 && !(p.work && p.work[0] === "build")) this.meleeAttack(p);
    else if (hold && gun && (gun.auto || touchFire) && p.aiming && p.atkCd <= 0 && p.reloadT <= 0) this.shoot(p);

    if (p.work && p.work[0] === "build") this.updateBuild(p, dt);
    else if (demoHeld && !p.search) this.updateDemolish(p, dt, mouse);
    else if (p.work) p.work = null;

    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0 && gun) {
        const take = Math.min(gun.mag - p.mag, p.inv[gun.ammo] || 0);
        p.mag += take;
        this.removeItem(p, gun.ammo, take);
        this.msg(`Recargada (${p.mag}/${gun.mag}).`, [200, 220, 255], p);
      }
    }
    if (p.search) {
      p.search[2] += dt;
      if (p.search[2] >= p.search[3]) { const [tx, ty] = p.search; p.search = null; this.openContainer(p, tx, ty); }
    }
    if (p.flashOn) {
      p.battery -= 0.35 * dt;
      if (p.battery <= 0) { p.battery = 0; p.flashOn = false; this.msg("La linterna se quedó sin pilas.", [255, 190, 90], p); }
    }
    p.hunger = Math.min(100, p.hunger + 0.085 * dt);
    p.thirst = Math.min(100, p.thirst + 0.13 * dt);
    let drain = 0;
    if (p.hunger >= 90) { drain += 0.25; p.cause = "Hambre"; }
    if (p.thirst >= 90) { drain += 0.4; p.cause = "Sed"; }
    if (p.bleeding) {
      drain += 1.0; p.cause = "Desangrado"; p.bleedT -= dt;
      if (p.bleedT <= 0) { p.bleeding = false; this.msg("Tu herida dejó de sangrar.", [200, 255, 200], p); }
    }
    if (drain) p.hp -= drain * dt;
    else if (p.hunger < 60 && p.thirst < 60 && p.hp < 100) p.hp = Math.min(100, p.hp + 0.15 * dt);
    if (p.infected) { p.infT -= dt; if (p.infT <= 0) { p.hp = 0; p.cause = "Infección zombi"; } }
    if (p.hp <= 0.05) {
      p.hp = 0; p.alive = false; p.search = p.work = p.fish = p.open = null;
      this.msg(`${p.name} ha muerto (${p.cause || "causa desconocida"}).`, [255, 120, 120]);
      if (p.car !== null) this.releaseCar(p.pid);
      this.dropBody(p);
      if (!this.revive) this.msg(`HARDCORE: ${p.name} no puede revivir.`, [255, 90, 90]);
    }
  }
  dropBody(p) {
    if (GUNS[p.weapon]) p.mags[p.weapon] = p.mag;
    const pile = Object.assign({}, p.inv);
    if (PACKS[p.back]) pile[p.back] = (pile[p.back] || 0) + 1;
    p.back = ""; p.thr = "bottle";
    for (const w in p.mags) if (p.mags[w] > 0 && GUNS[w]) pile[GUNS[w].ammo] = (pile[GUNS[w].ammo] || 0) + p.mags[w];
    let any = false;
    for (const item in pile) {
      if (pile[item] > 0 && ITEMS[item]) {
        const a = this.rnd.uniform(0, TAU), d = this.rnd.uniform(4, 20);
        this.spawnItem(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, item, pile[item]);
        any = true;
      }
    }
    p.inv = {}; p.mags = {}; p.mag = 0; p.weapon = "fists"; p.flashOn = false;
    this.addCorpse(p.x, p.y, p.angle, [70, 120, 200]);
    if (any) this.msg("Tus cosas quedaron junto a tu cuerpo.", [255, 200, 140], p);
  }
  hurtPlayer(P, dmg, cause) {
    if (P.car !== null && cause === "Zombi") dmg *= 0.35;
    P.hp -= dmg; P.cause = cause; P.search = null; P.fish = null;
    if (P.work && P.work[0] === "build") P.work = null;
    P.hurtT = 0.3;
    if (P === this.p) this.shake = 0.25; else P.hurtEv = true;
  }

  // ------------------------------------------------------------ construir y destruir
  damageTile(tx, ty, dmg, by) {
    const t = this.map.tile(tx, ty), mx = TILE_HP[t];
    if (mx === undefined || !(tx >= 1 && tx < N - 1 && ty >= 1 && ty < N - 1)) return null;
    const key = ck(tx, ty);
    const hp = (this.tileHp.has(key) ? this.tileHp.get(key) : mx) - dmg;
    if (hp <= 0) { this.destroyTile(tx, ty, t, by); return 0; }
    this.tileHp.set(key, hp);
    return hp / mx;
  }
  destroyTile(tx, ty, t, by) {
    const key = ck(tx, ty);
    this.tileHp.delete(key);
    if (t === CONT) {
      const c = this.map.containers.get(key);
      this.map.containers.delete(key);
      if (c) {
        if (!c.rolled) this.rollLoot(c);
        for (const item in c.inv)
          this.spawnItem((tx + 0.5) * TS + this.rnd.uniform(-10, 10), (ty + 0.5) * TS + this.rnd.uniform(-10, 10), item, c.inv[item]);
      }
      for (const pl of this.players.values()) if (pl.open && pl.open[0] === tx && pl.open[1] === ty) pl.open = null;
    }
    this.setTile(tx, ty, (t === TREE || t === FLOOR) ? GRASS : FLOOR);
    const cx = (tx + 0.5) * TS, cy = (ty + 0.5) * TS;
    this.addFx(cx, cy, "crash");
    this.makeNoise(cx, cy, 190);
    if (by) { const q = TILE_DROP[t]; this.give(by, "planks", q); this.msg(`+${q} tablón(es)`, [210, 190, 140], by); }
  }
  updateDemolish(p, dt, mouse) {
    const tx = Math.floor(mouse[0] / TS), ty = Math.floor(mouse[1] / TS);
    const cx = (tx + 0.5) * TS, cy = (ty + 0.5) * TS;
    if (TILE_HP[this.map.tile(tx, ty)] === undefined || hypot(cx - p.x, cy - p.y) > REACH) { p.work = null; return; }
    const power = TOOL_POWER[p.weapon] || 6;
    const frac = this.damageTile(tx, ty, power * dt, p);
    if (frac === null || frac <= 0) p.work = null;
    else p.work = ["demo", tx, ty, r2(1 - frac)];
    p.demoNoise -= dt;
    if (p.demoNoise <= 0) { p.demoNoise = 0.7; this.makeNoise(p.x, p.y, 70 + power * 1.8); }
    if (p.weapon !== "fists" && !GUNS[p.weapon]) {
      p.toolWear += dt;
      if (p.toolWear >= 2) { p.toolWear = 0; this.wearWeapon(p, 1); }
    }
  }
  canBuild(p, tx, ty, pc) {
    if (!(tx >= 2 && tx < N - 2 && ty >= 2 && ty < N - 2)) return false;
    const cx = (tx + 0.5) * TS, cy = (ty + 0.5) * TS;
    if (hypot(cx - p.x, cy - p.y) > REACH) return false;
    const t = this.map.tile(tx, ty);
    if (pc.id === "floor" ? !(t === GRASS || t === ROAD) : !(t === GRASS || t === ROAD || t === FLOOR)) return false;
    if (pc.id !== "floor") {
      for (const pl of this.players.values()) if (pl.alive && hypot(pl.x - cx, pl.y - cy) < 22) return false;
      for (const z of this.zombies) if (hypot(z.x - cx, z.y - cy) < 22) return false;
    }
    return true;
  }
  startBuild(p, tx, ty, pi) {
    const pc = BUILD_PIECES[pi];
    if (!pc) return;
    if ((p.inv.planks || 0) < pc.cost) this.msg(`Necesitas ${pc.cost} tablones.`, [255, 190, 90], p);
    else if (!this.canBuild(p, tx, ty, pc)) this.msg("No puedes construir ahí.", [255, 190, 90], p);
    else { p.search = null; p.work = ["build", tx, ty, 0, pi]; }
  }
  updateBuild(p, dt) {
    const w = p.work, tx = w[1], ty = w[2], pc = BUILD_PIECES[w[4]];
    if (p.moving) { p.work = null; this.msg("Construcción cancelada.", [200, 200, 200], p); return; }
    if ((p.inv.planks || 0) < pc.cost || !this.canBuild(p, tx, ty, pc)) { p.work = null; this.msg("No se puede construir ahí.", [255, 190, 90], p); return; }
    w[3] += dt / pc.time;
    if (w[3] >= 1) {
      this.removeItem(p, "planks", pc.cost);
      this.tileHp.delete(ck(tx, ty));
      this.setTile(tx, ty, pc.tile);
      if (pc.id === "chest") {
        this.map.containers.set(ck(tx, ty), { kind: "chest", looted: true, q: 0, rolled: true, inv: {} });
        this.evCont.push([tx, ty, "chest", 1]);
        this.map.dirty(tx, ty);
      }
      this.makeNoise(p.x, p.y, 110);
      this.addFx((tx + 0.5) * TS, (ty + 0.5) * TS, "build");
      p.work = null;
    }
  }

  // ------------------------------------------------------------ acciones
  doAction(p, a, arg) {
    if (!ACTIONS.has(a)) return;
    if (a === "respawn") { this.respawnPlayer(p); return; }
    if (!p.alive) return;
    if (p.car !== null && a !== "interact" && a !== "hat") return;
    switch (a) {
      case "click": this.onClick(p); break;
      case "shove": this.shove(p); break;
      case "interact": this.interact(p); break;
      case "reload": this.reload(p); break;
      case "flash": this.toggleFlash(p); break;
      case "cycle": this.cycleWeapon(p); break;
      case "bandage": this.useBandage(p); break;
      case "consume": this.autoConsume(p); break;
      case "use": if (typeof arg === "string" && ITEMS[arg]) this.useItem(p, arg); break;
      case "unequip": this.unequipPack(p); break;
      case "take": this.takeItem(p, arg); break;
      case "put": this.putItem(p, arg); break;
      case "drop": this.dropItem(p, arg); break;
      case "closec": p.open = null; break;
      case "hat": if (HATS.includes(arg)) p.hat = arg; break;
      case "build":
        if (Array.isArray(arg) && arg.length === 3 && arg.every(Number.isFinite)) this.startBuild(p, arg[0] | 0, arg[1] | 0, arg[2] | 0);
        break;
      case "throw":
        if (Array.isArray(arg) && arg.length === 2 && arg.every(Number.isFinite)) this.throwItem(p, arg[0], arg[1]);
        break;
    }
  }

  // ------------------------------------------------------------ combate
  hitZombie(z, dmg, ang, kb, p, stagger = 0.45) {
    z.hp -= dmg;
    z.kx = Math.cos(ang) * kb; z.ky = Math.sin(ang) * kb;
    z.stagger = stagger * ((z.kind === "brute" || z.kind === "breaker") ? 0.4 : 1);
    z.state = "chase"; z.toPlayer = true; z.lostT = 7;
    if (p) { z.tx = p.x; z.ty = p.y; }
    if (z.hp <= 0 && z.alive) {
      z.alive = false;
      if (p) p.kills++;
      this.addCorpse(z.x, z.y, ang, z.cloth);
    }
  }
  setWeapon(p, w) {
    if (w === p.weapon) return;
    if (GUNS[p.weapon]) p.mags[p.weapon] = p.mag;
    p.weapon = w;
    p.mag = GUNS[w] ? (p.mags[w] || 0) : 0;
    p.reloadT = 0;
  }
  wearWeapon(p, n = 1) {
    const w = WEAPONS[p.weapon];
    if (!w || p.weapon === "fists") return;
    p.cond[p.weapon] = (p.cond[p.weapon] !== undefined ? p.cond[p.weapon] : w.dur) - n;
    if (p.cond[p.weapon] <= 0) {
      const broken = p.weapon;
      this.removeItem(p, broken, 1);
      this.msg(`Tu ${w.name.toLowerCase()} se rompió.`, [255, 150, 120], p);
      if ((p.inv[broken] || 0) > 0) { p.cond[broken] = w.dur; p.weapon = broken; }
      else this.setWeapon(p, "fists");
    }
  }
  meleeAttack(p) {
    if (p.atkCd > 0) return;
    const w = WEAPONS[p.weapon];
    p.stamina = Math.max(0, p.stamina - w.stam);
    p.atkCd = w.cd * (p.stamina < 10 ? 1.5 : 1);
    p.swingT = 0.14; p.search = null; p.fish = null;
    this.makeNoise(p.x, p.y, w.noise);
    const cands = [];
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const d = hypot(z.x - p.x, z.y - p.y);
      if (d > w.rng + z.r) continue;
      if (Math.abs(angdiff(Math.atan2(z.y - p.y, z.x - p.x), p.angle)) > w.arc / 2) continue;
      if (!this.map.lineClear(p.x, p.y, z.x, z.y)) continue;
      cands.push([d, z]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    let hits = 0;
    for (const [, z] of cands.slice(0, w.targets)) { this.hitZombie(z, w.dmg * this.rnd.uniform(0.85, 1.15), p.angle, w.kb, p); hits++; }
    if (hits) this.wearWeapon(p, 1);
  }
  shove(p) {
    if (p.atkCd > 0 || p.stamina < 5) return;
    p.stamina -= 12; p.atkCd = 0.7; p.swingT = 0.12; p.search = null;
    this.makeNoise(p.x, p.y, 80);
    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (hypot(z.x - p.x, z.y - p.y) <= 46 + z.r - 10 && Math.abs(angdiff(Math.atan2(z.y - p.y, z.x - p.x), p.angle)) <= 1.2) {
        const f = (z.kind === "brute" || z.kind === "breaker") ? 0.35 : 1;
        z.kx = Math.cos(p.angle) * 420 * f; z.ky = Math.sin(p.angle) * 420 * f;
        z.stagger = 1.1 * f; z.state = "chase"; z.toPlayer = true; z.tx = p.x; z.ty = p.y;
      }
    }
  }
  shoot(p) {
    const gun = GUNS[p.weapon];
    if (!gun || p.atkCd > 0 || p.reloadT > 0) return;
    if (p.mag <= 0) {
      this.msg(IS_TOUCH ? "Sin munición. Pulsa Recargar." : "Sin munición. Pulsa R para recargar.", [255, 190, 90], p);
      p.atkCd = 0.3;
      if ((p.inv[gun.ammo] || 0) > 0) this.reload(p);
      return;
    }
    p.mag--; p.atkCd = gun.cd; p.search = null;
    const sp = gun.spread + (gun.pellets === 1 ? (p.moving ? 0.04 : 0) : (p.moving ? 0.02 : 0));
    const hits = new Map();
    for (let k = 0; k < gun.pellets; k++) {
      const ang = p.angle + this.rnd.gauss(0, sp), c = Math.cos(ang), s = Math.sin(ang);
      let end = this.map.rayDistance(p.x, p.y, ang, gun.rng);
      const cand = [];
      for (const z of this.zombies) {
        if (!z.alive) continue;
        const rx = z.x - p.x, ry = z.y - p.y, t = rx * c + ry * s;
        if (t > 0 && t < end && Math.abs(-rx * s + ry * c) < z.r + 2) cand.push([t, z]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const taken = cand.slice(0, gun.pierce);
      taken.forEach(([t, z], i) => {
        const h = hits.get(z) || [0, ang];
        h[0] += gun.dmg * Math.pow(0.8, i);
        hits.set(z, h);
      });
      if (taken.length) end = taken[taken.length - 1][0];
      this.addTracer(p.x + c * 14, p.y + s * 14, p.x + c * end, p.y + s * end, [255, 235, 150], 2);
    }
    for (const [z, [dmg, ang]] of hits) this.hitZombie(z, dmg, ang, gun.kb, p, 0.6);
    this.makeNoise(p.x, p.y, gun.noise);
    p.swingT = 0.06;
    if (p === this.p) this.shake = Math.max(this.shake, 0.08 + (gun.pellets > 1 ? 0.05 : 0));
  }
  reload(p) {
    const gun = GUNS[p.weapon];
    if (!gun || p.reloadT > 0 || p.mag >= gun.mag) return;
    if ((p.inv[gun.ammo] || 0) <= 0) { this.msg(`No tienes ${ITEMS[gun.ammo].name.toLowerCase()}.`, [255, 190, 90], p); return; }
    p.reloadT = gun.reload; p.search = null;
    this.msg("Recargando...", [200, 220, 255], p);
  }
  onClick(p) {
    if (GUNS[p.weapon]) {
      if (p.aiming) this.shoot(p);
      else this.msg("Mantén el clic derecho para apuntar.", [200, 200, 200], p);
    } else this.meleeAttack(p);
  }
  throwItem(p, x, y) {
    if (p.throwCd > 0) return;
    let item = (p.inv[p.thr] || 0) > 0 && THROWABLES.includes(p.thr) ? p.thr : null;
    if (!item) {
      item = THROWABLES.find(i => (p.inv[i] || 0) > 0) || null;
      if (!item) { this.msg("No tienes nada que lanzar.", [255, 190, 90], p); return; }
      p.thr = item;
    }
    const ang = Math.atan2(y - p.y, x - p.x);
    let dist = Math.min(380, hypot(x - p.x, y - p.y));
    const free = this.map.rayDistance(p.x, p.y, ang, dist);
    if (free < dist) dist = Math.max(10, free - 8);
    const speed = 380;
    if (item === "bottle") this.projs.push([p.x, p.y, Math.cos(ang) * speed, Math.sin(ang) * speed, Math.max(0.05, dist / speed), 2, p.pid]);
    else this.bombs.push({ x: p.x, y: p.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, fl: Math.max(0.05, dist / speed),
      fuse: BOMBS[item].fuse, item, owner: p.pid, tick: 0 });
    this.removeItem(p, item, 1);
    if ((p.inv[item] || 0) <= 0 && item !== "bottle") p.thr = "bottle";
    p.throwCd = 0.6; p.swingT = 0.1; p.search = null;
  }
  updateBombs(dt) {
    const keep = [];
    for (const b of this.bombs) {
      if (b.fl > 0) {
        const step = Math.min(dt, b.fl);
        b.x += b.vx * step; b.y += b.vy * step; b.fl -= dt;
        if (b.fl > 0) { keep.push(b); continue; }
        b.vx = b.vy = 0; b.fl = 0;
        if (b.item === "molotov") { this.startFire(b.x, b.y, b.owner); continue; }
      }
      b.fuse -= dt;
      if (b.item === "firecracker") {
        b.tick -= dt;
        if (b.tick <= 0) { b.tick = 0.3; this.makeNoise(b.x, b.y, BOMBS.firecracker.noise); this.addFx(b.x, b.y, "pop"); }
      }
      if (b.fuse > 0) keep.push(b);
      else if (b.item !== "firecracker") this.explode(b.x, b.y, b.item, b.owner);
    }
    this.bombs = keep;
    const fk = [];
    for (const f of this.fires) {
      f[2] -= dt;
      if (f[2] <= 0) continue;
      f[4] -= dt;
      if (f[4] <= 0) {
        f[4] = 0.25;
        const owner = this.players.get(f[3]) || this.p;
        for (const z of this.zombies) if (z.alive && hypot(z.x - f[0], z.y - f[1]) < 48) this.hitZombie(z, 9, 0, 0, owner, 0);
        for (const pl of this.players.values()) if (pl.alive && hypot(pl.x - f[0], pl.y - f[1]) < 48 + PLAYER_R) this.hurtPlayer(pl, 3.5, "Fuego");
      }
      fk.push(f);
    }
    this.fires = fk;
  }
  startFire(x, y, owner) {
    this.addFx(x, y, "glass");
    this.makeNoise(x, y, BOMBS.molotov.noise);
    this.fires.push([x, y, 8, owner, 0]);
    if (this.fires.length > 24) this.fires.shift();
  }
  explode(x, y, item, owner) {
    const cfg = BOMBS[item], rad = cfg.rad, who = this.players.get(owner) || this.p;
    this.addFx(x, y, "boom");
    this.makeNoise(x, y, cfg.noise);
    this.shake = Math.max(this.shake, 0.35);
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const d = hypot(z.x - x, z.y - y);
      if (d < rad) {
        let k = 1 - 0.6 * d / rad;
        if (!this.map.lineClear(x, y, z.x, z.y)) k *= 0.35;
        this.hitZombie(z, cfg.zd * k, Math.atan2(z.y - y, z.x - x), cfg.kb * k, who, 1.0);
      }
    }
    for (const pl of this.players.values()) {
      if (!pl.alive) continue;
      const d = hypot(pl.x - x, pl.y - y);
      if (d < rad) {
        let k = 1 - 0.7 * d / rad;
        if (!this.map.lineClear(x, y, pl.x, pl.y)) k *= 0.35;
        this.hurtPlayer(pl, cfg.pd * k, "Explosión");
      }
    }
    const tr = Math.max(1, Math.floor(rad * 0.55 / TS) + 1);
    const cx = Math.floor(x / TS), cy = Math.floor(y / TS);
    for (let ty = cy - tr; ty <= cy + tr; ty++) for (let tx = cx - tr; tx <= cx + tr; tx++) {
      const d = hypot((tx + 0.5) * TS - x, (ty + 0.5) * TS - y);
      if (d <= rad * 0.55) this.damageTile(tx, ty, cfg.td * (1 - 0.6 * d / (rad * 0.55)), null);
    }
  }
  placeTorch(p) {
    if (this.torches.length >= MAX_TORCHES) { this.msg("Ya hay demasiadas antorchas encendidas.", [255, 190, 90], p); return; }
    let x = p.x + Math.cos(p.angle) * 22, y = p.y + Math.sin(p.angle) * 22;
    if (!this.map.free(x, y, 3)) { x = p.x; y = p.y; }
    if (this.torches.some(t => hypot(x - t[0], y - t[1]) < 30)) { this.msg("Ahí ya hay una antorcha.", [200, 200, 200], p); return; }
    this.removeItem(p, "torch", 1);
    this.torches.push([r1(x), r1(y)]);
    this.msg("Clavas una antorcha: no aparecerán zombis cerca. (Interactuar para recogerla)", [255, 210, 120], p);
  }
  toggleSwitch(p, bi) {
    if (this.lit.has(bi)) { this.lit.delete(bi); this.msg("Apagas la luz.", [200, 200, 210], p); }
    else { this.lit.add(bi); this.msg("Enciendes la luz: no aparecerán zombis aquí dentro.", [255, 235, 150], p); }
    this.makeNoise(p.x, p.y, 40);
  }
  nearSwitch(p) {
    let best = null;
    this.map.buildings.forEach((b, i) => {
      const [sx, sy] = switchPos(b), d = hypot(sx - p.x, sy - p.y);
      if (d < 46 && (!best || d < best[0])) best = [d, i];
    });
    return best;
  }
  unequipPack(p) {
    if (!PACKS[p.back]) return;
    if (invWeight(p.inv) + (ITEM_WEIGHT[p.back] || 1) > CAP + 1e-9) { this.msg("Llevas demasiado peso para quitarte la mochila.", [255, 190, 90], p); return; }
    const item = p.back; p.back = "";
    this.give(p, item, 1);
  }
  equipPack(p, item) {
    if (p.back === item) return;
    const old = p.back;
    const after = invWeight(p.inv) - (ITEM_WEIGHT[item] || 1) + (old ? (ITEM_WEIGHT[old] || 1) : 0);
    if (after > capOf(item) + 1e-9) { this.msg("Llevas demasiado peso para cambiar de mochila.", [255, 190, 90], p); return; }
    this.removeItem(p, item, 1);
    p.back = item;
    if (PACKS[old]) this.give(p, old, 1);
    this.msg(`Te pones: ${ITEMS[item].name} (capacidad ${capOf(item)} kg)`, [200, 220, 255], p);
  }
  updateProjectiles(dt) {
    const keep = [], alive = [...this.players.values()].filter(pl => pl.alive);
    for (const pr of this.projs) {
      const [x, y, vx, vy, ttl, kind] = pr;
      const nx = x + vx * dt, ny = y + vy * dt;
      pr[4] = ttl - dt;
      const blocked = LOS_BLOCK.has(this.map.tile(Math.floor(nx / TS), Math.floor(ny / TS)));
      if (kind === 2) {
        if (blocked || pr[4] <= 0) {
          const lx = blocked ? x : nx, ly = blocked ? y : ny;
          this.makeNoise(lx, ly, 560); this.addFx(lx, ly, "glass");
        } else { pr[0] = nx; pr[1] = ny; keep.push(pr); }
        continue;
      }
      if (blocked || pr[4] <= 0) continue;
      const hit = alive.find(pl => hypot(nx - pl.x, ny - pl.y) < PLAYER_R + 5);
      if (hit) {
        this.hurtPlayer(hit, this.rnd.uniform(6, 10), "Proyectil zombi");
        if (this.rnd.random() < 0.25 && !hit.bleeding) { hit.bleeding = true; hit.bleedT = 30; this.msg("¡Te golpearon y sangras!", [255, 120, 120], hit); }
        continue;
      }
      pr[0] = nx; pr[1] = ny; keep.push(pr);
    }
    this.projs = keep;
  }

  // ------------------------------------------------------------ zombis
  zombieSees(z, P) {
    let rng = 380 * (1 - 0.55 * this.darkNow);
    if (P.sneak) rng *= 0.55;
    if (P.flashOn && this.darkNow > 0.3) rng *= 1.5;
    if (z.d > rng) return false;
    if (z.d > 70 && Math.abs(angdiff(Math.atan2(P.y - z.y, P.x - z.x), z.angle)) > 1.2) return false;
    return this.map.lineClear(z.x, z.y, P.x, P.y);
  }
  computeFlow(P) {
    const m = this.map, sx = Math.floor(P.x / TS), sy = Math.floor(P.y / TS);
    const dist = new Map([[ck(sx, sy), 0]]);
    const q = [[sx, sy]];
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      let d = dist.get(ck(x, y));
      if (d >= FLOW_R) continue;
      d++;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const k = ck(nx, ny);
        if (dist.has(k) || FLOW_BLOCK.has(m.t[ny * N + nx])) continue;
        dist.set(k, d);
        q.push([nx, ny]);
      }
    }
    return dist;
  }
  flowDir(z, P) {
    const flow = this.flows.get(P.pid);
    if (!flow) return null;
    const tx = Math.floor(z.x / TS), ty = Math.floor(z.y / TS);
    const d0 = flow.get(ck(tx, ty));
    if (d0 === undefined) return null;
    let best = null, bd = d0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const dn = flow.get(ck(tx + dx, ty + dy));
      if (dn === undefined || dn >= bd) continue;
      if (dx && dy && (FLOW_BLOCK.has(this.map.tile(tx + dx, ty)) || FLOW_BLOCK.has(this.map.tile(tx, ty + dy)))) continue;
      best = [tx + dx, ty + dy]; bd = dn;
    }
    return best ? [(best[0] + 0.5) * TS, (best[1] + 0.5) * TS] : null;
  }
  updateZombies(dt) {
    this.zombies = this.zombies.filter(z => z.alive);
    this.darkNow = this.darkness();
    const alive = [...this.players.values()].filter(pl => pl.alive);
    if (!alive.length) return;
    const active = [];
    for (const z of this.zombies) {
      let best = null, bd = 1e9;
      for (const pl of alive) { const d = hypot(z.x - pl.x, z.y - pl.y); if (d < bd) { best = pl; bd = d; } }
      z.tp = best; z.d = bd;
      if (bd < ACTIVE_R) active.push(z);
    }
    for (const pl of alive) {
      let t = (this.flowTs.get(pl.pid) || 0) - dt, age = (this.flowAge.has(pl.pid) ? this.flowAge.get(pl.pid) : 99) + dt;
      if (t <= 0 && active.some(z => z.tp === pl && z.state === "chase" && z.d < FLOW_R * TS * 0.8)) {
        const tile = ck(Math.floor(pl.x / TS), Math.floor(pl.y / TS));
        if (tile !== this.flowTile.get(pl.pid) || age > 3 || !this.flows.has(pl.pid)) {
          this.flows.set(pl.pid, this.computeFlow(pl)); this.flowTile.set(pl.pid, tile); age = 0; t = 0.6;
        } else t = 0.2;
      }
      this.flowTs.set(pl.pid, t); this.flowAge.set(pl.pid, age);
    }
    this.zt++;
    const near = [];
    for (const z of active) {
      const lod = z.d < 450 ? 1 : (z.d < 650 ? 2 : 3);
      if (lod === 1) { this.updateZombie(z, dt, z.tp); near.push(z); }
      else if ((this.zt + z.id) % lod === 0) this.updateZombie(z, dt * lod, z.tp);
    }
    if (this.zt % 2) return;
    const grid = new Map();
    for (const z of near) {
      const k = Math.floor(z.x / 40) * 10000 + Math.floor(z.y / 40);
      let cell = grid.get(k); if (!cell) grid.set(k, cell = []); cell.push(z);
    }
    const kk = Math.min(1, dt * 16);
    for (const z of near) {
      const cx = Math.floor(z.x / 40), cy = Math.floor(z.y / 40);
      let px = 0, py = 0;
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const cell = grid.get(gx * 10000 + gy);
        if (!cell) continue;
        for (const o of cell) {
          if (o === z) continue;
          const dx = z.x - o.x, dy = z.y - o.y, d2 = dx * dx + dy * dy, lim = (z.r + o.r) * 0.85;
          if (d2 > 1e-4 && d2 < lim * lim) { const d = Math.sqrt(d2), f = (lim - d) * 0.5 / d; px += dx * f; py += dy * f; }
        }
      }
      if (px || py) this.moveEntity(z, px * kk, py * kk, z.r);
    }
  }
  zombieAttack(z, P) {
    z.atkCd = 1.3 + this.rnd.random() * 0.4;
    if (this.rnd.random() > 0.78) return;
    this.hurtPlayer(P, this.rnd.uniform(6, 12) * z.dmgMult * this.dmgm, "Zombi");
    const r = this.rnd.random();
    if (r < BITE_CHANCE * this.bitem) {
      if (!P.infected) { P.infected = true; P.infT = INFECTION_TIME; this.msg("¡Te mordió! Estás infectado.", [255, 80, 80], P); }
      else this.msg("¡Te mordió!", [255, 80, 80], P);
      P.bleeding = true; P.bleedT = 45;
    } else if (r < BITE_CHANCE * this.bitem + 0.30) {
      if (!P.bleeding) this.msg("Estás sangrando. Usa una venda.", [255, 120, 120], P);
      P.bleeding = true; P.bleedT = 45;
    }
  }
  zombieThrow(z, P) {
    const ang = Math.atan2(P.y - z.y, P.x - z.x) + this.rnd.gauss(0, 0.05);
    this.projs.push([z.x, z.y, Math.cos(ang) * 300, Math.sin(ang) * 300, 1.3, this.rnd.random() < 0.5 ? 0 : 1, -1]);
  }
  updateZombie(z, dt, P) {
    const m = this.map;
    z.throwCd -= dt; z.lungeCd -= dt; z.screamCd -= dt;
    if (z.stagger > 0) {
      z.stagger -= dt;
      this.moveEntity(z, z.kx * dt, z.ky * dt, z.r);
      const decay = Math.max(0, 1 - 8 * dt);
      z.kx *= decay; z.ky *= decay;
      return;
    }
    z.atkCd -= dt; z.lookT -= dt;
    if (z.lookT <= 0) {
      z.lookT = 0.25 + this.rnd.random() * 0.15;
      const was = z.sees;
      z.sees = this.zombieSees(z, P);
      if (z.sees && !was && z.kind === "runner" && z.screamCd <= 0 && this.rnd.random() < 0.5) {
        z.screamCd = 12; this.makeNoise(z.x, z.y, 420); this.addFx(z.x, z.y, "scream");
      }
    }
    if (z.sees) { z.state = "chase"; z.toPlayer = true; z.lostT = 7; z.tx = P.x; z.ty = P.y; }
    if (z.state === "chase") {
      if (!z.sees) {
        z.lostT -= dt;
        if (z.lostT <= 0) { z.state = "idle"; return; }
        if (z.toPlayer) { z.tx = P.x; z.ty = P.y; }
      }
      if (z.d < z.r + PLAYER_R + 5) {
        z.angle = Math.atan2(P.y - z.y, P.x - z.x);
        if (z.atkCd <= 0) this.zombieAttack(z, P);
        return;
      }
      if (z.kind === "thrower" && z.sees && z.d > 130 && z.d < 300) {
        z.angle = Math.atan2(P.y - z.y, P.x - z.x);
        if (z.throwCd <= 0) { z.throwCd = this.rnd.uniform(2.2, 3.6); this.zombieThrow(z, P); }
        return;
      }
      let ang = Math.atan2(z.ty - z.y, z.tx - z.x);
      if (z.toPlayer && !z.sees && z.kind !== "breaker") {
        const step = this.flowDir(z, P);
        if (step) ang = Math.atan2(step[1] - z.y, step[0] - z.x);
      } else if (!z.toPlayer && hypot(z.tx - z.x, z.ty - z.y) < 14) { z.state = "idle"; return; }
      if (z.steerT > 0) { z.steerT -= dt; ang += z.steerA; }
      z.angle = ang;
      let speed = z.speed * (1 + 0.15 * this.darkNow);
      if (z.lungeT > 0) { z.lungeT -= dt; speed *= 1.9; }
      else if (z.sees && z.d < 95 && z.lungeCd <= 0 && (z.kind === "walker" || z.kind === "brute")) { z.lungeT = 0.45; z.lungeCd = 4; }
      const c = Math.cos(ang), s = Math.sin(ang);
      const ax = Math.floor((z.x + c * (z.r + 6)) / TS), ay = Math.floor((z.y + s * (z.r + 6)) / TS);
      const ahead = m.tile(ax, ay);
      if (ahead === DOOR_C || (z.kind === "breaker" && BREAKABLE.has(ahead))) {
        const power = z.kind === "breaker" ? 60 : (z.kind === "brute" ? 40 : 14);
        if (this.damageTile(ax, ay, power * dt, null) === 0 && z.kind === "breaker") this.addFx(z.x, z.y, "scream");
        z.bashNoise -= dt;
        if (z.bashNoise <= 0) { z.bashNoise = 0.8; this.makeNoise(z.x, z.y, 150); }
        return;
      }
      const moved = this.moveEntity(z, c * speed * dt, s * speed * dt, z.r);
      if (moved) z.stuckT = Math.max(0, z.stuckT - dt);
      else {
        z.stuckT += dt;
        if (z.stuckT > 0.35 && z.steerT <= 0) { z.steerT = 0.6; z.steerA = (this.rnd.random() < 0.5 ? -1 : 1) * this.rnd.uniform(0.9, 1.8); z.stuckT = 0; }
      }
    } else {
      z.wanderT -= dt;
      if (z.wanderT <= 0) { z.wanderT = this.rnd.uniform(2, 5); z.wdir = this.rnd.random() < 0.4 ? null : this.rnd.uniform(0, TAU); }
      if (z.wdir !== null) {
        z.angle = z.wdir;
        if (!this.moveEntity(z, Math.cos(z.wdir) * z.speed * 0.45 * dt, Math.sin(z.wdir) * z.speed * 0.45 * dt, z.r)) z.wanderT = 0;
      }
    }
  }

  // ------------------------------------------------------------ inventario e interacción
  loadFactor(p) {
    const r = invWeight(p.inv) / capOf(p.back);
    return r <= 0.5 ? 1 : 1 - 0.35 * Math.min(1.4, (r - 0.5) / 0.5);
  }
  roomFor(p, item, qty) {
    const wt = ITEM_WEIGHT[item] || 0.5;
    return Math.max(0, Math.min(qty, Math.floor((capOf(p.back) - invWeight(p.inv)) / wt + 1e-9)));
  }
  give(p, item, qty = 1) {
    p.inv[item] = (p.inv[item] || 0) + qty;
    if (WEAPONS[item] && p.cond[item] === undefined) p.cond[item] = WEAPONS[item].dur;
  }
  removeItem(p, item, qty = 1) {
    if (qty <= 0) return;
    p.inv[item] = (p.inv[item] || 0) - qty;
    if (p.inv[item] <= 0) {
      delete p.inv[item];
      if (p.weapon === item) this.setWeapon(p, "fists");
      if (item === "flashlight") p.flashOn = false;
    }
  }
  useItem(p, item) {
    if ((p.inv[item] || 0) <= 0 || !p.alive) return;
    const kind = ITEMS[item].kind;
    if (kind === "pack") this.equipPack(p, item);
    else if (kind === "torch") this.placeTorch(p);
    else if (kind === "bomb") { p.thr = item; this.msg(`Preparado: ${ITEMS[item].name}. Lánzalo con Lanzar.`, [255, 210, 120], p); }
    else if (kind === "weapon") { this.setWeapon(p, item); this.msg(`Equipado: ${ITEMS[item].name}`, [200, 220, 255], p); }
    else if (item === "flashlight") this.toggleFlash(p);
    else if (kind === "food") {
      if (p.hunger < 8) { this.msg("No tienes hambre.", [200, 200, 200], p); return; }
      p.hunger = Math.max(0, p.hunger - ITEMS[item].amount); this.removeItem(p, item);
    } else if (kind === "drink") {
      if (p.thirst < 8) { this.msg("No tienes sed.", [200, 200, 200], p); return; }
      p.thirst = Math.max(0, p.thirst - ITEMS[item].amount);
      if (item === "soda") p.hunger = Math.max(0, p.hunger - 5);
      this.removeItem(p, item);
      if (item === "water") this.give(p, "bottle", 1);
    } else if (item === "bandage") this.useBandage(p);
    else if (item === "medkit") { p.hp = Math.min(100, p.hp + 45); p.bleeding = false; this.removeItem(p, item); this.msg("Te curaste con el botiquín.", [160, 255, 170], p); }
    else if (item === "battery") {
      if ((p.inv.flashlight || 0) <= 0) { this.msg("No tienes linterna.", [200, 200, 200], p); return; }
      p.battery = 100; this.removeItem(p, item); this.msg("Cambiaste las pilas.", [200, 220, 255], p);
    } else if (kind === "fuel") {
      const car = this.carNear(p, 70);
      if (car) this.refuel(p, car); else this.msg("Acércate a un auto para echarle gasolina.", [200, 200, 200], p);
    } else if (kind === "ammo") this.msg("La munición se carga con Recargar (con el arma de fuego equipada).", [200, 200, 200], p);
    else if (item === "bottle") { p.thr = "bottle"; this.msg("Lánzala con Lanzar para atraer zombis.", [200, 200, 200], p); }
    else if (item === "planks") this.msg("Con los tablones construyes: botón Construir.", [200, 200, 200], p);
  }
  useBandage(p) {
    if ((p.inv.bandage || 0) <= 0) this.msg("No tienes vendas.", [255, 190, 90], p);
    else if (!p.bleeding) this.msg("No estás sangrando.", [200, 200, 200], p);
    else { p.bleeding = false; this.removeItem(p, "bandage"); this.msg("Te pusiste una venda.", [160, 255, 170], p); }
  }
  autoConsume(p) {
    const order = p.thirst >= p.hunger ? ["water", "soda", "canned", "fish", "cookies"] : ["canned", "fish", "cookies", "water", "soda"];
    for (const item of order) if ((p.inv[item] || 0) > 0) { this.useItem(p, item); return; }
    this.msg("No tienes comida ni bebida.", [255, 190, 90], p);
  }
  cycleWeapon(p) {
    const opts = ["fists", ...["rod", "knife", "pan", "bat", "axe", "pistol", "smg", "shotgun", "rifle"].filter(i => (p.inv[i] || 0) > 0)];
    const i = opts.indexOf(p.weapon);
    this.setWeapon(p, i >= 0 ? opts[(i + 1) % opts.length] : "fists");
  }
  toggleFlash(p) {
    if ((p.inv.flashlight || 0) <= 0) this.msg("No tienes linterna.", [200, 200, 200], p);
    else if (p.battery <= 0) this.msg("La linterna no tiene pilas.", [255, 190, 90], p);
    else p.flashOn = !p.flashOn;
  }
  findInteract(p) {
    p = p || this.p;
    const ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);
    let best = null;
    for (let ty = pty - 2; ty <= pty + 2; ty++) for (let tx = ptx - 2; tx <= ptx + 2; tx++) {
      const t = this.map.tile(tx, ty);
      if (!(t === DOOR_C || t === DOOR_O || t === CONT || t === WATER)) continue;
      const cx = (tx + 0.5) * TS, cy = (ty + 0.5) * TS, d = hypot(cx - p.x, cy - p.y);
      if (d > INTERACT_DIST) continue;
      if (d > 34 && Math.abs(angdiff(Math.atan2(cy - p.y, cx - p.x), p.angle)) > 1.1) continue;
      if (!best || d < best[0]) best = [d, tx, ty, t];
    }
    return best;
  }
  findGround(p) {
    let best = null;
    for (const it of this.items.values()) {
      const d = hypot(it[0] - p.x, it[1] - p.y);
      if (d <= 40 && (!best || d < best[0])) best = [d, it];
    }
    return best;
  }
  interactText(p) {
    p = p || this.p;
    if (p.car !== null) return "Bajar del auto";
    const car = this.carNear(p);
    if (car) return `Subir al auto (gasolina ${car.fuel | 0}%)` + (car.fuel < 15 ? " - usa un bidón" : "");
    const sw = this.nearSwitch(p);
    if (sw) return this.lit.has(sw[1]) ? "Apagar la luz" : "Encender la luz";
    if (this.torches.some(t => hypot(t[0] - p.x, t[1] - p.y) < 40)) return "Recoger antorcha";
    const gnd = this.findGround(p), b = this.findInteract(p);
    if (gnd && (!b || gnd[0] <= b[0])) { const it = gnd[1]; return `Recoger ${ITEMS[it[2]].name}` + (it[3] > 1 ? ` x${it[3]}` : ""); }
    if (!b) return "";
    if (b[3] === DOOR_C) return "Abrir puerta";
    if (b[3] === DOOR_O) return "Cerrar puerta";
    if (b[3] === WATER) return p.weapon === "rod" ? "Pescar" : "Beber agua del lago";
    const c = this.map.containers.get(ck(b[1], b[2]));
    const name = c ? (CONT_NAMES[c.kind] || "mueble") : "mueble";
    return `Abrir ${name.toLowerCase()}` + (c && c.looted ? " (vacío)" : "");
  }
  interact(p) {
    if (p.car !== null) { this.exitCar(p); return; }
    const car = this.carNear(p);
    if (car) { this.enterCar(p, car); return; }
    const sw = this.nearSwitch(p);
    if (sw) { this.toggleSwitch(p, sw[1]); return; }
    const tc = this.torches.find(t => hypot(t[0] - p.x, t[1] - p.y) < 40);
    if (tc) {
      if (this.roomFor(p, "torch", 1) <= 0) this.msg("Llevas demasiado peso.", [255, 190, 90], p);
      else { this.torches.splice(this.torches.indexOf(tc), 1); this.give(p, "torch", 1); this.msg("Recoges la antorcha.", [170, 255, 190], p); }
      return;
    }
    const gnd = this.findGround(p), b = this.findInteract(p);
    if (gnd && (!b || gnd[0] <= b[0])) { this.pickup(p, gnd[1]); return; }
    if (!b) return;
    const [, tx, ty, t] = b;
    if (t === DOOR_C) { this.setTile(tx, ty, DOOR_O); this.makeNoise((tx + 0.5) * TS, (ty + 0.5) * TS, 90); }
    else if (t === DOOR_O) {
      const cx = (tx + 0.5) * TS, cy = (ty + 0.5) * TS;
      if ([...this.players.values(), ...this.zombies].some(e => hypot(e.x - cx, e.y - cy) < 22)) this.msg("Hay alguien en la puerta.", [255, 190, 90], p);
      else this.setTile(tx, ty, DOOR_C);
    } else if (t === WATER) {
      if (p.weapon === "rod") {
        if (!p.fish) {
          p.work = p.search = null;
          p.fish = [tx, ty, 0, this.rnd.uniform(4, 8)];
          this.makeNoise(p.x, p.y, 35);
          this.msg("Lanzas la caña... espera sin moverte.", [150, 200, 255], p);
        }
      } else if (p.drinkCd <= 0) { p.drinkCd = 1; p.thirst = Math.max(0, p.thirst - 18); this.msg("Bebes agua del lago.", [150, 200, 255], p); }
    } else {
      const c = this.map.containers.get(ck(tx, ty));
      if (!c) return;
      p.work = p.fish = null;
      if (!c.rolled) { if (!p.search) { p.search = [tx, ty, 0, 1.4]; this.makeNoise(p.x, p.y, 50); } }
      else this.openContainer(p, tx, ty);
    }
  }
  updateFishing(p, dt) {
    const f = p.fish;
    if (p.weapon !== "rod" || this.map.tile(f[0], f[1]) !== WATER) { p.fish = null; return; }
    f[2] += dt;
    if (f[2] < f[3]) return;
    p.fish = null;
    const r = this.rnd.random();
    if (r < 0.62) { this.give(p, "fish", 1); this.msg("¡Pescaste un pez!", [150, 230, 255], p); }
    else if (r < 0.74) { this.give(p, "bottle", 1); this.msg("Pescaste una botella vacía.", [190, 220, 235], p); }
    else this.msg("Se escapó... vuelve a lanzar.", [200, 200, 200], p);
    this.wearWeapon(p, 1);
  }
  spawnItem(x, y, item, qty) {
    if (qty <= 0) return;
    for (const it of this.items.values()) if (it[2] === item && hypot(it[0] - x, it[1] - y) < 14) { it[3] += qty; return; }
    const id = this.nextIid++;
    this.items.set(id, [x, y, item, qty, id]);
    if (this.items.size > 400) this.items.delete(this.items.keys().next().value);
  }
  pickup(p, it) {
    if (!this.items.has(it[4])) return;
    const orig = it[3], n = this.roomFor(p, it[2], orig);
    if (n <= 0) { this.msg("Llevas demasiado peso. Suelta algo para recoger esto.", [255, 190, 90], p); return; }
    if (n < orig) it[3] -= n; else this.items.delete(it[4]);
    this.give(p, it[2], n);
    this.msg(`Recoges ${ITEMS[it[2]].name}` + (n > 1 ? ` x${n}` : "") + (n < orig ? " (no te cabe todo)" : ""), [170, 255, 190], p);
  }
  itemArg(arg) {
    if (!Array.isArray(arg) || arg.length !== 2) return null;
    const [item, qty] = arg;
    if (typeof item !== "string" || !ITEMS[item] || !Number.isInteger(qty) || qty < 0 || qty > 9999) return null;
    return [item, qty];
  }
  dropItem(p, arg) {
    const a = this.itemArg(arg);
    if (!a) return;
    const [item, qty] = a, have = p.inv[item] || 0, n = qty === 0 ? have : Math.min(qty, have);
    if (n <= 0) return;
    this.removeItem(p, item, n);
    let x = p.x + Math.cos(p.angle) * 18, y = p.y + Math.sin(p.angle) * 18;
    if (!this.map.free(x, y, 3)) { x = p.x; y = p.y; }
    this.spawnItem(x, y, item, n);
    this.msg(`Tiras ${ITEMS[item].name}` + (n > 1 ? ` x${n}` : ""), [200, 200, 200], p);
  }
  rollLoot(c) {
    const rnd = this.rnd, q = c.q || 0;
    let n = weighted(rnd, ITEM_COUNT_BY_QUALITY[q])[0] * this.lmul;
    n = Math.floor(n) + (rnd.random() < n - Math.floor(n) ? 1 : 0);
    const table = (LOOT[c.kind] || []).map(([i, wt, lo, hi]) => [i, wt * (RARE_ITEMS.has(i) ? 1 + 1.2 * q : 1), lo, hi]);
    for (let i = 0; i < n && table.length; i++) {
      const [item, , lo, hi] = weighted(rnd, table);
      const qty = rnd.randint(lo, hi) + ((item === "ammo" || item === "planks") && q >= 2 ? 1 : 0);
      c.inv[item] = (c.inv[item] || 0) + qty;
    }
    c.rolled = true;
  }
  syncContainer(tx, ty, c) {
    const empty = Object.keys(c.inv).length === 0;
    if (c.looted !== empty) { c.looted = empty; this.map.dirty(tx, ty); this.evLoot.push([tx, ty, empty ? 1 : 0]); }
  }
  openContainer(p, tx, ty) {
    const c = this.map.containers.get(ck(tx, ty));
    if (!c) return;
    if (!c.rolled) { this.rollLoot(c); this.syncContainer(tx, ty, c); }
    p.open = [tx, ty]; p.search = null;
  }
  takeItem(p, arg) {
    const a = this.itemArg(arg), c = p.open ? this.map.containers.get(ck(p.open[0], p.open[1])) : null;
    if (!a || !c) return;
    const [item, qty] = a, have = c.inv[item] || 0;
    let n = qty === 0 ? have : Math.min(qty, have);
    const fit = this.roomFor(p, item, n);
    if (fit < n) this.msg(fit <= 0 ? "No puedes cargar tanto peso." : "Solo te cabe una parte.", [255, 190, 90], p);
    n = fit;
    if (n <= 0) return;
    if (have - n > 0) c.inv[item] = have - n; else delete c.inv[item];
    this.give(p, item, n);
    this.syncContainer(p.open[0], p.open[1], c);
  }
  putItem(p, arg) {
    const a = this.itemArg(arg), c = p.open ? this.map.containers.get(ck(p.open[0], p.open[1])) : null;
    if (!a || !c) return;
    const [item, qty] = a, have = p.inv[item] || 0, n = qty === 0 ? have : Math.min(qty, have);
    if (n <= 0) return;
    this.removeItem(p, item, n);
    c.inv[item] = (c.inv[item] || 0) + n;
    this.syncContainer(p.open[0], p.open[1], c);
  }
  restock() {
    let n = 0;
    for (const [k, c] of this.map.containers) {
      if (c.kind !== "chest" && c.looted) {
        c.rolled = false; c.looted = false;
        this.map.dirty(ckx(k), cky(k));
        this.evLoot.push([ckx(k), cky(k), 0]);
        n++;
      }
    }
    if (n) this.msg(`Amanece el día ${this.day()}: ${n} muebles tienen botín nuevo.`, [255, 235, 150]);
  }
}
