'use strict';
// =====================================================================
//  AFFICHAGE + ENTRÉES (Three.js).  La logique est dans logic.js.
//  Mode 1 : stratégie 3D en tours simultanés
//  Mode 2 : combat en chasseur, vue première personne
// =====================================================================

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLORS = [0x4a90ff, 0xff5a40]; // camp 0 = bleu (joueur), camp 1 = rouge
const keys = new Set();              // touches physiques enfoncées (ZQSD = WASD physiques)
const mouse = { x: 0, y: 0 };

let mode = 'menu'; // menu | planning | anim | battle | over
let vsAI = true;
let state = null;
let currentPlayer = 0;
let handoff = false;
let battle = null;

// ---------------------------------------------------------------- rendu
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

// ---------------------------------------------------------------- interface (overlay)
function showOverlay(title, text, buttons, opaque) {
  $('ov-title').textContent = title;
  $('ov-text').textContent = text;
  const box = $('ov-btns');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.onclick = b.onClick;
    box.appendChild(el);
  }
  $('overlay').classList.toggle('opaque', !!opaque);
  $('overlay').hidden = false;
}
function hideOverlay() { $('overlay').hidden = true; }

let lastHud = '';
function setHud(t) {
  if (t !== lastHud) { $('hud').textContent = t; lastHud = t; }
}

// ---------------------------------------------------------------- lignes dynamiques
function makeDynLines(scene, maxVerts) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(maxVerts * 3);
  const col = new Float32Array(maxVerts * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
  obj.frustumCulled = false;
  scene.add(obj);
  let n = 0;
  return {
    begin() { n = 0; },
    add(a, b, c) {
      if (n + 2 > maxVerts) return;
      pos.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 3);
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], n * 3);
      n += 2;
    },
    end() {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, n);
    },
  };
}

const C = {
  green: new THREE.Color(0x44ff66),
  dgreen: new THREE.Color(0x1f7a30),
  white: new THREE.Color(0xffffff),
  gray: new THREE.Color(0x888888),
  range: new THREE.Color(0x335577),
  stick: [new THREE.Color(0x24487a), new THREE.Color(0x7a2a20)],
};

// =====================================================================
//  MODE 1 : STRATÉGIE
// =====================================================================
const strat = {
  scene: new THREE.Scene(),
  cam: new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 6000),
  target: new THREE.Vector3(0, 0, 0),
  yaw: 0, pitch: 0.6, dist: 260,
  nodes: new Map(),       // id -> mesh
  selected: -1,
  targetAlt: 0,
  orders: new Map(),      // ordres du joueur courant : shipId -> ordre
  submitted: [],          // ordres déjà validés par les joueurs précédents
  dragging: false,
  lines: null,
};
strat.scene.background = new THREE.Color(0x02020a);
strat.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
{
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(1, 2, 1);
  strat.scene.add(sun);
}
strat.scene.add(new THREE.GridHelper(400, 16, 0x3a3a5a, 0x1c1c30));
strat.lines = makeDynLines(strat.scene, 4000);

function updateStratCam() {
  const { yaw, pitch, dist, target } = strat;
  strat.cam.position.set(
    target.x + dist * Math.cos(pitch) * Math.sin(yaw),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(pitch) * Math.cos(yaw)
  );
  strat.cam.lookAt(target);
  strat.cam.updateMatrixWorld();
}

function buildStratShips() {
  for (const s of state.ships.values()) {
    const L = s.length / 25; // taille visuelle sur la carte
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.3, L * 0.2, L),
      new THREE.MeshLambertMaterial({ color: COLORS[s.owner] })
    );
    mesh.position.set(s.pos.x, s.pos.y, s.pos.z);
    strat.scene.add(mesh);
    strat.nodes.set(s.id, mesh);
  }
}

// Brouillard de guerre : on ne voit que ses vaisseaux et les ennemis à portée.
function refreshVisibility() {
  const mine = state.shipsOf(currentPlayer);
  for (const s of state.ships.values()) {
    const node = strat.nodes.get(s.id);
    let seen = s.alive && s.owner === currentPlayer;
    if (s.alive && !seen) {
      seen = mine.some((m) => node.position.distanceTo(strat.nodes.get(m.id).position) <= m.detection);
    }
    node.visible = seen;
  }
}

