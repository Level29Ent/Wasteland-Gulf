import type { Entity } from "koota";
import { defineServer, type Player } from "@trhs/wildwood/server";
import { replicateServer } from "@trhs/wildwood/replicate/server";
import { UserId } from "@trhs/wildwood";
import { createDataService } from "@trhs/wildwood/platform";
import {
  ACHIEVEMENTS, ACH_XP, BOSS_KIND, CHALLENGES, DAILY_REWARDS, DAY_LENGTH, FOES, JOBS, MAX_LEVEL, MELEE, MISSIONS,
  Profile, RECIPES, REGIONS, WEAPONS, challengesForDay, dayNumber, dmgMult, isNight, maxHpFor, xpNeed,
  type ChallengeEv, type ProfileT,
} from "./data.ts";
import { Body, game, KIND_CRATE, KIND_FOE, KIND_PLAYER, KIND_TURRET, Mover, Net, Pose, Sync } from "./game.ts";
import { makeLayouts, inWater, rayBlock, resolve } from "./world/layout.ts";

const COLORS = ["#3f7ad0", "#d0573f", "#4fae5a", "#d0a63f", "#8f5ad0", "#3fb3b3"];
const MAX_FOES_BASE = 16;
const wallClock = () => Date.now(); // eslint-disable-line treehouse/no-ambient-time

type PS = {
  player: Player;
  entity: Entity;
  profile: ProfileT;
  loaded: boolean;
  region: number;
  hp: number;
  hunger: number;
  thirst: number;
  weapon: number;
  fireT: number;
  meleeT: number;
  hurtT: number;
  downT: number; // >0 while dead, counts down to respawn
  tpN: number;
  tpX: number;
  tpZ: number;
  dirty: boolean;
  saveT: number;
  stateT: number;
  nightFlag: boolean;
  turrets: number;
  today: number;
  reachT: number;
  guest: boolean;
};
type Foe = { e: Entity; kind: number; region: number; x: number; z: number; hp: number; maxHp: number; head: number; atkT: number; stateT: number; wx: number; wz: number; wanderT: number };
type Crate = { e: Entity; region: number; x: number; z: number; sub: number; spot: number };
type Turret = { e: Entity; region: number; x: number; z: number; owner: string; life: number; fireT: number };
type Zone = { spawnT: number; crateT: number; bossT: number; dropT: number; bossAlive: boolean; bossDeadT: number; occupied: boolean };

