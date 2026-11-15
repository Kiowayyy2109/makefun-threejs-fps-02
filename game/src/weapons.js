// Weapons and the economy around them. Four guns with distinct damage,
// cadence, spread and falloff, a grenade, and armour. The arsenal owns the
// numbers and the view models; main.js owns the rays and applies the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  pistol: {
    name: 'P9 Sidearm', slot: 2, price: 0, damage: 26, headMult: 2.6,
    rpm: 340, mag: 12, reserve: 48, reload: 1.1, spread: 0.010, bloom: 0.004,
    kick: 0.011, pellets: 1, auto: false, range: 14, fall: 0.5,
  },
  smg: {
    name: 'K7 Carbine', slot: 1, price: 1500, damage: 22, headMult: 2.4,
    rpm: 820, mag: 32, reserve: 128, reload: 1.6, spread: 0.019, bloom: 0.0022,
    kick: 0.007, pellets: 1, auto: true, range: 11, fall: 0.45,
  },
  rifle: {
    name: 'AR-9 Longarm', slot: 1, price: 2700, damage: 34, headMult: 2.9,
    rpm: 600, mag: 30, reserve: 90, reload: 1.9, spread: 0.012, bloom: 0.003,
    kick: 0.013, pellets: 1, auto: true, range: 22, fall: 0.62,
  },
  scatter: {
    name: 'M3 Scattergun', slot: 1, price: 1100, damage: 9, headMult: 1.5,
    rpm: 68, mag: 6, reserve: 24, reload: 2.4, spread: 0.055, bloom: 0.01,
    kick: 0.032, pellets: 8, auto: false, range: 7, fall: 0.22,
  },
};

export const GRENADE_PRICE = 300;
export const GRENADE_MAX = 2;
export const ARMOR_PRICE = 650;
export const ARMOR_MAX = 100;

export const BUY_ITEMS = [
  { id: 'smg', key: 'Digit1', label: 'K7 Carbine', price: 1500 },
  { id: 'rifle', key: 'Digit2', label: 'AR-9 Longarm', price: 2700 },
  { id: 'scatter', key: 'Digit3', label: 'M3 Scattergun', price: 1100 },
  { id: 'grenade', key: 'Digit4', label: 'Grenade', price: GRENADE_PRICE },
  { id: 'armor', key: 'Digit5', label: 'Armour vest', price: ARMOR_PRICE },
];

// Damage after distance falloff and the head multiplier. Full damage out to
// def.range metres, then a slide towards def.fall at 45 m.
export function damageAt(def, dist, part) {
  let mult = 1;
  if (dist > def.range) {
    mult = Math.max(0.2, 1 - ((dist - def.range) / (45 - def.range)) * (1 - def.fall));
  }
  return def.damage * mult * (part === 'head' ? def.headMult : 1);
}

function buildViewModels(camera) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.45, metalness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.8, metalness: 0.05 });
  const stripe = new THREE.MeshStandardMaterial({ color: PALETTE.atk, roughness: 0.5, metalness: 0.2 });
  const models = {};

  function part(parent, w, h, d, x, y, z, mat = metal) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  const pistol = new THREE.Group();
  part(pistol, 0.07, 0.11, 0.24, 0, 0, -0.05);
  part(pistol, 0.05, 0.05, 0.12, 0, 0.05, -0.2);
  part(pistol, 0.06, 0.12, 0.08, 0, -0.1, 0.05, grip);
  models.pistol = pistol;

  const smg = new THREE.Group();
  part(smg, 0.08, 0.13, 0.46, 0, 0, -0.1);
  part(smg, 0.05, 0.05, 0.22, 0, 0.03, -0.42);
  part(smg, 0.06, 0.16, 0.07, 0, -0.13, -0.08, grip);
  part(smg, 0.07, 0.09, 0.18, 0, -0.02, 0.18, grip);
  part(smg, 0.085, 0.03, 0.2, 0, 0.08, -0.1, stripe);
  models.smg = smg;

  const rifle = new THREE.Group();
  part(rifle, 0.09, 0.12, 0.6, 0, 0, -0.16);
  part(rifle, 0.045, 0.045, 0.34, 0, 0.03, -0.6);
  part(rifle, 0.06, 0.17, 0.08, 0, -0.13, -0.12, grip);
  part(rifle, 0.07, 0.1, 0.24, 0, -0.03, 0.26, grip);
  part(rifle, 0.03, 0.07, 0.03, 0, 0.1, -0.3);
  part(rifle, 0.095, 0.03, 0.24, 0, 0.075, -0.16, stripe);
  models.rifle = rifle;

  const scatter = new THREE.Group();
  part(scatter, 0.09, 0.11, 0.52, 0, 0, -0.12);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.44, 10), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -0.55);
  scatter.add(barrel);
  part(scatter, 0.07, 0.07, 0.16, 0, -0.01, -0.38, grip);
  part(scatter, 0.07, 0.1, 0.2, 0, -0.03, 0.24, grip);
  models.scatter = scatter;

  for (const model of Object.values(models)) {
    model.position.set(0.25, -0.22, -0.45);
    model.visible = false;
    camera.add(model);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: PALETTE.charge, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.25, -0.18, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(PALETTE.charge, 0, 6);
  flashLight.position.set(0.25, -0.16, -0.7);
  camera.add(flashLight);

  return { models, flash, flashLight };
}

