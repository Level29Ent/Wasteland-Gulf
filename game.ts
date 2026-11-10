import { defineGame, defineProtocol, defineTrait } from "@trhs/wildwood";
import { defineReplication, replicated } from "@trhs/wildwood/replicate";
import { z } from "zod";
import { Profile } from "./data.ts";

const PoseShape = z.object({ x: z.number(), z: z.number(), heading: z.number(), speed: z.number(), aim: z.boolean() });
export const Pose = defineTrait("gulf.pose", PoseShape);
export const Mover = defineTrait("gulf.mover", PoseShape);

export const KIND_PLAYER = 0;
export const KIND_FOE = 1;
export const KIND_CRATE = 2;
export const KIND_TURRET = 3;

export const BodyShape = z.object({
    region: z.number().int(),
    kind: z.number().int(),
    sub: z.number().int(),
    hp: z.number(),
    maxHp: z.number(),
    state: z.number().int(),
    name: z.string(),
    color: z.string(),
});
export const Body = defineTrait("gulf.body", BodyShape);

const P3 = { x: z.number(), y: z.number(), z: z.number() };
export const Sync = defineReplication(
  "gulf",
  {
    pose: replicated(Pose, { writer: "owner", decimals: 2 }),
    mover: replicated(Mover, { decimals: 2 }),
    body: replicated(Body),
  },
  {
    shot: z.object({ region: z.number().int(), ...P3, tx: z.number(), ty: z.number(), tz: z.number(), w: z.number().int() }),
    hit: z.object({ region: z.number().int(), ...P3, n: z.number(), crit: z.boolean() }),
    died: z.object({ region: z.number().int(), ...P3, kind: z.number().int() }),
    crate: z.object({ region: z.number().int(), x: z.number(), z: z.number() }),
    hurt: z.object({ region: z.number().int(), ...P3 }),
  },
);

export const StateMsg = z.object({
  profile: Profile,
  region: z.number().int(),
  hp: z.number(),
  maxHp: z.number(),
  hunger: z.number(),
  thirst: z.number(),
  weapon: z.number().int(),
  down: z.boolean(),
  respawnIn: z.number(),
  time: z.number(),
  nightsNote: z.boolean(),
  tpN: z.number().int(),
  tpX: z.number(),
  tpZ: z.number(),
  players: z.number().int(),
  foes: z.number().int(),
  today: z.number().int(),
  canClaim: z.boolean(),
});

export const Net = defineProtocol("gulf", {
  toServer: {
    fire: z.object({ ox: z.number(), oy: z.number(), oz: z.number(), dx: z.number(), dy: z.number(), dz: z.number() }),
    melee: z.object({}),
    act: z.object({ a: z.enum(["interact", "medkit", "food", "water", "turret"]) }),
    weapon: z.object({ i: z.number().int().min(0).max(2) }),
    travel: z.object({ region: z.number().int().min(0).max(3) }),
    craft: z.object({ id: z.string().max(24) }),
    job: z.object({ id: z.string().max(8) }),
    daily: z.object({}),
    respawn: z.object({}),
  },
  toClient: {
    state: StateMsg,
    toast: z.object({ text: z.string() }),
  },
});

export const game = defineGame({
  name: "Wasteland Gulf",
  tickRate: 30,
  protocols: [Net, Sync.protocol],
});