// --- sélection et ordres
function pickShip(px, py) {
  let best = -1, bestDist = 30; // pixels
  const v = new THREE.Vector3();
  for (const [id, node] of strat.nodes) {
    if (!node.visible) continue;
    v.copy(node.position).project(strat.cam);
    if (v.z > 1) continue; // derrière la caméra
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const d = Math.hypot(sx - px, sy - py);
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return best;
}

const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _pt = new THREE.Vector3();
// Point où le rayon de la souris coupe le plan horizontal à l'altitude donnée.
function mouseOnPlane(px, py, altitude) {
  _ray.setFromCamera({ x: (px / window.innerWidth) * 2 - 1, y: -(py / window.innerHeight) * 2 + 1 }, strat.cam);
  _plane.constant = -altitude;
  return _ray.ray.intersectPlane(_plane, _pt); // Vector3 ou null
}

function onLeftClick(px, py) {
  const picked = pickShip(px, py);
  if (picked !== -1 && state.ships.get(picked).owner === currentPlayer) {
    strat.selected = picked;
    strat.targetAlt = state.ships.get(picked).pos.y;
    return;
  }
  if (strat.selected === -1) return;
  const p = mouseOnPlane(px, py, strat.targetAlt);
  if (p) {
    strat.orders.set(strat.selected, { shipId: strat.selected, target: { x: p.x, y: p.y, z: p.z } });
  }
}

// --- déroulement des tours
function showHandoff(p) {
  handoff = true;
  showOverlay(
    'Joueur ' + (p + 1),
    "Passez le clavier à ce joueur, l'autre détourne les yeux. Cliquez quand vous êtes prêt.",
    [{
      label: 'Commencer',
      onClick: () => { currentPlayer = p; refreshVisibility(); handoff = false; hideOverlay(); },
    }],
    true
  );
}

function beginPlanning() {
  mode = 'planning';
  strat.selected = -1;
  strat.orders.clear();
  strat.submitted = [];
  currentPlayer = 0;
  refreshVisibility();
  if (!vsAI) showHandoff(0);
}

function endPlanning() {
  if (mode !== 'planning' || handoff) return;
  strat.submitted.push(...strat.orders.values());
  strat.orders.clear();
  strat.selected = -1;
  if (!vsAI && currentPlayer === 0) { showHandoff(1); return; }
  processTurn().catch(console.error);
}

async function playFrames(frames) {
  for (const f of frames) {
    for (const id in f) strat.nodes.get(Number(id)).position.set(f[id].x, f[id].y, f[id].z);
    refreshVisibility();
    await sleep(30);
  }
}

async function processTurn() {
  mode = 'anim';
  let orders = strat.submitted.slice();
  strat.submitted = [];
  if (vsAI) orders = orders.concat(aiOrders(state, 1));

  const result = resolveTurn(state, orders); // tours simultanés : tous les ordres d'un coup
  await playFrames(result.frames);

  for (const ids of result.battles) {
    const ctx = buildBattleContext(state, ids, 0);
    const damage = await runBattle(ctx);
    applyBattleResult(state, damage); // les dégâts du combat persistent sur la carte
    mode = 'anim';
    refreshVisibility();
  }

  state.turn += 1;
  const w = checkWinner(state);
  if (w !== null) { endGame(w); return; }
  beginPlanning();
}

function endGame(w) {
  mode = 'over';
  let title = 'Match nul';
  if (w === 0) title = vsAI ? 'Victoire !' : 'Le joueur 1 l\u2019emporte';
  if (w === 1) title = vsAI ? 'Défaite…' : 'Le joueur 2 l\u2019emporte';
  for (const s of state.ships.values()) strat.nodes.get(s.id).visible = s.alive;
  showOverlay(title, 'Fin de la partie après ' + (state.turn - 1) + ' tours.', [
    { label: 'Rejouer', onClick: () => location.reload() },
  ]);
}

// --- dessin et HUD de la vue stratégique
function circle(lines, c, r, color) {
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    lines.add(
      { x: c.x + Math.cos(a) * r, y: c.y, z: c.z + Math.sin(a) * r },
      { x: c.x + Math.cos(b) * r, y: c.y, z: c.z + Math.sin(b) * r },
      color
    );
  }
}

