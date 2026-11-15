// Player movement: acceleration and friction on the ground, weak air control,
// crouch, jump, and a circle-vs-box collision resolve shared with the bots.
// Colliders everywhere in the game are plain records
// { minX, maxX, minZ, maxZ, minY, maxY } in world space.
import * as THREE from 'three';

const RADIUS = 0.35;
const HEIGHT = 1.8;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.14;
const WALK_SPEED = 4.4;
const CROUCH_SPEED = 2.1;
const GROUND_ACCEL = 11; // 1/s rate the velocity closes on the wish velocity
const AIR_ACCEL = 1.6;
const GRAVITY = 22;
const JUMP_SPEED = 7.2;

// Push a feet-position circle out of every collider whose vertical span
// overlaps the body's span. Returns true when anything pushed.
export function collideCircle(pos, radius, height, colliders) {
  let pushed = false;
  for (const c of colliders) {
    if (c.maxY <= pos.y + 0.05 || c.minY >= pos.y + height) continue;
    const nearX = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nearZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      pos.x = nearX + (dx / dist) * radius;
      pos.z = nearZ + (dz / dist) * radius;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = pos.x - c.minX;
      const right = c.maxX - pos.x;
      const near = pos.z - c.minZ;
      const far = c.maxZ - pos.z;
      const min = Math.min(left, right, near, far);
      if (min === left) pos.x = c.minX - radius;
      else if (min === right) pos.x = c.maxX + radius;
      else if (min === near) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
    pushed = true;
  }
  return pushed;
}

export function createPlayer(colliders) {
  const state = {
    pos: new THREE.Vector3(-28, 0, 0),
    vel: new THREE.Vector3(),
    yaw: -Math.PI / 2, // facing east, down the yard
    pitch: 0,
    eye: EYE_STAND,
    crouching: false,
    grounded: true,
    recoilPitch: 0,
    recoilYaw: 0,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * 0.0021));
  }

  function recoil(pitchKick, yawKick) {
    state.recoilPitch += pitchKick;
    state.recoilYaw += yawKick;
  }

  function teleport(x, z, yaw) {
    state.pos.set(x, 0, z);
    state.vel.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
  }

  function step(dt, keys, frozen) {
    state.crouching = !frozen && (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'));
    const eyeTarget = state.crouching ? EYE_CROUCH : EYE_STAND;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 11);
    state.recoilPitch *= Math.exp(-dt * 9);
    state.recoilYaw *= Math.exp(-dt * 9);

    wish.set(0, 0, 0);
    if (!frozen) {
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      if (forward || strafe) {
        const sin = Math.sin(state.yaw);
        const cos = Math.cos(state.yaw);
        wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
      }
      if (keys.has('Space') && state.grounded) {
        state.vel.y = JUMP_SPEED;
        state.grounded = false;
      }
    }
    const speed = state.crouching ? CROUCH_SPEED : WALK_SPEED;
    const rate = state.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const blend = 1 - Math.exp(-rate * dt);
    state.vel.x += (wish.x * speed - state.vel.x) * blend;
    state.vel.z += (wish.z * speed - state.vel.z) * blend;
    state.vel.y -= GRAVITY * dt;

    state.pos.x += state.vel.x * dt;
    state.pos.z += state.vel.z * dt;
    state.pos.y += state.vel.y * dt;
    if (state.pos.y <= 0) {
      state.pos.y = 0;
      state.vel.y = 0;
      state.grounded = true;
    }
    collideCircle(state.pos, RADIUS, HEIGHT, colliders);
  }

  return {
    state,
    look,
    recoil,
    teleport,
    step,
    groundSpeed() { return Math.hypot(state.vel.x, state.vel.z); },
    radius: RADIUS,
    height: HEIGHT,
  };
}
