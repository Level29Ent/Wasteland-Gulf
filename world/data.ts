import { z } from "zod";

export const DAY_LENGTH = 300;
export const DAWN = 0.0;
export const DUSK = 0.62;
export const MAX_LEVEL = 20;

export type Pt = { x: number; z: number };
export type Target = Pt & { r: number; name: string };

export type RegionDef = {
  id: number;
  key: "nola" | "swamp" | "houston" | "la";
  name: string;
  tagline: string;
  minLevel: number;
  spawn: Pt;
  boss: Pt;
  bossName: string;
  landmarks: Target[];
  spawnWeights: number[];
};

export const FOE_KINDS = ["walker", "runner", "brute", "spitter", "gator", "raider", "boss"] as const;
export type FoeDef = {
  name: string; hp: number; speed: number; dmg: number; reach: number; ranged: boolean;
  cooldown: number; xp: number; scrap: number; scale: number;
};
export const FOES: FoeDef[] = [
  { name: "Shambler", hp: 60, speed: 1.6, dmg: 10, reach: 1.6, ranged: false, cooldown: 1.1, xp: 8, scrap: 1, scale: 1 },
  { name: "Runner", hp: 40, speed: 4.4, dmg: 8, reach: 1.5, ranged: false, cooldown: 0.8, xp: 10, scrap: 1, scale: 0.95 },
  { name: "Brute", hp: 260, speed: 2.0, dmg: 26, reach: 2.1, ranged: false, cooldown: 1.4, xp: 40, scrap: 5, scale: 1.55 },
  { name: "Spore Spitter", hp: 55, speed: 2.0, dmg: 9, reach: 16, ranged: true, cooldown: 2.2, xp: 16, scrap: 2, scale: 1.05 },
  { name: "Bayou Gator", hp: 120, speed: 4.8, dmg: 18, reach: 2.2, ranged: false, cooldown: 1.0, xp: 22, scrap: 3, scale: 1 },
  { name: "Raider", hp: 80, speed: 2.8, dmg: 8, reach: 18, ranged: true, cooldown: 1.1, xp: 18, scrap: 3, scale: 1 },
  { name: "Tyrant", hp: 1600, speed: 2.5, dmg: 38, reach: 3.2, ranged: false, cooldown: 1.3, xp: 400, scrap: 40, scale: 2.5 },
];
export const BOSS_KIND = 6;

export type WeaponDef = {
  name: string; dmg: number; cooldown: number; ammo: number; pellets: number; spread: number; range: number; minLevel: number;
};
export const WEAPONS: WeaponDef[] = [
  { name: "Revolver", dmg: 24, cooldown: 0.38, ammo: 1, pellets: 1, spread: 0.008, range: 80, minLevel: 1 },
  { name: "Pump Shotgun", dmg: 10, cooldown: 0.9, ammo: 2, pellets: 7, spread: 0.075, range: 24, minLevel: 2 },
  { name: "Assault Rifle", dmg: 17, cooldown: 0.12, ammo: 1, pellets: 1, spread: 0.022, range: 100, minLevel: 4 },
];
export const MELEE = { dmg: 42, cooldown: 0.55, range: 2.6 };

export const REGIONS: RegionDef[] = [
  {
    id: 0, key: "nola", name: "New Orleans", tagline: "Drowned jazz, shambling crowds, and a Superdome that never emptied.",
    minLevel: 1, spawn: { x: 0, z: 75 }, boss: { x: 38, z: -38 }, bossName: "The Dome Tyrant",
    landmarks: [
      { x: -21, z: -21, r: 14, name: "St. Louis Cathedral" },
      { x: -21, z: 21, r: 14, name: "Jackson Square" },
      { x: 63, z: -63, r: 26, name: "The Superdome" },
    ],
    spawnWeights: [5, 2, 0.5, 0, 0, 0],
  },
  {
    id: 1, key: "swamp", name: "The Bayou Swamp", tagline: "Fog, stilt shacks and things that glow in the water.",
    minLevel: 2, spawn: { x: 0, z: 75 }, boss: { x: -45, z: -45 }, bossName: "The Mire Tyrant",
    landmarks: [
      { x: 30, z: 20, r: 12, name: "Stilt Village" },
      { x: -45, z: -30, r: 14, name: "Hag's Cypress Hut" },
      { x: 55, z: -55, r: 12, name: "Old Airboat Dock" },
    ],
    spawnWeights: [2, 1, 0.6, 3, 4, 0],
  },
  {
    id: 2, key: "houston", name: "Houston", tagline: "Rocket gantries, glass towers and a dome full of the dead.",
    minLevel: 4, spawn: { x: 0, z: 75 }, boss: { x: -30, z: -30 }, bossName: "The Launchpad Tyrant",
    landmarks: [
      { x: 42, z: -42, r: 14, name: "Space Center Rocket" },
      { x: -63, z: -63, r: 26, name: "The Astrodome" },
      { x: 0, z: 0, r: 14, name: "Downtown Towers" },
    ],
    spawnWeights: [4, 3, 1.2, 1.5, 0, 0],
  },
  {
    id: 3, key: "la", name: "Los Angeles", tagline: "Hollywood sign, boardwalk pier and raiders on every freeway.",
    minLevel: 6, spawn: { x: 0, z: 75 }, boss: { x: 0, z: -60 }, bossName: "The Hollywood Tyrant",
    landmarks: [
      { x: 0, z: -72, r: 18, name: "Hollywood Sign" },
      { x: -63, z: -21, r: 14, name: "Griffith Observatory" },
      { x: 63, z: 42, r: 14, name: "Santa Monica Pier" },
    ],
    spawnWeights: [3, 3, 1.2, 0, 0, 4],
  },
];
export const REGION_HALF = 88;