function stratFrame(dt) {
  if (!state) return;
  const planning = mode === 'planning' && !handoff;

  if (planning) {
    const pan = strat.dist * 0.8 * dt;
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sy = Math.sin(strat.yaw), cy = Math.cos(strat.yaw);
    strat.target.x += (-sy * f + cy * r) * pan;
    strat.target.z += (-cy * f - sy * r) * pan;
  }
  updateStratCam();

  const L = strat.lines;
  L.begin();
  // "Bâton" vertical sous chaque vaisseau visible : lit l'altitude d'un coup d'œil.
  for (const [id, node] of strat.nodes) {
    if (!node.visible) continue;
    L.add(node.position, { x: node.position.x, y: 0, z: node.position.z }, C.stick[state.ships.get(id).owner]);
  }
  if (planning) {
    for (const o of strat.orders.values()) {
      const s = state.ships.get(o.shipId);
      L.add(s.pos, o.target, C.green);
      L.add(o.target, { x: o.target.x, y: 0, z: o.target.z }, C.dgreen);
    }
    if (strat.selected !== -1) {
      const s = state.ships.get(strat.selected);
      circle(L, s.pos, s.speed, C.range); // portée de déplacement ce tour-ci
      const p = mouseOnPlane(mouse.x, mouse.y, strat.targetAlt);
      if (p) {
        L.add(s.pos, p, C.white);
        L.add(p, { x: p.x, y: 0, z: p.z }, C.gray);
      }
    }
  }
  L.end();

  let t = planning || handoff
    ? 'Tour ' + state.turn + ' — ' + (vsAI ? 'votre flotte' : 'Joueur ' + (currentPlayer + 1))
    : mode === 'over' ? '' : 'Résolution du tour…';
  if (planning && strat.selected !== -1) {
    const s = state.ships.get(strat.selected);
    t += '\nSélection : ' + s.type + ' #' + s.id + ' · coque ' + Math.round(s.hull) + '/' + s.maxHull +
         ' · altitude de l\u2019ordre ' + strat.targetAlt.toFixed(0);
  }
  if (planning) {
    t += '\n\nClic gauche : sélectionner un vaisseau / donner un ordre' +
         '\nR / F (ou Maj + molette) : monter / descendre l\u2019ordre' +
         '\nClic droit + glisser : tourner · molette : zoom · ZQSD : déplacer la vue' +
         '\nEntrée : valider les ordres (le cercle = portée de ce tour)';
  }
  setHud(t);
}

// =====================================================================
//  MODE 2 : COMBAT EN CHASSEUR
// =====================================================================
const TURRET = {
  frigate:    { range: 900,  rate: 1, dmg: 6 },
  cruiser:    { range: 1200, rate: 2, dmg: 8 },
  battleship: { range: 1500, rate: 3, dmg: 10 },
};
const BOLT_GEO = new THREE.BoxGeometry(1.2, 1.2, 18);
const BOLT_MAT = [new THREE.MeshBasicMaterial({ color: 0x66ffff }), new THREE.MeshBasicMaterial({ color: 0xff5533 })];

function createBattle(ctx, done) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(0.5, 0.8, 0.3);
  scene.add(sun);

  // Étoiles (suivent la caméra pour rester à l'infini).
  const starPos = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize().multiplyScalar(15000);
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false }));
  stars.frustumCulled = false;
  scene.add(stars);

  // Chaque vaisseau capital apparaît à sa position stratégique relative,
  // altitude comprise : l'organisation de la flotte EST la carte de combat.
  const ships = ctx.ships.map((s) => {
    const half = { x: s.length * 0.125, y: s.length * 0.075, z: s.length * 0.5 };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2),
      new THREE.MeshLambertMaterial({ color: COLORS[s.owner] })
    );
    mesh.position.set(s.pos.x, s.pos.y, s.pos.z);
    scene.add(mesh);
    return Object.assign({}, s, { mesh, half, cd: Math.random(), dead: false, lost: 0 });
  });

  // Marqueurs à l'écran.
  const markerBox = $('markers');
  markerBox.innerHTML = '';
  const markers = ships.map((s) => {
    const el = document.createElement('div');
    el.className = 'marker';
    el.style.color = s.owner === ctx.playerOwner ? '#7fb0ff' : '#ff8a70';
    markerBox.appendChild(el);
    return el;
  });

  // Le chasseur décolle du premier vaisseau allié, tourné vers l'ennemi.
  const cam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 30000);
  const mine = ships.filter((s) => s.owner === ctx.playerOwner);
  const theirs = ships.filter((s) => s.owner !== ctx.playerOwner);
  const carrier = mine[0];
  const enemyCenter = new THREE.Vector3();
  theirs.forEach((s) => enemyCenter.add(new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z)));
  enemyCenter.divideScalar(theirs.length);
  const start = new THREE.Vector3(carrier.pos.x, carrier.pos.y, carrier.pos.z);
  const dir = enemyCenter.clone().sub(start).normalize();
  cam.position.copy(start).addScaledVector(dir, carrier.length * 0.5 + 60);
  cam.lookAt(enemyCenter);

  return {
    ctx, scene, cam, ships, stars, markers, done,
    bolts: [], hull: 100, throttle: 0.5, firing: false, fireCd: 0, side: 1,
    paused: true, ended: false, noLock: false, endTimer: 0, endMsg: '',
  };
}

