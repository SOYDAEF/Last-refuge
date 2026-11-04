/* Last Refuge - modo online: el anfitrión simula el mundo y manda "fotos" (snapshots) a los demás por WebRTC. */
"use strict";

class Host {
  constructor(game) {
    this.game = game;
    this.code = ZNet.host();
    this.peers = new Map();         // id de red -> {pid|null, t0}
    this.snapT = 0;
  }
  close() { try { ZNet.close(); } catch (e) {} }
  status() { return ZNet.status(); }
  sendTo(id, obj) { ZNet.send(JSON.stringify(obj), id); }
  poll() {
    const g = this.game;
    for (let n = 0; n < 500; n++) {
      const raw = ZNet.pop();
      if (!raw) break;
      let m; try { m = JSON.parse(raw); } catch (e) { continue; }
      const id = m.from;
      if (m.sys === "join") { this.peers.set(id, { pid: null, t0: Date.now() }); continue; }
      if (m.sys === "leave") { this.drop(id); continue; }
      if (m.data === undefined) continue;
      let d; try { d = JSON.parse(m.data); } catch (e) { continue; }
      const peer = this.peers.get(id) || { pid: null, t0: Date.now() };
      this.peers.set(id, peer);
      if (peer.pid === null) { if (d.t === "hello") this.accept(id, peer, d); continue; }
      const p = g.players.get(peer.pid);
      if (p) this.handle(p, d);
    }
  }
  accept(id, peer, m) {
    const g = this.game;
    if (g.players.size >= MAX_PLAYERS) { this.sendTo(id, { t: "full" }); return; }
    const name = String(m.name || "Jugador").replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 14).trim() || "Jugador";
    const p = g.addPlayer(name, true);
    if (HATS.includes(m.hat)) p.hat = m.hat;
    peer.pid = p.pid;
    const mods = [...g.map.mods].map(([k, v]) => [ckx(k), cky(k), v]);
    const conts = [...g.map.containers].map(([k, c]) => [ckx(k), cky(k), c.kind, c.looted ? 1 : 0]);
    this.sendTo(id, { t: "welcome", pid: p.pid, pos: [p.x, p.y], name: p.name, m: g.minutes, seed: g.seed, gs: g.settings,
      mods, conts, lit: [...g.lit], corpses: g.corpses.slice(-80) });
    g.msg(`${p.name} se unió a la partida.`, [170, 255, 190]);
  }
  drop(id) {
    const peer = this.peers.get(id);
    this.peers.delete(id);
    if (!peer || peer.pid === null) return;
    const g = this.game, p = g.players.get(peer.pid);
    if (p) {
      g.releaseCar(p.pid);
      g.players.delete(p.pid);
      g.msg(`${p.name} se desconectó.`, [255, 190, 90]);
    }
  }
  handle(p, m) {
    const g = this.game;
    if (m.t === "in") {
      const f = k => +m[k];
      const v = { x: f("x"), y: f("y"), a: f("a"), mv: m.mv | 0, run: m.run | 0, aim: m.aim | 0, hold: m.hold | 0, sn: m.sn | 0,
        mx: f("mx"), my: f("my"), dm: m.dm | 0, tf: m.tf | 0 };
      const dv = Array.isArray(m.dv) ? m.dv : [0, 0];
      v.dv = [clamp(+dv[0] || 0, -1, 1), clamp(+dv[1] || 0, -1, 1)];
      if (["x", "y", "a", "mx", "my"].every(k => Number.isFinite(v[k]))) p.inp = v;
    } else if (m.t === "act") g.doAction(p, m.a, m.arg);
    else if (m.t === "chat") {
      const text = String(m.x || "").slice(0, 80).trim();
      if (text) g.msg(`${p.name}: ${text}`, [255, 255, 255]);
    }
  }
  broadcast(dt) {
    this.snapT -= dt;
    if (this.snapT > 0) return;                 // los eventos se acumulan hasta el próximo envío
    this.snapT = 1 / SNAP_HZ;
    const g = this.game;
    for (const [id, peer] of this.peers) {
      if (peer.pid === null) continue;
      const p = g.players.get(peer.pid);
      if (p) ZNet.send(JSON.stringify(this.snapshot(p)), id);
    }
    g.clearEvents();
  }
  snapshot(pl) {
    const g = this.game, near = (x, y, r = VIEW_R) => Math.abs(x - pl.x) < r && Math.abs(y - pl.y) < r;
    const me = { hp: r1(pl.hp), hu: r1(pl.hunger), th: r1(pl.thirst), st: r1(pl.stamina), ex: pl.exhausted ? 1 : 0,
      bl: pl.bleeding ? 1 : 0, inf: pl.infected ? 1 : 0, it: r1(pl.infT), wp: pl.weapon, mag: pl.mag, fl: pl.flashOn ? 1 : 0,
      bat: r1(pl.battery), k: pl.kills, al: pl.alive ? 1 : 0, cs: pl.cause, rl: r2(pl.reloadT), inv: pl.inv, cond: pl.cond,
      se: pl.search, wk: pl.work, sw: pl.swingT > 0 ? 1 : 0, hit: pl.hurtEv ? 1 : 0, fs: pl.fish, hat: pl.hat,
      car: pl.car === null ? -1 : pl.car, bk: pl.back, thr: pl.thr };
    if (pl.open) {
      const c = g.map.containers.get(ck(pl.open[0], pl.open[1]));
      if (c) me.cv = [pl.open[0], pl.open[1], c.kind, c.inv];
    }
    if (pl.fix) { me.fx = [r1(pl.x), r1(pl.y)]; pl.fix = false; }
    pl.hurtEv = false;
    const others = [];
    for (const o of g.players.values())
      if (o !== pl && o.alive) others.push([o.pid, r1(o.x), r1(o.y), r2(o.angle), o.weapon, o.flashOn ? 1 : 0, o.sneak ? 1 : 0,
        o.swingT > 0 ? 1 : 0, o.hp | 0, o.name, o.hat, o.moving ? 1 : 0]);
    const zs = [];
    for (const z of g.zombies) {
      if (!near(z.x, z.y)) continue;
      zs.push([z.id, r1(z.x), r1(z.y), r2(z.angle), z.state === "chase" ? 1 : 0, Math.round(100 * Math.max(0, z.hp) / z.maxHp),
        z.skinI, z.clothI, KINDS.indexOf(z.kind)]);
      if (zs.length >= 160) break;
    }
    const msgs = pl.outbox; pl.outbox = [];
    return {
      t: "snap", m: r2(g.minutes), me, pl: others, z: zs,
      pr: g.projs.filter(p => near(p[0], p[1])).map(p => [r1(p[0]), r1(p[1]), p[5]]),
      bb: g.bombs.filter(b => near(b.x, b.y)).map(b => [r1(b.x), r1(b.y), b.item]),
      fr: g.fires.filter(f => near(f[0], f[1])).map(f => [r1(f[0]), r1(f[1]), r1(f[2])]),
      tc: g.torches.filter(t => near(t[0], t[1], VIEW_R + 200)),
      lb: [...g.lit],
      gi: [...g.items.values()].filter(it => near(it[0], it[1])).slice(0, 120).map(it => [it[4], Math.round(it[0]), Math.round(it[1]), it[2], it[3]]),
      cars: g.cars.filter(c => near(c.x, c.y, VIEW_R + 200)).map(c => [c.id, r1(c.x), r1(c.y), r2(c.angle), c.fuel | 0, c.hp | 0,
        c.driver === null ? -1 : c.driver, c.ci, c.v | 0]),
      msg: msgs,
      ev: { tr: g.evTracers, co: g.evCorpses, ti: g.evTiles, lo: g.evLoot, fx: g.evFx, ct: g.evCont },
    };
  }
}