export type Stage = {
  kind: "kill" | "loot" | "reach" | "boss";
  n: number; title: string; desc: string; target?: Target; xp: number; scrap: number;
};
const T = (r: number, i: number) => REGIONS[r]!.landmarks[i]!;
export const MISSIONS: Stage[][] = [
  [
    { kind: "kill", n: 12, title: "Thin the Herd", desc: "Put down 12 of the dead in the Quarter.", xp: 60, scrap: 8 },
    { kind: "loot", n: 4, title: "Supply Run", desc: "Open 4 supply crates (E).", xp: 60, scrap: 10 },
    { kind: "reach", n: 1, title: "Sanctuary", desc: "Reach St. Louis Cathedral.", target: T(0, 0), xp: 80, scrap: 10 },
    { kind: "boss", n: 1, title: "Dome of the Dead", desc: "Slay the Dome Tyrant at the Superdome.", xp: 300, scrap: 40 },
  ],
  [
    { kind: "kill", n: 14, title: "Wade In", desc: "Kill 14 swamp creatures.", xp: 90, scrap: 10 },
    { kind: "loot", n: 5, title: "Stilt Salvage", desc: "Open 5 crates around the bayou.", xp: 90, scrap: 12 },
    { kind: "reach", n: 1, title: "The Hag's Hut", desc: "Reach the Hag's Cypress Hut.", target: T(1, 1), xp: 110, scrap: 12 },
    { kind: "boss", n: 1, title: "Heart of the Mire", desc: "Slay the Mire Tyrant.", xp: 420, scrap: 50 },
  ],
  [
    { kind: "kill", n: 18, title: "Clear the Freeway", desc: "Kill 18 infected.", xp: 120, scrap: 12 },
    { kind: "loot", n: 6, title: "Gantry Supplies", desc: "Open 6 crates.", xp: 120, scrap: 14 },
    { kind: "reach", n: 1, title: "Mission Control", desc: "Reach the Space Center Rocket.", target: T(2, 0), xp: 140, scrap: 14 },
    { kind: "boss", n: 1, title: "Liftoff", desc: "Slay the Launchpad Tyrant near the Astrodome.", xp: 520, scrap: 60 },
  ],
  [
    { kind: "kill", n: 22, title: "Hollywood Hills Sweep", desc: "Kill 22 raiders and infected.", xp: 150, scrap: 14 },
    { kind: "loot", n: 7, title: "Prop Warehouse", desc: "Open 7 crates.", xp: 150, scrap: 16 },
    { kind: "reach", n: 1, title: "Stargazer", desc: "Reach Griffith Observatory.", target: T(3, 1), xp: 170, scrap: 16 },
    { kind: "boss", n: 1, title: "The Last Picture Show", desc: "Slay the Hollywood Tyrant under the sign.", xp: 700, scrap: 80 },
  ],
];

