/* Last Refuge - datos del juego (objetos, armas, zombis, botín, ajustes). */
"use strict";

const TS = 32;                 // tamaño de tile en píxeles
const CH = 16;                 // tiles por trozo (caché de dibujo)
let MAP_K = 4;                 // manzanas por lado
let N = 33 * MAP_K + 11;       // el mapa mide N x N tiles
function setMapSize(k) { MAP_K = k | 0; N = 33 * MAP_K + 11; }

const IS_TOUCH = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

const GRASS = 0, ROAD = 1, FLOOR = 2, WALL = 3, TREE = 4, DOOR_C = 5, DOOR_O = 6, CONT = 7, WINDOW = 8, WATER = 9;
const SOLID = new Set([WALL, TREE, DOOR_C, CONT, WINDOW, WATER]);
const FLOW_BLOCK = new Set([WALL, TREE, CONT, WINDOW, WATER]);
const LOS_BLOCK = new Set([WALL, TREE, DOOR_C]);

const TILE_HP = { [WALL]: 120, [DOOR_C]: 50, [DOOR_O]: 50, [WINDOW]: 25, [CONT]: 40, [TREE]: 90, [FLOOR]: 18 };
const TILE_DROP = { [WALL]: 2, [DOOR_C]: 1, [DOOR_O]: 1, [WINDOW]: 1, [CONT]: 1, [TREE]: 2, [FLOOR]: 1 };
const TOOL_POWER = { fists: 6, knife: 9, pan: 12, bat: 20, axe: 48, pistol: 6 };
const HATS = ["none", "lumberjack", "police", "firefighter", "farmer"];
const HAT_NAMES = { none: "Sin sombrero", lumberjack: "Leñador", police: "Policía", firefighter: "Bombero", farmer: "Agricultor" };
const BUILD_PIECES = [
  { id: "wall", tile: WALL, cost: 2, time: 3.0, name: "Pared" },
  { id: "door", tile: DOOR_C, cost: 2, time: 2.5, name: "Puerta" },
  { id: "window", tile: WINDOW, cost: 1, time: 2.0, name: "Ventana" },
  { id: "floor", tile: FLOOR, cost: 1, time: 1.5, name: "Suelo" },
  { id: "chest", tile: CONT, cost: 3, time: 2.5, name: "Cofre" },
];
const REACH = 72;

const PLAYER_R = 9;
const WALK = 95, RUN = 165, SNEAK = 48;
const ACTIVE_R = 800;
const FLOW_R = 26;
const INTERACT_DIST = 58;
const TORCH_R = 280;
const MAX_TORCHES = 16;
const ZOMBIE_DAY = 45;
const ZOMBIE_NIGHT = IS_TOUCH ? 90 : 140;
const GAME_MIN_PER_SEC = 0.8;
const START_MINUTES = 8 * 60;
const SPAWN_TILE = [40, 40];
const BITE_CHANCE = 0.12;
const INFECTION_TIME = 240;

const CAR_R = 13;
const CAR_MAX = 330, CAR_REV = -110, CAR_ACC = 230, CAR_TURN = 2.3;
const N_CARS = 8;
const CAR_COLORS = [[190, 50, 45], [50, 100, 180], [210, 190, 60], [230, 230, 235], [60, 150, 90], [60, 60, 68]];

const SNAP_HZ = 15;
const INPUT_HZ = 20;
const VIEW_R = 780;
const MAX_PLAYERS = 6;

function switchPos(b) { return [(b.x0 + 1.5) * TS, (b.y0 + 1) * TS + 5]; }