export default defineServer(game, (ctx) => {
  const replica = replicateServer(ctx, Sync, {
    visibility: {
      entity: (player, entity) => {
        const b = entity.get(Body);
        const mine = states.get(player.id);
        return !b || !mine || b.region === mine.region;
      },
    },
  });
  let dataSvc: ReturnType<typeof createDataService> | null = null;
  const data = () => (dataSvc ??= createDataService(ctx.platform));
  const getLayout = makeLayouts();
  const states = new Map<string, PS>();
  const foes: Foe[] = [];
  const crates: Crate[] = [];
  const turrets: Turret[] = [];
  const zones: Zone[] = REGIONS.map(() => ({ spawnT: 0, crateT: 0, bossT: 0, dropT: 60, bossAlive: false, bossDeadT: 0, occupied: false }));
  let seed = (ctx.seed >>> 0) || 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  let joinCount = 0;
  const dt = 1 / ctx.tickRate;
  const time = () => ctx.tick / ctx.tickRate + DAY_LENGTH * 0.1;

  const toast = (ps: PS, text: string) => ctx.send(ps.player, Net.toClient.toast, { text });
  const inRegion = (r: number) => [...states.values()].filter((p) => p.region === r && p.loaded);
  const alive = (p: PS) => p.downT <= 0;
  const pose = (p: PS) => p.entity.get(Pose)!;

  // ───────── persistence ─────────
  const save = (ps: PS) => {
    ps.dirty = false;
    ps.saveT = 8;
    if (ps.guest) return;
    const uid = ps.player.userId as UserId;
    void data().user(uid).write(ps.profile as never).catch(() => {});
  };
  const mark = (ps: PS) => { ps.dirty = true; };

  // ───────── progression ─────────
  const addXp = (ps: PS, n: number) => {
    const pr = ps.profile;
    pr.xp += Math.round(n);
    while (pr.level < MAX_LEVEL && pr.xp >= xpNeed(pr.level)) {
      pr.xp -= xpNeed(pr.level);
      pr.level++;
      ps.hp = maxHpFor(pr.level);
      toast(ps, `LEVEL UP! You are level ${pr.level}.` + (WEAPONS.find((w) => w.minLevel === pr.level) ? ` ${WEAPONS.find((w) => w.minLevel === pr.level)!.name} unlocked!` : ""));
    }
    if (pr.level >= MAX_LEVEL) pr.xp = Math.min(pr.xp, xpNeed(pr.level) - 1);
  };
  const checkAch = (ps: PS) => {
    for (const a of ACHIEVEMENTS) {
      if (!ps.profile.achievements.includes(a.id) && a.test(ps.profile)) {
        ps.profile.achievements.push(a.id);
        toast(ps, `Achievement: ${a.name}!`);
        addXp(ps, ACH_XP);
      }
    }
  };
  const reward = (ps: PS, r: { xp?: number; scrap?: number; ammo?: number }) => {
    if (r.scrap) ps.profile.scrap += r.scrap;
    if (r.ammo) ps.profile.ammo += r.ammo;
    if (r.xp) addXp(ps, r.xp);
  };
  const resetChallenges = (ps: PS) => {
    const day = ps.today;
    if (ps.profile.chDay !== day) {
      ps.profile.chDay = day;
      ps.profile.chProg = challengesForDay(day).map(() => 0);
      ps.profile.chDone = [];
    }
  };
  const challenge = (ps: PS, ev: ChallengeEv, n = 1) => {
    resetChallenges(ps);
    challengesForDay(ps.today).forEach((ci, i) => {
      const c = CHALLENGES[ci]!;
      if (c.ev !== ev || ps.profile.chDone.includes(i)) return;
      ps.profile.chProg[i] = Math.min(c.need, (ps.profile.chProg[i] ?? 0) + n);
      if (ps.profile.chProg[i]! >= c.need) {
        ps.profile.chDone.push(i);
        toast(ps, `Daily challenge done: ${c.text}`);
        reward(ps, c);
      }
    });
  };
  const missionStep = (ps: PS, ev: "kill" | "loot" | "boss" | "reach") => {
    const r = ps.region;
    const stage = ps.profile.main[r] ?? 0;
    const def = MISSIONS[r]![stage];
    if (!def) return;
    const matches = def.kind === ev || (def.kind === "kill" && ev === "boss");
    if (!matches) return;
    const prog = (ps.profile.mainProg[r] = (ps.profile.mainProg[r] ?? 0) + 1);
    if (prog >= def.n) {
      ps.profile.main[r] = stage + 1;
      ps.profile.mainProg[r] = 0;
      toast(ps, `Mission complete: ${def.title}`);
      reward(ps, def);
      if (stage + 1 >= MISSIONS[r]!.length) toast(ps, `${REGIONS[r]!.name} story finished!`);
    }
  };
  const jobStep = (ps: PS, ev: "kill" | "loot" | "reach", foe = -1) => {
    const j = ps.profile.job;
    if (!j) return;
    const def = JOBS.find((x) => x.id === j.id);
    if (!def || def.region !== ps.region) return;
    const ok = (def.kind === "bounty" && ev === "kill" && (def.foe === foe)) || (def.kind === "supply" && ev === "loot") || (def.kind === "rescue" && ev === "reach");
    if (!ok) return;
    j.have++;
    if (j.have >= def.need) {
      ps.profile.job = null;
      ps.profile.jobsDone++;
      toast(ps, `Side job done: ${def.title}`);
      reward(ps, def);
      challenge(ps, "job");
    }
  };

  // ───────── spawning ─────────
  const body = (region: number, kind: number, sub: number, hp: number, name = "", color = "") =>
    Body({ region, kind, sub, hp, maxHp: hp, state: 0, name, color });
  const freeSpot = (region: number, around: { x: number; z: number } | null, minD: number, maxD: number) => {
    const L = getLayout(region);
    for (let i = 0; i < 20; i++) {
      let x: number, z: number;
      if (around) {
        const a = rnd() * 6.283, d = minD + rnd() * (maxD - minD);
        x = around.x + Math.sin(a) * d; z = around.z + Math.cos(a) * d;
      } else { x = (rnd() * 2 - 1) * 80; z = (rnd() * 2 - 1) * 80; }
      const r = resolve(L, { x, z }, 0.8);
      if (Math.abs(r.x - x) < 0.01 && Math.abs(r.z - z) < 0.01 && Math.abs(x) < 85 && Math.abs(z) < 85) return r;
    }
    return null;
  };
  const spawnFoe = (region: number, kind: number, x: number, z: number) => {
    const n = Math.max(1, inRegion(region).length);
    const hp = FOES[kind]!.hp * (1 + 0.25 * (n - 1));
    const e = ctx.world.spawn(body(region, KIND_FOE, kind, hp), Mover({ x, z, heading: rnd() * 6, speed: 0, aim: false }));
    replica.replicate(e);
    foes.push({ e, kind, region, x, z, hp, maxHp: hp, head: rnd() * 6, atkT: 0.5, stateT: 0, wx: x, wz: z, wanderT: 0 });
  };
  const spawnCrate = (region: number, x: number, z: number, sub: number, spot: number) => {
    const e = ctx.world.spawn(body(region, KIND_CRATE, sub, 1), Mover({ x, z, heading: 0, speed: 0, aim: false }));
    replica.replicate(e);
    crates.push({ e, region, x, z, sub, spot });
  };
  const killFoe = (f: Foe, by: PS | null) => {
    const idx = foes.indexOf(f);
    if (idx >= 0) foes.splice(idx, 1);
    f.e.destroy();
    const def = FOES[f.kind]!;
    replica.emit("died", { region: f.region, x: f.x, y: 1, z: f.z, kind: f.kind }, (p) => states.get(p.id)?.region === f.region);
    if (f.kind === BOSS_KIND) { zones[f.region]!.bossAlive = false; zones[f.region]!.bossDeadT = 150; }
    // loot drop: scrap/ammo for the killer's party
    const near = inRegion(f.region).filter((p) => alive(p) && Math.hypot(pose(p).x - f.x, pose(p).z - f.z) < 30);
    const recipients = by ? [by, ...near.filter((p) => p !== by)] : near;
    recipients.forEach((p, i) => {
      const share = i === 0 ? 1 : 0.5;
      addXp(p, def.xp * share);
      if (rnd() < 0.5 || f.kind === BOSS_KIND) p.profile.scrap += Math.ceil(def.scrap * share);
      if (rnd() < 0.3) p.profile.ammo += 4 + Math.floor(rnd() * 6);
      if (i === 0 || share) {
        p.profile.kills++;
        challenge(p, "kill");
        missionStep(p, f.kind === BOSS_KIND ? "boss" : "kill");
        jobStep(p, "kill", f.kind);
        if (f.kind === BOSS_KIND) { p.profile.bossKills++; challenge(p, "boss"); }
      }
      checkAch(p);
      mark(p);
    });
  };
  const damagePlayer = (ps: PS, n: number, from?: { x: number; z: number }) => {
    if (!alive(ps)) return;
    ps.hp -= n;
    ps.hurtT = 5;
    const p = pose(ps);
    replica.emit("hurt", { region: ps.region, x: p.x, y: 1.2, z: p.z }, (pl) => states.get(pl.id)?.region === ps.region);
    void from;
    if (ps.hp <= 0) {
      ps.hp = 0;
      ps.downT = 6;
      ps.profile.deaths++;
      ps.profile.scrap = Math.floor(ps.profile.scrap * 0.9);
      ps.entity.set(Body, { ...ps.entity.get(Body)!, state: 2 });
      toast(ps, "You went down. Respawning at the region start...");
      checkAch(ps);
      mark(ps);
    }
  };

  const enterRegion = (ps: PS, region: number) => {
    ps.region = region;
    const def = REGIONS[region]!;
    ps.tpN++;
    ps.tpX = def.spawn.x + (rnd() - 0.5) * 4;
    ps.tpZ = def.spawn.z + (rnd() - 0.5) * 4;
    ps.entity.set(Pose, { x: ps.tpX, z: ps.tpZ, heading: Math.PI, speed: 0, aim: false });
    ps.entity.set(Body, { ...ps.entity.get(Body)!, region, state: 0 });
    if (!ps.profile.visited.includes(region)) { ps.profile.visited.push(region); toast(ps, `Welcome to ${def.name}.`); }
    ps.downT = 0;
    ps.hp = Math.max(ps.hp, 1);
    checkAch(ps);
    mark(ps);
  };

  // ───────── joins ─────────
  ctx.onPlayerJoin((player) => {
    const idx = joinCount++;
    const entity = ctx.world.spawn(
      body(0, KIND_PLAYER, 0, 100, `Survivor ${idx + 1}`, COLORS[idx % COLORS.length]!),
      Pose({ x: 0, z: 75, heading: Math.PI, speed: 0, aim: false }),
    );
    replica.replicate(entity);
    replica.setOwner(entity, player);
    const ps: PS = {
      player, entity, profile: Profile.parse({}), loaded: false, region: 0, hp: 100, hunger: 100, thirst: 100, weapon: 0,
      fireT: 0, meleeT: 0, hurtT: 0, downT: 0, tpN: 1, tpX: 0, tpZ: 75, dirty: false, saveT: 8, stateT: 0, nightFlag: false,
      turrets: 0, today: dayNumber(wallClock()), reachT: 0, guest: player.userId === null,
    };
    states.set(player.id, ps);
    const finish = (stored: unknown) => {
      const parsed = Profile.safeParse(stored ?? {});
      ps.profile = parsed.success ? parsed.data : Profile.parse({});
      while (ps.profile.main.length < 4) ps.profile.main.push(0);
      while (ps.profile.mainProg.length < 4) ps.profile.mainProg.push(0);
      ps.hp = maxHpFor(ps.profile.level);
      ps.loaded = true;
      ps.entity.set(Body, { ...ps.entity.get(Body)!, hp: ps.hp, maxHp: ps.hp });
      resetChallenges(ps);
      toast(ps, ps.guest ? "Playing as a guest: progress will not be saved." : "Progress loaded.");
    };
    if (ps.guest) finish(null);
    else {
      try { data().user(player.userId as UserId).read().then(finish, () => finish(null)); }
      catch { ps.guest = true; finish(null); }
    }
  });
  ctx.onPlayerLeave(async (player) => {
    const ps = states.get(player.id);
    if (!ps) return;
    states.delete(player.id);
    for (let i = turrets.length - 1; i >= 0; i--) if (turrets[i]!.owner === player.id) { turrets[i]!.e.destroy(); turrets.splice(i, 1); }
    ps.entity.destroy();
    if (ps.loaded && !ps.guest) await data().user(player.userId as UserId).write(ps.profile as never).catch(() => {});
  });

  // ───────── messages ─────────
  const msg = Net.toServer;
  const withPs = <T,>(h: (ps: PS, d: T) => void) => (player: Player, d: T) => {
    const ps = states.get(player.id);
    if (ps?.loaded) h(ps, d);
  };
  ctx.onMessage(msg.weapon, withPs((ps, { i }) => {
    if (ps.profile.level >= WEAPONS[i]!.minLevel) ps.weapon = i;
    else toast(ps, `${WEAPONS[i]!.name} unlocks at level ${WEAPONS[i]!.minLevel}.`);
  }));
  ctx.onMessage(msg.travel, withPs((ps, { region }) => {
    const def = REGIONS[region]!;
    if (ps.profile.level < def.minLevel) return toast(ps, `${def.name} requires level ${def.minLevel}.`);
    enterRegion(ps, region);
  }));
  ctx.onMessage(msg.respawn, withPs((ps) => { if (ps.downT > 0 && ps.downT < 4.5) ps.downT = 0.01; }));
  ctx.onMessage(msg.craft, withPs((ps, { id }) => {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    const pr = ps.profile;
    if (pr.scrap < r.cost.scrap || pr.ammo < (r.cost.ammo ?? 0)) return toast(ps, "Not enough materials.");
    pr.scrap -= r.cost.scrap; pr.ammo -= r.cost.ammo ?? 0;
    pr.ammo += r.gives.ammo ?? 0; pr.medkits += r.gives.medkits ?? 0; pr.food += r.gives.food ?? 0; pr.water += r.gives.water ?? 0; pr.turrets += r.gives.turrets ?? 0;
    pr.crafted++;
    challenge(ps, "craft");
    toast(ps, `Crafted: ${r.name}`);
    checkAch(ps); mark(ps);
  }));
  ctx.onMessage(msg.job, withPs((ps, { id }) => {
    if (id === "") { ps.profile.job = null; mark(ps); return; }
    const j = JOBS.find((x) => x.id === id);
    if (!j || j.region !== ps.region) return toast(ps, "That job is in another region.");
    ps.profile.job = { id, have: 0 };
    toast(ps, `Job accepted: ${j.title}`);
    mark(ps);
  }));
  ctx.onMessage(msg.daily, withPs((ps) => {
    const today = ps.today;
    const d = ps.profile.daily;
    if (d.last === today) return;
    d.streak = d.last === today - 1 ? d.streak + 1 : 1;
    d.last = today;
    const r = DAILY_REWARDS[(d.streak - 1) % DAILY_REWARDS.length]!;
    const pr = ps.profile;
    pr.scrap += r.scrap ?? 0; pr.ammo += r.ammo ?? 0; pr.medkits += r.medkits ?? 0; pr.food += r.food ?? 0; pr.water += r.water ?? 0; pr.turrets += r.turrets ?? 0;
    if (r.xp) addXp(ps, r.xp);
    toast(ps, `Day ${d.streak} reward: ${r.label}`);
    checkAch(ps); mark(ps);
  }));
  ctx.onMessage(msg.act, withPs((ps, { a }) => {
    if (!alive(ps)) return;
    const pr = ps.profile;
    const p = pose(ps);
    if (a === "medkit") {
      if (pr.medkits > 0 && ps.hp < maxHpFor(pr.level)) { pr.medkits--; ps.hp = Math.min(maxHpFor(pr.level), ps.hp + 60); mark(ps); }
    } else if (a === "food") {
      if (pr.food > 0 && ps.hunger < 90) { pr.food--; ps.hunger = Math.min(100, ps.hunger + 45); mark(ps); }
    } else if (a === "water") {
      if (pr.water > 0 && ps.thirst < 90) { pr.water--; ps.thirst = Math.min(100, ps.thirst + 50); mark(ps); }
    } else if (a === "turret") {
      if (pr.turrets < 1) return toast(ps, "Craft a turret first.");
      if (turrets.filter((t) => t.owner === ps.player.id).length >= 3) return toast(ps, "Max 3 turrets.");
      const tx = p.x + Math.sin(p.heading) * 2.5, tz = p.z + Math.cos(p.heading) * 2.5;
      const r = resolve(getLayout(ps.region), { x: tx, z: tz }, 0.6);
      pr.turrets--; pr.built++;
      const e = ctx.world.spawn(body(ps.region, KIND_TURRET, 0, 80), Mover({ x: r.x, z: r.z, heading: p.heading, speed: 0, aim: false }));
      replica.replicate(e);
      turrets.push({ e, region: ps.region, x: r.x, z: r.z, owner: ps.player.id, life: 150, fireT: 0 });
      challenge(ps, "build"); checkAch(ps); mark(ps);
    } else {
      let best: Crate | null = null, bd = 3.2;
      for (const c of crates) {
        if (c.region !== ps.region) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return;
      crates.splice(crates.indexOf(best), 1);
      best.e.destroy();
      const sub = best.sub;
      const parts: string[] = [];
      const big = sub === 3 ? 3 : 1;
      if (sub === 1 || sub === 3) { const n = (1 + (rnd() < 0.4 ? 1 : 0)) * big; pr.medkits += n; parts.push(`${n} medkit`); }
      if (sub === 2 || sub === 3) { const n = (18 + Math.floor(rnd() * 20)) * big; pr.ammo += n; parts.push(`${n} rounds`); }
      if (sub === 0 || sub === 3) { const n = (2 + Math.floor(rnd() * 4)) * big; pr.scrap += n; parts.push(`${n} scrap`); }
      if (rnd() < 0.5 || sub === 3) { pr.food += big; pr.water += big; parts.push(`${big} food, ${big} water`); }
      pr.crates++;
      addXp(ps, 6 * big);
      toast(ps, `Looted: ${parts.join(", ")}`);
      replica.emit("crate", { region: ps.region, x: best.x, z: best.z }, (pl) => states.get(pl.id)?.region === ps.region);
      challenge(ps, "loot"); missionStep(ps, "loot"); jobStep(ps, "loot");
      checkAch(ps); mark(ps);
    }
  }));

  // ───────── combat ─────────
  const rayHitFoe = (region: number, o: [number, number, number], d: [number, number, number], range: number) => {
    // Distance to first obstacle, then the nearest foe capsule before it.
    const wall = rayBlock(getLayout(region), o[0], o[1], o[2], d[0], d[1], d[2], range);
    let bestT = wall, hit: Foe | null = null, crit = false;
    for (const f of foes) {
      if (f.region !== region) continue;
      const s = FOES[f.kind]!.scale;
      const rad = 0.5 * s, top = 1.75 * s;
      // sample the vertical axis: closest approach between ray and segment (f.x, 0, f.z)-(f.x, top, f.z)
      let tBest = Infinity, ok = false;
      for (let k = 0; k <= 4; k++) {
        const py = 0.1 + (top - 0.1) * (k / 4);
        const vx = f.x - o[0], vy = py - o[1], vz = f.z - o[2];
        const t = vx * d[0] + vy * d[1] + vz * d[2];
        if (t < 0 || t > bestT) continue;
        const cx = o[0] + d[0] * t - f.x, cy = o[1] + d[1] * t - py, cz = o[2] + d[2] * t - f.z;
        if (Math.hypot(cx, cy, cz) < rad && t < tBest) { tBest = t; ok = true; crit = py > top * 0.8; }
      }
      if (ok && tBest < bestT) { bestT = tBest; hit = f; }
    }
    return { t: bestT, foe: hit, crit };
  };
  const hurtFoe = (f: Foe, n: number, by: PS | null, crit: boolean) => {
    f.hp -= n;
    f.stateT = Math.max(f.stateT, 0);
    replica.emit("hit", { region: f.region, x: f.x, y: 1.4 * FOES[f.kind]!.scale, z: f.z, n: Math.round(n), crit }, (p) => states.get(p.id)?.region === f.region);
    f.e.set(Body, { ...f.e.get(Body)!, hp: Math.max(0, f.hp) });
    if (by && crit) { challenge(by, "headshot"); }
    if (f.hp <= 0) killFoe(f, by);
  };
  ctx.onMessage(msg.fire, withPs((ps, m) => {
    if (!alive(ps) || ps.fireT > 0) return;
    const w = WEAPONS[ps.weapon]!;
    if (ps.profile.ammo < w.ammo) return toast(ps, "Out of ammo! Craft or loot more.");
    const p = pose(ps);
    if (Math.hypot(m.ox - p.x, m.oz - p.z) > 9) return;
    const len = Math.hypot(m.dx, m.dy, m.dz);
    if (len < 0.5) return;
    ps.fireT = w.cooldown * 0.85;
    ps.profile.ammo -= w.ammo;
    const dm = dmgMult(ps.profile.level);
    const muzzle = { x: p.x + Math.sin(p.heading) * 0.6, y: 1.35, z: p.z + Math.cos(p.heading) * 0.6 };
    for (let i = 0; i < w.pellets; i++) {
      const dir: [number, number, number] = [m.dx / len + (rnd() - 0.5) * w.spread * 2, m.dy / len + (rnd() - 0.5) * w.spread * 2, m.dz / len + (rnd() - 0.5) * w.spread * 2];
      const r = rayHitFoe(ps.region, [m.ox, m.oy, m.oz], dir, w.range);
      const dl = Math.hypot(...dir);
      const tx = m.ox + (dir[0] / dl) * r.t, ty = m.oy + (dir[1] / dl) * r.t, tz = m.oz + (dir[2] / dl) * r.t;
      if (i < 3 || w.pellets === 1) replica.emit("shot", { region: ps.region, x: muzzle.x, y: muzzle.y, z: muzzle.z, tx, ty, tz, w: ps.weapon }, (pl) => states.get(pl.id)?.region === ps.region);
      if (r.foe) hurtFoe(r.foe, w.dmg * dm * (r.crit ? 2 : 1), ps, r.crit);
    }
    mark(ps);
  }));
  ctx.onMessage(msg.melee, withPs((ps) => {
    if (!alive(ps) || ps.meleeT > 0) return;
    ps.meleeT = MELEE.cooldown;
    const p = pose(ps);
    for (const f of [...foes]) {
      if (f.region !== ps.region) continue;
      const dx = f.x - p.x, dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > MELEE.range + FOES[f.kind]!.scale * 0.5) continue;
      const dot = (dx * Math.sin(p.heading) + dz * Math.cos(p.heading)) / (d || 1);
      if (dot < 0.2) continue;
      const hpBefore = f.hp;
      hurtFoe(f, MELEE.dmg * dmgMult(ps.profile.level), ps, false);
      if (f.hp <= 0 && hpBefore > 0) challenge(ps, "melee");
    }
  }));

  // ───────── step ─────────
  let lastNight = false;
  ctx.onStep(() => {
    const t = time();
    const night = isNight(t);
    const nightNum = Math.floor(t / DAY_LENGTH);
    void nightNum;
    const wallDay = dayNumber(wallClock());

    for (const z of zones) z.occupied = false;
    for (const ps of states.values()) {
      if (!ps.loaded) continue;
      zones[ps.region]!.occupied = true;
      ps.today = wallDay;
      ps.fireT -= dt; ps.meleeT -= dt; ps.hurtT -= dt;
      const p = pose(ps);
      if (ps.downT > 0) {
        ps.downT -= dt;
        if (ps.downT <= 0) {
          const def = REGIONS[ps.region]!;
          ps.downT = 0;
          ps.hp = maxHpFor(ps.profile.level);
          ps.hunger = Math.max(ps.hunger, 50); ps.thirst = Math.max(ps.thirst, 50);
          ps.tpN++; ps.tpX = def.spawn.x; ps.tpZ = def.spawn.z;
          ps.entity.set(Pose, { ...p, x: ps.tpX, z: ps.tpZ });
          ps.entity.set(Body, { ...ps.entity.get(Body)!, state: 0 });
        }
      } else {
        const maxHp = maxHpFor(ps.profile.level);
        ps.hunger = Math.max(0, ps.hunger - dt * (100 / 480));
        ps.thirst = Math.max(0, ps.thirst - dt * (100 / 360));
        if (ps.hunger <= 0 || ps.thirst <= 0) { if (ps.hp > 12) ps.hp -= dt * 1.2; }
        else if (ps.hurtT <= 0 && ps.hp < maxHp) ps.hp = Math.min(maxHp, ps.hp + dt * 0.8);
        // reach checks
        ps.reachT -= dt;
        if (ps.reachT <= 0) {
          ps.reachT = 0.5;
          const stage = MISSIONS[ps.region]![ps.profile.main[ps.region] ?? 0];
          if (stage?.kind === "reach" && stage.target && Math.hypot(p.x - stage.target.x, p.z - stage.target.z) < stage.target.r) missionStep(ps, "reach");
          const j = ps.profile.job && JOBS.find((x) => x.id === ps.profile.job!.id);
          if (j && j.kind === "rescue" && j.target && j.region === ps.region && Math.hypot(p.x - j.target.x, p.z - j.target.z) < j.target.r) jobStep(ps, "reach");
        }
      }
      const b = ps.entity.get(Body)!;
      const mh = maxHpFor(ps.profile.level);
      if (Math.abs(b.hp - ps.hp) > 0.5 || b.maxHp !== mh || b.sub !== ps.weapon) ps.entity.set(Body, { ...b, hp: Math.round(ps.hp), maxHp: mh, sub: ps.weapon });
      // night survival counter
      if (night && !ps.nightFlag) ps.nightFlag = true;
      if (!night && ps.nightFlag && lastNight) { ps.nightFlag = false; if (ps.downT <= 0) { ps.profile.nights++; toast(ps, "You survived the night."); checkAch(ps); mark(ps); } }
      // client state
      ps.stateT -= dt;
      if (ps.stateT <= 0) {
        ps.stateT = 0.2;
        ctx.send(ps.player, Net.toClient.state, {
          profile: ps.profile, region: ps.region, hp: ps.hp, maxHp: maxHpFor(ps.profile.level), hunger: ps.hunger, thirst: ps.thirst,
          weapon: ps.weapon, down: ps.downT > 0, respawnIn: Math.max(0, ps.downT), time: t, nightsNote: night, tpN: ps.tpN, tpX: ps.tpX, tpZ: ps.tpZ,
          players: inRegion(ps.region).length, foes: foes.filter((f) => f.region === ps.region).length, today: wallDay,
          canClaim: ps.profile.daily.last !== wallDay,
        });
      }
      ps.saveT -= dt;
      if (ps.dirty && ps.saveT <= 0) save(ps);
    }
    lastNight = night;

    // zones: spawn / despawn
    zones.forEach((z, r) => {
      const people = inRegion(r);
      if (!z.occupied || people.length === 0) {
        if (foes.some((f) => f.region === r) || crates.some((c) => c.region === r) || turrets.some((x) => x.region === r)) {
          for (let i = foes.length - 1; i >= 0; i--) if (foes[i]!.region === r) { foes[i]!.e.destroy(); foes.splice(i, 1); }
          for (let i = crates.length - 1; i >= 0; i--) if (crates[i]!.region === r) { crates[i]!.e.destroy(); crates.splice(i, 1); }
          for (let i = turrets.length - 1; i >= 0; i--) if (turrets[i]!.region === r) { turrets[i]!.e.destroy(); turrets.splice(i, 1); }
          z.bossAlive = false; z.bossDeadT = 0; z.dropT = 60;
        }
        return;
      }
      const def = REGIONS[r]!;
      const cap = Math.round((MAX_FOES_BASE + 6 * people.length) * (night ? 1.6 : 1));
      const count = foes.filter((f) => f.region === r && f.kind !== BOSS_KIND).length;
      z.spawnT -= dt;
      if (z.spawnT <= 0 && count < cap) {
        z.spawnT = night ? 0.7 : 1.4;
        const target = pick(people);
        const tp = pose(target);
        const sp = freeSpot(r, tp, 32, 58);
        if (sp) {
          const total = def.spawnWeights.reduce((a, b) => a + b, 0);
          let roll = rnd() * total, kind = 0;
          for (let i = 0; i < def.spawnWeights.length; i++) { roll -= def.spawnWeights[i]!; if (roll <= 0) { kind = i; break; } }
          spawnFoe(r, kind, sp.x, sp.z);
        }
      }
      if (!z.bossAlive) {
        z.bossDeadT -= dt;
        if (z.bossDeadT <= 0) { spawnFoe(r, BOSS_KIND, def.boss.x, def.boss.z); z.bossAlive = true; }
      }
      const cc = crates.filter((c) => c.region === r && c.sub !== 3).length;
      z.crateT -= dt;
      if (cc < 18 && z.crateT <= 0) {
        z.crateT = cc < 8 ? 0.4 : 4;
        const L = getLayout(r);
        const spot = Math.floor(rnd() * L.lootSpots.length);
        if (!crates.some((c) => c.region === r && c.spot === spot)) {
          const s = L.lootSpots[spot]!;
          spawnCrate(r, s.x, s.z, Math.floor(rnd() * 3), spot);
        }
      }
      z.dropT -= dt;
      if (z.dropT <= 0) {
        z.dropT = 150;
        const sp = freeSpot(r, null, 0, 0);
        if (sp) {
          spawnCrate(r, sp.x, sp.z, 3, -1);
          for (const p of people) toast(p, `AIRDROP landed near (${Math.round(sp.x)}, ${Math.round(sp.z)})! First to the beacon takes it.`);
        }
      }
    });

    // foe AI
    const L = REGIONS.map((_, i) => getLayout(i));
    for (const f of foes) {
      const def = FOES[f.kind]!;
      const people = inRegion(f.region).filter(alive);
      let tgt: PS | null = null, td = Infinity;
      for (const p of people) { const pp = pose(p); const d = Math.hypot(pp.x - f.x, pp.z - f.z); if (d < td) { td = d; tgt = p; } }
      const aggro = f.kind === BOSS_KIND ? 70 : (night ? 48 : 32);
      f.atkT -= dt; f.stateT -= dt;
      let vx = 0, vz = 0, speed = 0;
      if (tgt && td < aggro) {
        const pp = pose(tgt);
        const dx = pp.x - f.x, dz = pp.z - f.z;
        f.head = Math.atan2(dx, dz);
        const stop = def.ranged ? def.reach * 0.6 : def.reach * 0.7;
        if (td > stop) { speed = def.speed * (night && f.kind !== BOSS_KIND ? 1.15 : 1); vx = (dx / td) * speed; vz = (dz / td) * speed; }
        if (f.atkT <= 0 && td < def.reach + 0.4) {
          if (def.ranged) {
            const blocked = rayBlock(L[f.region]!, f.x, 1.4, f.z, dx, 0, dz, td) < td - 0.5;
            if (!blocked) {
              f.atkT = def.cooldown * (0.8 + rnd() * 0.5); f.stateT = 0.35;
              replica.emit("shot", { region: f.region, x: f.x, y: 1.4, z: f.z, tx: pp.x, ty: 1.2, tz: pp.z, w: f.kind === 5 ? 3 : 4 }, (pl) => states.get(pl.id)?.region === f.region);
              if (rnd() < 0.55) damagePlayer(tgt, def.dmg * (night ? 1.2 : 1), f);
            }
          } else {
            f.atkT = def.cooldown; f.stateT = 0.4;
            damagePlayer(tgt, def.dmg * (night ? 1.2 : 1), f);
          }
        }
      } else {
        f.wanderT -= dt;
        if (f.wanderT <= 0) { f.wanderT = 3 + rnd() * 4; const a = rnd() * 6.28; f.wx = f.x + Math.sin(a) * 8; f.wz = f.z + Math.cos(a) * 8; }
        const dx = f.wx - f.x, dz = f.wz - f.z, d = Math.hypot(dx, dz);
        if (d > 1) { speed = def.speed * 0.3; vx = (dx / d) * speed; vz = (dz / d) * speed; f.head = Math.atan2(dx, dz); }
      }
      if (inWater(L[f.region]!, f.x, f.z) && f.kind !== 4) { vx *= 0.6; vz *= 0.6; speed *= 0.6; }
      const r = resolve(L[f.region]!, { x: f.x + vx * dt, z: f.z + vz * dt }, 0.55 * def.scale);
      f.x = r.x; f.z = r.z;
    }
    // light separation
    for (let i = 0; i < foes.length; i++) {
      for (let j = i + 1; j < foes.length; j++) {
        const a = foes[i]!, b = foes[j]!;
        if (a.region !== b.region) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        const m = 0.9 * (FOES[a.kind]!.scale + FOES[b.kind]!.scale) * 0.5;
        if (d < m && d > 1e-3) { const k = (m - d) * 0.25 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
      }
    }
    for (const f of foes) {
      const prev = f.e.get(Mover)!;
      const moved = Math.hypot(f.x - prev.x, f.z - prev.z) / dt;
      f.e.set(Mover, { x: f.x, z: f.z, heading: f.head, speed: moved, aim: false });
      const bd = f.e.get(Body)!;
      const st = f.stateT > 0 ? 1 : 0;
      if (bd.state !== st) f.e.set(Body, { ...bd, state: st });
    }

    // turrets
    for (let i = turrets.length - 1; i >= 0; i--) {
      const tu = turrets[i]!;
      tu.life -= dt; tu.fireT -= dt;
      if (tu.life <= 0) { tu.e.destroy(); turrets.splice(i, 1); continue; }
      let tgt: Foe | null = null, td = 22;
      for (const f of foes) { if (f.region !== tu.region) continue; const d = Math.hypot(f.x - tu.x, f.z - tu.z); if (d < td) { td = d; tgt = f; } }
      if (tgt) {
        const h = Math.atan2(tgt.x - tu.x, tgt.z - tu.z);
        tu.e.set(Mover, { x: tu.x, z: tu.z, heading: h, speed: 0, aim: true });
        if (tu.fireT <= 0) {
          tu.fireT = 0.35;
          replica.emit("shot", { region: tu.region, x: tu.x, y: 1, z: tu.z, tx: tgt.x, ty: 1, tz: tgt.z, w: 0 }, (pl) => states.get(pl.id)?.region === tu.region);
          const owner = states.get(tu.owner) ?? null;
          hurtFoe(tgt, 9, owner, false);
        }
      }
    }
    replica.publish();
  });
});