export type Job = {
  id: string; region: number; kind: "bounty" | "supply" | "rescue"; title: string; desc: string;
  need: number; foe: number; target?: Target; xp: number; scrap: number; ammo: number;
};
export const JOBS: Job[] = [
  { id: "n1", region: 0, kind: "bounty", title: "Runner Bounty", desc: "Kill 6 Runners.", need: 6, foe: 1, xp: 70, scrap: 8, ammo: 20 },
  { id: "n2", region: 0, kind: "supply", title: "Streetcar Salvage", desc: "Open 3 crates.", need: 3, foe: -1, xp: 55, scrap: 12, ammo: 10 },
  { id: "n3", region: 0, kind: "rescue", title: "Jackson Square Survivor", desc: "Reach the stranded survivor.", need: 1, foe: -1, target: { x: -21, z: 21, r: 8, name: "Survivor" }, xp: 80, scrap: 10, ammo: 15 },
  { id: "s1", region: 1, kind: "bounty", title: "Gator Hunt", desc: "Kill 5 Bayou Gators.", need: 5, foe: 4, xp: 110, scrap: 10, ammo: 25 },
  { id: "s2", region: 1, kind: "supply", title: "Shack Raid", desc: "Open 4 crates.", need: 4, foe: -1, xp: 85, scrap: 14, ammo: 15 },
  { id: "s3", region: 1, kind: "rescue", title: "Lost Airboater", desc: "Reach the stranded airboater.", need: 1, foe: -1, target: { x: 55, z: -55, r: 8, name: "Airboater" }, xp: 100, scrap: 12, ammo: 20 },
  { id: "h1", region: 2, kind: "bounty", title: "Brute Contract", desc: "Kill 3 Brutes.", need: 3, foe: 2, xp: 150, scrap: 14, ammo: 30 },
  { id: "h2", region: 2, kind: "supply", title: "Gantry Gear", desc: "Open 5 crates.", need: 5, foe: -1, xp: 110, scrap: 16, ammo: 20 },
  { id: "h3", region: 2, kind: "rescue", title: "Stranded Engineer", desc: "Reach the engineer at the Astrodome.", need: 1, foe: -1, target: { x: -63, z: -63, r: 12, name: "Engineer" }, xp: 130, scrap: 14, ammo: 25 },
  { id: "l1", region: 3, kind: "bounty", title: "Raider Bounty", desc: "Kill 8 Raiders.", need: 8, foe: 5, xp: 170, scrap: 16, ammo: 40 },
  { id: "l2", region: 3, kind: "supply", title: "Studio Props", desc: "Open 6 crates.", need: 6, foe: -1, xp: 130, scrap: 18, ammo: 25 },
  { id: "l3", region: 3, kind: "rescue", title: "Pier Castaway", desc: "Reach the survivor at Santa Monica Pier.", need: 1, foe: -1, target: { x: 63, z: 42, r: 10, name: "Castaway" }, xp: 150, scrap: 16, ammo: 30 },
];

export type Recipe = { id: string; name: string; cost: { scrap: number; ammo?: number }; gives: Partial<Record<"ammo" | "medkits" | "food" | "water" | "turrets", number>>; desc: string };
export const RECIPES: Recipe[] = [
  { id: "ammo", name: "Pack Ammo", cost: { scrap: 3 }, gives: { ammo: 20 }, desc: "3 scrap → 20 rounds" },
  { id: "medkit", name: "Medkit", cost: { scrap: 6 }, gives: { medkits: 1 }, desc: "6 scrap → 1 medkit" },
  { id: "water", name: "Purify Water", cost: { scrap: 2 }, gives: { water: 1 }, desc: "2 scrap → 1 clean water" },
  { id: "food", name: "Cook Rations", cost: { scrap: 2 }, gives: { food: 1 }, desc: "2 scrap → 1 ration" },
  { id: "turret", name: "Auto-Turret", cost: { scrap: 15, ammo: 30 }, gives: { turrets: 1 }, desc: "15 scrap + 30 rounds → 1 turret (B to place)" },
];

export type ChallengeEv = "kill" | "loot" | "craft" | "build" | "headshot" | "job" | "boss" | "melee";
export type Challenge = { text: string; ev: ChallengeEv; need: number; xp: number; scrap: number };
export const CHALLENGES: Challenge[] = [
  { text: "Kill 30 enemies", ev: "kill", need: 30, xp: 120, scrap: 15 },
  { text: "Open 8 crates", ev: "loot", need: 8, xp: 100, scrap: 15 },
  { text: "Craft 3 items", ev: "craft", need: 3, xp: 80, scrap: 10 },
  { text: "Place 2 turrets", ev: "build", need: 2, xp: 90, scrap: 10 },
  { text: "Land 10 headshots", ev: "headshot", need: 10, xp: 130, scrap: 15 },
  { text: "Finish a side job", ev: "job", need: 1, xp: 110, scrap: 20 },
  { text: "Slay a Tyrant", ev: "boss", need: 1, xp: 300, scrap: 30 },
  { text: "Machete 8 enemies", ev: "melee", need: 8, xp: 120, scrap: 15 },
];
export const DAILY_CHALLENGE_COUNT = 4;
export function challengesForDay(day: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < DAILY_CHALLENGE_COUNT; i++) out.push((day * 3 + i * 2) % CHALLENGES.length);
  return [...new Set(out)];
}

