/* Last Refuge - aplicación: bucle principal, dibujo, entrada (teclado/ratón/táctil), HUD, guardado. */
"use strict";

const SAVE_KEY = "lastrefuge_save", CFG_KEY = "lastrefuge_cfg";
const LQ = 4; const STICK_R = 58;                                   // la luz se calcula a 1/4 de resolución
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function loadCfg() {
  const cfg = { name: "Superviviente", hat: "none", dark: 1.0, fps: false, minimap: true, game: normSettings(null), touch: IS_TOUCH, aimAssist: true, turn: { url: "", user: "", pass: "" } };
  try {
    const d = JSON.parse(store.get(CFG_KEY) || "{}");
    if (typeof d.name === "string" && d.name.trim()) cfg.name = d.name.trim().slice(0, 14);
    if (HATS.includes(d.hat)) cfg.hat = d.hat;
    if (typeof d.dark === "number") cfg.dark = clamp(d.dark, 0.5, 1);
    for (const k of ["fps", "minimap", "touch", "aimAssist"]) if (typeof d[k] === "boolean") cfg[k] = d[k];
    if (d.game) cfg.game = normSettings(d.game);
    if (d.turn && typeof d.turn === "object") cfg.turn = { url: String(d.turn.url || ""), user: String(d.turn.user || ""), pass: String(d.turn.pass || "") };
  } catch (e) {}
  return cfg;
}

