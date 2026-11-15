// Cinder Yard: boot and the one loop. A fixed 60 Hz simulation (player,
// arsenal, objective, bots, grenades) feeds a render at the display's rate.
// Shooting resolves here so the player and the bots share one hitscan.
// ?shot=start|play|end with &seed=N sets up a deterministic scene, renders it
// twice, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, damageAt, BUY_ITEMS, GRENADE_MAX, ARMOR_MAX } from './weapons.js';
import { createBots } from './bots.js';
import { createObjective, MONEY_KILL } from './objective.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const BOT_GUN = { damage: 12, headMult: 2.3, range: 15, fall: 0.5 };
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(shot ? seed * 7919 + 13 : 987654321);

// --- Scene ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 26, 88);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const bots = createBots(scene, world, rng);
const hitList = world.shootables.concat(bots.hitMeshes);

const playerState = { hp: 100, alive: true };
const explosionLight = new THREE.PointLight(PALETTE.charge, 0, 18, 1.6);
scene.add(explosionLight);
const scorchGeo = new THREE.CircleGeometry(1.6, 20);
const scorchMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 });
const scorches = [];

function resetPlayer() {
  const spawn = world.spawns.atk[1];
  player.teleport(spawn.x, spawn.z, -Math.PI / 2);
  playerState.hp = 100;
  playerState.alive = true;
}

const objective = createObjective({
  world, bots, hud, audio, arsenal,
  resetPlayer,
  onMatchEnd(winner) {
    hud.showMatch(winner === 'atk', objective.state.scoreAtk, objective.state.scoreDef);
    input.releaseLock();
  },
});

const input = createInput(renderer.domElement, onLockChange);
let started = false;
let frozen = false;
let simTime = 0;
let buyOpen = true;
let lastBuySignature = '';

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  input.requestLock();
});
hud.onRestart(() => {
  hud.hideMatch();
  objective.startMatch();
  started = true;
  input.requestLock();
});
hud.onBuy((id) => tryBuy(id));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (started && objective.state.phase !== 'match') {
    hud.showOverlay('paused');
  }
}

// --- Damage ---------------------------------------------------------------
function feedKill(attackerName, attackerTeam, victimName) {
  hud.kill(`${attackerName} ▸ ${victimName}`, attackerTeam);
}

function applyBotDamage(bot, amount, attacker) {
  const killed = bots.damage(bot, amount);
  if (killed) {
    feedKill(attacker.name, attacker.team, bot.name);
    if (attacker.isPlayer) {
      objective.state.money += MONEY_KILL;
      hud.setMoney(objective.state.money);
    }
  }
  return killed;
}

function damagePlayer(amount) {
  if (!playerState.alive) return;
  let rest = amount;
  if (arsenal.state.armorHp > 0) {
    const absorbed = Math.min(arsenal.state.armorHp, amount * 0.5);
    arsenal.state.armorHp -= absorbed;
    rest = amount - absorbed;
  }
  playerState.hp -= rest;
  hud.damage();
  audio.hurt();
  if (playerState.hp <= 0) {
    playerState.hp = 0;
    playerState.alive = false;
    hud.banner('YOU DIED', 'Your team fights on without you', false);
    hud.setObjective('You are down — your team fights on');
  }
}

// --- Shooting ---------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const eyeVec = new THREE.Vector3();
const dirVec = new THREE.Vector3();
const baseDir = new THREE.Vector3();
const aimVec = new THREE.Vector3();

function traceShot(origin, dir, shooter) {
  raycaster.set(origin, dir);
  raycaster.far = 95;
  const hits = raycaster.intersectObjects(hitList, false);
  for (const hit of hits) {
    const bot = hit.object.userData.bot;
    if (bot && (bot === shooter || !bot.alive)) continue;
    return { bot: bot ?? null, part: hit.object.userData.part ?? null, dist: hit.distance };
  }
  return null;
}

function playerShoot() {
  const def = arsenal.fire();
  const spread = arsenal.spread(player.groundSpeed(), player.state.crouching);
  camera.getWorldDirection(baseDir);
  eyeVec.copy(camera.position);
  bots.hear(eyeVec.x, eyeVec.z, 'atk');
  let hitAny = false;
  let killAny = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    dirVec.copy(baseDir);
    dirVec.x += (rng() * 2 - 1) * spread;
    dirVec.y += (rng() * 2 - 1) * spread;
    dirVec.z += (rng() * 2 - 1) * spread;
    dirVec.normalize();
    const hit = traceShot(eyeVec, dirVec, null);
    if (hit && hit.bot) {
      hitAny = true;
      if (applyBotDamage(hit.bot, damageAt(def, hit.dist, hit.part), { name: 'You', team: 'atk', isPlayer: true })) killAny = true;
    }
  }
  audio.shot(arsenal.state.current, 1);
  if (hitAny) {
    hud.hitMarker(killAny, shot ? 4000 : 90);
    audio.hit(killAny);
  }
  player.recoil(def.kick * 0.85 + rng() * def.kick * 0.4, (rng() * 2 - 1) * def.kick * 0.35);
}

