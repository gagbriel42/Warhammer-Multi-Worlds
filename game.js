// --- RENDU THREE.JS & ASSETS GOTHIC ---

let scene, camera, renderer, state;
let shipMeshes = {};
let gridHelper, hololithGroup;

function init3D() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050814, 0.008);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, -80, 60);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x02040a);
    document.body.appendChild(renderer.domElement);

    // Lumières ambiantes et spéculaires style Gothic
    const ambientLight = new THREE.AmbientLight(0x334466, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    dirLight.position.set(50, -50, 100);
    scene.add(dirLight);

    // Grille de référence Hololith
    gridHelper = new THREE.GridHelper(200, 40, 0x00ffff, 0x112244);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    hololithGroup = new THREE.Group();
    scene.add(hololithGroup);

    state = new GameState();
    state.initDemo("PVE");
    
    buildGothicShips();
    animate();
}

// Générateur procédural de Vaisseaux style Gothic (Proue cathédrale + Réacteurs)
function createGothicShipMesh(typeKey, team) {
    const group = new THREE.Group();
    const color = team === 1 ? 0x2266ff : 0xff2222;
    const goldColor = 0xcca010;

    const mainMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.8 });
    const goldMat = new THREE.MeshStandardMaterial({ color: goldColor, roughness: 0.2, metalness: 0.9 });
    const engineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    // 1. Corps principal (Coque)
    const bodyGeo = new THREE.BoxGeometry(1.2, 3, 1);
    const body = new THREE.Mesh(bodyGeo, mainMat);
    group.add(body);

    // 2. Proue blindée (Pointe / Éperon Gothic)
    const prowGeo = new THREE.ConeGeometry(0.8, 2, 4);
    const prow = new THREE.Mesh(prowGeo, goldMat);
    prow.rotation.x = -Math.PI / 2;
    prow.rotation.y = Math.PI / 4;
    prow.position.set(0, 2, 0.2);
    group.add(prow);

    // 3. Superstructure / Cathédrale sur le pont
    const castleGeo = new THREE.BoxGeometry(0.6, 1, 0.8);
    const castle = new THREE.Mesh(castleGeo, goldMat);
    castle.position.set(0, -0.5, 0.8);
    group.add(castle);

    // Flèche de la cathédrale
    const spireGeo = new THREE.CylinderGeometry(0.02, 0.1, 0.8);
    const spire = new THREE.Mesh(spireGeo, goldMat);
    spire.position.set(0, -0.5, 1.4);
    group.add(spire);

    // 4. Réacteurs à Plasma (Arrière)
    const engineGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.4);
    const engine1 = new THREE.Mesh(engineGeo, engineMat);
    engine1.position.set(-0.3, -1.6, 0);
    engine1.rotation.x = Math.PI / 2;
    group.add(engine1);

    const engine2 = engine1.clone();
    engine2.position.x = 0.3;
    group.add(engine2);

    // Échelle selon la catégorie
    const scale = SHIP_TYPES[typeKey].size;
    group.scale.set(scale, scale, scale);

    return group;
}

function buildGothicShips() {
    state.ships.forEach(ship => {
        const mesh = createGothicShipMesh(ship.typeKey, ship.team);
        scene.add(mesh);
        shipMeshes[ship.id] = mesh;
    });
}

function updatePositions() {
    hololithGroup.clear();

    state.ships.forEach(ship => {
        const mesh = shipMeshes[ship.id];
        if (!mesh) return;

        // Synchronisation position
        mesh.position.set(ship.x, ship.y, ship.z);
        mesh.rotation.z = ship.yaw - Math.PI / 2; // Correction d'alignement de la 3D
        mesh.rotation.x = ship.pitch;

        // --- BÂTON D'ALTITUDE & PROJECTION (HOLOLITH) ---
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ship.x, ship.y, ship.z),
            new THREE.Vector3(ship.x, ship.y, 0)
        ]);
        const lineMat = new THREE.LineDashedMaterial({
            color: ship.team === 1 ? 0x00ffff : 0xff4444,
            dashSize: 0.5,
            gapSize: 0.5
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        hololithGroup.add(line);

        // Cercle au sol
        const ringGeo = new THREE.RingGeometry(0.8, 1.0, 16);
        const ringMat = new THREE.MeshBasicMaterial({
            color: ship.team === 1 ? 0x00ffff : 0xff4444,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(ship.x, ship.y, 0);
        hololithGroup.add(ring);
    });
}

function animate() {
    requestAnimationFrame(animate);
    updatePositions();
    renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', init3D);