class Client {
  constructor(code, name, hat) {
    this.name = name; this.hat = hat;
    this.helloSent = false; this.welcome = null; this.backlog = []; this.dead = false;
    this.t0 = Date.now();
    ZNet.join(code);
  }
  drain() {
    const out = [];
    for (let n = 0; n < 500; n++) {
      const raw = ZNet.pop();
      if (!raw) break;
      let m; try { m = JSON.parse(raw); } catch (e) { continue; }
      if (m.sys === "leave") this.dead = true;
      else if (m.data !== undefined) { try { out.push(JSON.parse(m.data)); } catch (e) {} }
    }
    if (String(ZNet.status()).startsWith("error")) this.dead = true;
    return out;
  }
  advance() {          // "wait", "ok" o un texto de error
    const st = String(ZNet.status());
    if (st.startsWith("error")) return st.slice(6) || "error de conexión";
    if (Date.now() - this.t0 > 60000) return "tiempo de espera agotado";
    if (st === "connected" && !this.helloSent) { this.helloSent = true; this.send({ t: "hello", name: this.name, hat: this.hat, v: 1 }); }
    const msgs = this.drain();
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].t === "welcome") { this.welcome = msgs[i]; this.backlog = msgs.slice(i + 1); return "ok"; }
      if (msgs[i].t === "full") return "la partida está llena";
    }
    return "wait";
  }
  send(obj) { ZNet.send(JSON.stringify(obj)); }
  poll() { const m = this.backlog.concat(this.drain()); this.backlog = []; return m; }
  close() { this.dead = true; try { ZNet.close(); } catch (e) {} }
}