// A bot's shot: the same ray, plus a capsule test against the player, who is
// not a mesh. The nearest of world, bot and player takes the bullet.
function fireBotShot(bot, aimPoint) {
  if (objective.state.phase !== 'live') return;
  eyeVec.set(bot.pos.x, 1.5, bot.pos.z);
  aimVec.copy(aimPoint);
  dirVec.subVectors(aimVec, eyeVec).normalize();
  const spread = 0.048 + (bot.team === 'atk' ? 0.004 : 0);
  dirVec.x += (rng() * 2 - 1) * spread;
  dirVec.y += (rng() * 2 - 1) * spread;
  dirVec.z += (rng() * 2 - 1) * spread;
  dirVec.normalize();
  const hit = traceShot(eyeVec, dirVec, bot);
  let bestDist = hit ? hit.dist : Infinity;
  let playerPart = null;
  if (bot.team === 'def' && playerState.alive) {
    for (const [height, radius, part] of [[1.55, 0.24, 'head'], [1.12, 0.44, 'body']]) {
      aimVec.set(player.state.pos.x, height, player.state.pos.z).sub(eyeVec);
      const t = aimVec.dot(dirVec);
      if (t <= 0 || t >= bestDist) continue;
      const perpSq = aimVec.lengthSq() - t * t;
      if (perpSq < radius * radius) {
        bestDist = t;
        playerPart = part;
      }
    }
  }
  const distToPlayer = Math.hypot(player.state.pos.x - bot.pos.x, player.state.pos.z - bot.pos.z);
  audio.shot(bot.team === 'def' ? 'rifle' : 'smg', Math.max(0.12, Math.min(0.75, 1 - distToPlayer / 42)));
  bots.hear(bot.pos.x, bot.pos.z, bot.team);
  if (playerPart) {
    damagePlayer(damageAt(BOT_GUN, bestDist, playerPart));
  } else if (hit && hit.bot) {
    applyBotDamage(hit.bot, damageAt(BOT_GUN, hit.dist, hit.part), { name: bot.name, team: bot.team, isPlayer: false });
  }
}

const botCtx = {
  time: 0,
  planted: null,
  playerPos: player.state.pos,
  playerAlive: true,
  fireBotShot,
};

// --- Grenades ---------------------------------------------------------------
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: PALETTE.dark, roughness: 0.5, metalness: 0.4 });
const grenades = [];

function throwGrenade() {
  if (arsenal.state.grenades <= 0 || !playerState.alive) return;
  arsenal.state.grenades -= 1;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  camera.getWorldDirection(baseDir);
  mesh.position.copy(camera.position).addScaledVector(baseDir, 0.5);
  scene.add(mesh);
  const vel = baseDir.clone().multiplyScalar(13.5);
  vel.y += 4.2;
  grenades.push({ mesh, vel, fuse: 1.6 });
  audio.throwIt();
}

function explode(grenade) {
  const at = grenade.mesh.position;
  explosionLight.position.set(at.x, 1.2, at.z);
  explosionLight.intensity = 120;
  audio.explosion();
  const scorch = new THREE.Mesh(scorchGeo, scorchMat);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.set(at.x, 0.02 + scorches.length * 0.0006, at.z);
  scene.add(scorch);
  scorches.push(scorch);
  if (scorches.length > 8) scene.remove(scorches.shift());
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.pos.x - at.x, bot.pos.z - at.z);
    if (dist < 6.5) applyBotDamage(bot, 95 * (1 - dist / 6.5) + 8, { name: 'You ✸', team: 'atk', isPlayer: true });
  }
  const playerDist = Math.hypot(player.state.pos.x - at.x, player.state.pos.z - at.z);
  if (playerDist < 6.5 && playerState.alive) damagePlayer((95 * (1 - playerDist / 6.5)) * 0.6);
  if (playerDist < 13) hud.flash();
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.vel.y -= 20 * dt;
    grenade.mesh.position.addScaledVector(grenade.vel, dt);
    const pos = grenade.mesh.position;
    if (pos.y < 0.09) {
      pos.y = 0.09;
      grenade.vel.y *= -0.35;
      grenade.vel.x *= 0.7;
      grenade.vel.z *= 0.7;
    }
    grenade.fuse -= dt;
    if (grenade.fuse <= 0) {
      explode(grenade);
      scene.remove(grenade.mesh);
      grenades.splice(i, 1);
    }
  }
}

