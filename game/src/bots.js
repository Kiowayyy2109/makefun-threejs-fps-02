// The seven bots: two attackers beside the player, five defenders. Each bot
// walks waypoint routes to a post, perceives with a view cone, a hearing
// radius and plan-view line of sight, and fights in bursts through the same
// hitscan the player uses. States: route, hold, engage, defuse, dead.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { collideCircle } from './player.js';

const EYE = 1.55;
const CHEST = 1.15;
const WALK_SPEED = 3.05;
const SIGHT_RANGE = 34;
const SIGHT_COS = Math.cos(1.25); // ~72 degree half-cone
const HEAR_RANGE = 20;

const ROSTER = [
  { name: 'Vex', team: 'atk', post: 'aSite', guard: { x: 17.5, z: -11.5 } },
  { name: 'Odo', team: 'atk', post: 'bSite', guard: { x: 18.5, z: 17.5 } },
  { name: 'Rook', team: 'def', post: 'aSite', guard: { x: 23.5, z: -17.5 } },
  { name: 'Hale', team: 'def', post: 'aBack', guard: { x: 27, z: -18.5 } },
  { name: 'Moss', team: 'def', post: 'bSite', guard: { x: 18, z: 17 } },
  { name: 'Ivy', team: 'def', post: 'defMid', guard: { x: 18, z: -1 } },
  { name: 'Fenn', team: 'def', post: 'bBack', guard: { x: 28, z: 18.5 } },
];

