// The DOM HUD: health, armour, ammo, money, timer, score, objective line,
// kill feed, banners, the plant/defuse bar and the buy menu. It never touches
// the simulation; main.js pushes values in and reads callbacks out. Values are
// cached so a steady frame writes nothing to the DOM.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const healthNum = el('health-num');
  const healthFill = el('health-fill');
  const armorNum = el('armor-num');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeCount = el('grenade-count');
  const moneyEl = el('money');
  const timerEl = el('timer');
  const roundEl = el('round-label');
  const scoreAtk = el('score-atk');
  const scoreDef = el('score-def');
  const objectiveEl = el('objective');
  const killfeed = el('killfeed');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const plantWrap = el('plantwrap');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const damageEl = el('damage');
  const flashEl = el('flash');
  const buyMenu = el('buymenu');
  const buyItems = el('buy-items');
  const buyMoney = el('buy-money');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playButton = el('play');
  const matchEl = el('matchover');
  const matchTitle = el('match-title');
  const matchCopy = el('match-copy');
  const restartButton = el('restart');

  const cache = new Set();
  function set(key, apply) {
    if (cache.has(key)) return;
    cache.add(key);
    apply();
  }
  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;

  const hud = {
    buyHandler: null,
    setSpread(px) {
      crosshair.style.setProperty('--sp', `${Math.round(px)}px`);
    },
    setHealth(hp) {
      const value = Math.max(0, Math.ceil(hp));
      set(`hp${value}`, () => {
        healthNum.textContent = String(value);
        healthFill.style.width = `${value}%`;
        healthFill.classList.toggle('low', value <= 30);
      });
    },
    setArmor(value) {
      set(`arm${value}`, () => { armorNum.textContent = value > 0 ? `🛡 ${Math.ceil(value)}` : ''; });
    },
    setAmmo(mag, reserve, name, grenades) {
      set(`ammo${mag}|${reserve}|${name}|${grenades}`, () => {
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        weaponName.textContent = name;
        grenadeCount.textContent = grenades > 0 ? `✸ ${grenades}` : '';
        ammoMag.classList.toggle('empty', mag === 0);
      });
    },
    setMoney(value) {
      set(`money${value}`, () => { moneyEl.textContent = `$${value}`; });
    },
    setTimer(seconds, label) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      set(`timer${text}|${label}`, () => {
        timerEl.textContent = text;
        roundEl.textContent = label;
        timerEl.classList.toggle('urgent', total <= 10);
      });
    },
    setScore(atk, def, round) {
      set(`score${atk}|${def}|${round}`, () => {
        scoreAtk.textContent = String(atk);
        scoreDef.textContent = String(def);
        roundEl.textContent = `ROUND ${round}`;
      });
    },
    setObjective(text) {
      set(`obj${text}`, () => { objectiveEl.textContent = text; });
    },
    kill(text, teamClass) {
      const row = document.createElement('div');
      row.className = `kill-row ${teamClass ?? ''}`;
      row.textContent = text;
      killfeed.prepend(row);
      while (killfeed.children.length > 4) killfeed.lastChild.remove();
      setTimeout(() => { row.classList.add('fade'); }, 3600);
      setTimeout(() => { row.remove(); }, 4300);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    banner(title, sub, sticky) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub ?? '';
      bannerEl.classList.add('show');
      clearTimeout(bannerTimer);
      if (!sticky) bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 2500);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      bannerEl.classList.remove('show');
    },
    setPlant(frac, label) {
      if (frac === null || frac === undefined) {
        if (!plantWrap.hidden) plantWrap.hidden = true;
        return;
      }
      plantWrap.hidden = false;
      plantFill.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
      if (label) plantLabel.textContent = label;
    },
    damage() {
      damageEl.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageEl.classList.remove('on'), 180);
    },
    flash() {
      flashEl.classList.add('on');
      setTimeout(() => flashEl.classList.remove('on'), 320);
    },
    renderBuy(items, money) {
      buyMoney.textContent = `$${money}`;
      buyItems.replaceChildren();
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.state !== 'ok';
        const name = document.createElement('span');
        name.textContent = item.label;
        const meta = document.createElement('span');
        meta.className = 'buy-meta';
        meta.textContent = item.state === 'owned' ? 'OWNED' : item.state === 'max' ? 'MAX' : `$${item.price} · ${item.keyLabel}`;
        button.append(name, meta);
        button.addEventListener('click', () => { if (hud.buyHandler) hud.buyHandler(item.id); });
        buyItems.append(button);
      }
    },
    showBuy(show) { buyMenu.hidden = !show; },
    get buyVisible() { return !buyMenu.hidden; },
    onBuy(handler) { hud.buyHandler = handler; },
    showOverlay(mode) {
      overlayTitle.textContent = mode === 'paused' ? 'Paused' : 'Cinder Yard';
      overlayCopy.textContent = mode === 'paused'
        ? 'The round waits for no one — click to jump back in.'
        : 'A round-based tactical FPS in a dusk freight yard. Plant the breach charge at site A or B, or eliminate the defenders. First to five rounds.';
      playButton.textContent = mode === 'paused' ? 'Click to resume' : 'Click to play';
      overlay.hidden = false;
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { playButton.addEventListener('click', handler); },
    showMatch(won, atk, def) {
      matchTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      matchCopy.textContent = `Final score ${atk} — ${def}. ${won ? 'The yard is yours.' : 'The defenders hold the yard.'}`;
      matchEl.hidden = false;
    },
    hideMatch() { matchEl.hidden = true; },
    onRestart(handler) { restartButton.addEventListener('click', handler); },
  };
  return hud;
}
