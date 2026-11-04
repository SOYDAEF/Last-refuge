/* Last Refuge - menús, inventario y botones táctiles (HTML encima del juego). */
"use strict";

const UI = (() => {
  let app, menu, inv, touchEl, interactBtn, buildBar, chatBox, chatIn;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icons = new Map();
  const icon = item => { let u = icons.get(item); if (!u) { u = ART.itemIcon(item).toDataURL(); icons.set(item, u); } return u; };
  let invSig = "", invSel = null, menuFrom = null, connTimer = null;

  function init(a) {
    app = a;
    menu = $("menu"); inv = $("inv"); touchEl = $("touch"); interactBtn = $("tInteract"); buildBar = $("tBuild");
    chatBox = $("chatBox"); chatIn = $("chatIn");
    for (const b of touchEl.querySelectorAll("button[data-act]")) {
      const act = b.dataset.act;
      b.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); b.classList.add("active"); app.touchAction(act, true); });
      const up = e => { b.classList.remove("active"); app.touchAction(act, false); };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
      b.addEventListener("contextmenu", e => e.preventDefault());
    }
    $("invClose").addEventListener("click", closeInv);
    $("chatSend").addEventListener("click", () => { app.sendChat(chatIn.value); closeChat(); });
    chatIn.addEventListener("keydown", e => {
      if (e.key === "Enter") { app.sendChat(chatIn.value); closeChat(); }
      else if (e.key === "Escape") closeChat();
      e.stopPropagation();
    });
  }
  function typing() { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "SELECT"); }
  function show(html, ingame) {
    menu.innerHTML = `<div class="card">${html}</div>`;
    menu.classList.remove("hidden");
    menu.classList.toggle("ingame", !!ingame);
    const first = menu.querySelector(".btn.primary") || menu.querySelector(".btn");
    if (first && !IS_TOUCH) first.focus({ preventScroll: true });
  }
  function hide() { menu.classList.add("hidden"); menu.innerHTML = ""; if (connTimer) { clearInterval(connTimer); connTimer = null; } }
  function on(id, fn) { const el = $(id); if (el) el.addEventListener("click", fn); }
  function seg(id, opts, cur, fn) {
    const el = $(id);
    el.innerHTML = opts.map((o, i) => `<button data-i="${i}" class="${i === cur ? "on" : ""}">${esc(o)}</button>`).join("");
    el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      el.querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); fn(+b.dataset.i);
    }));
  }
  function saveCfg() { store.set(CFG_KEY, JSON.stringify(app.cfg)); }
  function toast(msg) {
    if (app.game && app.game.p) app.game.msg(msg, [255, 160, 120], app.game.p);
    else console.warn(msg);
  }

  // ------------------------------------------------------------ pantallas
  function title(msg) {
    const has = app.hasSave();
    show(`<h1>LAST REFUGE</h1>
      <div class="sub">Sobrevive al apocalipsis zombi. Saquea, construye tu refugio y no salgas de noche.</div>
      ${has ? `<button class="btn primary" id="bCont">▶ Continuar partida guardada</button>` : ""}
      <button class="btn ${has ? "" : "primary"}" id="bSolo">Jugar solo</button>
      <button class="btn" id="bOnline">Jugar online con amigos</button>
      <div class="row"><button class="btn" id="bSet">Ajustes</button><button class="btn" id="bHelp">Cómo se juega</button></div>
      <div class="status">${esc(msg || "")}</div>
      <p style="text-align:center;font-size:12px">Funciona en PC y en celular. Tu partida se guarda en este navegador.</p>`);
    on("bCont", () => { if (!app.loadGame()) title("No se pudo cargar la partida guardada."); else goFull(); });
    on("bSolo", solo); on("bOnline", () => online()); on("bSet", () => settings("title")); on("bHelp", () => help("title"));
  }
  function solo() {
    const gs = app.cfg.game;
    show(`<h2>Jugar solo</h2>
      <label class="f">Modo</label><div class="seg" id="sMode"></div>
      <p id="sDesc"></p>
      <label class="f">Tamaño del mapa</label><div class="seg" id="sMap"></div>
      <label class="f">Zombis</label><div class="seg" id="sZ"></div>
      <label class="f">Botín</label><div class="seg" id="sL"></div>
      <label class="f">Velocidad del tiempo</label><div class="seg" id="sT"></div>
      <label class="f">Semilla del mundo (vacío = al azar; la misma semilla genera el mismo mapa)</label>
      <input type="text" id="sSeed" maxlength="20" placeholder="Al azar">
      ${app.hasSave() ? `<p style="color:#ffb38a">Ojo: empezar una partida nueva reemplaza tu partida guardada.</p>` : ""}
      <div class="row"><button class="btn" id="bBack">Volver</button><button class="btn primary" id="bGo">Empezar</button></div>`);
    const modes = Object.keys(MODES);
    const upd = () => { $("sDesc").textContent = MODES[gs.mode].desc; saveCfg(); };
    seg("sMode", modes.map(m => MODES[m].name), modes.indexOf(gs.mode), i => {
      gs.mode = modes[i]; const mo = MODES[gs.mode]; gs.zi = mo.zi; gs.li = mo.li; gs.ti = mo.ti; solo();
    });
    seg("sMap", MAP_OPTS.map(o => o[0]), gs.ms, i => { gs.ms = i; upd(); });
    seg("sZ", Z_OPTS.map(o => o[0]), gs.zi, i => { gs.zi = i; upd(); });
    seg("sL", LOOT_OPTS.map(o => o[0]), gs.li, i => { gs.li = i; upd(); });
    seg("sT", TIME_OPTS.map(o => o[0]), gs.ti, i => { gs.ti = i; upd(); });
    upd();
    on("bBack", () => title()); on("bGo", () => { app.startSolo($("sSeed").value); goFull(); });
  }
  function online(msg) {
    const gs = app.cfg.game;
    show(`<h2>Jugar online</h2>
      <p>Uno crea la sala y les pasa el código de 6 letras a sus amigos (hasta 6 jugadores). Funciona en distintas redes wifi y con datos móviles.
      Quien crea la sala debe mantener el juego abierto.</p>
      <label class="f">Tu nombre</label><input type="text" id="oName" maxlength="14" value="${esc(app.cfg.name)}">
      <button class="btn primary" id="bHost">Crear sala</button>
      <p style="font-size:12px">La sala usa los ajustes de «Jugar solo»: ${esc(MODES[gs.mode].name)}, mapa ${esc(MAP_OPTS[gs.ms][0].toLowerCase())}, zombis ${esc(Z_OPTS[gs.zi][0].toLowerCase())}.</p>
      <label class="f">¿Te pasaron un código?</label>
      <div class="row"><input type="text" id="oCode" maxlength="6" placeholder="ABC123" style="flex:2;text-transform:uppercase;letter-spacing:4px">
      <button class="btn" id="bJoin" style="flex:1">Unirse</button></div>
      <div class="status">${esc(msg || "")}</div>
      <button class="btn" id="bTurn">${app.cfg.turn.url ? "✓ Retransmisor configurado (cambiar)" : "Configurar retransmisor (para redes distintas)"}</button>
      <button class="btn" id="bBack">Volver</button>`);
    on("bTurn", () => settings("online"));
    const setName = () => { const v = $("oName").value.trim().slice(0, 14); if (v) { app.cfg.name = v; saveCfg(); } };
    on("bHost", () => { setName(); app.startHost(); goFull(); });
    on("bJoin", () => {
      setName();
      const code = $("oCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 6) { menu.querySelector(".status").textContent = "El código tiene 6 caracteres."; return; }
      app.startJoin(code); goFull();
    });
    on("bBack", () => title());
  }
  function connecting() {
    show(`<h2>Conectando...</h2><p>Buscando la sala y abriendo la conexión. Puede tardar unos segundos.</p>
      <div class="status" id="cStat"></div><button class="btn" id="bCancel">Cancelar</button>`);
    on("bCancel", () => { app.stopNet(); online("Cancelado."); });
    connTimer = setInterval(() => {
      const el = $("cStat");
      if (!el) return;
      const logs = (ZNet.log() || "").split("\n");
      el.textContent = logs[logs.length - 1] || "";
    }, 400);
  }
  function settings(from) {
    menuFrom = from;
    const c = app.cfg;
    show(`<h2>Ajustes</h2>
      <label class="f">Nombre</label><input type="text" id="cName" maxlength="14" value="${esc(c.name)}">
      <label class="f">Sombrero</label><div class="seg" id="cHat"></div>
      <label class="f">Oscuridad de la noche: <b id="cDarkV">${Math.round(c.dark * 100)}%</b></label>
      <input type="range" id="cDark" min="50" max="100" value="${Math.round(c.dark * 100)}">
      <label class="f">Controles</label><div class="seg" id="cTouch"></div>
      <label class="f">Ayuda para apuntar en celular</label><div class="seg" id="cAim"></div>
      <label class="f">Minimapa al empezar</label><div class="seg" id="cMap"></div>
      <label class="f">Mostrar FPS</label><div class="seg" id="cFps"></div>
      <h2 style="margin-top:16px">Online: servidor retransmisor (TURN)</h2>
      <p>Hace falta para jugar con amigos en redes distintas (otro wifi o datos móviles). Crea una cuenta gratis en
      <b>expressturn.com</b> y copia aquí los datos que te da. Con que lo tenga quien crea la sala suele bastar.</p>
      <label class="f">Servidor (ej. relay1.expressturn.com:3478)</label><input type="text" id="tUrl" value="${esc(c.turn.url)}" autocomplete="off" autocapitalize="off">
      <label class="f">Usuario</label><input type="text" id="tUser" value="${esc(c.turn.user)}" autocomplete="off" autocapitalize="off">
      <label class="f">Clave</label><input type="text" id="tPass" value="${esc(c.turn.pass)}" autocomplete="off" autocapitalize="off">
      <button class="btn primary" id="bOk">Listo</button>`, from === "pause");
    seg("cHat", HATS.map(h => HAT_NAMES[h]), HATS.indexOf(c.hat), i => { c.hat = HATS[i]; if (app.game) app.act("hat", c.hat); });
    seg("cTouch", ["Teclado y ratón", "Táctiles"], c.touch ? 1 : 0, i => { c.touch = i === 1; app.resize(); });
    seg("cAim", ["No", "Sí"], c.aimAssist ? 1 : 0, i => { c.aimAssist = i === 1; });
    seg("cMap", ["No", "Sí"], c.minimap ? 1 : 0, i => { c.minimap = i === 1; app.showMap = c.minimap; });
    seg("cFps", ["No", "Sí"], c.fps ? 1 : 0, i => { c.fps = i === 1; });
    $("cDark").addEventListener("input", e => { c.dark = +e.target.value / 100; $("cDarkV").textContent = e.target.value + "%"; });
    on("bOk", () => {
      const v = $("cName").value.trim().slice(0, 14);
      if (v) c.name = v;
      c.turn = { url: $("tUrl").value.trim(), user: $("tUser").value.trim(), pass: $("tPass").value.trim() };
      saveCfg();
      if (from === "title") title(); else if (from === "online") online(); else pause();
      if (app.state === "play") setTouch(c.touch);
    });
  }
  function help(from) {
    show(`<h2>Cómo se juega</h2>
      <p>Explora la ciudad, revisa muebles para encontrar comida, agua, armas y herramientas. De noche salen muchos más zombis:
      refúgiate en una casa, enciende la luz con el interruptor o clava antorchas para que no aparezcan cerca.</p>
      <p><b>Celular:</b> mueve con el dedo izquierdo (empújalo hasta el borde para correr). El dedo derecho apunta y ataca
      (con armas de fuego dispara al empujar). Toca cerca de ti o usa el botón amarillo para interactuar.</p>
      <div class="keys">
        <b>WASD</b> moverse<br><b>Shift</b> correr<br><b>C</b> furtivo<br><b>Ratón</b> apuntar<br><b>Clic izq.</b> atacar / disparar<br>
        <b>Clic der.</b> apuntar arma de fuego<br><b>E</b> interactuar / auto<br><b>Espacio</b> empujar<br><b>R</b> recargar<br>
        <b>F</b> linterna<br><b>Tab</b> cambiar arma<br><b>H</b> venda<br><b>Q</b> comer / beber<br><b>V</b> lanzar<br>
        <b>B</b> construir (1-5 pieza)<br><b>G</b> mantener = destruir<br><b>I</b> inventario<br><b>M</b> minimapa<br><b>T</b> chat<br><b>Esc</b> menú</div>
      <p>Los zombis rompen las puertas, los corredores gritan y atraen a otros, los lanzadores tiran rocas y los rompemuros
      derriban paredes. Si te muerden quedas infectado. Con tablones construyes paredes, puertas, ventanas, suelo y cofres.</p>
      <button class="btn primary" id="bOk">Volver</button>`, from !== "title");
    on("bOk", () => from === "title" ? title() : pause());
  }
  function pause() {
    const solo = app.mode === "solo";
    show(`<h2>${solo ? "Pausa" : "Menú"}</h2>
      ${app.mode === "host" ? `<p>Código de tu sala (pásaselo a tus amigos):</p><div class="code">${esc(app.host.code)}</div>` : ""}
      ${!solo ? `<p>En online el juego no se detiene.</p>` : ""}
      <button class="btn primary" id="bRes">Continuar</button>
      ${solo ? `<button class="btn" id="bSave">Guardar partida</button>` : ""}
      ${document.fullscreenEnabled ? `<button class="btn" id="bFull">${document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa"}</button>` : ""}
      <div class="row"><button class="btn" id="bSet">Ajustes</button><button class="btn" id="bHelp">Cómo se juega</button></div>
      <button class="btn danger" id="bQuit">Salir al menú principal</button>
      <div class="status" id="pStat"></div>`, true);
    on("bRes", () => app.togglePause());
    on("bSave", () => { const ok = app.saveGame(true); $("pStat").textContent = ok ? "Partida guardada. Puedes cerrar la página y seguir después." : "No se pudo guardar."; });
    on("bFull", () => { if (document.fullscreenElement) document.exitFullscreen(); else goFull(); pause(); });
    on("bSet", () => settings("pause")); on("bHelp", () => help("pause"));
    on("bQuit", () => app.backToTitle(solo ? "Partida guardada." : ""));
  }
  function goFull() {
    if (!IS_TOUCH || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
    }).catch(() => {});
  }

  // ------------------------------------------------------------ controles táctiles
  function setTouch(onFlag) {
    touchEl.classList.toggle("hidden", !(onFlag && app.state === "play"));
    $("tChat").classList.toggle("hidden", !app.mode || app.mode === "solo");
    syncToggles(); updateBuildBar();
  }
  let lastInteract = null;
  function setInteract(text, alive) {
    if (!app.touch) return;
    if (!alive) text = app.mode === "solo" ? "Mundo nuevo" : (app.game && app.game.revive ? "Reaparecer" : "");
    if (text === lastInteract) return;
    lastInteract = text;
    interactBtn.textContent = text;
    interactBtn.classList.toggle("hidden", !text);
  }
  function syncToggles() {
    for (const b of touchEl.querySelectorAll(".toggle")) {
      const a = b.dataset.act;
      b.classList.toggle("on", a === "sneak" ? app.sneak : a === "run" ? app.runToggle : a === "build" ? app.buildMode : false);
    }
  }
  function updateBuildBar() {
    syncToggles();
    if (!app.touch || !app.buildMode || app.state !== "play") { buildBar.classList.add("hidden"); return; }
    buildBar.classList.remove("hidden");
    buildBar.innerHTML = BUILD_PIECES.map((pc, i) => `<button data-i="${i}" class="${i === app.buildPiece ? "on" : ""}">${esc(pc.name)} ${pc.cost}</button>`).join("") +
      `<button class="go" id="bPlace">Colocar</button><button id="bBuildX">✕</button>`;
    buildBar.querySelectorAll("button[data-i]").forEach(b => b.addEventListener("pointerdown", e => {
      e.preventDefault(); app.buildPiece = +b.dataset.i; updateBuildBar();
    }));
    $("bPlace").addEventListener("pointerdown", e => {
      e.preventDefault();
      if (app.ghost) app.act("build", [app.ghost[0], app.ghost[1], app.buildPiece]);
    });
    $("bBuildX").addEventListener("pointerdown", e => { e.preventDefault(); app.buildMode = false; updateBuildBar(); });
  }

  // ------------------------------------------------------------ chat
  function openChat() { chatBox.classList.remove("hidden"); app.chatOpen = true; chatIn.value = ""; setTimeout(() => chatIn.focus(), 30); }
  function closeChat() { chatBox.classList.add("hidden"); app.chatOpen = false; chatIn.blur(); }

  // ------------------------------------------------------------ inventario
  function contView() {
    const g = app.game, p = g.p;
    if (!p.open) return null;
    if (app.mode === "client") return p.cview ? { kind: p.cview[2], inv: p.cview[3] } : null;
    const c = g.map.containers.get(ck(p.open[0], p.open[1]));
    return c ? { kind: c.kind, inv: c.inv } : null;
  }
  function openInv() { if (!app.game) return; app.invOpen = true; invSig = ""; inv.classList.remove("hidden"); refreshInv(); }
  function closeInv() {
    if (!app.invOpen) return;
    app.invOpen = false; inv.classList.add("hidden");
    app.contIgnore = performance.now() + 800;
    if (app.game && app.game.p.open) { app.act("closec"); if (app.mode === "client") { app.game.p.open = null; app.game.p.cview = null; } }
  }
  function row(item, qty, mine, cv) {
    const p = app.game.p, kind = ITEMS[item].kind;
    let tag = "";
    if (mine && item === p.weapon) tag = "equipado";
    else if (mine && item === p.thr && (kind === "bomb" || item === "bottle")) tag = "listo para lanzar";
    const w = ((ITEM_WEIGHT[item] || 0.5) * qty).toFixed(1);
    let btns;
    if (mine) {
      const use = kind === "pack" ? "Equipar" : kind === "bomb" ? "Preparar" : kind === "torch" ? "Clavar" : kind === "weapon" ? "Equipar" : "Usar";
      btns = `<button data-a="use">${use}</button><button data-a="drop1">Tirar</button>` +
        (qty > 1 ? `<button data-a="dropall">Todo</button>` : "") + (cv ? `<button data-a="put" class="g">Guardar</button>` : "");
    } else btns = (qty > 1 ? `<button data-a="take1" class="g">1</button>` : "") + `<button data-a="take" class="g">Tomar${qty > 1 ? " todo" : ""}</button>`;
    return `<div class="it${invSel === (mine ? "m:" : "c:") + item ? " sel" : ""}" data-item="${item}" data-mine="${mine ? 1 : 0}">
      <img src="${icon(item)}" alt=""><div class="nm">${esc(ITEMS[item].name)}${qty > 1 ? ` x${qty}` : ""}<small>${w} kg${tag ? " · " + tag : ""}</small></div>
      <div class="bt">${btns}</div></div>`;
  }
  function refreshInv() {
    if (!app.invOpen || !app.game) return;
    const g = app.game, p = g.p, cv = contView();
    const sig = JSON.stringify([p.inv, p.back, p.thr, p.weapon, cv, invSel, p.alive]);
    if (sig === invSig) return;
    invSig = sig;
    const mineEl = $("invMineList"), contEl = $("invContList");
    const ms = mineEl.scrollTop, cs = contEl.scrollTop;
    $("invMineTitle").textContent = `Tus objetos · ${invWeight(p.inv).toFixed(1)} / ${capOf(p.back)} kg`;
    $("invBack").innerHTML = PACKS[p.back]
      ? `<div class="box"><img src="${icon(p.back)}" width="28" height="28" style="image-rendering:pixelated"></div>
         <div class="nm">Espalda: ${esc(ITEMS[p.back].name)}<small>+${PACKS[p.back]} kg de capacidad</small></div>
         <button class="btn small" id="bUnequip">Quitar</button>`
      : `<div class="box"></div><div class="nm">Espalda: sin mochila<small>Equipa una mochila de la lista para cargar más (hasta 50 kg)</small></div>`;
    on("bUnequip", () => app.act("unequip"));
    const own = g.owned();
    mineEl.innerHTML = own.length ? own.map(i => row(i, p.inv[i], true, cv)).join("") : `<div class="empty">No llevas nada.</div>`;
    const contPanel = $("invCont");
    if (cv) {
      contPanel.classList.remove("hidden");
      const items = ITEM_ORDER.filter(i => (cv.inv[i] || 0) > 0);
      $("invContTitle").textContent = `${CONT_NAMES[cv.kind] || "Mueble"} · ${items.length} objeto(s)`;
      contEl.innerHTML = items.length ? items.map(i => row(i, cv.inv[i], false, cv)).join("") : `<div class="empty">Vacío.</div>`;
    } else {
      contPanel.classList.toggle("hidden", app.cssW < 700);
      $("invContTitle").textContent = "Mueble";
      contEl.innerHTML = `<div class="empty">Ningún mueble abierto.<br>Acércate a uno e interactúa para ver lo que tiene.</div>`;
    }
    mineEl.scrollTop = ms; contEl.scrollTop = cs;
    for (const el of inv.querySelectorAll(".it")) {
      const item = el.dataset.item, mine = el.dataset.mine === "1";
      el.addEventListener("click", e => {
        const a = e.target.dataset && e.target.dataset.a;
        invSel = (mine ? "m:" : "c:") + item;
        $("invDesc").textContent = ITEMS[item].name + ": " + (ITEM_DESC[item] || "");
        if (a === "use") app.act("use", item);
        else if (a === "drop1") app.act("drop", [item, 1]);
        else if (a === "dropall") app.act("drop", [item, 0]);
        else if (a === "put") app.act("put", [item, 0]);
        else if (a === "take") app.act("take", [item, 0]);
        else if (a === "take1") app.act("take", [item, 1]);
        invSig = "";
        setTimeout(refreshInv, 0);
      });
    }
  }

  return { init, typing, title, solo, online, connecting, settings, help, pause, hide, toast, setTouch, setInteract, syncToggles,
    updateBuildBar, openChat, closeChat, openInv, closeInv, refreshInv };
})();