// --- Buying ---------------------------------------------------------------
function buyItemState(item) {
  const money = objective.state.money;
  if (item.id === 'grenade') {
    if (arsenal.state.grenades >= GRENADE_MAX) return 'max';
    return money < item.price ? 'poor' : 'ok';
  }
  if (item.id === 'armor') {
    if (arsenal.state.armorHp >= ARMOR_MAX / 2) return 'owned';
    return money < item.price ? 'poor' : 'ok';
  }
  if (arsenal.state.owned.has(item.id)) return 'owned';
  return money < item.price ? 'poor' : 'ok';
}

function refreshBuy() {
  hud.renderBuy(
    BUY_ITEMS.map((item) => ({ ...item, keyLabel: item.key.replace('Digit', ''), state: buyItemState(item) })),
    objective.state.money,
  );
}

function tryBuy(id) {
  if (objective.state.phase !== 'buy') return;
  if (arsenal.buy(id, objective.state)) {
    audio.beep(true);
    hud.setMoney(objective.state.money);
  }
}

// --- HUD sync ---------------------------------------------------------------
function syncHud() {
  const state = objective.state;
  hud.setHealth(playerState.hp);
  hud.setArmor(arsenal.state.armorHp);
  const held = arsenal.ammo[arsenal.state.current];
  hud.setAmmo(held.mag, held.reserve, arsenal.def().name.toUpperCase(), arsenal.state.grenades);
  hud.setMoney(state.money);
  hud.setTimer(state.phaseT, `ROUND ${state.round}`);
  hud.setScore(state.scoreAtk, state.scoreDef, state.round);
  hud.setSpread(6 + arsenal.spread(player.groundSpeed(), player.state.crouching) * 460);
  const showBuy = state.phase === 'buy' && buyOpen;
  hud.showBuy(showBuy);
  if (showBuy) {
    const signature = `${state.money}|${[...arsenal.state.owned].join(',')}|${arsenal.state.grenades}|${arsenal.state.armorHp}`;
    if (signature !== lastBuySignature) {
      lastBuySignature = signature;
      refreshBuy();
    }
  }
}

// --- Simulation ---------------------------------------------------------------
function stepSim(dt) {
  simTime += dt;
  const phase = objective.state.phase;
  player.step(dt, input.keys, phase === 'buy' || !playerState.alive);
  arsenal.step(dt, player.groundSpeed(), simTime);
  objective.update(dt, {
    playerPos: player.state.pos,
    playerAlive: playerState.alive,
    plantHeld: input.keys.has('KeyF'),
  });
  botCtx.time = simTime;
  botCtx.planted = objective.state.planted;
  botCtx.playerAlive = playerState.alive;
  if (phase === 'live' || phase === 'end') bots.step(dt, botCtx);
  stepGrenades(dt);
  world.update(simTime);
  explosionLight.intensity *= Math.exp(-dt * 8);
  syncHud();
}

function syncCamera() {
  const body = player.state;
  const eye = playerState.alive ? body.eye : 0.55;
  camera.position.set(body.pos.x, body.pos.y + eye, body.pos.z);
  camera.rotation.set(
    body.pitch + body.recoilPitch,
    body.yaw + body.recoilYaw,
    playerState.alive ? 0 : 0.38,
  );
}

function handleKeys() {
  const phase = objective.state.phase;
  if (phase === 'buy') {
    for (const item of BUY_ITEMS) if (input.wasPressed(item.key)) tryBuy(item.id);
    if (input.wasPressed('KeyB')) buyOpen = !buyOpen;
    return;
  }
  if (phase !== 'live' || !playerState.alive) return;
  if (input.wasPressed('Digit1')) arsenal.equipSlot(1);
  if (input.wasPressed('Digit2')) arsenal.equipSlot(2);
  if (input.wasPressed('KeyR') && arsenal.startReload()) audio.reload();
  if (input.wasPressed('KeyG')) throwGrenade();
}