// ---------------------------------------------------------------- objetos
const ITEMS = {
  pistol: { name: "Pistola", kind: "weapon" },
  axe: { name: "Hacha", kind: "weapon" },
  bat: { name: "Bate", kind: "weapon" },
  pan: { name: "Sartén", kind: "weapon" },
  knife: { name: "Cuchillo", kind: "weapon" },
  flashlight: { name: "Linterna", kind: "tool" },
  torch: { name: "Antorcha", kind: "torch" },
  pack_small: { name: "Mochila pequeña", kind: "pack" },
  backpack: { name: "Mochila", kind: "pack" },
  pack_hiker: { name: "Mochila de montaña", kind: "pack" },
  pack_mil: { name: "Mochila militar", kind: "pack" },
  grenade: { name: "Granada", kind: "bomb" },
  molotov: { name: "Cóctel molotov", kind: "bomb" },
  dynamite: { name: "Dinamita", kind: "bomb" },
  firecracker: { name: "Petardos", kind: "bomb" },
  bandage: { name: "Venda", kind: "med" },
  medkit: { name: "Botiquín", kind: "med" },
  canned: { name: "Comida enlatada", kind: "food", amount: 40 },
  cookies: { name: "Galletas", kind: "food", amount: 20 },
  water: { name: "Botella de agua", kind: "drink", amount: 45 },
  soda: { name: "Refresco", kind: "drink", amount: 25 },
  battery: { name: "Pilas", kind: "tool" },
  ammo: { name: "Balas 9mm", kind: "ammo" },
  bottle: { name: "Botella vacía", kind: "throw" },
  planks: { name: "Tablones", kind: "material" },
  rod: { name: "Caña de pescar", kind: "weapon" },
  fish: { name: "Pescado", kind: "food", amount: 35 },
  smg: { name: "Subfusil", kind: "weapon" },
  shotgun: { name: "Escopeta", kind: "weapon" },
  rifle: { name: "Rifle de caza", kind: "weapon" },
  fuel: { name: "Bidón de gasolina", kind: "fuel" },
  shells: { name: "Cartuchos", kind: "ammo" },
  rifle_ammo: { name: "Balas de rifle", kind: "ammo" },
};
const ITEM_WEIGHT = {
  pistol: 1.2, smg: 3.0, shotgun: 3.5, rifle: 4.0, axe: 2.0, bat: 1.5, pan: 1.2, knife: 0.4,
  rod: 1.0, flashlight: 0.5, torch: 0.4, bandage: 0.1, medkit: 0.8, canned: 0.5, cookies: 0.2, fish: 0.4,
  water: 0.6, soda: 0.4, battery: 0.2, ammo: 0.03, shells: 0.06, rifle_ammo: 0.05, fuel: 3.0,
  bottle: 0.2, planks: 0.5, backpack: 1.0, pack_small: 0.5, pack_hiker: 1.6, pack_mil: 2.2,
  grenade: 0.5, molotov: 0.6, dynamite: 0.8, firecracker: 0.1,
};
const CAP = 22.0;
const PACKS = { pack_small: 8, backpack: 14, pack_hiker: 24, pack_mil: 28 };
const THROWABLES = ["grenade", "molotov", "dynamite", "firecracker", "bottle"];
const BOMBS = {
  grenade: { fuse: 1.6, rad: 120, zd: 190, pd: 55, td: 70, noise: 950, kb: 420 },
  dynamite: { fuse: 3.0, rad: 170, zd: 400, pd: 95, td: 220, noise: 1100, kb: 600 },
  molotov: { fuse: 0, rad: 0, zd: 0, pd: 0, td: 0, noise: 420, kb: 0 },
  firecracker: { fuse: 2.4, rad: 0, zd: 0, pd: 0, td: 0, noise: 900, kb: 0 },
};
function capOf(back) { return CAP + (PACKS[back] || 0); }
function invWeight(inv) {
  let s = 0;
  for (const k in inv) if (inv[k] > 0) s += (ITEM_WEIGHT[k] || 0.5) * inv[k];
  return s;
}