export function dirFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}
export function yawFromDir(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function createBots(scene, world, rng) {
  const hitMeshes = [];
  const list = [];
  const tmp = new THREE.Vector3();

  const torsoGeo = new THREE.BoxGeometry(0.56, 0.74, 0.3);
  const headGeo = new THREE.SphereGeometry(0.17, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.24);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  for (const def of ROSTER) {
    const teamColor = def.team === 'atk' ? PALETTE.atk : PALETTE.def;
    const darkColor = def.team === 'atk' ? PALETTE.atkDark : PALETTE.defDark;
    const torsoMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7, metalness: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.8, metalness: 0.05 });
    const group = new THREE.Group();
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.14, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.14, 0.35, 0);
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.07;
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.62;
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.18, 1.22, -0.3);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    scene.add(group);

    const bot = {
      ...def,
      group, torso, head, torsoMat,
      pos: new THREE.Vector3(),
      yaw: 0, hp: 100, alive: true,
      state: 'hold', path: [], finalPoint: null,
      target: null, seenAgo: 99, reactT: 0,
      burstLeft: 0, burstWait: 0.5, shotT: 0,
      strafeDir: 1, strafeT: 0, perceiveT: rng() * 0.13,
      defusing: false, fallT: 0, flashT: 0, phase: rng() * 6.28,
      enemies: [],
    };
    torso.userData.bot = bot;
    torso.userData.part = 'body';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    list.push(bot);
  }

  // Enemy references: the player plus every opposing bot.
  const playerRef = { kind: 'player' };
  for (const bot of list) {
    bot.enemies = list.filter((other) => other.team !== bot.team).map((other) => ({ kind: 'bot', bot: other }));
    if (bot.team === 'def') bot.enemies.unshift(playerRef);
  }

  function routeTo(bot, x, z) {
    const from = world.nearestNode(bot.pos.x, bot.pos.z);
    const to = world.nearestNode(x, z);
    bot.path = world.findPath(from.id, to.id);
    bot.finalPoint = { x, z };
    bot.state = 'route';
  }

  function reset() {
    const atkSpawns = world.spawns.atk;
    const defSpawns = world.spawns.def;
    let atkIndex = 0;
    let defIndex = 0;
    for (const bot of list) {
      const spawn = bot.team === 'atk' ? atkSpawns[[0, 2][atkIndex++]] : defSpawns[defIndex++];
      bot.pos.set(spawn.x, 0, spawn.z);
      bot.hp = 100;
      bot.alive = true;
      bot.target = null;
      bot.seenAgo = 99;
      bot.defusing = false;
      bot.fallT = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.copy(bot.pos);
      bot.yaw = bot.team === 'atk' ? -Math.PI / 2 : Math.PI / 2;
      bot.group.rotation.y = bot.yaw;
      routeTo(bot, bot.guard.x, bot.guard.z);
    }
  }

  function targetPos(ref, ctx, out) {
    if (ref.kind === 'player') return out.copy(ctx.playerPos);
    return out.copy(ref.bot.pos);
  }

  function targetAlive(ref, ctx) {
    return ref.kind === 'player' ? ctx.playerAlive : ref.bot.alive;
  }

  function perceive(bot, ctx) {
    let best = null;
    let bestDist = Infinity;
    const fwd = dirFromYaw(bot.yaw);
    for (const ref of bot.enemies) {
      if (!targetAlive(ref, ctx)) continue;
      targetPos(ref, ctx, tmp);
      const dx = tmp.x - bot.pos.x;
      const dz = tmp.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SIGHT_RANGE || dist >= bestDist) continue;
      if (dist > 5.5) {
        const dot = (fwd.x * dx + fwd.z * dz) / (dist || 1);
        if (dot < SIGHT_COS) continue;
      }
      if (!world.losClear(bot.pos.x, bot.pos.z, tmp.x, tmp.z)) continue;
      best = ref;
      bestDist = dist;
    }
    if (best) {
      if (bot.target !== best) bot.reactT = 0.3 + rng() * 0.15;
      bot.target = best;
      bot.seenAgo = 0;
    }
  }

  function moveToward(bot, x, z, dt, speed = WALK_SPEED) {
    const dx = x - bot.pos.x;
    const dz = z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.45) return true;
    const stepLen = Math.min(dist, speed * dt);
    bot.pos.x += (dx / dist) * stepLen;
    bot.pos.z += (dz / dist) * stepLen;
    const want = yawFromDir(dx, dz);
    bot.yaw = turnToward(bot.yaw, want, dt * 7);
    collideCircle(bot.pos, 0.35, 1.8, world.colliders);
    return dist - stepLen < 0.45;
  }

  function turnToward(yaw, want, maxStep) {
    let diff = want - yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return yaw + Math.max(-maxStep, Math.min(maxStep, diff));
  }

  function engage(bot, dt, ctx) {
    targetPos(bot.target, ctx, tmp);
    const dx = tmp.x - bot.pos.x;
    const dz = tmp.z - bot.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    bot.yaw = turnToward(bot.yaw, yawFromDir(dx, dz), dt * 9);
    // Range keeping: close in past 16 m, back off inside 6 m, strafe between.
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeT = 0.7 + rng() * 0.8;
      bot.strafeDir = rng() < 0.5 ? -1 : 1;
    }
    let mx = 0;
    let mz = 0;
    if (dist > 16) { mx = dx / dist; mz = dz / dist; }
    else if (dist < 6) { mx = -dx / dist; mz = -dz / dist; }
    else { mx = (-dz / dist) * bot.strafeDir; mz = (dx / dist) * bot.strafeDir; }
    bot.pos.x += mx * 1.7 * dt;
    bot.pos.z += mz * 1.7 * dt;
    collideCircle(bot.pos, 0.35, 1.8, world.colliders);

    if (bot.reactT > 0) { bot.reactT -= dt; return; }
    if (bot.seenAgo > 0.3) return;
    if (bot.burstLeft > 0) {
      bot.shotT -= dt;
      if (bot.shotT <= 0) {
        bot.shotT = 0.088;
        bot.burstLeft -= 1;
        tmp.y = rng() < 0.22 ? 1.58 : CHEST;
        ctx.fireBotShot(bot, tmp);
      }
    } else {
      bot.burstWait -= dt;
      if (bot.burstWait <= 0) {
        bot.burstLeft = 3 + Math.floor(rng() * 3);
        bot.burstWait = 0.55 + rng() * 0.8;
      }
    }
  }

  function step(dt, ctx) {
    for (const bot of list) {
      if (!bot.alive) {
        if (bot.fallT < 1) {
          bot.fallT = Math.min(1, bot.fallT + dt / 0.45);
          bot.group.rotation.x = -bot.fallT * 1.42;
          bot.group.position.y = -bot.fallT * 0.06;
        }
        continue;
      }
      bot.defusing = false;
      bot.seenAgo += dt;
      bot.perceiveT -= dt;
      if (bot.perceiveT <= 0) {
        bot.perceiveT = 0.13;
        perceive(bot, ctx);
      }
      if (bot.flashT > 0) {
        bot.flashT = Math.max(0, bot.flashT - dt);
        bot.torsoMat.emissive.setRGB(bot.flashT * 1.4, bot.flashT * 0.3, bot.flashT * 0.2);
      }

      const planted = ctx.planted;
      if (bot.target && bot.seenAgo < 1.6 && targetAlive(bot.target, ctx)) {
        engage(bot, dt, ctx);
      } else if (planted && bot.team === 'def') {
        // Defenders converge on the charge; one channels the defuse in the open.
        const dist = Math.hypot(planted.x - bot.pos.x, planted.z - bot.pos.z);
        if (dist < 1.9) {
          bot.state = 'defuse';
          bot.defusing = true;
          bot.yaw = turnToward(bot.yaw, yawFromDir(planted.x - bot.pos.x, planted.z - bot.pos.z), dt * 7);
        } else {
          if (bot.state !== 'route' || !bot.finalPoint || Math.hypot(bot.finalPoint.x - planted.x, bot.finalPoint.z - planted.z) > 2) {
            routeTo(bot, planted.x + (rng() - 0.5) * 1.6, planted.z + (rng() - 0.5) * 1.6);
          }
          walkRoute(bot, dt);
        }
      } else if (planted && bot.team === 'atk') {
        if (bot.state !== 'hold' || Math.hypot(bot.guard.x - bot.pos.x, bot.guard.z - bot.pos.z) > 6) {
          const site = world.sites[planted.site];
          routeTo(bot, site.x + (bot.guard.x - site.x) * 0.4, site.z + (bot.guard.z - site.z) * 0.4);
          bot.state = 'route';
        }
        if (bot.state === 'route') walkRoute(bot, dt);
        else scan(bot, ctx.time);
      } else if (bot.state === 'route') {
        walkRoute(bot, dt);
      } else {
        scan(bot, ctx.time);
      }

      // Separation: bots never stand inside each other.
      for (const other of list) {
        if (other === bot || !other.alive) continue;
        const dx = bot.pos.x - other.pos.x;
        const dz = bot.pos.z - other.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.0001 && d2 < 0.49) {
          const d = Math.sqrt(d2);
          const push = ((0.7 - d) / d) * 0.5;
          bot.pos.x += dx * push;
          bot.pos.z += dz * push;
        }
      }

      bot.group.position.set(bot.pos.x, bot.state === 'route' ? Math.abs(Math.sin(ctx.time * 8.5 + bot.phase)) * 0.035 : 0, bot.pos.z);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function walkRoute(bot, dt) {
    const next = bot.path[0];
    if (next) {
      if (moveToward(bot, next.x, next.z, dt)) bot.path.shift();
      return;
    }
    if (bot.finalPoint) {
      if (moveToward(bot, bot.finalPoint.x, bot.finalPoint.z, dt)) {
        bot.finalPoint = null;
        bot.state = 'hold';
      }
      return;
    }
    bot.state = 'hold';
  }

  function scan(bot, time) {
    bot.state = 'hold';
    const base = bot.team === 'atk' ? -Math.PI / 2 : Math.PI / 2;
    bot.yaw = base + Math.sin(time * 0.45 + bot.phase) * 0.65;
  }

  return {
    list,
    hitMeshes,
    reset,
    step,
    hear(x, z, team) {
      for (const bot of list) {
        if (!bot.alive || bot.team === team || bot.target) continue;
        const dist = Math.hypot(x - bot.pos.x, z - bot.pos.z);
        if (dist < HEAR_RANGE && bot.state !== 'route') routeTo(bot, x, z);
        else if (dist < HEAR_RANGE) bot.yaw = yawFromDir(x - bot.pos.x, z - bot.pos.z);
      }
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      bot.flashT = 0.12;
      bot.torsoMat.emissive.setRGB(0.17, 0.04, 0.02);
      if (bot.hp > 0) return false;
      bot.alive = false;
      bot.state = 'dead';
      bot.defusing = false;
      return true;
    },
    aliveCount(team) {
      return list.filter((bot) => bot.team === team && bot.alive).length;
    },
    defusingBot() {
      return list.find((bot) => bot.alive && bot.defusing) ?? null;
    },
    setPose(bot, x, z, yaw, state = 'hold') {
      bot.pos.set(x, 0, z);
      bot.yaw = yaw;
      bot.state = state;
      bot.path = [];
      bot.finalPoint = null;
      bot.group.position.copy(bot.pos);
      bot.group.rotation.set(0, yaw, 0);
    },
    byName(name) {
      return list.find((bot) => bot.name === name);
    },
  };
}