class App {
  constructor() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.cfg = loadCfg();
    this.state = "title";
    this.game = null; this.mode = null; this.host = null; this.client = null; this.cam = [0, 0];
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, left: false, right: false, seen: false };
    this.sticks = { L: null, R: null };
    this.sneak = false; this.runToggle = false; this.demoHeld = false;
    this.buildMode = false; this.buildPiece = 0; this.buildTile = null;
    this.showMap = this.cfg.minimap;
    this.invOpen = false; this.menuOpen = false; this.chatOpen = false;
    this.aimAng = 0; this.sendT = 0; this.t = 0; this.saveT = 0;
    this.light = document.createElement("canvas"); this.lctx = this.light.getContext("2d");
    this.minimapC = null; this.minimapT = 0;
    this.fpsAvg = 60;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindInput();
    UI.init(this);
    UI.title();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.autoSave(); });
    window.addEventListener("pagehide", () => this.autoSave());
  }
  get touch() { return this.cfg.touch; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.cssW = window.innerWidth; this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * dpr); this.canvas.height = Math.round(this.cssH * dpr);
    const target = this.touch ? 470 : 680;
    this.zoom = clamp(Math.min(this.cssH, this.cssW * 0.75) / target, 0.55, 2.2);
    this.viewW = this.cssW / this.zoom; this.viewH = this.cssH / this.zoom;
    this.light.width = Math.ceil(this.viewW / LQ) + 2; this.light.height = Math.ceil(this.viewH / LQ) + 2;
    document.getElementById("rotate").classList.toggle("hidden", !(this.touch && this.state === "play" && this.cssH > this.cssW));
  }

  // ------------------------------------------------------------ partidas
  begin(game, mode) {
    this.game = game; this.mode = mode; this.state = "play";
    this.menuOpen = false; this.buildMode = false; this.sneak = false; this.runToggle = false;
    this.minimapC = game.map.minimap(); this.minimapT = 0;
    this.cam = [game.p.x - this.viewW / 2, game.p.y - this.viewH / 2];
    UI.hide(); UI.setTouch(this.touch); UI.updateBuildBar();
    this.resize();
  }
  startSolo(seedText) {
    const seed = parseSeed(seedText);
    this.stopNet();
    this.begin(new Game(seed, { settings: this.cfg.game, name: this.cfg.name, hat: this.cfg.hat }), "solo");
  }
  saveGame(silent) {
    if (this.mode !== "solo" || !this.game || !this.game.p.alive) return false;
    const ok = store.set(SAVE_KEY, JSON.stringify(this.game.toSave()));
    if (!silent) this.game.msg(ok ? "Partida guardada." : "No se pudo guardar (almacenamiento lleno o bloqueado).", ok ? [200, 255, 200] : [255, 150, 120], this.game.p);
    return ok;
  }
  autoSave() { if (this.state === "play" && this.mode === "solo") this.saveGame(true); }
  hasSave() { return !!store.get(SAVE_KEY); }
  loadGame() {
    try {
      const d = JSON.parse(store.get(SAVE_KEY));
      this.stopNet();
      this.begin(Game.fromSave(d, this.cfg.name, this.cfg.hat), "solo");
      return true;
    } catch (e) { console.error(e); return false; }
  }
  applyTurn() {                          // retransmisores propios (config.js y Ajustes)
    const list = TURN_SERVERS.slice(), t = this.cfg.turn;
    if (t && t.url && t.user && t.pass) {
      const host = t.url.trim().replace(/^turns?:/, "").replace(/\?.*$/, "");
      list.push({ urls: ["turn:" + host, "turn:" + host + "?transport=tcp"], username: t.user.trim(), credential: t.pass.trim() });
    }
    ZNet.config({ extraTurn: list });
    return list.length;
  }
  startHost() {
    this.stopNet();
    this.applyTurn();
    const g = new Game(parseSeed(""), { settings: this.cfg.game, name: this.cfg.name, hat: this.cfg.hat });
    this.host = new Host(g);
    this.begin(g, "host");
    g.msg(`Sala creada. Código: ${this.host.code} (pásaselo a tus amigos)`, [170, 230, 255], g.p);
  }
  startJoin(code) {
    this.stopNet();
    this.applyTurn();
    this.client = new Client(code, this.cfg.name, this.cfg.hat);
    UI.connecting();
    const tick = () => {
      if (!this.client) return;
      const r = this.client.advance();
      if (r === "ok") {
        const cg = new ClientGame(this.client.welcome);
        cg.p.hat = this.cfg.hat;
        this.begin(cg, "client");
      } else if (r === "wait") setTimeout(tick, 120);
      else {
        this.stopNet();
        const hint = /retransmisor=0/.test(r) ? "\n\nEl retransmisor no respondió. Revisen que los dos tengan internet y la versión nueva del juego (recarguen la página)." : "";
        UI.online("No se pudo conectar: " + r + hint);
      }
    };
    tick();
  }
  stopNet() {
    if (this.host) this.host.close();
    if (this.client) this.client.close();
    this.host = this.client = null;
  }
  backToTitle(msg) {
    this.autoSave();
    this.stopNet();
    this.game = null; this.state = "title"; this.invOpen = false; this.menuOpen = false;
    UI.setTouch(false); UI.closeInv(); UI.closeChat();
    UI.title(msg);
    this.resize();
  }
  act(a, arg) {
    if (!this.game) return;
    if (this.mode === "client") { if (this.client) this.client.send({ t: "act", a, arg: arg === undefined ? null : arg }); }
    else this.game.doAction(this.game.p, a, arg);
  }
  sendChat(text) {
    text = (text || "").trim().slice(0, 80);
    if (!text || !this.game) return;
    if (this.mode === "client") this.client.send({ t: "chat", x: text });
    else if (this.mode === "host") this.game.msg(`${this.game.p.name}: ${text}`, [255, 255, 255]);
  }

  // ------------------------------------------------------------ entrada
  bindInput() {
    const c = this.canvas;
    window.addEventListener("keydown", e => this.onKey(e, true));
    window.addEventListener("keyup", e => this.onKey(e, false));
    window.addEventListener("blur", () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; this.demoHeld = false; });
    c.addEventListener("contextmenu", e => e.preventDefault());
    c.addEventListener("pointerdown", e => this.onPointer(e, "down"));
    window.addEventListener("pointermove", e => this.onPointer(e, "move"));
    window.addEventListener("pointerup", e => this.onPointer(e, "up"));
    window.addEventListener("pointercancel", e => this.onPointer(e, "up"));
    c.addEventListener("wheel", e => {
      if (this.state === "play" && this.buildMode && !this.touch) {
        this.buildPiece = (this.buildPiece + (e.deltaY > 0 ? 1 : BUILD_PIECES.length - 1)) % BUILD_PIECES.length;
        UI.updateBuildBar();
      }
    }, { passive: true });
  }
  onKey(e, down) {
    if (UI.typing()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && this.cfg.touch && !e.repeat && /^[a-z]$/.test(k)) { this.cfg.touch = false; UI.setTouch(false); this.resize(); }
    if (this.state !== "play") return;
    if (["Tab", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    if (!down) { this.keys.delete(k); if (k === "g") this.demoHeld = false; return; }
    if (e.repeat) return;
    this.keys.add(k);
    if (k === "Escape") {
      if (this.invOpen) UI.closeInv();
      else if (this.chatOpen) UI.closeChat();
      else if (this.buildMode) { this.buildMode = false; UI.updateBuildBar(); }
      else this.togglePause();
      return;
    }
    if (this.menuOpen) return;
    if (k === "i") { this.invOpen ? UI.closeInv() : UI.openInv(); return; }
    if (this.invOpen) return;
    const g = this.game, p = g.p;
    if (!p.alive) {
      if (k === "Enter" || k === "r") this.respawnOrNew();
      return;
    }
    if (this.buildMode && /^[1-5]$/.test(k)) { this.buildPiece = +k - 1; UI.updateBuildBar(); return; }
    switch (k) {
      case "e": this.act("interact"); break;
      case "f": this.act("flash"); break;
      case "r": this.act("reload"); break;
      case "Tab": this.act("cycle"); break;
      case " ": this.act("shove"); break;
      case "h": this.act("bandage"); break;
      case "q": this.act("consume"); break;
      case "c": this.sneak = !this.sneak; break;
      case "b": this.buildMode = !this.buildMode; UI.updateBuildBar(); break;
      case "g": this.demoHeld = true; break;
      case "v": this.act("throw", [r1(this.aimPoint()[0]), r1(this.aimPoint()[1])]); break;
      case "m": this.showMap = !this.showMap; break;
      case "t": if (this.mode !== "solo") UI.openChat(); break;
      case "p": this.togglePause(); break;
      default:
        if (/^[1-9]$/.test(k)) { const own = g.owned(); const it = own[+k - 1]; if (it) this.act("use", it); }
    }
  }
  togglePause() {
    if (this.menuOpen) { this.menuOpen = false; UI.hide(); }
    else { this.menuOpen = true; UI.pause(); }
  }
  respawnOrNew() {
    if (this.mode === "solo") { if (!this.game.revive) store.del(SAVE_KEY); this.startSolo(""); }
    else if (this.game.revive) this.act("respawn");
  }
  screenToWorld(x, y) { return [this.cam[0] + x / this.zoom, this.cam[1] + y / this.zoom]; }
  onPointer(e, phase) {
    if (e.pointerType === "mouse") {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true;
      if (phase === "down" && this.cfg.touch) { this.cfg.touch = false; UI.setTouch(this.state === "play" ? false : false); this.resize(); }
      if (phase === "down") {
        if (e.button === 0) { this.mouse.left = true; this.onMouseDown(); }
        if (e.button === 2) this.mouse.right = true;
      } else if (phase === "up") {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      }
      return;
    }
    // táctil / lápiz: dos joysticks flotantes
    if (phase === "down") {
      if (!this.cfg.touch) { this.cfg.touch = true; this.resize(); }
      if (this.state !== "play" || this.menuOpen || this.invOpen) return;
      UI.setTouch(true);
      e.preventDefault();
      // joysticks fijos: el izquierdo se activa tocando la mitad izquierda; el derecho, tocando cerca de él
      const cL = this.stickCenter("L"), cR = this.stickCenter("R");
      let side = null;
      if (e.clientX < this.cssW * 0.42) side = "L";
      else if (hypot(e.clientX - cR[0], e.clientY - cR[1]) < STICK_R * 1.9) side = "R";
      if (!side) { this.tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now() }; return; }
      if (this.sticks[side]) return;
      const c = side === "L" ? cL : cR;
      this.sticks[side] = { id: e.pointerId, ox: c[0], oy: c[1], x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, sx: e.clientX, sy: e.clientY };
    } else {
      for (const side of ["L", "R"]) {
        const s = this.sticks[side];
        if (!s || s.id !== e.pointerId) continue;
        if (phase === "move") { s.x = e.clientX; s.y = e.clientY; s.moved = Math.max(s.moved, hypot(s.x - s.sx, s.y - s.sy)); }
        else this.sticks[side] = null;
      }
      const t = this.tapStart;
      if (phase === "up" && t && t.id === e.pointerId) {
        if (hypot(e.clientX - t.x, e.clientY - t.y) < 14 && performance.now() - t.t0 < 350) this.onTap(t.x, t.y);
        this.tapStart = null;
      }
    }
  }
  stickCenter(side) {                      // posición fija de cada joystick
    const H = this.cssH, W = this.cssW, b = Math.min(100, Math.max(78, H * 0.22));
    if (side === "L") return [Math.max(24, this.safeL || 0) + STICK_R + 26, H - b];
    let padL = W - 160;
    const pad = document.getElementById("tPad");
    if (pad && pad.offsetParent !== null) padL = pad.getBoundingClientRect().left;
    return [Math.max(W * 0.58, padL - STICK_R - 22), H - b];
  }
  stickVec(s, radius = STICK_R) {
    if (!s) return [0, 0, 0];
    const dx = s.x - s.ox, dy = s.y - s.oy, d = hypot(dx, dy);
    const m = Math.min(1, d / radius);
    if (m < 0.12) return [0, 0, 0];
    return [dx / d * m, dy / d * m, m];
  }
  onTap(x, y) {                            // toque corto en el mundo (táctil)
    if (!this.game || !this.game.p.alive) return;
    const [wx, wy] = this.screenToWorld(x, y);
    if (this.buildMode) { this.buildTile = [Math.floor(wx / TS), Math.floor(wy / TS)]; return; }
    const p = this.game.p;
    if (hypot(wx - p.x, wy - p.y) < 70) this.act("interact");
  }
  onMouseDown() {
    if (this.state !== "play" || this.menuOpen || this.invOpen || !this.game) return;
    const g = this.game, p = g.p;
    if (!p.alive) return;
    const [wx, wy] = this.screenToWorld(this.mouse.x, this.mouse.y);
    if (this.buildMode) { this.act("build", [Math.floor(wx / TS), Math.floor(wy / TS), this.buildPiece]); return; }
    this.act("click");
  }
  aimPoint() {
    const p = this.game.p;
    if (!this.touch && this.mouse.seen) return this.screenToWorld(this.mouse.x, this.mouse.y);
    const R = this.stickVec(this.sticks.R);
    const dist = R[2] ? 80 + 240 * R[2] : 200;
    return [p.x + Math.cos(this.aimAng) * dist, p.y + Math.sin(this.aimAng) * dist];
  }
  touchAction(a, down) {                   // botones táctiles
    if (!this.game || this.state !== "play") return;
    const p = this.game.p;
    if (a === "demolish") { this.demoHeld = down; return; }
    if (!down) return;
    switch (a) {
      case "menu": this.togglePause(); return;
      case "inventory": UI.openInv(); return;
      case "map": this.showMap = !this.showMap; return;
      case "chat": UI.openChat(); return;
      case "sneak": this.sneak = !this.sneak; break;
      case "run": this.runToggle = !this.runToggle; break;
      case "build": this.buildMode = !this.buildMode; this.buildTile = null; UI.updateBuildBar(); break;
      case "throw": { const ap = this.aimPoint(); this.act("throw", [r1(ap[0]), r1(ap[1])]); break; }
      case "interact": if (!p.alive) this.respawnOrNew(); else this.act("interact"); break;
      default: this.act(a);
    }
    UI.syncToggles();
  }
  buildInput() {
    const g = this.game, p = g.p;
    const inp = { mouse: [p.x + 1, p.y], move: [0, 0], aim: false, run: false, attackHeld: false, demolish: this.demoHeld,
      sneak: this.sneak, touchFire: false, analog: false };
    const blocked = this.menuOpen || this.invOpen || this.chatOpen;
    if (this.touch) {
      const L = this.stickVec(this.sticks.L), R = this.stickVec(this.sticks.R);
      if (!blocked) { inp.move = [L[0], L[1]]; inp.analog = true; }
      inp.run = this.runToggle || L[2] > 0.95;
      if (R[2] && !blocked) {
        this.aimAng = Math.atan2(R[1], R[0]);
        const gun = !!GUNS[p.weapon];
        inp.aim = gun;
        inp.attackHeld = !this.buildMode && R[2] > (gun ? 0.55 : 0.45);
        inp.touchFire = true;
        if (this.cfg.aimAssist && gun) this.aimAng = this.assist(this.aimAng);
      } else if (L[2] && !blocked) this.aimAng = Math.atan2(L[1], L[0]);
      const dist = R[2] ? 80 + 240 * R[2] : (this.demoHeld ? 44 : 200);
      inp.mouse = [p.x + Math.cos(this.aimAng) * dist, p.y + Math.sin(this.aimAng) * dist];
      if (this.demoHeld) inp.mouse = [p.x + Math.cos(this.aimAng) * 40, p.y + Math.sin(this.aimAng) * 40];
    } else {
      const k = this.keys;
      if (!blocked) {
        inp.move = [(k.has("d") || k.has("ArrowRight") ? 1 : 0) - (k.has("a") || k.has("ArrowLeft") ? 1 : 0),
          (k.has("s") || k.has("ArrowDown") ? 1 : 0) - (k.has("w") || k.has("ArrowUp") ? 1 : 0)];
        inp.run = k.has("Shift");
        inp.aim = this.mouse.right;
        inp.attackHeld = this.mouse.left && !this.buildMode;
      }
      inp.mouse = this.screenToWorld(this.mouse.x, this.mouse.y);
      this.aimAng = Math.atan2(inp.mouse[1] - p.y, inp.mouse[0] - p.x);
    }
    return inp;
  }
  assist(ang) {                            // ayuda a apuntar en celular: se pega al zombi más cercano del cono
    const g = this.game, p = g.p, gun = GUNS[p.weapon];
    let best = null;
    for (const z of g.zombies) {
      const d = hypot(z.x - p.x, z.y - p.y);
      if (d > gun.rng) continue;
      const a = Math.atan2(z.y - p.y, z.x - p.x), da = Math.abs(angdiff(a, ang));
      if (da < 0.28 && (!best || da + d / 3000 < best[0])) best = [da + d / 3000, a];
    }
    return best ? best[1] : ang;
  }

  // ------------------------------------------------------------ bucle
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    if (dt > 0) this.fpsAvg = this.fpsAvg * 0.95 + (1 / dt) * 0.05;
    try { this.step(dt); this.render(); }
    catch (e) { console.error(e); if (!this.errShown) { this.errShown = true; UI.toast("Error: " + e.message); } }
    requestAnimationFrame(t => this.loop(t));
  }
  step(dt) {
    if (this.state !== "play" || !this.game) return;
    const g = this.game, inp = this.buildInput();
    if (this.mode === "client") {
      const cl = this.client;
      for (const m of cl.poll()) if (m.t === "snap") g.applySnap(m);
      if (cl.dead) { this.backToTitle("Se perdió la conexión con el anfitrión."); return; }
      g.update(dt, inp);
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / INPUT_HZ;
        const p = g.p;
        cl.send({ t: "in", x: r1(p.x), y: r1(p.y), a: Math.round(p.angle * 1000) / 1000, mv: p.moving ? 1 : 0, run: inp.run ? 1 : 0,
          aim: inp.aim ? 1 : 0, hold: inp.attackHeld ? 1 : 0, sn: this.sneak ? 1 : 0, mx: r1(inp.mouse[0]), my: r1(inp.mouse[1]),
          dm: inp.demolish ? 1 : 0, tf: inp.touchFire ? 1 : 0, dv: g.p.car !== null ? [-inp.move[1], inp.move[0]] : [0, 0] });
      }
    } else {
      if (this.host) this.host.poll();
      const paused = this.mode === "solo" && this.menuOpen;
      if (!paused) g.update(dt, inp);
      if (this.host) this.host.broadcast(dt); else g.clearEvents();
      if (this.mode === "solo" && !paused) {
        this.saveT += dt;
        if (this.saveT > 90) { this.saveT = 0; this.saveGame(true); }
      }
    }
    // al abrir un mueble o cofre se abre solo el inventario con lo que tiene dentro
    const op = g.p.open ? g.p.open.join(",") : "";
    if (op && op !== this.contPrev && !this.invOpen && !this.menuOpen && performance.now() > (this.contIgnore || 0)) UI.openInv();
    this.contPrev = op;
    if (this.invOpen) UI.refreshInv();
    this.playT = (this.playT || 0) + dt;
    if (this.playT > 25 && !this.hintHidden) { this.hintHidden = true; document.getElementById("tHint").classList.add("hidden"); }
    this.minimapT -= dt;
    if (this.minimapT <= 0 && this.showMap) { this.minimapT = 4; this.minimapC = g.map.minimap(); }
  }

  // ------------------------------------------------------------ dibujo
  render() {
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (this.state !== "play" || !this.game) { this.renderTitleBg(); return; }
    const g = this.game, p = g.p;
    let cx = p.x - this.viewW / 2, cy = p.y - this.viewH / 2;
    cx = clamp(cx, -40, N * TS - this.viewW + 40); cy = clamp(cy, -40, N * TS - this.viewH + 40);
    if (g.shake > 0) { cx += (Math.random() - 0.5) * 8 * g.shake / 0.25; cy += (Math.random() - 0.5) * 8 * g.shake / 0.25; }
    const sc = dpr * this.zoom;
    cx = Math.round(cx * sc) / sc; cy = Math.round(cy * sc) / sc;
    this.cam = [cx, cy];
    ctx.fillStyle = "#0b0c10"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(sc, 0, 0, sc, -cx * sc, -cy * sc);
    ctx.imageSmoothingEnabled = false;
    this.drawWorld(ctx, cx, cy);
    this.drawDarkness(ctx, cx, cy);
    this.drawEyes(ctx, cx, cy);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLabels(ctx, cx, cy);
    this.drawHud(ctx);
    if (this.touch) this.drawSticks(ctx);
  }
  renderTitleBg() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    if (!this.bgMap) { this.bgMap = new GameMap(12345, 3); this.bgT = 0; }
    this.bgT += 0.3;
    const sc = this.dpr * 1.2, m = this.bgMap;
    const cx = 300 + this.bgT, cy = 700 + Math.sin(this.bgT / 300) * 100;
    ctx.setTransform(sc, 0, 0, sc, -cx * sc, -cy * sc);
    const cs = CH * TS, vw = W / sc, vh = H / sc;
    for (let y = Math.floor(cy / cs); y <= Math.floor((cy + vh) / cs); y++)
      for (let x = Math.floor(cx / cs); x <= Math.floor((cx + vw) / cs); x++)
        if (x >= 0 && y >= 0 && x * CH < N && y * CH < N) ctx.drawImage(m.getChunk(x, y), x * cs, y * cs);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(10,12,20,0.55)"; ctx.fillRect(0, 0, W, H);
  }
  inView(x, y, pad = 40) { return x > this.cam[0] - pad && y > this.cam[1] - pad && x < this.cam[0] + this.viewW + pad && y < this.cam[1] + this.viewH + pad; }
  drawWorld(ctx, ox, oy) {
    const g = this.game, p = g.p, m = g.map, cs = CH * TS, maxc = Math.floor((N - 1) / CH);
    for (let cy = Math.floor(oy / cs); cy <= Math.floor((oy + this.viewH) / cs); cy++)
      for (let cx = Math.floor(ox / cs); cx <= Math.floor((ox + this.viewW) / cs); cx++)
        if (cx >= 0 && cy >= 0 && cx <= maxc && cy <= maxc) ctx.drawImage(m.getChunk(cx, cy), cx * cs, cy * cs);
    // cuerpos
    for (const [x, y, a, col] of g.corpses) {
      if (!this.inView(x, y)) continue;
      ctx.fillStyle = "rgb(95,18,18)";
      ctx.beginPath(); ctx.ellipse(x, y, 14, 9, 0, 0, TAU); ctx.fill();
      const body = ART.person(shade(col, 0.7), [44, 48, 66], [110, 138, 104], [36, 30, 26], "down", 0, true, 0, "none", "walker");
      ctx.save(); ctx.translate(x, y); ctx.rotate(-(Math.PI / 2 + ((Math.floor(a * 57) % 40) - 20) * Math.PI / 180)); ctx.drawImage(body, -16, -16); ctx.restore();
    }
    // objetos del suelo
    for (const it of g.items.values()) {
      if (!this.inView(it[0], it[1])) continue;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(it[0] - 8, it[1] - 6, 16, 14);
      ctx.drawImage(ART.itemIcon(it[2]), it[0] - 8, it[1] - 9);
    }
    // antorchas, interruptores, fuego
    for (const t of g.torches) {
      if (!this.inView(t[0], t[1])) continue;
      const fl = 0.5 + 0.5 * Math.sin(this.t * 12 + t[0]);
      ctx.fillStyle = "rgb(90,60,35)"; ctx.fillRect(t[0] - 2, t[1] - 2, 4, 12);
      ctx.fillStyle = "rgb(220,90,25)"; ctx.beginPath(); ctx.arc(t[0], t[1] - 5, 5 + 2 * fl, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgb(255,200,80)"; ctx.beginPath(); ctx.arc(t[0], t[1] - 6, 3 + fl, 0, TAU); ctx.fill();
    }
    m.buildings.forEach((b, bi) => {
      const [sx, sy] = switchPos(b);
      if (!this.inView(sx, sy)) return;
      const on = g.lit.has(bi);
      ctx.fillStyle = "rgb(230,230,225)"; ctx.fillRect(sx - 5, sy - 6, 10, 12);
      ctx.fillStyle = on ? "rgb(255,220,90)" : "rgb(110,110,115)"; ctx.fillRect(sx - 2, on ? sy - 4 : sy, 4, 4);
    });
    for (const f of g.fires) {
      if (!this.inView(f[0], f[1])) continue;
      const fl = 0.5 + 0.5 * Math.sin(this.t * 14 + f[0]);
      for (const [r, col] of [[30 + 4 * fl, "rgb(200,60,20)"], [20 + 5 * fl, "rgb(250,140,30)"], [9 + 3 * fl, "rgb(255,230,120)"]]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(f[0], f[1], r, 0, TAU); ctx.fill();
      }
    }
    // autos
    for (const c of g.cars) if (this.inView(c.x, c.y, 60)) this.drawCar(ctx, c);
    // actores ordenados por altura
    const drivers = new Set(g.cars.filter(c => c.driver !== null).map(c => c.driver));
    const actors = [];
    for (const z of g.zombies) if (this.inView(z.x, z.y)) actors.push([z.y, 0, z]);
    for (const o of g.otherPlayers()) if (!drivers.has(o.pid) && this.inView(o.x, o.y)) actors.push([o.y, 1, o]);
    if (p.alive && p.car === null) actors.push([p.y, 2, p]);
    actors.sort((a, b) => a[0] - b[0]);
    for (const [, kind, a] of actors) { if (kind === 0) this.drawZombie(ctx, a); else this.drawPlayer(ctx, a, kind === 2); }
    // trazos de bala, proyectiles, explosivos
    for (const [x1, y1, x2, y2, col, w] of g.tracers) {
      ctx.strokeStyle = rgb(col); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (const pr of g.projs) {
      const col = pr[5] === 0 ? "rgb(120,120,125)" : pr[5] === 1 ? "rgb(70,150,90)" : "rgb(180,220,240)";
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pr[0], pr[1], 4, 0, TAU); ctx.fill();
    }
    for (const b of g.bombs) {
      ctx.drawImage(ART.itemIcon(b.item), b.x - 8, b.y - 8);
      if (Math.floor(this.t * 6) % 2 === 0) { ctx.fillStyle = "rgb(255,90,60)"; ctx.beginPath(); ctx.arc(b.x, b.y - 8, 2, 0, TAU); ctx.fill(); }
    }
    if (p.aiming && p.alive) {
      const d = m.rayDistance(p.x, p.y, p.angle, 520);
      ctx.strokeStyle = "rgba(255,60,60,0.85)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * d, p.y + Math.sin(p.angle) * d); ctx.stroke();
    }
    // tejados (se ocultan al entrar)
    const inside = m.buildingAt(Math.floor(p.x / TS), Math.floor(p.y / TS));
    for (const b of m.buildings) {
      if (b === inside) continue;
      const rx = (b.x0 + 1) * TS, ry = (b.y0 + 1) * TS, rw = (b.x1 - b.x0 - 1) * TS, rh = (b.y1 - b.y0 - 1) * TS;
      if (rx > ox + this.viewW || ry > oy + this.viewH || rx + rw < ox || ry + rh < oy) continue;
      ctx.drawImage(ART.roof(rw, rh, b.roof), rx, ry);
      if (b.q >= 2) {
        ctx.fillStyle = b.q === 3 ? "rgb(255,215,90)" : "rgb(210,210,220)";
        ctx.beginPath(); ctx.arc(rx + rw / 2, ry + rh / 2, b.q === 3 ? 7 : 5, 0, TAU); ctx.fill();
      }
    }
    // efectos
    for (const [x, y, kind, ttl] of g.fx) {
      const k = 1 - ttl / 0.6;
      ctx.lineWidth = 2;
      if (kind === "glass") { ctx.strokeStyle = "rgb(190,230,255)"; ctx.beginPath(); ctx.arc(x, y, 8 + 50 * k, 0, TAU); ctx.stroke(); }
      else if (kind === "scream") { ctx.strokeStyle = "rgb(230,70,60)"; ctx.beginPath(); ctx.arc(x, y, 10 + 90 * k, 0, TAU); ctx.stroke(); }
      else if (kind === "crash") {
        ctx.fillStyle = "rgb(140,105,70)";
        for (let a = 0; a < 6; a++) { ctx.beginPath(); ctx.arc(x + Math.cos(a * Math.PI / 3) * 18 * k, y + Math.sin(a * Math.PI / 3) * 18 * k, 4, 0, TAU); ctx.fill(); }
      } else if (kind === "build") { ctx.strokeStyle = "rgb(200,190,150)"; ctx.beginPath(); ctx.arc(x, y, 6 + 12 * k, 0, TAU); ctx.stroke(); }
      else if (kind === "boom") {
        ctx.fillStyle = `rgba(255,200,80,${1 - k})`; ctx.beginPath(); ctx.arc(x, y, 10 + 120 * k, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,120,40,${1 - k * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 6 + 70 * k, 0, TAU); ctx.fill();
      } else if (kind === "pop") { ctx.strokeStyle = "rgb(255,240,140)"; ctx.beginPath(); ctx.arc(x, y, 4 + 14 * k, 0, TAU); ctx.stroke(); }
    }
    this.drawWork(ctx, p);
  }
  drawCar(ctx, c) {
    ctx.fillStyle = "rgba(0,0,0,0.27)"; ctx.beginPath(); ctx.ellipse(c.x, c.y + 8, 23, 11, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(c.x, c.y);
    const step = Math.PI / 24;                             // 48 ángulos: mantiene el aspecto de píxeles
    ctx.rotate(Math.round(c.angle / step) * step);
    ctx.drawImage(ART.car(c.color, c.hp <= 30), -22, -13);
    ctx.restore();
    if (c.hp < 40) {
      const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
      for (let k = 0; k < 3; k++) {
        const v = 70 + 20 * k;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath(); ctx.arc(c.x + ca * (20 + 5 * k) + Math.sin(this.t * 6 + k) * 3, c.y + sa * (20 + 5 * k) - 4 * k, 3 + k, 0, TAU); ctx.fill();
      }
    }
  }
  spriteDir(ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    if (Math.abs(c) > Math.abs(s) * 1.15) return ["side", c < 0];
    return [s > 0 ? "down" : "up", false];
  }
  drawSprite(ctx, spr, x, y, flip) {
    ctx.drawImage(ART.shadow(), Math.round(x - 11), Math.round(y + 4));
    ctx.drawImage(flip ? spr.flip : spr, Math.round(x - 16), Math.round(y - 21));
  }
  drawZombie(ctx, z) {
    let shirt = z.cloth;
    if (z.kind === "runner") shirt = z.cloth.map(c => Math.min(255, c + 50));
    else if (z.kind === "brute") shirt = [95, 55, 55];
    else if (z.kind === "breaker") shirt = [70, 70, 88];
    const [d, flip] = this.spriteDir(z.angle);
    const frame = (Math.floor(this.t * (z.kind === "runner" ? 9 : 5) + z.id) & 1);
    this.drawSprite(ctx, ART.person(shirt, [44, 48, 66], z.skin, [36, 30, 26], d, frame, true, 4, "none", z.kind), z.x, z.y, flip);
    if (z.hp < z.maxHp) {
      const frac = Math.max(0, z.hp / z.maxHp);
      ctx.fillStyle = "rgb(110,20,20)"; ctx.fillRect(z.x - 10, z.y - 26, 20, 3);
      ctx.fillStyle = "rgb(80,220,80)"; ctx.fillRect(z.x - 10, z.y - 26, 20 * frac, 3);
    }
  }
  drawPlayer(ctx, pl, local) {
    const c = Math.cos(pl.angle), s = Math.sin(pl.angle), wlen = WEAPON_LEN[pl.weapon] || 0;
    const [d, flip] = this.spriteDir(pl.angle);
    let shirt = local ? [70, 120, 200] : [80, 170, 110];
    if (pl.sneak) shirt = shade(shirt, 0.8);
    const frame = pl.moving ? (Math.floor(this.t * (pl.running ? 12 : 8)) & 1) : 0;
    const spr = ART.person(shirt, [50, 54, 72], [232, 196, 160], [86, 56, 36], d, frame, false, 0, pl.hat, "walker");
    const weapon = () => {
      ctx.strokeStyle = "rgb(40,40,40)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pl.x, pl.y - 4); ctx.lineTo(pl.x + c * (PLAYER_R + wlen), pl.y - 4 + s * (PLAYER_R + wlen)); ctx.stroke();
    };
    if (wlen && d === "up") weapon();
    this.drawSprite(ctx, spr, pl.x, pl.y, flip);
    if (wlen && d !== "up") weapon();
    if (pl.swingT > 0 && WEAPONS[pl.weapon]) {
      const w = WEAPONS[pl.weapon];
      ctx.strokeStyle = "rgb(255,255,255)"; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const a = pl.angle + w.arc * (k / 8 - 0.5);
        const x = pl.x + Math.cos(a) * (w.rng + 6), y = pl.y + Math.sin(a) * (w.rng + 6);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  drawWork(ctx, p) {
    const g = this.game;
    if (this.buildMode && p.alive) {
      let tx, ty;
      if (this.touch) {
        if (!this.buildTile || hypot((this.buildTile[0] + 0.5) * TS - p.x, (this.buildTile[1] + 0.5) * TS - p.y) > REACH)
          this.buildTile = [Math.floor((p.x + Math.cos(this.aimAng) * 46) / TS), Math.floor((p.y + Math.sin(this.aimAng) * 46) / TS)];
        [tx, ty] = this.buildTile;
      } else {
        const w = this.screenToWorld(this.mouse.x, this.mouse.y);
        tx = Math.floor(w[0] / TS); ty = Math.floor(w[1] / TS);
      }
      const pc = BUILD_PIECES[this.buildPiece];
      const ok = g.canBuild(p, tx, ty, pc) && (p.inv.planks || 0) >= pc.cost;
      ctx.strokeStyle = ok ? "rgb(90,255,120)" : "rgb(255,90,90)"; ctx.lineWidth = 3;
      ctx.strokeRect(tx * TS + 1.5, ty * TS + 1.5, TS - 3, TS - 3);
      this.ghost = [tx, ty, ok];
    }
    if (p.fish && p.alive) {
      const bx = (p.fish[0] + 0.5) * TS, by = (p.fish[1] + 0.5) * TS + Math.sin(this.t * 3) * 2;
      ctx.strokeStyle = "rgb(235,235,235)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = "rgb(250,250,250)"; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgb(220,40,40)"; ctx.beginPath(); ctx.arc(bx, by - 2, 3, 0, TAU); ctx.fill();
    }
    const w = p.work;
    if (w && p.alive) {
      const bx = w[1] * TS, by = w[2] * TS - 8;
      ctx.fillStyle = "rgb(25,25,30)"; ctx.fillRect(bx - 1, by - 1, TS + 2, 8);
      ctx.fillStyle = w[0] === "demo" ? "rgb(230,150,60)" : "rgb(120,200,255)"; ctx.fillRect(bx, by, TS * clamp(w[3], 0, 1), 6);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(w[1] * TS + 0.5, w[2] * TS + 0.5, TS - 1, TS - 1);
    }
  }
  drawDarkness(ctx, ox, oy) {
    const g = this.game, alpha = g.darkness() * 246 * this.cfg.dark;
    if (alpha < 6) return;
    const m = 1 - alpha / 255, l = this.lctx, lw = this.light.width, lh = this.light.height;
    l.globalCompositeOperation = "source-over";
    l.fillStyle = `rgb(${255 * m * 0.95 | 0},${255 * m * 0.98 | 0},${Math.min(255, 255 * m * 1.06) | 0})`;
    l.fillRect(0, 0, lw, lh);
    l.globalCompositeOperation = "lighter";
    const glow = (x, y, r, col) => {
      const sx = (x - ox) / LQ, sy = (y - oy) / LQ, rr = r / LQ;
      if (sx < -rr || sy < -rr || sx > lw + rr || sy > lh + rr) return;
      const gr = l.createRadialGradient(sx, sy, 0, sx, sy, rr);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},1)`); gr.addColorStop(1, "rgba(0,0,0,0)");
      l.fillStyle = gr; l.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
    };
    const cone = (x, y, ang, r, col) => {
      const sx = (x - ox) / LQ, sy = (y - oy) / LQ, rr = r / LQ, half = 26 * Math.PI / 180;
      const gr = l.createRadialGradient(sx, sy, 0, sx, sy, rr);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},1)`); gr.addColorStop(1, "rgba(0,0,0,0)");
      l.fillStyle = gr; l.beginPath(); l.moveTo(sx, sy); l.arc(sx, sy, rr, ang - half, ang + half); l.closePath(); l.fill();
    };
    const lit = (g.p.alive ? [g.p] : []).concat(g.otherPlayers());
    for (const pl of lit) {
      glow(pl.x, pl.y, 70, [255, 255, 255]);
      if (pl.flashOn && (pl.battery === undefined || pl.battery > 0)) cone(pl.x, pl.y, pl.angle, 300, [255, 250, 225]);
    }
    for (const t of g.torches) { glow(t[0], t[1], 175, [235, 185, 110]); glow(t[0], t[1], 70, [120, 90, 50]); }
    for (const f of g.fires) glow(f[0], f[1], 140, [255, 150, 60]);
    for (const b of g.bombs) if (b.item === "firecracker") glow(b.x, b.y, 50, [255, 220, 120]);
    for (const [x, y, kind, ttl] of g.fx) if (kind === "boom") glow(x, y, 260 * (ttl / 0.6), [255, 200, 120]);
    for (const bi of g.lit) {
      const b = g.map.buildings[bi];
      if (!b) continue;
      const rx = ((b.x0 + 1) * TS - ox) / LQ, ry = ((b.y0 + 1) * TS - oy) / LQ;
      const rw = (b.x1 - b.x0 - 1) * TS / LQ, rh = (b.y1 - b.y0 - 1) * TS / LQ;
      if (rx > lw || ry > lh || rx + rw < 0 || ry + rh < 0) continue;
      l.fillStyle = "rgb(235,215,150)"; l.fillRect(rx, ry, rw, rh);
    }
    for (const c of g.cars) if (c.driver !== null && c.fuel > 0) cone(c.x, c.y, c.angle, 340, [255, 250, 220]);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, ox, oy, lw * LQ, lh * LQ);
    ctx.restore();
  }
  drawEyes(ctx) {
    const g = this.game;
    if (g.darkness() < 0.35) return;
    const p = g.p;
    for (const z of g.zombies) {
      if (!this.inView(z.x, z.y)) continue;
      const d = hypot(z.x - p.x, z.y - p.y);
      if ((z.state === "chase" && d < 420) || d < 140) {
        for (const side of [-0.45, 0.45]) {
          const ex = z.x + Math.cos(z.angle + side) * 5, ey = z.y - 6 + Math.sin(z.angle + side) * 3;
          ctx.fillStyle = "rgb(120,0,0)"; ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, TAU); ctx.fill();
          ctx.fillStyle = "rgb(255,40,30)"; ctx.beginPath(); ctx.arc(ex, ey, 1.1, 0, TAU); ctx.fill();
        }
      }
    }
  }
  // textos en pantalla (no se escalan con el zoom)
  text(ctx, txt, x, y, size, col = [255, 255, 255], align = "left", bold = true) {
    if (!txt) return;
    ctx.font = `${bold ? "700 " : ""}${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillText(txt, x + 1.5, y + 1.5);
    ctx.fillStyle = Array.isArray(col) ? rgb(col) : col; ctx.fillText(txt, x, y);
  }
  toScreen(x, y) { return [(x - this.cam[0]) * this.zoom, (y - this.cam[1]) * this.zoom]; }
  drawLabels(ctx) {
    const g = this.game, p = g.p, m = g.map;
    const inside = m.buildingAt(Math.floor(p.x / TS), Math.floor(p.y / TS));
    for (const b of m.buildings) {
      if (!b.kind || b === inside) continue;
      const cx = (b.x0 + b.x1 + 1) / 2 * TS, cy = (b.y0 + b.y1 + 1) / 2 * TS;
      if (!this.inView(cx, cy, 200)) continue;
      const [sx, sy] = this.toScreen(cx, cy);
      this.text(ctx, SPECIAL[b.kind].name, sx, sy - 28, 15, b.kind === "hospital" ? [40, 40, 46] : [255, 255, 255], "center");
    }
    for (const o of g.otherPlayers()) {
      const [sx, sy] = this.toScreen(o.x, o.y);
      this.text(ctx, o.name, sx, sy - 34 * this.zoom - 6, 13, [170, 255, 190], "center");
    }
    for (const it of g.items.values()) {
      if (hypot(it[0] - p.x, it[1] - p.y) < 40) {
        const [sx, sy] = this.toScreen(it[0], it[1]);
        this.text(ctx, ITEMS[it[2]].name + (it[3] > 1 ? ` x${it[3]}` : ""), sx, sy - 22 * this.zoom - 8, 12, [255, 255, 255], "center");
      }
    }
    m.buildings.forEach((b, bi) => {
      const [sx, sy] = switchPos(b);
      if (hypot(sx - p.x, sy - p.y) < 70) {
        const [x, y] = this.toScreen(sx, sy);
        this.text(ctx, "Interruptor de luz", x, y + 12 * this.zoom, 11, [255, 240, 170], "center");
      }
    });
    if (p.fish && p.alive) { const [x, y] = this.toScreen(p.x, p.y); this.text(ctx, "Pescando... no te muevas", x, y - 40 * this.zoom - 8, 13, [190, 230, 255], "center"); }
    if (this.buildMode && this.ghost) {
      const pc = BUILD_PIECES[this.buildPiece], [x, y] = this.toScreen((this.ghost[0] + 0.5) * TS, this.ghost[1] * TS);
      this.text(ctx, `${pc.name} (${pc.cost} tablones)`, x, y - 18, 12, this.ghost[2] ? [90, 255, 120] : [255, 90, 90], "center");
    }
  }
  bar(ctx, x, y, label, value, col, w = 150) {
    ctx.fillStyle = "rgba(20,20,26,0.85)"; ctx.fillRect(x - 2, y - 2, w + 4, 16);
    ctx.fillStyle = rgb(col); ctx.fillRect(x, y, w * clamp(value / 100, 0, 1), 12);
    this.text(ctx, label, x + 5, y, 11, [255, 255, 255]);
  }
  drawHud(ctx) {
    const g = this.game, p = g.p, W = this.cssW, H = this.cssH, touch = this.touch;
    if (p.alive && (p.hp < 40 || p.hurtT > 0)) {
      let a = p.hp < 40 ? 0.4 * (1 - p.hp / 40) : 0;
      a = Math.max(a, 0.5 * Math.max(0, p.hurtT) / 0.3);
      if (a > 0) { ctx.fillStyle = `rgba(200,0,0,${a * 0.5})`; ctx.fillRect(0, 0, W, H); }
    }
    const L = Math.max(10, (window.visualViewport ? 0 : 0) + 10);
    // barras
    const bx = L, by = touch ? 70 : H - 86, bw = touch ? 120 : 160;
    this.bar(ctx, bx, by, "Salud", p.hp, [200, 50, 50], bw);
    this.bar(ctx, bx, by + 18, "Hambre", p.hunger, [220, 150, 50], bw);
    this.bar(ctx, bx, by + 36, "Sed", p.thirst, [60, 130, 220], bw);
    this.bar(ctx, bx, by + 54, "Aguante", p.stamina, [220, 210, 70], bw);
    // reloj, arma, peso
    const mtag = g.settings.mode === "normal" ? "" : `  [${MODES[g.settings.mode].name.toUpperCase()}]`;
    this.text(ctx, `Día ${g.day()}  ${g.clock()}${mtag}`, L, 8, touch ? 18 : 22, [255, 235, 150]);
    let wtxt;
    const car = g.myCar();
    if (car) wtxt = `Conduciendo  ${Math.abs(car.v * 0.11) | 0} km/h  ·  Gasolina ${car.fuel | 0}%  ·  Carrocería ${car.hp | 0}%`;
    else if (GUNS[p.weapon]) { const gun = GUNS[p.weapon]; wtxt = `${gun.name}  ${p.mag}/${gun.mag}  (+${p.inv[gun.ammo] || 0})`; }
    else { const w = WEAPONS[p.weapon]; wtxt = w.name + (w.dur ? `  ${p.cond[p.weapon] !== undefined ? p.cond[p.weapon] : w.dur}/${w.dur}` : ""); }
    this.text(ctx, wtxt, L, touch ? 30 : 36, touch ? 13 : 16, [230, 230, 240]);
    const wr = invWeight(p.inv) / capOf(p.back);
    this.text(ctx, `Peso ${invWeight(p.inv).toFixed(1)}/${capOf(p.back)} kg` + (wr > 0.5 ? " (lento)" : "") +
      `   Tablones ${p.inv.planks || 0}` + (p.flashOn ? `   Linterna ${p.battery | 0}%` : ""), L, touch ? 48 : 56, touch ? 12 : 14,
      wr > 0.85 ? [255, 170, 120] : [215, 190, 140]);
    if (car && car.fuel <= 0) this.text(ctx, "SIN GASOLINA", W / 2, 70, 28, [255, 120, 90], "center");
    // estados
    const md = [];
    if (p.bleeding) md.push(["Sangrando", [255, 90, 90]]);
    if (p.infected) md.push([`Infectado (${(p.infT / 60) | 0}:${String((p.infT % 60) | 0).padStart(2, "0")})`, [150, 230, 110]]);
    if (p.hunger >= 50) md.push([p.hunger < 80 ? "Hambriento" : "¡Muy hambriento!", [240, 170, 70]]);
    if (p.thirst >= 50) md.push([p.thirst < 80 ? "Sediento" : "¡Muy sediento!", [110, 170, 240]]);
    if (p.exhausted) md.push(["Agotado", [240, 220, 90]]);
    if (this.sneak) md.push(["Furtivo", [170, 220, 170]]);
    if (p.reloadT > 0) md.push(["Recargando...", [200, 220, 255]]);
    md.forEach(([t, c], i) => this.text(ctx, t, bx + bw + 12, by + i * 16 - Math.max(0, md.length - 4) * 16, 13, c));
    const thr = (p.inv[p.thr] || 0) > 0 ? p.thr : null;
    if (thr) this.text(ctx, (touch ? "Lanzar: " : "[V] ") + `${ITEMS[thr].name} x${p.inv[thr]}`, L, by - 18, 12, [255, 210, 130]);
    // online
    if (this.mode !== "solo") {
      const n = g.otherPlayers().length + 1;
      const info = this.mode === "host" ? `ONLINE · sala ${this.host.code} · ${n} jugador(es)` : `ONLINE · ${n} jugador(es)`;
      this.text(ctx, info, W / 2, 8, 14, [170, 230, 255], "center");
      g.otherPlayers().forEach((o, i) => this.text(ctx, `${o.name} ${o.hp | 0}%`, W / 2, 26 + i * 15, 12, [170, 255, 190], "center"));
    }
    if (this.cfg.fps) this.text(ctx, `FPS ${this.fpsAvg | 0}  zombis ${g.zombies.length}`, W / 2, H - 20, 12, [255, 255, 120], "center");
    // lista rápida de objetos (PC)
    if (!touch) {
      const own = g.owned();
      let x = W - 200, y = this.showMap ? 176 : 24;
      this.hotbar = [];
      if (own.length) this.text(ctx, "OBJETOS (I = inventario)", x, y - 18, 12, [190, 190, 205]);
      const maxr = Math.max(3, Math.floor((H - 8 - y) / 20));
      own.slice(0, maxr).forEach((item, i) => {
        const eq = item === p.weapon;
        ctx.fillStyle = eq ? "rgba(60,110,70,0.9)" : "rgba(30,32,42,0.85)"; ctx.fillRect(x, y + i * 20, 190, 18);
        ctx.drawImage(ART.itemIcon(item), x + 2, y + i * 20 + 1);
        this.text(ctx, `${i < 9 ? i + 1 : " "} ${ITEMS[item].name}` + (p.inv[item] > 1 ? ` x${p.inv[item]}` : ""), x + 22, y + i * 20 + 3, 12, eq ? [190, 255, 200] : [255, 255, 255]);
      });
    }
    // minimapa
    if (this.showMap && this.minimapC) {
      const ms = touch ? 84 : 150, mx = touch ? L : W - ms - 10, my = touch ? by + 78 : 10;
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.92; ctx.drawImage(this.minimapC, mx, my, ms, ms); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#14161c"; ctx.lineWidth = 2; ctx.strokeRect(mx, my, ms, ms);
      const sc = ms / (N * TS);
      ctx.fillStyle = "rgb(120,255,150)";
      for (const o of g.otherPlayers()) { ctx.beginPath(); ctx.arc(mx + o.x * sc, my + o.y * sc, 2.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "rgb(255,230,80)"; ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 3.5, 0, TAU); ctx.fill();
    }
    // interacción, búsqueda, mensajes
    const prompt = p.alive && !p.search && !p.fish ? g.interactText(p) : "";
    UI.setInteract(prompt, p.alive);
    if (prompt && !touch && !this.buildMode) this.text(ctx, "[E] " + prompt, W / 2, H - 150, 18, [255, 255, 255], "center");
    if (p.search) {
      const frac = clamp(p.search[2] / p.search[3], 0, 1), sx = W / 2 - 80, sy = H * 0.62;
      ctx.fillStyle = "rgb(25,25,30)"; ctx.fillRect(sx - 2, sy - 2, 164, 18);
      ctx.fillStyle = "rgb(230,200,90)"; ctx.fillRect(sx, sy, 160 * frac, 14);
      this.text(ctx, "Buscando...", W / 2, sy, 11, [30, 25, 10], "center");
    }
    const msgs = p.msgs.slice(-4), my0 = touch ? H * 0.2 : H - 132;
    msgs.forEach(([txt, , col], i) => this.text(ctx, txt, W / 2, my0 + i * 19, touch ? 13 : 15, col, "center"));
    if (this.buildMode && !touch) {
      const parts = BUILD_PIECES.map((pc, i) => `${i + 1} ${pc.name} (${pc.cost})`).join("   ");
      ctx.fillStyle = "rgba(20,22,30,0.9)"; ctx.fillRect(W / 2 - 330, H - 64, 660, 50);
      this.text(ctx, "MODO CONSTRUIR: " + parts, W / 2, H - 58, 14, [190, 235, 255], "center");
      this.text(ctx, `Pieza: ${BUILD_PIECES[this.buildPiece].name} · clic = construir · rueda/1-5 = pieza · G = destruir`, W / 2, H - 36, 12, [170, 175, 195], "center");
    }
    if (!p.alive) this.drawDeath(ctx);
  }
  drawDeath(ctx) {
    const g = this.game, p = g.p, W = this.cssW, H = this.cssH;
    ctx.fillStyle = "rgba(60,0,0,0.75)"; ctx.fillRect(0, 0, W, H);
    const el = g.minutes - START_MINUTES, days = Math.floor(el / 1440), hours = Math.floor((el % 1440) / 60);
    const s = Math.min(1, W / 700);
    this.text(ctx, "HAS MUERTO", W / 2, H * 0.22, 64 * s, [230, 60, 50], "center");
    this.text(ctx, `Causa: ${p.cause || "Desconocida"}`, W / 2, H * 0.22 + 80 * s, 22, [255, 255, 255], "center");
    this.text(ctx, `El mundo lleva ${days} días y ${hours} horas · Zombis eliminados: ${p.kills}`, W / 2, H * 0.22 + 112 * s, 16, [255, 235, 150], "center");
    let msg;
    if (this.mode !== "solo" && !g.revive) msg = "HARDCORE: no puedes revivir. Menú: botón de pausa / Esc";
    else if (this.mode === "solo") msg = this.touch ? "Toca «Interactuar» para un mundo nuevo · ⏸ para el menú" : "ENTER = mundo nuevo · Esc = menú";
    else msg = this.touch ? "Toca «Interactuar» para reaparecer" : "ENTER = reaparecer (tus cosas quedaron junto a tu cuerpo)";
    this.text(ctx, msg, W / 2, H * 0.22 + 146 * s, 15, [230, 230, 240], "center");
  }
  drawSticks(ctx) {
    if (this.menuOpen || this.invOpen) return;
    for (const side of ["L", "R"]) {
      const s = this.sticks[side], [cx, cy] = this.stickCenter(side);
      ctx.fillStyle = s ? "rgba(20,22,32,0.35)" : "rgba(20,22,32,0.25)";
      ctx.beginPath(); ctx.arc(cx, cy, STICK_R, 0, TAU); ctx.fill();
      ctx.strokeStyle = s ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.3)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, STICK_R, 0, TAU); ctx.stroke();
      const v = this.stickVec(s);
      ctx.fillStyle = side === "R" ? (s ? "rgba(255,120,90,0.7)" : "rgba(255,120,90,0.35)") : (s ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)");
      ctx.beginPath(); ctx.arc(cx + v[0] * STICK_R, cy + v[1] * STICK_R, 26, 0, TAU); ctx.fill();
      this.text(ctx, side === "L" ? "Mover" : "Atacar", cx, cy + STICK_R + 4, 11, "rgba(255,255,255,0.6)", "center");
    }
    const [rx, ry] = this.stickCenter("R"), ib = document.getElementById("tInteract");   // botón amarillo sobre el joystick
    const pos = `${Math.round(rx)},${Math.round(this.cssH - ry + STICK_R + 14)}`;
    if (ib && ib.dataset.pos !== pos) {
      ib.dataset.pos = pos;
      ib.style.left = Math.round(rx) + "px"; ib.style.right = "auto"; ib.style.transform = "translateX(-50%)";
      ib.style.bottom = Math.round(this.cssH - ry + STICK_R + 14) + "px";
    }
  }
}

window.addEventListener("load", () => {
  const q = new URLSearchParams(location.search);          // solo para pruebas: ?signal=local&base=http://...
  if (q.get("signal")) ZNet.config({ signal: q.get("signal"), base: q.get("base") || "" });
  window.app = new App();
});