export type ProfileT = z.output<typeof Profile>;
export type Achievement = { id: string; name: string; desc: string; test: (p: ProfileT) => boolean };
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-blood", name: "First Blood", desc: "Kill your first enemy.", test: (p) => p.kills >= 1 },
  { id: "slayer", name: "Dead Reckoning", desc: "Kill 100 enemies.", test: (p) => p.kills >= 100 },
  { id: "exterminator", name: "Exterminator", desc: "Kill 500 enemies.", test: (p) => p.kills >= 500 },
  { id: "scavenger", name: "Scavenger", desc: "Open 25 crates.", test: (p) => p.crates >= 25 },
  { id: "tourist", name: "Gulf Tour", desc: "Visit all four regions.", test: (p) => p.visited.length >= 4 },
  { id: "lvl5", name: "Seasoned", desc: "Reach level 5.", test: (p) => p.level >= 5 },
  { id: "lvl10", name: "Veteran", desc: "Reach level 10.", test: (p) => p.level >= 10 },
  { id: "tyrant", name: "Tyrant Slayer", desc: "Defeat a Tyrant.", test: (p) => p.bossKills >= 1 },
  { id: "all-tyrants", name: "Gulf Liberator", desc: "Defeat four Tyrants.", test: (p) => p.bossKills >= 4 },
  { id: "crafter", name: "Tinkerer", desc: "Craft 10 items.", test: (p) => p.crafted >= 10 },
  { id: "engineer", name: "Engineer", desc: "Place 5 turrets.", test: (p) => p.built >= 5 },
  { id: "jobs", name: "Odd Jobber", desc: "Finish 5 side jobs.", test: (p) => p.jobsDone >= 5 },
  { id: "dead", name: "Back From the Dead", desc: "Die and respawn.", test: (p) => p.deaths >= 1 },
  { id: "regular", name: "Regular", desc: "Claim a 3-day login streak.", test: (p) => p.daily.streak >= 3 },
  { id: "night", name: "Night Owl", desc: "Survive 3 nights.", test: (p) => p.nights >= 3 },
  { id: "missions", name: "Mission Complete", desc: "Finish a region's story.", test: (p) => p.main.some((s, i) => s >= MISSIONS[i]!.length) },
];
export const ACH_XP = 50;

export type DailyReward = { label: string; scrap?: number; ammo?: number; medkits?: number; food?: number; water?: number; xp?: number; turrets?: number };
export const DAILY_REWARDS: DailyReward[] = [
  { label: "20 scrap, 30 rounds", scrap: 20, ammo: 30 },
  { label: "2 medkits", medkits: 2 },
  { label: "3 rations, 3 water", food: 3, water: 3 },
  { label: "80 rounds", ammo: 80 },
  { label: "60 scrap", scrap: 60 },
  { label: "1 turret, 3 medkits", turrets: 1, medkits: 3 },
  { label: "300 XP, 100 scrap, 100 rounds", xp: 300, scrap: 100, ammo: 100 },
];

const n0 = z.number().int().nonnegative().default(0);
export const Profile = z.object({
  level: z.number().int().min(1).max(MAX_LEVEL).default(1),
  xp: n0,
  scrap: z.number().int().nonnegative().default(20),
  ammo: z.number().int().nonnegative().default(80),
  medkits: z.number().int().nonnegative().default(2),
  food: z.number().int().nonnegative().default(2),
  water: z.number().int().nonnegative().default(2),
  turrets: n0,
  kills: n0,
  bossKills: n0,
  crates: n0,
  crafted: n0,
  built: n0,
  deaths: n0,
  jobsDone: n0,
  nights: n0,
  visited: z.array(z.number().int()).default([]),
  main: z.array(z.number().int().nonnegative()).default([0, 0, 0, 0]),
  mainProg: z.array(z.number().int().nonnegative()).default([0, 0, 0, 0]),
  job: z.object({ id: z.string(), have: z.number().int().nonnegative() }).nullable().default(null),
  achievements: z.array(z.string()).default([]),
  daily: z.object({ last: z.number().int().default(-1), streak: z.number().int().nonnegative().default(0) }).default({ last: -1, streak: 0 }),
  chDay: z.number().int().default(-1),
  chProg: z.array(z.number().int().nonnegative()).default([]),
  chDone: z.array(z.number().int()).default([]),
});

export const xpNeed = (level: number) => 80 + level * 45;
export const maxHpFor = (level: number) => 100 + (level - 1) * 8;
export const dmgMult = (level: number) => 1 + (level - 1) * 0.05;
export const isNight = (t: number) => (t % DAY_LENGTH) / DAY_LENGTH >= DUSK;
export const dayNumber = (nowMs: number) => Math.floor(nowMs / 86_400_000);