function insideBox(p, s, margin) {
  return Math.abs(p.x - s.pos.x) < s.half.x + margin &&
         Math.abs(p.y - s.pos.y) < s.half.y + margin &&
         Math.abs(p.z - s.pos.z) < s.half.z + margin;
}

function spawnBolt(b, origin, dir, speed, dmg, fromPlayer) {
  const mesh = new THREE.Mesh(BOLT_GEO, BOLT_MAT[fromPlayer ? 0 : 1]);
  mesh.position.copy(origin);
  mesh.lookAt(origin.clone().add(dir));
  b.scene.add(mesh);
  b.bolts.push({
    mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(speed),
    life: fromPlayer ? 2 : 4, dmg, fromPlayer,
  });
}

function damageShip(s, d) {
  s.hull -= d;
  s.lost += d;
  if (s.hull <= 0) { s.dead = true; s.mesh.visible = false; }
}

function simulateBattle(b, dt) {
  const cam = b.cam;
  const me = b.ctx.playerOwner;

  // --- pilotage
  if (b.noLock) { // repli si le verrouillage de la souris est refusé : joystick virtuel
    const dx = (mouse.x - window.innerWidth / 2) / (window.innerWidth / 2);
    const dy = (mouse.y - window.innerHeight / 2) / (window.innerHeight / 2);
    if (Math.abs(dx) > 0.08) cam.rotateY(-dx * dt * 1.6);
    if (Math.abs(dy) > 0.08) cam.rotateX(-dy * dt * 1.1);
  }
  cam.quaternion.normalize();
  if (keys.has('KeyW')) b.throttle = clamp(b.throttle + dt, 0, 1); // W physique = Z en AZERTY
  if (keys.has('KeyS')) b.throttle = clamp(b.throttle - dt, 0, 1);
  const speed = 40 + b.throttle * 260;
  cam.translateZ(-speed * dt);
  cam.updateMatrixWorld();

  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);

  // --- collision avec un vaisseau capital
  for (const s of b.ships) {
    if (!s.dead && insideBox(cam.position, s, 4)) {
      b.hull = 0;
      endBattle('Collision avec un vaisseau capital : chasseur détruit.');
      return;
    }
  }

  // --- tirs du joueur
  b.fireCd -= dt;
  if ((b.firing || keys.has('Space')) && b.fireCd <= 0) {
    b.fireCd = 0.12;
    b.side = -b.side;
    const origin = cam.position.clone().addScaledVector(fwd, 12).addScaledVector(right, 3 * b.side);
    spawnBolt(b, origin, fwd, 900, 30, true);
  }

  // --- tourelles ennemies : plus il y a de gros vaisseaux, plus c'est dangereux
  for (const s of b.ships) {
    if (s.dead || s.owner === me) continue;
    const t = TURRET[s.type];
    const sp = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
    const d = sp.distanceTo(cam.position);
    if (d > t.range) continue;
    s.cd -= dt;
    if (s.cd > 0) continue;
    s.cd = (1 / t.rate) * (0.8 + Math.random() * 0.4);
    const origin = new THREE.Vector3(
      s.pos.x + (Math.random() * 2 - 1) * s.half.x,
      s.pos.y + (Math.random() * 2 - 1) * s.half.y,
      s.pos.z + (Math.random() * 2 - 1) * s.half.z
    );
    const boltSpeed = 450;
    const aim = cam.position.clone().addScaledVector(fwd, speed * (d / boltSpeed) * 0.7);
    aim.x += (Math.random() - 0.5) * d * 0.08;
    aim.y += (Math.random() - 0.5) * d * 0.08;
    aim.z += (Math.random() - 0.5) * d * 0.08;
    spawnBolt(b, origin, aim.sub(origin).normalize(), boltSpeed, t.dmg, false);
  }

  // --- projectiles
  for (let i = b.bolts.length - 1; i >= 0; i--) {
    const bo = b.bolts[i];
    bo.life -= dt;
    let remove = bo.life <= 0;
    const steps = Math.max(1, Math.ceil((bo.vel.length() * dt) / 4)); // évite de traverser les coques
    for (let k = 0; k < steps && !remove; k++) {
      bo.pos.addScaledVector(bo.vel, dt / steps);
      if (bo.fromPlayer) {
        for (const s of b.ships) {
          if (s.dead || s.owner === me) continue;
          if (insideBox(bo.pos, s, 0)) { damageShip(s, bo.dmg); remove = true; break; }
        }
      } else if (bo.pos.distanceTo(cam.position) < 8) {
        b.hull -= bo.dmg;
        remove = true;
      }
    }
    bo.mesh.position.copy(bo.pos);
    if (remove) { b.scene.remove(bo.mesh); b.bolts.splice(i, 1); }
  }

  // --- fin du combat
  if (b.hull <= 0) { endBattle('Chasseur détruit.'); return; }
  if (!b.endTimer && b.ships.every((s) => s.owner === me || s.dead)) {
    b.endTimer = 1.5;
    b.endMsg = 'Flotte ennemie détruite !';
  }
  if (b.endTimer > 0) {
    b.endTimer -= dt;
    if (b.endTimer <= 0) endBattle(b.endMsg);
  }
}