const ITEM_DESC = {
  pistol: "Pistola: apunta y dispara. Hace mucho ruido.",
  axe: "Arma y herramienta: derriba paredes y puertas rápido.",
  bat: "Arma cuerpo a cuerpo, golpea a 2 zombis.",
  pan: "Sartén: golpe medio, algo ruidosa.",
  knife: "Cuchillo: rápido y silencioso.",
  rod: "Equípala y pulsa Interactuar frente a un lago para pescar.",
  fish: "Pescado: quita hambre.",
  flashlight: "Ilumina un cono delante de ti. Gasta pilas.",
  torch: "Antorcha: 'Usar' la clava en el suelo. Da luz y ningún zombi aparece cerca. Recógela con Interactuar.",
  pack_small: "Mochila pequeña: equípala y cargas 8 kg más (30 kg).",
  backpack: "Mochila: equípala y cargas 14 kg más (36 kg).",
  pack_hiker: "Mochila de montaña: equípala y cargas 24 kg más (46 kg).",
  pack_mil: "Mochila militar: la más grande. 28 kg más: 50 kg en total.",
  grenade: "Granada: 'Preparar' y luego Lanzar. Explota 1,6 s después de caer. ¡Aléjate!",
  molotov: "Cóctel molotov: al caer deja fuego unos segundos que quema zombis (y a ti).",
  dynamite: "Dinamita: explota a los 3 s con enorme radio. Destruye paredes. ¡Cuidado!",
  firecracker: "Petardos: mucho ruido unos segundos; atraen zombis lejos de ti.",
  bandage: "Detiene el sangrado.",
  medkit: "Cura 45 de salud y detiene el sangrado.",
  canned: "Comida enlatada: quita mucha hambre.",
  cookies: "Galletas: quitan un poco de hambre.",
  water: "Agua: quita sed. Te deja una botella vacía.",
  soda: "Refresco: quita algo de sed.",
  battery: "Recarga la linterna.",
  ammo: "Balas para pistola y subfusil (se cargan con Recargar).",
  bottle: "Botella vacía: lánzala para distraer zombis.",
  planks: "Material para construir paredes, puertas, suelo y cofres.",
  smg: "Subfusil automático: gasta balas 9mm rápido. Muy ruidoso.",
  shotgun: "Escopeta: varios perdigones, devastadora de cerca. Usa cartuchos.",
  rifle: "Rifle de caza: mucho alcance y atraviesa hasta 3 zombis.",
  fuel: "Gasolina: acércate a un auto y úsala para llenarle el tanque.",
  shells: "Cartuchos para la escopeta.",
  rifle_ammo: "Balas para el rifle de caza.",
};
const CONT_NAMES = { gunrack: "Armero", medcab: "Armario médico", pantry: "Despensa", toolbox: "Caja de herramientas",
  fridge: "Nevera", shelf: "Estante", wardrobe: "Armario", counter: "Mostrador", cabinet: "Gabinete", chest: "Cofre" };
const ITEM_ORDER = ["rifle", "shotgun", "smg", "pistol", "axe", "bat", "pan", "knife", "rod", "flashlight", "torch", "bandage",
  "medkit", "canned", "cookies", "fish", "water", "soda", "battery", "ammo", "shells", "rifle_ammo",
  "fuel", "grenade", "molotov", "dynamite", "firecracker", "bottle", "planks",
  "pack_small", "backpack", "pack_hiker", "pack_mil"];
const ITEM_COLORS = { weapon: [205, 205, 215], food: [225, 150, 60], drink: [80, 150, 230], material: [170, 125, 70],
  pack: [150, 110, 190], bomb: [230, 70, 60], torch: [240, 170, 60], med: [230, 90, 90], ammo: [210, 190, 90],
  tool: [150, 200, 220], throw: [180, 220, 240], fuel: [220, 120, 40] };

