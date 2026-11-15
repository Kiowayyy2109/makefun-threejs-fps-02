// Keyboard and mouse state, pointer lock included. The game reads three
// things from here: the held-key set, the edge-triggered pressed set (cleared
// by the game once per frame) and the accumulated mouse look deltas.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;

  const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyB', 'KeyF', 'KeyG', 'KeyQ',
    'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'KeyC', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
  ]);

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    keys.add(event.code);
    if (!event.repeat) pressed.add(event.code);
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.code); });
  window.addEventListener('blur', () => { keys.clear(); firing = false; });

  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  });
  document.addEventListener('mousedown', (event) => {
    if (event.button === 0) firing = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });
  document.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
    onLockChange(locked);
  });

  return {
    keys,
    get locked() { return locked; },
    get firing() { return firing && locked; },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    // Edge-triggered: true once per physical press.
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    endFrame() { pressed.clear(); },
    requestLock() {
      try {
        const pending = canvas.requestPointerLock();
        if (pending && pending.catch) pending.catch(() => {});
      } catch { /* headless or unsupported: the game stays unlocked */ }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };
}
