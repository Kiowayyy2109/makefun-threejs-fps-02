// The match in one state machine: buy phase, live round, plant and defuse,
// round end, next round, first to five. It owns the shared match state the
// HUD reads and the win/loss rules; main.js feeds it the player's position
// and the plant key each tick.
export const BUY_TIME = 8;
export const ROUND_TIME = 100;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 4;
export const FUSE_TIME = 35;
export const WIN_SCORE = 5;
export const MONEY_START = 800;
export const MONEY_WIN = 1400;
export const MONEY_LOSS = 800;
export const MONEY_KILL = 300;
export const MONEY_PLANT = 300;

export function createObjective(deps) {
  const { world, bots, hud, audio, arsenal, onMatchEnd, resetPlayer } = deps;
  const state = {
    phase: 'buy',
    phaseT: BUY_TIME,
    round: 1,
    scoreAtk: 0,
    scoreDef: 0,
    money: MONEY_START,
    planted: null,
    plantT: 0,
    defuseT: 0,
    lastReason: '',
    matchWinner: null,
  };
  let beepT = 0;

  function startRound() {
    state.planted = null;
    state.plantT = 0;
    state.defuseT = 0;
    state.phase = 'buy';
    state.phaseT = BUY_TIME;
    world.hideCharge();
    bots.reset();
    resetPlayer();
    arsenal.refillRound();
    hud.setScore(state.scoreAtk, state.scoreDef, state.round);
    hud.setMoney(state.money);
    hud.setObjective('Buy phase — press B for the buy menu');
    hud.setPlant(null);
    hud.banner(`ROUND ${state.round}`, 'Buy, then plant the charge at site A or B', false);
  }

  function startMatch() {
    state.scoreAtk = 0;
    state.scoreDef = 0;
    state.round = 1;
    state.money = MONEY_START;
    state.matchWinner = null;
    arsenal.resetMatch();
    startRound();
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    if (winner === 'atk') state.scoreAtk += 1;
    else state.scoreDef += 1;
    state.money += winner === 'atk' ? MONEY_WIN : MONEY_LOSS;
    state.lastReason = reason;
    state.phase = 'end';
    state.phaseT = 4;
    hud.setPlant(null);
    hud.setObjective(reason);
    hud.setScore(state.scoreAtk, state.scoreDef, state.round);
    hud.setMoney(state.money);
    hud.banner(winner === 'atk' ? 'ROUND WON' : 'ROUND LOST', reason, true);
    audio.sting(winner === 'atk');
    if (state.planted && winner !== 'atk') world.hideCharge();
  }

  function doPlant(site, playerPos) {
    state.planted = { site: site.id, x: playerPos.x, z: playerPos.z, fuse: FUSE_TIME };
    state.money += MONEY_PLANT;
    state.plantT = 0;
    world.setCharge(playerPos.x, playerPos.z);
    hud.setMoney(state.money);
    hud.setObjective(`Charge planted at ${site.id} — defend it`);
    hud.setPlant(null);
    hud.banner('CHARGE PLANTED', `${FUSE_TIME} seconds to detonation`, false);
    audio.plantDone();
  }

  function updateBuy(dt) {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      state.phase = 'live';
      state.phaseT = ROUND_TIME;
      hud.setObjective('Plant the charge at site A or B — or eliminate the defenders');
      hud.banner('ROUND LIVE', 'First to five rounds takes the match', false);
    }
  }

  function updateLive(dt, ctx) {
    const { playerPos, playerAlive, plantHeld } = ctx;
    if (!state.planted) state.phaseT -= dt;

    // Planting: hold the key inside a site zone, standing in the open.
    if (!state.planted && playerAlive) {
      const site = plantHeld ? world.siteAt(playerPos.x, playerPos.z) : null;
      if (site) {
        state.plantT += dt;
        beepT -= dt;
        if (beepT <= 0) { beepT = 0.5; audio.beep(false); }
        hud.setPlant(state.plantT / PLANT_TIME, `PLANTING AT ${site.id}`);
        if (state.plantT >= PLANT_TIME) doPlant(site, playerPos);
      } else {
        state.plantT = 0;
        hud.setPlant(null);
      }
    }

    if (state.planted) {
      const planted = state.planted;
      planted.fuse -= dt;
      state.phaseT = planted.fuse;
      beepT -= dt;
      if (beepT <= 0) {
        beepT = planted.fuse < 10 ? 0.28 : 0.8;
        audio.beep(planted.fuse < 10);
      }
      // Defuse: a defender channels in the open while no attacker is near.
      const defuser = bots.defusingBot();
      let attackerNear = false;
      if (playerAlive && Math.hypot(playerPos.x - planted.x, playerPos.z - planted.z) < 5) attackerNear = true;
      if (!attackerNear) {
        for (const bot of bots.list) {
          if (bot.team === 'atk' && bot.alive && Math.hypot(bot.pos.x - planted.x, bot.pos.z - planted.z) < 5) {
            attackerNear = true;
            break;
          }
        }
      }
      if (defuser && !attackerNear) {
        state.defuseT += dt;
        hud.setPlant(state.defuseT / DEFUSE_TIME, 'ENEMY DEFUSING');
        if (state.defuseT >= DEFUSE_TIME) {
          audio.defused();
          endRound('def', 'The charge was defused');
          return;
        }
      } else {
        state.defuseT = Math.max(0, state.defuseT - dt * 2);
        if (!defuser) hud.setPlant(null);
      }
      if (planted.fuse <= 0) {
        audio.explosion();
        hud.flash();
        endRound('atk', 'The charge detonated');
        return;
      }
    }

    const defAlive = bots.aliveCount('def');
    const atkAlive = (playerAlive ? 1 : 0) + bots.aliveCount('atk');
    if (defAlive === 0) {
      endRound('atk', 'Defenders eliminated');
    } else if (!state.planted && atkAlive === 0) {
      endRound('def', 'Attackers eliminated');
    } else if (!state.planted && state.phaseT <= 0) {
      endRound('def', 'The round timer expired');
    }
  }

  function updateEnd(dt) {
    state.phaseT -= dt;
    if (state.phaseT > 0) return;
    if (state.scoreAtk >= WIN_SCORE || state.scoreDef >= WIN_SCORE) {
      state.phase = 'match';
      state.matchWinner = state.scoreAtk >= WIN_SCORE ? 'atk' : 'def';
      onMatchEnd(state.matchWinner);
    } else {
      state.round += 1;
      startRound();
    }
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    forceLive() {
      state.phase = 'live';
      state.phaseT = ROUND_TIME;
      hud.hideBanner();
    },
    update(dt, ctx) {
      if (state.phase === 'buy') updateBuy(dt);
      else if (state.phase === 'live') updateLive(dt, ctx);
      else if (state.phase === 'end') updateEnd(dt);
    },
  };
}