const WEAPONS = {
  fists: { name: "Puños", dmg: 8, rng: 34, arc: 2.0, cd: 0.45, noise: 45, targets: 1, dur: null, kb: 140, stam: 5 },
  knife: { name: "Cuchillo", dmg: 20, rng: 38, arc: 1.6, cd: 0.35, noise: 30, targets: 1, dur: 70, kb: 90, stam: 4 },
  pan: { name: "Sartén", dmg: 24, rng: 42, arc: 1.8, cd: 0.55, noise: 75, targets: 1, dur: 90, kb: 170, stam: 6 },
  bat: { name: "Bate", dmg: 34, rng: 54, arc: 2.2, cd: 0.62, noise: 110, targets: 2, dur: 110, kb: 260, stam: 9 },
  axe: { name: "Hacha", dmg: 58, rng: 52, arc: 2.2, cd: 0.85, noise: 120, targets: 2, dur: 90, kb: 240, stam: 12 },
  rod: { name: "Caña de pescar", dmg: 3, rng: 60, arc: 0.9, cd: 0.6, noise: 40, targets: 1, dur: 80, kb: 50, stam: 3 },
};
const GUNS = {
  pistol: { name: "Pistola", ammo: "ammo", dmg: 50, cd: 0.40, noise: 650, mag: 12, reload: 1.5, pellets: 1, spread: 0.025, rng: 520, pierce: 1, auto: false, kb: 200 },
  smg: { name: "Subfusil", ammo: "ammo", dmg: 22, cd: 0.10, noise: 700, mag: 30, reload: 2.0, pellets: 1, spread: 0.07, rng: 480, pierce: 1, auto: true, kb: 110 },
  shotgun: { name: "Escopeta", ammo: "shells", dmg: 17, cd: 0.95, noise: 800, mag: 6, reload: 2.4, pellets: 7, spread: 0.20, rng: 300, pierce: 1, auto: false, kb: 330 },
  rifle: { name: "Rifle de caza", ammo: "rifle_ammo", dmg: 110, cd: 1.0, noise: 900, mag: 5, reload: 2.2, pellets: 1, spread: 0.008, rng: 760, pierce: 3, auto: false, kb: 260 },
};
const WEAPON_LEN = { fists: 0, knife: 16, pan: 18, bat: 26, axe: 24, pistol: 18, rod: 30, smg: 22, shotgun: 30, rifle: 36 };

// ---------------------------------------------------------------- modos
const MODES = {
  normal: { name: "Normal", zi: 1, li: 2, ti: 1, dmg: 1.0, bite: 1.0, bk: 1.0, revive: true,
    desc: "La experiencia de siempre. Si mueres, reapareces (tu botín queda en tu cuerpo)." },
  hard: { name: "Difícil", zi: 2, li: 1, ti: 1, dmg: 1.3, bite: 1.3, bk: 1.8, revive: true,
    desc: "Más zombis, menos botín, golpes más fuertes y más rompemuros." },
  hardcore: { name: "Hardcore", zi: 3, li: 0, ti: 1, dmg: 1.6, bite: 1.6, bk: 2.5, revive: false,
    desc: "Hordas, poco botín y MUERTE REAL: no puedes revivir." },
};
const MAP_OPTS = [["Pequeño", 3], ["Mediano", 4], ["Grande", 5], ["Enorme", 6]];
const Z_OPTS = [["Pocos", 0.4], ["Normal", 1.0], ["Muchos", 1.5], ["Horda", 2.2]];
const LOOT_OPTS = [["Escaso", 0.4], ["Poco", 0.7], ["Normal", 1.0], ["Abundante", 1.6], ["Muy abundante", 2.5]];
const TIME_OPTS = [["Lento", 0.5], ["Normal", 1.0], ["Rápido", 2.0], ["Muy rápido", 4.0]];

function normSettings(d) {
  d = (d && typeof d === "object") ? d : {};
  const mode = MODES[d.mode] ? d.mode : "normal";
  const out = { mode };
  for (const [key, opts] of [["zi", Z_OPTS], ["li", LOOT_OPTS], ["ti", TIME_OPTS], ["ms", MAP_OPTS]]) {
    const v = d[key];
    out[key] = (Number.isInteger(v) && v >= 0 && v < opts.length) ? v : (MODES[mode][key] !== undefined ? MODES[mode][key] : 1);
  }
  return out;
}