function updateMarkers(b) {
  const v = new THREE.Vector3();
  b.cam.updateMatrixWorld();
  b.ships.forEach((s, i) => {
    const el = b.markers[i];
    v.set(s.pos.x, s.pos.y, s.pos.z);
    const dist = v.distanceTo(b.cam.position);
    v.project(b.cam);
    if (s.dead || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = (v.x * 0.5 + 0.5) * window.innerWidth + 'px';
    el.style.top = (-v.y * 0.5 + 0.5) * window.innerHeight + 'px';
    el.textContent = '\u25C7 ' + s.type + ' · ' + Math.round(dist) + ' m' +
      (s.owner !== b.ctx.playerOwner ? ' · coque ' + Math.max(0, Math.round(s.hull)) : '');
  });
}

function battleFrame(dt) {
  const b = battle;
  if (!b.paused && !b.ended) simulateBattle(b, dt);
  if (!battle) return; // le combat a pu se terminer pendant la simulation
  b.stars.position.copy(b.cam.position);
  updateMarkers(b);
  const enemies = b.ships.filter((s) => s.owner !== b.ctx.playerOwner && !s.dead).length;
  setHud(
    'Coque : ' + Math.max(0, Math.round(b.hull)) + ' %   ·   Poussée : ' + Math.round(b.throttle * 100) +
    ' %   ·   Vaisseaux ennemis : ' + enemies +
    '\nSouris : piloter · clic / Espace : tirer · Z / S : poussée · Échap : pause'
  );
}

function resumeBattle() {
  if (!battle || battle.ended) return;
  battle.paused = false;
  hideOverlay();
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { if (battle) battle.noLock = true; });
  } catch (e) {
    battle.noLock = true;
  }
}

function pauseBattle() {
  if (!battle || battle.ended || battle.paused) return;
  battle.paused = true;
  battle.firing = false;
  showOverlay('Pause', 'Combat en pause.', [
    { label: 'Reprendre', onClick: resumeBattle },
    { label: 'Quitter le combat', onClick: finishBattle },
  ]);
}

function endBattle(msg) {
  const b = battle;
  if (!b || b.ended) return;
  b.ended = true;
  b.firing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  showOverlay('Combat terminé', msg, [{ label: 'Retour à la carte', onClick: finishBattle }]);
}