export function createArsenal(camera) {
  const view = buildViewModels(camera);
  const ammo = {};
  for (const [id, def] of Object.entries(WEAPON_DEFS)) ammo[id] = { mag: def.mag, reserve: def.reserve };

  const state = {
    owned: new Set(['pistol']),
    primary: null,
    current: 'pistol',
    grenades: 0,
    armorHp: 0,
    cooldown: 0,
    reloadLeft: 0,
    bloom: 0,
    flash: 0,
    kick: 0,
  };

  function showCurrent() {
    for (const [id, model] of Object.entries(view.models)) model.visible = id === state.current;
  }
  showCurrent();

  function equip(id) {
    if (!state.owned.has(id) || id === state.current) return false;
    state.current = id;
    state.reloadLeft = 0;
    state.cooldown = Math.max(state.cooldown, 0.28);
    showCurrent();
    return true;
  }

  return {
    state,
    ammo,
    def() { return WEAPON_DEFS[state.current]; },
    equip,
    equipSlot(slot) {
      if (slot === 2) return equip('pistol');
      return state.primary ? equip(state.primary) : false;
    },
    canFire() {
      return state.cooldown <= 0 && state.reloadLeft <= 0 && ammo[state.current].mag > 0;
    },
    fire() {
      const def = WEAPON_DEFS[state.current];
      ammo[state.current].mag -= 1;
      state.cooldown = 60 / def.rpm;
      state.bloom = Math.min(0.03, state.bloom + def.bloom);
      state.flash = 0.055;
      state.kick = Math.min(0.09, state.kick + def.kick * 1.6);
      return def;
    },
    dryFire() { state.cooldown = 0.3; },
    startReload() {
      const def = WEAPON_DEFS[state.current];
      const held = ammo[state.current];
      if (state.reloadLeft > 0 || held.mag >= def.mag || held.reserve <= 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed, crouching) {
      const def = WEAPON_DEFS[state.current];
      const moveFactor = 1 + Math.min(1, speed / 4.4) * 1.7;
      return (def.spread + state.bloom) * moveFactor * (crouching ? 0.65 : 1);
    },
    buy(id, wallet) {
      if (id === 'grenade') {
        if (state.grenades >= GRENADE_MAX || wallet.money < GRENADE_PRICE) return false;
        wallet.money -= GRENADE_PRICE;
        state.grenades += 1;
        return true;
      }
      if (id === 'armor') {
        if (state.armorHp >= ARMOR_MAX / 2 || wallet.money < ARMOR_PRICE) return false;
        wallet.money -= ARMOR_PRICE;
        state.armorHp = ARMOR_MAX;
        return true;
      }
      const def = WEAPON_DEFS[id];
      if (!def || state.owned.has(id) || wallet.money < def.price) return false;
      wallet.money -= def.price;
      state.owned.add(id);
      state.primary = id;
      equip(id);
      return true;
    },
    // A fresh round: magazines top up from reserve; a gun run completely dry
    // is reissued so the player is never left weaponless.
    refillRound() {
      for (const [id, def] of Object.entries(WEAPON_DEFS)) {
        const held = ammo[id];
        if (held.mag + held.reserve <= 0) {
          held.mag = def.mag;
          held.reserve = def.reserve;
          continue;
        }
        const take = Math.min(def.mag - held.mag, held.reserve);
        held.mag += take;
        held.reserve -= take;
      }
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
    resetMatch() {
      state.owned = new Set(['pistol']);
      state.primary = null;
      state.current = 'pistol';
      state.grenades = 0;
      state.armorHp = 0;
      for (const [id, def] of Object.entries(WEAPON_DEFS)) ammo[id] = { mag: def.mag, reserve: def.reserve };
      showCurrent();
    },
    step(dt, speed, time) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.bloom = Math.max(0, state.bloom - dt * 0.028);
      state.kick += (0 - state.kick) * Math.min(1, dt * 13);
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        if (state.reloadLeft === 0) {
          const def = WEAPON_DEFS[state.current];
          const held = ammo[state.current];
          const take = Math.min(def.mag - held.mag, held.reserve);
          held.mag += take;
          held.reserve -= take;
        }
      }
      const model = view.models[state.current];
      const bob = Math.min(1, speed / 4.4) * 0.011;
      model.position.set(
        0.25,
        -0.22 + Math.sin(time * 9.2) * bob - (state.reloadLeft > 0 ? 0.05 : 0),
        -0.45 + state.kick,
      );
      model.rotation.x = state.kick * 2.4 - (state.reloadLeft > 0 ? 0.5 : 0);
      view.flash.visible = state.flash > 0;
      if (state.flash > 0) view.flash.rotation.z = state.flash * 47;
      view.flashLight.intensity = state.flash > 0 ? 14 : 0;
    },
  };
}