const LOOT = {
  fridge: [["canned", 3, 1, 2], ["cookies", 2, 1, 2], ["water", 3, 1, 1], ["soda", 3, 1, 2], ["bottle", 1, 1, 1]],
  shelf: [["canned", 3, 1, 2], ["cookies", 3, 1, 2], ["battery", 2, 1, 1], ["ammo", 1, 4, 8], ["shells", 0.5, 2, 4], ["fuel", 0.9, 1, 1],
    ["bandage", 1, 1, 1], ["planks", 2, 2, 4], ["bottle", 2, 1, 2], ["pack_small", 0.4, 1, 1], ["torch", 1.2, 1, 2],
    ["firecracker", 0.5, 1, 3], ["molotov", 0.3, 1, 1]],
  wardrobe: [["bandage", 3, 1, 2], ["bat", 1, 1, 1], ["flashlight", 1, 1, 1], ["medkit", 1, 1, 1],
    ["water", 1, 1, 1], ["planks", 1, 1, 2], ["backpack", 0.7, 1, 1], ["pack_small", 0.8, 1, 1], ["pack_hiker", 0.3, 1, 1]],
  counter: [["knife", 2, 1, 1], ["pan", 2, 1, 1], ["canned", 2, 1, 1], ["water", 1, 1, 1],
    ["cookies", 2, 1, 2], ["bottle", 2, 1, 2], ["pack_small", 0.5, 1, 1]],
  cabinet: [["medkit", 1, 1, 1], ["bandage", 2, 1, 2], ["ammo", 2, 4, 9], ["battery", 2, 1, 1],
    ["pistol", 0.35, 1, 1], ["axe", 0.5, 1, 1], ["flashlight", 1, 1, 1], ["planks", 1, 2, 3], ["torch", 1, 1, 2],
    ["rod", 0.5, 1, 1], ["backpack", 0.6, 1, 1], ["pack_hiker", 0.3, 1, 1], ["pack_mil", 0.15, 1, 1],
    ["grenade", 0.35, 1, 2], ["molotov", 0.4, 1, 1], ["shotgun", 0.22, 1, 1], ["rifle", 0.14, 1, 1], ["smg", 0.10, 1, 1],
    ["shells", 1.3, 3, 6], ["rifle_ammo", 0.9, 3, 6], ["fuel", 1.2, 1, 1]],
  gunrack: [["pistol", 3, 1, 1], ["smg", 1.0, 1, 1], ["shotgun", 1.8, 1, 1], ["rifle", 1.1, 1, 1],
    ["ammo", 3, 6, 14], ["shells", 3, 4, 8], ["rifle_ammo", 2, 4, 8], ["bandage", 1, 1, 2],
    ["flashlight", 1, 1, 1], ["grenade", 1.2, 1, 3], ["pack_mil", 0.9, 1, 1], ["dynamite", 0.4, 1, 1]],
  medcab: [["medkit", 3, 1, 1], ["bandage", 5, 1, 3], ["water", 1, 1, 2], ["cookies", 1, 1, 1]],
  pantry: [["canned", 5, 1, 3], ["cookies", 4, 1, 3], ["water", 4, 1, 2], ["soda", 4, 1, 3],
    ["bottle", 1, 1, 2], ["firecracker", 0.6, 1, 3]],
  toolbox: [["axe", 1.6, 1, 1], ["bat", 1.6, 1, 1], ["planks", 4, 2, 5], ["fuel", 3, 1, 2], ["torch", 3, 1, 3],
    ["battery", 2.5, 1, 2], ["knife", 1, 1, 1], ["flashlight", 1.2, 1, 1], ["pan", 0.8, 1, 1], ["backpack", 0.9, 1, 1],
    ["pack_hiker", 0.5, 1, 1], ["dynamite", 0.7, 1, 2], ["molotov", 0.8, 1, 2], ["firecracker", 0.8, 2, 4]],
  chest: [],
};
const SPECIAL = {
  gas: { name: "GASOLINERA", w: [11, 13], h: [8, 9], q: 1, maxd: 0, doors: 2, bonus: 1, roof: [196, 62, 52],
    cw: [["toolbox", 4], ["shelf", 2], ["fridge", 2]] },
  supermarket: { name: "SUPERMERCADO", w: [20, 24], h: [14, 17], q: 2, maxd: 2, doors: 3, bonus: 4, roof: [58, 124, 92],
    cw: [["pantry", 5], ["fridge", 3], ["counter", 2]] },
  police: { name: "COMISARÍA", w: [14, 16], h: [11, 13], q: 3, maxd: 2, doors: 2, bonus: 2, roof: [52, 72, 132],
    cw: [["gunrack", 4], ["cabinet", 2], ["counter", 2], ["wardrobe", 1]] },
  hardware: { name: "FERRETERÍA", w: [14, 17], h: [10, 12], q: 2, maxd: 1, doors: 2, bonus: 3, roof: [184, 132, 52],
    cw: [["toolbox", 5], ["shelf", 3]] },
  hospital: { name: "HOSPITAL", w: [20, 24], h: [14, 17], q: 3, maxd: 3, doors: 3, bonus: 4, roof: [222, 222, 230],
    cw: [["medcab", 5], ["fridge", 1], ["counter", 2], ["wardrobe", 1]] },
};
const RARE_ITEMS = new Set(["backpack", "pack_small", "pack_hiker", "pack_mil", "grenade", "molotov", "dynamite", "pistol", "axe",
  "medkit", "ammo", "bat", "battery", "flashlight", "shotgun", "rifle", "smg", "shells", "rifle_ammo", "fuel"]);