function finishBattle() {
  const b = battle;
  if (!b) return;
  const damage = {};
  for (const s of b.ships) if (s.lost > 0) damage[s.id] = s.lost;
  hideOverlay();
  $('markers').innerHTML = '';
  $('cross').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  battle = null;
  mode = 'anim';
  b.done(damage); // le résultat revient sur la carte stratégique
}

function runBattle(ctx) {
  return new Promise((resolve) => {
    battle = createBattle(ctx, resolve);
    mode = 'battle';
    $('cross').hidden = false;
    showOverlay('Contact !', 'Vos flottes sont engagées. Vous décollez en chasseur depuis votre vaisseau.', [
      { label: 'Prendre les commandes', onClick: resumeBattle },
      { label: 'Se retirer', onClick: finishBattle },
    ]);
  });
}

// =====================================================================
//  ENTRÉES
// =====================================================================
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'planning' || handoff) return;
  if (e.button === 0) onLeftClick(e.clientX, e.clientY);
  else if (e.button === 2) strat.dragging = true;
});
window.addEventListener('pointerup', (e) => { if (e.button === 2) strat.dragging = false; });

window.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (mode === 'planning' && !handoff && strat.dragging) {
    strat.yaw -= e.movementX * 0.005;
    strat.pitch = clamp(strat.pitch + e.movementY * 0.005, 0.1, 1.5);
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (mode !== 'planning' || handoff) return;
  const dir = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
  if (e.shiftKey) {
    if (strat.selected !== -1) strat.targetAlt += dir * 5;
  } else {
    strat.dist = clamp(strat.dist * (1 - dir * 0.1), 40, 1200);
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (mode === 'planning' && !handoff) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') endPlanning();
    else if (e.code === 'Escape') strat.selected = -1;
    else if (e.code === 'KeyR' && strat.selected !== -1) strat.targetAlt += 5;
    else if (e.code === 'KeyF' && strat.selected !== -1) strat.targetAlt -= 5;
  } else if (mode === 'battle' && e.code === 'Escape') {
    pauseBattle();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Combat : souris verrouillée = pilotage à la souris.
document.addEventListener('mousemove', (e) => {
  if (mode === 'battle' && battle && !battle.paused && !battle.ended && document.pointerLockElement) {
    battle.cam.rotateY(-e.movementX * 0.0022);
    battle.cam.rotateX(-e.movementY * 0.0022);
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (mode === 'battle' && battle && !battle.paused && e.button === 0) battle.firing = true;
});
window.addEventListener('mouseup', (e) => { if (battle && e.button === 0) battle.firing = false; });

// Verrouillage perdu (Échap) = pause ; refusé = on bascule en pilotage "joystick".
document.addEventListener('pointerlockchange', () => {
  if (mode === 'battle' && battle && !battle.ended && !battle.paused && !document.pointerLockElement) pauseBattle();
});
document.addEventListener('pointerlockerror', () => { if (battle) battle.noLock = true; });

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const cams = [strat.cam];
  if (battle) cams.push(battle.cam);
  for (const c of cams) { c.aspect = window.innerWidth / window.innerHeight; c.updateProjectionMatrix(); }
});

// =====================================================================
//  DÉMARRAGE
// =====================================================================
function startGame(ai) {
  vsAI = ai;
  state = new GameState();
  state.addShip(0, 'cruiser', { x: -80, y: 0, z: 0 });
  state.addShip(0, 'frigate', { x: -80, y: 10, z: 20 });
  state.addShip(0, 'frigate', { x: -80, y: -5, z: -20 });
  state.addShip(1, 'cruiser', { x: 80, y: 5, z: 0 });
  state.addShip(1, 'frigate', { x: 80, y: 15, z: 15 });
  buildStratShips();
  hideOverlay();
  beginPlanning();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (mode === 'battle' && battle) {
    battleFrame(dt);
    renderer.render(battle.scene, battle.cam);
  } else {
    stratFrame(dt);
    renderer.render(strat.scene, strat.cam);
  }
  requestAnimationFrame(loop);
}

updateStratCam();
showOverlay(
  'Battlefleet — prototype',
  'Placez vos flottes dans l\u2019espace, puis prenez les commandes d\u2019un chasseur quand le contact est établi.',
  [
    { label: 'Solo contre l\u2019IA', onClick: () => startGame(true) },
    { label: '2 joueurs (même écran)', onClick: () => startGame(false) },
  ]
);
requestAnimationFrame(loop);