/* El mundo tal como lo ve un cliente: el mapa se genera igual con la semilla; el resto llega en los snapshots. */
class ClientGame extends Game {
  constructor(w) {
    super(w.seed, { settings: w.gs, local: false, view: true });
    const m = this.map;
    for (const [x, y, v] of w.mods) m.setTile(x, y, v);
    m.containers.clear();
    for (const [x, y, kind, looted] of w.conts) m.containers.set(ck(x, y), { kind, looted: !!looted, q: 0, rolled: true, inv: {} });
    m.chunks.clear();
    this.isClient = true;
    this.pid = w.pid;
    this.p = new Player(w.pos[0], w.pos[1], w.pid, w.name);
    this.players.set(w.pid, this.p);
    this.others = new Map();
    this.zmap = new Map(); this.cmap = new Map();
    this.minutes = +w.m;
    this.lit = new Set(w.lit || []);
    this.corpses = (w.corpses || []).slice();
    this.msg("Conectado. ¡Sobrevive!", [170, 255, 190], this.p);
  }
  otherPlayers() { return [...this.others.values()]; }
  update(dt, inp) {
    this.tickEffects(dt);
    this.minutes += dt * GAME_MIN_PER_SEC * this.tmul;
    const p = this.p, k = Math.min(1, dt * 14);
    for (const c of this.cars) {
      c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k;
      c.angle += angdiff(c.ta, c.angle) * k;
    }
    const mine = this.myCar();
    if (p.alive && !mine) this.controlMove(p, dt, inp);
    else if (p.alive) { p.x = mine.x; p.y = mine.y; p.angle = mine.angle; p.moving = false; }
    p.swingT -= dt; p.hurtT -= dt;
    for (const z of this.zombies) { z.x += (z.tx - z.x) * k; z.y += (z.ty - z.y) * k; }
    for (const o of this.others.values()) { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.swingT -= dt; }
  }
  applySnap(s) {
    this.minutes = +s.m;
    const me = s.me, p = this.p;
    p.hp = me.hp; p.hunger = me.hu; p.thirst = me.th; p.stamina = me.st; p.exhausted = !!me.ex; p.bleeding = !!me.bl;
    p.infected = !!me.inf; p.infT = me.it; p.weapon = me.wp; p.mag = me.mag; p.flashOn = !!me.fl; p.battery = me.bat;
    p.kills = me.k; p.alive = !!me.al; p.cause = me.cs; p.reloadT = me.rl; p.inv = me.inv; p.cond = me.cond;
    p.search = me.se; p.work = me.wk; p.fish = me.fs; p.hat = me.hat || p.hat; p.back = me.bk || ""; p.thr = me.thr || "bottle";
    p.open = me.cv ? [me.cv[0], me.cv[1]] : null;
    p.cview = me.cv || null;
    p.car = me.car < 0 ? null : me.car;
    if (me.fx) { p.x = me.fx[0]; p.y = me.fx[1]; }
    if (me.sw) p.swingT = 0.14;
    if (me.hit) { p.hurtT = 0.3; this.shake = 0.25; }
    this.items = new Map(s.gi.map(g => [g[0], [g[1], g[2], g[3], g[4], g[0]]]));
    const seen = new Set();
    for (const [pid, x, y, a, wp, fl, sn, sw, hp, name, hat, mv] of s.pl) {
      let o = this.others.get(pid);
      if (!o) { o = new Player(x, y, pid, name); this.others.set(pid, o); }
      o.hat = HATS.includes(hat) ? hat : "none";
      o.tx = x; o.ty = y; o.angle = a; o.weapon = wp; o.flashOn = !!fl; o.sneak = !!sn; o.hp = hp; o.moving = !!mv;
      if (sw) o.swingT = 0.14;
      seen.add(pid);
    }
    for (const pid of [...this.others.keys()]) if (!seen.has(pid)) this.others.delete(pid);
    const zm = new Map(), zs = [];
    for (const [id, x, y, a, st, hpp, si, ci, ki] of s.z) {
      let z = this.zmap.get(id);
      const kind = KINDS[ki % KINDS.length];
      if (!z) z = { id, x, y, tx: x, ty: y, kind, r: ZK[kind].r, angle: a, state: "idle", hp: 100, maxHp: 100, alive: true };
      z.tx = x; z.ty = y; z.angle = a; z.state = st ? "chase" : "idle"; z.hp = hpp; z.kind = kind;
      z.skin = Z_SKINS[si % Z_SKINS.length]; z.cloth = Z_CLOTHES[ci % Z_CLOTHES.length];
      zm.set(id, z); zs.push(z);
    }
    this.zombies = zs; this.zmap = zm;
    this.projs = s.pr.map(([x, y, k]) => [x, y, 0, 0, 0, k, 0]);
    this.bombs = s.bb.map(([x, y, item]) => ({ x, y, item }));
    this.fires = s.fr.map(([x, y, t]) => [x, y, t]);
    this.torches = s.tc.map(t => [t[0], t[1]]);
    this.lit = new Set(s.lb);
    const cm = new Map(), cs = [];
    for (const [id, x, y, a, fu, hp, dr, ci, v] of s.cars) {
      let c = this.cmap.get(id);
      if (!c) { c = new Car(id, x, y, a, ci, fu); c.tx = x; c.ty = y; c.ta = a; }
      c.tx = x; c.ty = y; c.ta = a; c.fuel = fu; c.hp = hp; c.driver = dr < 0 ? null : dr; c.ci = ci; c.v = v;
      c.color = CAR_COLORS[ci % CAR_COLORS.length];
      cm.set(id, c); cs.push(c);
    }
    this.cars = cs; this.cmap = cm;
    for (const [text, col] of s.msg) { p.msgs.push([text, 5, col]); if (p.msgs.length > 5) p.msgs.shift(); }
    const ev = s.ev;
    for (const [x1, y1, x2, y2, col, w] of ev.tr) this.tracers.push([x1, y1, x2, y2, col, w, 0.08]);
    for (const c of ev.co) { this.corpses.push(c); if (this.corpses.length > 260) this.corpses.shift(); }
    for (const [x, y, v] of ev.ti) this.map.setTile(x, y, v);
    for (const [x, y, empty] of ev.lo) {
      const c = this.map.containers.get(ck(x, y));
      if (c) { c.looted = !!empty; this.map.dirty(x, y); }
    }
    for (const [x, y, kind] of ev.ct) { this.map.containers.set(ck(x, y), { kind, looted: true, q: 0, rolled: true, inv: {} }); this.map.dirty(x, y); }
    for (const [x, y, kind] of ev.fx) this.fx.push([x, y, kind, 0.6]);
  }
}