let triggerHeld = false;
function handleFire() {
  const phase = objective.state.phase;
  if (phase !== 'live' || !playerState.alive || !started) {
    triggerHeld = input.firing;
    return;
  }
  if (input.firing) {
    const def = arsenal.def();
    if (def.auto || !triggerHeld) {
      if (arsenal.canFire()) playerShoot();
      else if (arsenal.ammo[arsenal.state.current].mag === 0 && arsenal.state.cooldown <= 0 && arsenal.state.reloadLeft <= 0) {
        audio.dry();
        arsenal.dryFire();
        if (arsenal.startReload()) audio.reload();
      }
    }
  }
  triggerHeld = input.firing;
}

// --- Frame loop ---------------------------------------------------------------
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (started) player.look(look.x, look.y);
    syncCamera();
    if (started && input.locked) {
      handleFire();
      handleKeys();
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        stepSim(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    }
    input.endFrame();
    syncCamera();
  }
  renderer.render(scene, camera);
}

// --- Shot modes ---------------------------------------------------------------
function settle(steps) {
  for (let i = 0; i < steps; i += 1) stepSim(FIXED_STEP);
}

function aimAt(x, y, z) {
  const body = player.state;
  const dx = x - body.pos.x;
  const dy = y - (body.pos.y + body.eye);
  const dz = z - body.pos.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  started = true;
  if (name === 'start') {
    const spawn = world.spawns.atk[0];
    player.teleport(spawn.x, spawn.z, -Math.PI / 2);
    buyOpen = true;
    settle(24);
    aimAt(4, 1.3, -2);
    hud.showBuy(true);
    refreshBuy();
  } else if (name === 'play') {
    arsenal.state.owned.add('rifle');
    arsenal.state.primary = 'rifle';
    arsenal.equip('rifle');
    objective.state.money = 1250;
    objective.state.scoreAtk = 1;
    objective.state.scoreDef = 1;
    objective.state.round = 2;
    objective.forceLive();
    objective.state.phaseT = 74;
    hud.setObjective('Eliminate the defenders — or plant the charge at A or B');
    player.teleport(-2.5, 0.8, -Math.PI / 2);
    playerState.hp = 100;
    const rook = bots.byName('Rook');
    bots.setPose(rook, 9.5, -1.2, Math.PI / 2, 'hold');
    rook.hp = 46;
    rook.perceiveT = 999;
    const hale = bots.byName('Hale');
    bots.setPose(hale, 12.5, 1.8, Math.PI / 2, 'hold');
    hale.perceiveT = 999;
    const vex = bots.byName('Vex');
    bots.setPose(vex, -10.5, 3.4, -Math.PI / 2, 'hold');
    const moss = bots.byName('Moss');
    bots.setPose(moss, 3.5, 3.4, 0.6, 'hold');
    bots.damage(moss, 500);
    settle(26);
    for (let round = 0; round < 2; round += 1) {
      aimAt(rook.pos.x, 1.15, rook.pos.z);
      playerShoot();
      settle(6);
    }
    aimAt(hale.pos.x, 1.15, hale.pos.z);
    playerShoot();
    settle(5);
    aimAt(hale.pos.x, 1.3, hale.pos.z);
    hud.setAmmo(arsenal.ammo.rifle.mag, arsenal.ammo.rifle.reserve, 'AR-9 LONGARM', 1);
    hud.kill('You ▸ Rook', 'atk');
  } else if (name === 'end') {
    arsenal.state.owned.add('rifle');
    arsenal.state.primary = 'rifle';
    arsenal.equip('rifle');
    arsenal.ammo.rifle.mag = 17;
    arsenal.ammo.rifle.reserve = 63;
    arsenal.state.armorHp = 40;
    objective.state.money = 2350;
    objective.state.scoreAtk = 2;
    objective.state.scoreDef = 2;
    objective.state.round = 5;
    objective.forceLive();
    player.teleport(17.6, -11.6, -Math.PI / 2);
    playerState.hp = 64;
    const moss = bots.byName('Moss');
    bots.setPose(moss, 22.6, -16.8, 2.4, 'hold');
    bots.damage(moss, 500);
    const ivy = bots.byName('Ivy');
    bots.setPose(ivy, 18.2, -17.6, -0.7, 'hold');
    bots.damage(ivy, 500);
    const charge = { x: 19.9, z: -13.9 };
    world.setCharge(charge.x, charge.z);
    objective.state.planted = { site: 'A', x: charge.x, z: charge.z, fuse: 0.01 };
    settle(30);
    aimAt(charge.x, 0.5, charge.z);
    hud.kill('You ▸ Moss', 'atk');
    hud.kill('Vex ▸ Ivy', 'atk');
    hud.setHealth(64);
    hud.setArmor(40);
  }
  syncHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

objective.startMatch();
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
