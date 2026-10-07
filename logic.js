'use strict';
// =====================================================================
//  LOGIQUE PURE DU JEU (aucun affichage ici)
//  Même principe que la version Godot : le joueur envoie des ORDRES,
//  la simulation les exécute. C'est ce qu'un serveur ferait en multijoueur.
// =====================================================================

const SHIP_TYPES = {
  frigate:    { hull: 300,  speed: 40, detection: 25, length: 80 },
  cruiser:    { hull: 900,  speed: 30, detection: 30, length: 200 },
  battleship: { hull: 2000, speed: 20, detection: 35, length: 400 },
};

const SUBSTEPS = 30;      // pas de simulation par tour
const BATTLE_SCALE = 50;  // 1 unité stratégique = 50 m en combat

const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

class GameState {
  constructor() {
    this.turn = 1;
    this.ships = new Map(); // id -> vaisseau
    this._nextId = 1;
  }

  addShip(owner, type, pos) {
    const st = SHIP_TYPES[type];
    const ship = {
      id: this._nextId++,
      owner,
      type,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      hull: st.hull,
      maxHull: st.hull,
      speed: st.speed,
      detection: st.detection,
      length: st.length,
      alive: true,
    };
    this.ships.set(ship.id, ship);
    return ship;
  }

  shipsOf(owner) {
    return [...this.ships.values()].filter((s) => s.owner === owner && s.alive);
  }
}

// Paires de vaisseaux ennemis à portée l'un de l'autre.
function pairsInRange(state, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i++) {
    const a = state.ships.get(ids[i]);
    if (!a.alive) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = state.ships.get(ids[j]);
      if (!b.alive || a.owner === b.owner) continue;
      if (vdist(a.pos, b.pos) <= Math.max(a.detection, b.detection)) {
        out.set(a.id + '_' + b.id, [a.id, b.id]);
      }
    }
  }
  return out;
}

// Regroupe les paires en batailles : si A touche B et B touche C, une seule bataille.
function groupBattles(pairs) {
  const parent = new Map();
  const find = (id) => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  for (const pair of pairs.values()) for (const id of pair) parent.set(id, id);
  for (const [a, b] of pairs.values()) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()];
}

// Résolution d'un tour SIMULTANÉ : tous les ordres des deux camps sont
// exécutés en même temps. Un nouveau contact gèle les deux vaisseaux
// concernés et déclenche une bataille.
// orders : [{ shipId, target: {x,y,z} }]
function resolveTurn(state, orders) {
  const targets = new Map();
  for (const o of orders) if (state.ships.has(o.shipId)) targets.set(o.shipId, o.target);

  const ids = [...state.ships.keys()].sort((a, b) => a - b); // ordre fixe = déterministe
  const prior = pairsInRange(state, ids); // engagements déjà en cours
  const pairs = new Map();                // combats à lancer
  const frozen = new Set();               // vaisseaux arrêtés par un contact
  const frames = [];                      // positions à chaque pas (animation)

  for (let step = 0; step < SUBSTEPS; step++) {
    for (const id of ids) {
      const s = state.ships.get(id);
      if (!s.alive || frozen.has(id) || !targets.has(id)) continue;
      const t = targets.get(id);
      const dx = t.x - s.pos.x, dy = t.y - s.pos.y, dz = t.z - s.pos.z;
      const d = Math.hypot(dx, dy, dz);
      const maxStep = s.speed / SUBSTEPS;
      if (d <= maxStep) {
        s.pos = { x: t.x, y: t.y, z: t.z };
        targets.delete(id);
      } else {
        s.pos.x += (dx / d) * maxStep;
        s.pos.y += (dy / d) * maxStep;
        s.pos.z += (dz / d) * maxStep;
      }
    }

    // Nouveaux contacts : combat + arrêt des deux vaisseaux.
    const now = pairsInRange(state, ids);
    for (const [key, pair] of now) {
      if (prior.has(key)) continue;
      pairs.set(key, pair);
      pair.forEach((id) => frozen.add(id));
    }

    const snap = {};
    for (const id of ids) {
      const p = state.ships.get(id).pos;
      snap[id] = { x: p.x, y: p.y, z: p.z };
    }
    frames.push(snap);
  }

  // Engagements déjà en cours : on peut rompre le contact en s'éloignant.
  // Si on est encore à portée à la fin du tour, le combat continue.
  const still = pairsInRange(state, ids);
  for (const [key, pair] of still) if (prior.has(key)) pairs.set(key, pair);

  return { frames, battles: groupBattles(pairs) };
}

// Le "pont" entre les deux modes : les positions stratégiques (altitude
// comprise) deviennent la scène du combat, mises à l'échelle en mètres.
function buildBattleContext(state, shipIds, playerOwner) {
  const c = { x: 0, y: 0, z: 0 };
  for (const id of shipIds) {
    const p = state.ships.get(id).pos;
    c.x += p.x; c.y += p.y; c.z += p.z;
  }
  c.x /= shipIds.length; c.y /= shipIds.length; c.z /= shipIds.length;

  return {
    playerOwner,
    center: c,
    ships: shipIds.map((id) => {
      const s = state.ships.get(id);
      return {
        id: s.id,
        owner: s.owner,
        type: s.type,
        length: s.length,
        hull: s.hull,
        pos: {
          x: (s.pos.x - c.x) * BATTLE_SCALE,
          y: (s.pos.y - c.y) * BATTLE_SCALE,
          z: (s.pos.z - c.z) * BATTLE_SCALE,
        },
      };
    }),
  };
}

// damage : { shipId: coque perdue }  (le résultat du combat revient sur la carte)
function applyBattleResult(state, damage) {
  for (const id of Object.keys(damage)) {
    const s = state.ships.get(Number(id));
    if (!s) continue;
    s.hull -= damage[id];
    if (s.hull <= 0) s.alive = false;
  }
}

// IA simple : chaque vaisseau fonce sur l'ennemi le plus proche.
function aiOrders(state, owner) {
  const enemies = state.shipsOf(1 - owner);
  if (enemies.length === 0) return [];
  return state.shipsOf(owner).map((s) => {
    let best = enemies[0];
    for (const e of enemies) if (vdist(s.pos, e.pos) < vdist(s.pos, best.pos)) best = e;
    return { shipId: s.id, target: { x: best.pos.x, y: best.pos.y, z: best.pos.z } };
  });
}

// null = la partie continue, -1 = match nul, sinon numéro du vainqueur.
function checkWinner(state) {
  const a0 = state.shipsOf(0).length;
  const a1 = state.shipsOf(1).length;
  if (a0 && a1) return null;
  if (!a0 && !a1) return -1;
  return a0 ? 0 : 1;
}

if (typeof module !== 'undefined') {
  module.exports = {
    SHIP_TYPES, SUBSTEPS, BATTLE_SCALE, vdist, GameState, resolveTurn,
    buildBattleContext, applyBattleResult, aiOrders, checkWinner,
  };
}