const ITEM_COUNT_BY_QUALITY = [
  [[0, 22], [1, 40], [2, 28], [3, 10]],
  [[0, 12], [1, 30], [2, 38], [3, 20]],
  [[0, 6], [1, 22], [2, 36], [3, 26], [4, 10]],
  [[0, 3], [1, 12], [2, 30], [3, 32], [4, 23]],
];
const CONT_WEIGHTS = [["fridge", 2], ["shelf", 3], ["wardrobe", 2], ["counter", 3], ["cabinet", 2]];
const ROOF_COLORS = [[140, 70, 60], [112, 92, 72], [88, 100, 122], [122, 60, 72], [98, 112, 92]];
const ACTIONS = new Set(["click", "shove", "interact", "reload", "flash", "cycle", "bandage", "consume", "use",
  "respawn", "build", "throw", "take", "put", "drop", "closec", "hat", "unequip"]);

// ---------------------------------------------------------------- zombis
const KINDS = ["walker", "runner", "thrower", "brute", "breaker"];
const BREAKABLE = new Set([WALL, WINDOW, DOOR_C]);
const ZK = {
  walker: { name: "Normal", hp: [45, 70], spd: [38, 52], r: 10, dmg: 1.0 },
  runner: { name: "Corredor", hp: [28, 42], spd: [105, 125], r: 9, dmg: 0.8 },
  thrower: { name: "Lanzador", hp: [40, 60], spd: [40, 50], r: 10, dmg: 0.8 },
  brute: { name: "Bruto", hp: [200, 260], spd: [34, 42], r: 14, dmg: 1.7 },
  breaker: { name: "Rompemuros", hp: [300, 380], spd: [36, 42], r: 14, dmg: 1.5 },
};
const Z_SKINS = [[122, 152, 112], [136, 160, 122], [110, 140, 105]];
const Z_CLOTHES = [[70, 80, 110], [110, 70, 60], [60, 90, 70], [90, 90, 90], [120, 110, 60], [80, 60, 90]];

// ---------------------------------------------------------------- utilidades
function angdiff(a, b) { let d = (a - b + Math.PI) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI; return d - Math.PI; }
function hypot(x, y) { return Math.sqrt(x * x + y * y); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rgb(c, a) { return a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function shade(c, f) { return [clamp(c[0] * f, 0, 255) | 0, clamp(c[1] * f, 0, 255) | 0, clamp(c[2] * f, 0, 255) | 0]; }
const TAU = Math.PI * 2;
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

/* Generador aleatorio con semilla (igual en todos los dispositivos: el mapa se genera igual). */
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  random() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  randint(a, b) { return a + Math.floor(this.random() * (b - a + 1)); }
  randrange(n) { return Math.floor(this.random() * n); }
  uniform(a, b) { return a + (b - a) * this.random(); }
  choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  gauss(mu, s) {
    const u = 1 - this.random(), v = this.random();
    return mu + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
}
function weighted(rnd, table, wi = 1) {
  let total = 0;
  for (const t of table) total += t[wi];
  let r = rnd.random() * total;
  for (const t of table) { r -= t[wi]; if (r <= 0) return t; }
  return table[table.length - 1];
}
function parseSeed(text) {
  text = (text || "").trim();
  if (!text) return Math.floor(Math.random() * 1e9);
  if (/^-?\d+$/.test(text)) return Math.abs(parseInt(text, 10)) % 1e9;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1e9;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (ix, iy) => {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) & 0xFFFF) / 65535;
  };
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  const top = a + (b - a) * u, bot = c + (d - c) * u;
  return top + (bot - top) * v;
}
