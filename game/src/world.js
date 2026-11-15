// The map: Cinder Yard, a freight depot at dusk. A warehouse holding site A in
// the north-east, an open container yard holding site B in the south-east, a
// railed mid lane between them and a connector lane along each flank. Every
// solid is a box or cylinder mesh, a collider record for movement and a mesh
// bullets stop on. Waypoints graph the routes bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = new Map();
  function material(color, rough = 0.9, metal = 0.04) {
    const key = `${color}|${rough}|${metal}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    }
    return materials.get(key);
  }

  const colliders = [];
  const shootables = [];

  // Axis-aligned solid. (x, z) is the centre, w/d the footprint, y0/h the span.
  function solid(x, z, w, d, h, color, opts = {}) {
    const y0 = opts.y0 ?? 0;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      opts.material ?? material(color, opts.rough ?? 0.9, opts.metal ?? 0.04),
    );
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = opts.shadow ?? true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (opts.collide ?? true) {
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y0, maxY: y0 + h });
    }
    if (opts.shoot ?? true) shootables.push(mesh);
    return mesh;
  }

  function barrel(x, z, color) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.15, 14), material(color, 0.55, 0.35));
    mesh.position.set(x, 0.575, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: x - 0.46, maxX: x + 0.46, minZ: z - 0.46, maxZ: z + 0.46, minY: 0, maxY: 1.15 });
    shootables.push(mesh);
    return mesh;
  }

  // Ground: one asphalt slab the sun and shadows land on.
  const ground = solid(0, 0, 68, 48, 0.1, PALETTE.asphalt, { y0: -0.1, collide: false, shadow: false });
  ground.material = material(PALETTE.asphalt, 0.96, 0);

  // Perimeter walls.
  solid(-33, 0, 1.2, 48, 4.6, PALETTE.concreteDark);
  solid(33, 0, 1.2, 48, 4.6, PALETTE.concreteDark);
  solid(0, -23, 68, 1.2, 4.6, PALETTE.concreteDark);
  solid(0, 23, 68, 1.2, 4.6, PALETTE.concreteDark);

  // Rail tracks crossing mid: ties and twin steel ribbons, low enough to step over.
  for (const trackZ of [-5.2, 5.2]) {
    solid(0, trackZ, 62, 2.0, 0.07, PALETTE.railTie, { collide: false, shadow: false });
    solid(0, trackZ - 0.72, 62, 0.14, 0.12, PALETTE.railSteel, { collide: false, metal: 0.7, rough: 0.35 });
    solid(0, trackZ + 0.72, 62, 0.14, 0.12, PALETTE.railSteel, { collide: false, metal: 0.7, rough: 0.35 });
  }

  // Warehouse A (north-east): walls with a west door and a south door.
  solid(21, -21.2, 21, 0.5, 5, PALETTE.wallWarehouse, { metal: 0.25, rough: 0.6 });
  solid(11.7, -18.2, 0.5, 6.4, 5, PALETTE.wallWarehouse, { metal: 0.25, rough: 0.6 });
  solid(11.7, -10.2, 0.5, 4.4, 5, PALETTE.wallWarehouse, { metal: 0.25, rough: 0.6 });
  solid(14.5, -8.2, 6.6, 0.5, 5, PALETTE.wallWarehouse, { metal: 0.25, rough: 0.6 });
  solid(26.4, -8.2, 9.8, 0.5, 5, PALETTE.wallWarehouse, { metal: 0.25, rough: 0.6 });
  solid(30.8, -14.7, 0.5, 13.6, 5, PALETTE.wallWarehouse, { metal: 0.25, rough: 0.6 });
  // Roof beams and a header over each door: silhouette only, high above play.
  for (const beamZ of [-19.5, -14.7, -9.9]) solid(21, beamZ, 19.6, 0.45, 0.4, PALETTE.roofBeam, { y0: 4.7, collide: false, shoot: false });
  solid(11.7, -14, 0.6, 3.4, 0.4, PALETTE.wallTrim, { y0: 3.1, collide: false, shoot: false });
  solid(19.7, -8.2, 3.9, 0.6, 0.4, PALETTE.wallTrim, { y0: 3.1, collide: false, shoot: false });
  // Interior cover.
  solid(16, -18, 1.7, 1.7, 1.7, PALETTE.crate);
  solid(17.6, -18.2, 1.1, 1.1, 1.1, PALETTE.crateDark);
  solid(24.5, -11, 1.7, 1.7, 1.7, PALETTE.crate);
  solid(21, -19.5, 3.2, 1.2, 1.05, PALETTE.concrete);
  barrel(27.5, -18.5, PALETTE.barrel);
  barrel(28.4, -17.8, PALETTE.barrel);
  barrel(27.9, -19.4, PALETTE.containerRust);

  // Site B container yard (south-east).
  solid(17, 11, 6.4, 2.6, 2.6, PALETTE.containerTeal, { metal: 0.3, rough: 0.55 });
  solid(24.5, 17.5, 2.6, 6.4, 2.6, PALETTE.containerRust, { metal: 0.3, rough: 0.55 });
  solid(16.5, 18.6, 6.4, 2.6, 2.6, PALETTE.containerSand, { metal: 0.3, rough: 0.55 });
  solid(25, 10.8, 6.4, 2.6, 2.6, PALETTE.containerTeal, { metal: 0.3, rough: 0.55 });
  solid(25, 10.8, 6.4, 2.6, 2.6, PALETTE.containerRust, { y0: 2.6, metal: 0.3, rough: 0.55 });
  solid(13.2, 15.2, 1.5, 1.5, 1.5, PALETTE.crate);

  // Mid lane cover: two containers set across the rails and crouch barriers.
  solid(-6, -1, 2.6, 5.2, 2.6, PALETTE.containerRust, { metal: 0.3, rough: 0.55 });
  solid(6, 2.9, 6.4, 2.6, 2.6, PALETTE.containerTeal, { metal: 0.3, rough: 0.55 });
  solid(0.5, -3.4, 1.6, 1.6, 1.6, PALETTE.crate);
  solid(12, -2.6, 1.6, 1.6, 1.6, PALETTE.crate);
  solid(12, -2.6, 1.2, 1.2, 1.2, PALETTE.crateDark, { y0: 1.6 });
  solid(-14, 3.4, 3.6, 0.6, 1.05, PALETTE.concrete);
  solid(16.5, -3.4, 3.6, 0.6, 1.05, PALETTE.concrete);

  // Flank connectors and spawn cover.
  solid(-16, -18, 1.6, 1.6, 1.6, PALETTE.crate);
  solid(-3, -19, 6.4, 2.6, 2.6, PALETTE.containerSand, { metal: 0.3, rough: 0.55 });
  solid(-16, 17, 1.6, 1.6, 1.6, PALETTE.crate);
  solid(-3, 18.6, 6.4, 2.6, 2.6, PALETTE.containerTeal, { metal: 0.3, rough: 0.55 });
  solid(-24, -8.5, 1.6, 1.6, 1.6, PALETTE.crate);
  solid(-24, 8.5, 1.6, 1.6, 1.6, PALETTE.crateDark);
  solid(-20.5, 0, 2.6, 5.2, 2.6, PALETTE.containerSand, { metal: 0.3, rough: 0.55 });
  barrel(-18, 7, PALETTE.barrel);
  barrel(14.5, -5.5, PALETTE.barrel);
  solid(26, 3.4, 1.5, 1.5, 1.5, PALETTE.crate);

  // Skyline silhouettes beyond the walls, so the horizon is not empty.
  for (const [x, z, w, h] of [[-44, -14, 10, 15], [-42, 12, 8, 10], [44, -18, 12, 18], [43, 10, 9, 12], [-10, -34, 16, 13], [18, 34, 14, 11]]) {
    solid(x, z, w, 6, h, PALETTE.concreteDark, { collide: false, shoot: false, shadow: false });
  }

  // Lamp posts: a pole, a glowing head, real light at three of them.
  const lampHeads = [];
  function lamp(x, z, withLight) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8), material(PALETTE.wallTrim, 0.5, 0.5));
    pole.position.set(x, 2.2, z);
    pole.castShadow = true;
    group.add(pole);
    colliders.push({ minX: x - 0.12, maxX: x + 0.12, minZ: z - 0.12, maxZ: z + 0.12, minY: 0, maxY: 4.4 });
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: PALETTE.dark, emissive: PALETTE.lampGlow, emissiveIntensity: 2.4 }),
    );
    head.position.set(x, 4.45, z);
    group.add(head);
    lampHeads.push(head);
    if (withLight) {
      const light = new THREE.PointLight(PALETTE.lampGlow, 60, 22, 1.9);
      light.position.set(x, 4.2, z);
      group.add(light);
    }
  }
  lamp(-12, -11, true);
  lamp(8, 12.5, true);
  lamp(21, -14.5, true);
  lamp(27, 6, false);
  lamp(-27, -13, false);

  // Light: hemisphere wash, a low warm sun with shadows, a cool fill.
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.05));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-34, 30, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0007;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x6f87a0, 0.45);
  fill.position.set(30, 18, 26);
  scene.add(fill);

  // Site zones: a painted ring, a translucent disc and a beacon pole.
  const sites = {
    A: { id: 'A', x: 21, z: -14.5, r: 5 },
    B: { id: 'B', x: 21, z: 14.5, r: 5.5 },
  };
  const ringMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const discMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.13, side: THREE.DoubleSide });
  for (const site of Object.values(sites)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 48), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(site.r - 0.35, 48), discMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.x, 0.025, site.z);
    group.add(disc);
    const beacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 2.6, 0.22),
      new THREE.MeshStandardMaterial({ color: PALETTE.dark, emissive: PALETTE.accent, emissiveIntensity: 1.1 }),
    );
    beacon.position.set(site.x + site.r - 0.4, 1.3, site.z);
    group.add(beacon);
  }

  // The breach charge: a squat case with a beacon that blinks once planted.
  const chargeGroup = new THREE.Group();
  const chargeCase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.32), material(PALETTE.dark, 0.5, 0.4));
  chargeCase.position.y = 0.1;
  chargeCase.castShadow = true;
  const chargeBeaconMat = new THREE.MeshStandardMaterial({ color: PALETTE.dark, emissive: PALETTE.charge, emissiveIntensity: 0.4 });
  const chargeBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), chargeBeaconMat);
  chargeBeacon.position.y = 0.26;
  chargeGroup.add(chargeCase, chargeBeacon);
  chargeGroup.visible = false;
  group.add(chargeGroup);

  const spawns = {
    atk: [{ x: -28, z: -3.5 }, { x: -28, z: 0 }, { x: -28, z: 3.5 }],
    def: [{ x: 27, z: -3 }, { x: 28.5, z: 1 }, { x: 26, z: 4.5 }, { x: 29, z: -1.5 }, { x: 25.5, z: -5 }],
  };

  // Waypoint graph: the routes bots walk between spawns, lanes and sites.
  const nodes = {};
  function node(id, x, z, links) { nodes[id] = { id, x, z, links }; }
  node('atkSpawn', -26, 0, ['midWest', 'northWest', 'southWest']);
  node('midWest', -16, 0, ['atkSpawn', 'mid', 'northWest', 'southWest']);
  node('mid', -3, 0.5, ['midWest', 'midEast']);
  node('midEast', 10, 0, ['mid', 'defMid', 'aDoor', 'bDoor']);
  node('northWest', -15, -15, ['atkSpawn', 'midWest', 'northMid']);
  node('northMid', 2, -15.5, ['northWest', 'aDoor']);
  node('aDoor', 10.5, -14, ['northMid', 'midEast', 'aSite']);
  node('aSite', 20, -14.5, ['aDoor', 'aBack', 'aSouthDoor']);
  node('aBack', 27, -18.5, ['aSite']);
  node('aSouthDoor', 19.7, -6, ['aSite', 'defMid']);
  node('southWest', -15, 14.5, ['atkSpawn', 'midWest', 'southMid']);
  node('southMid', 2, 15, ['southWest', 'bDoor']);
  node('bDoor', 10.5, 14.5, ['southMid', 'midEast', 'bSite']);
  node('bSite', 21, 14.5, ['bDoor', 'bBack', 'defMid']);
  node('bBack', 28, 18.5, ['bSite', 'defSpawn']);
  node('defSpawn', 28, 0, ['defMid', 'bBack']);
  node('defMid', 18, -1, ['defSpawn', 'midEast', 'aSouthDoor', 'bSite']);

  function nearestNode(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const n of Object.values(nodes)) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
  }

  // Breadth-first path between waypoint ids, as a list of nodes to walk to.
  function findPath(fromId, toId) {
    if (fromId === toId) return [];
    const prev = { [fromId]: null };
    const queue = [fromId];
    while (queue.length) {
      const current = queue.shift();
      for (const next of nodes[current].links) {
        if (prev[next] !== undefined) continue;
        prev[next] = current;
        if (next === toId) {
          const path = [];
          let cursor = toId;
          while (cursor !== fromId) { path.unshift(nodes[cursor]); cursor = prev[cursor]; }
          return path;
        }
        queue.push(next);
      }
    }
    return [];
  }

  // Segment vs tall colliders in plan view: does anything block the sight line?
  function losClear(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    for (const c of colliders) {
      if (c.maxY <= 1.45 || c.minY >= 1.5) continue;
      let t0 = 0.03;
      let t1 = 0.97;
      let ok = true;
      if (Math.abs(dx) < 1e-9) {
        if (x1 < c.minX || x1 > c.maxX) ok = false;
      } else {
        let ta = (c.minX - x1) / dx;
        let tb = (c.maxX - x1) / dx;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
      if (ok) {
        if (Math.abs(dz) < 1e-9) {
          if (z1 < c.minZ || z1 > c.maxZ) ok = false;
        } else {
          let ta = (c.minZ - z1) / dz;
          let tb = (c.maxZ - z1) / dz;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) ok = false;
        }
      }
      if (ok && t0 <= t1) return false;
    }
    return true;
  }

  function siteAt(x, z) {
    for (const site of Object.values(sites)) {
      const dx = x - site.x;
      const dz = z - site.z;
      if (dx * dx + dz * dz <= site.r * site.r) return site;
    }
    return null;
  }

  let chargeBlink = false;
  return {
    colliders,
    shootables,
    sites,
    spawns,
    nodes,
    nearestNode,
    findPath,
    losClear,
    siteAt,
    setCharge(x, z) {
      chargeGroup.position.set(x, 0, z);
      chargeGroup.visible = true;
      chargeBlink = true;
    },
    hideCharge() {
      chargeGroup.visible = false;
      chargeBlink = false;
    },
    update(time) {
      ringMaterial.opacity = 0.7 + Math.sin(time * 2.2) * 0.2;
      if (chargeBlink) chargeBeaconMat.emissiveIntensity = Math.sin(time * 11) > 0 ? 3.2 : 0.25;
    },
  };
}
