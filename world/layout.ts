import { REGIONS, REGION_HALF, type Pt } from "../data.ts";

/**
 * Pure, deterministic geometry for each region. Server and client both use it for
 * collision; scenery.ts turns the same data into meshes. Coordinates: metres, +y up,
 * the play area is the square |x|,|z| <= REGION_HALF. Spawn is at z=+75 looking toward -z.
 */

export type Style = "plain" | "balcony" | "tower" | "warehouse" | "shack" | "stilt";
export type Building = { x: number; z: number; w: number; d: number; h: number; color: string; style: Style; ruin: number; rot: number };
export type Circle = { x: number; z: number; r: number; h: number };
export type PropType = "car" | "lamp" | "rubble" | "barrel" | "deadtree" | "cypress" | "palm" | "mushroom" | "wreck" | "sandbag" | "bench";
export type Prop = { type: PropType; x: number; z: number; rot: number; s: number; color: string };
export type LandmarkType =
  | "cathedral" | "square" | "superdome" | "streetcar"
  | "stilts" | "hut" | "dock"
  | "rocket" | "astrodome" | "towers" | "freeway"
  | "hollywood" | "observatory" | "pier" | "ferris";
/** A landmark is drawn by scenery.ts around (x,z); `w`,`d` is its footprint, front faces +z unless `rot` (radians about +y) says otherwise. */
export type Landmark = { type: LandmarkType; x: number; z: number; rot: number; w: number; d: number };
export type Box = { x: number; z: number; w: number; d: number; h: number };

export type Layout = {
  region: number;
  half: number;
  buildings: Building[];
  props: Prop[];
  landmarks: Landmark[];
  /** Everything solid: building footprints and landmark solids (centered boxes, unrotated). */
  boxes: Box[];
  circles: Circle[];
  /** Shallow water pools (swamp): slow walking. Decor water elsewhere is not listed. */
  water: Circle[];
  lootSpots: Pt[];
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: Record<string, string[]> = {
  nola: ["#c9a27c", "#b8c4a0", "#d9a4a0", "#a9b8cf", "#e0c27a", "#9fb59a", "#c78d6e"],
  houston: ["#8b95a1", "#6f7b8a", "#a3acb7", "#59687a", "#8d8a85"],
  la: ["#d9c3a0", "#e3b9a0", "#b5c4c9", "#c9b1c9", "#e8dcb8", "#9fb0b8"],
  swamp: ["#5a4a36", "#6b5a40", "#4d4030"],
};

/** A per-owner memo of region layouts (keep one in a closure, not at module scope). */
export function makeLayouts() {
  const cache = new Map<number, Layout>();
  return (region: number): Layout => {
    let l = cache.get(region);
    if (!l) { l = buildLayout(region); cache.set(region, l); }
    return l;
  };
}

export function buildLayout(region: number): Layout {
  const def = REGIONS[region]!;
  const rnd = mulberry(1337 + region * 7919);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const L: Layout = { region, half: REGION_HALF, buildings: [], props: [], landmarks: [], boxes: [], circles: [], water: [], lootSpots: [] };
  /** Footprint exclusion discs so the street grid leaves room. */
  const ex: Array<Pt & { r: number }> = [{ ...def.spawn, r: 9 }, { ...def.boss, r: 12 }];
  const lm = (type: LandmarkType, x: number, z: number, w: number, d: number, rot = 0) => {
    L.landmarks.push({ type, x, z, rot, w, d });
  };
  const solid = (x: number, z: number, w: number, d: number, h: number) => L.boxes.push({ x, z, w, d, h });
  const col = (x: number, z: number, r: number, h: number) => L.circles.push({ x, z, r, h });
  const exclude = (x: number, z: number, r: number) => ex.push({ x, z, r });

  // ── landmarks (also fix collision) ──
  if (region === 0) {
    lm("cathedral", -21, -24, 26, 22); solid(-21, -24, 26, 22, 20); exclude(-21, -24, 8);
    lm("square", -21, 21, 28, 28); col(-21, 21, 1.6, 5); col(-21, 29, 1, 2); exclude(-21, 21, 8);
    lm("superdome", 63, -63, 48, 48); col(63, -63, 22, 22); exclude(63, -63, 30);
    lm("streetcar", -30, 42, 10, 3); solid(-30, 42, 10, 3, 3.5);
  } else if (region === 1) {
    lm("stilts", 30, 20, 20, 20); solid(26, 17, 6, 6, 4); solid(35, 23, 6, 6, 4); solid(26, 26, 5, 5, 4);
    lm("hut", -45, -30, 12, 12); solid(-45, -30, 10, 10, 8);
    lm("dock", 55, -55, 14, 10); solid(53, -55, 6, 2.5, 1.5);
  } else if (region === 2) {
    lm("rocket", 42, -42, 14, 14); col(42, -42, 3, 40); solid(34, -42, 2, 12, 20); exclude(42, -42, 6);
    lm("astrodome", -63, -63, 48, 48); col(-63, -63, 22, 22); exclude(-63, -63, 30);
    lm("towers", 0, 0, 24, 24); solid(-4, -4, 9, 9, 50); solid(6, 4, 8, 8, 34); solid(-6, 7, 7, 7, 24); exclude(0, 0, 10);
    lm("freeway", 0, 62, 176, 12);
    for (let x = -80; x <= 80; x += 16) col(x, 62, 1.1, 9);
  } else {
    lm("hollywood", 0, -92, 70, 6);
    lm("observatory", -63, -21, 26, 16); solid(-63, -21, 26, 16, 12); exclude(-63, -21, 8);
    lm("pier", 77, 42, 24, 12); exclude(63, 42, 10);
    lm("ferris", 56, 58, 18, 6); col(56, 58, 2, 18);
    // ocean wall east, with a gap for the pier
    solid(78, -26, 24, 120, 3); solid(78, 69, 24, 38, 3);
  }

  // ── street grid cities ──
  if (region !== 1) {
    const pal = PALETTES[def.key]!;
    for (const bx of [-63, -21, 21, 63]) {
      for (const bz of [-63, -21, 21, 63]) {
        const blocked = ex.some((e) => {
          const nx = Math.max(bx - 15, Math.min(e.x, bx + 15));
          const nz = Math.max(bz - 15, Math.min(e.z, bz + 15));
          return Math.hypot(nx - e.x, nz - e.z) < e.r;
        });
        if (blocked) continue;
        if (region === 3 && bx === 63 && (bz === 21 || bz === 63)) continue; // beach side
        if (rnd() < 0.12) {
          // empty lot / plaza with debris
          L.props.push({ type: "rubble", x: bx + (rnd() - 0.5) * 14, z: bz + (rnd() - 0.5) * 14, rot: rnd() * 6, s: 1.5 + rnd() * 1.5, color: "#6d6a63" });
          continue;
        }
        const count = rnd() < 0.5 ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const w = count === 1 ? 20 + rnd() * 8 : 12 + rnd() * 3;
          const d = count === 1 ? 18 + rnd() * 10 : 24 + rnd() * 4;
          const ox = count === 1 ? 0 : (i === 0 ? -8 : 8);
          let h = 8 + rnd() * 8;
          let style: Style = "plain";
          if (region === 0) { style = rnd() < 0.7 ? "balcony" : "plain"; h = 7 + rnd() * 7; }
          else if (region === 2) { style = rnd() < 0.55 ? "tower" : "warehouse"; h = style === "tower" ? 24 + rnd() * 40 : 8 + rnd() * 6; }
          else { style = rnd() < 0.25 ? "tower" : "plain"; h = style === "tower" ? 22 + rnd() * 18 : 6 + rnd() * 9; }
          const b: Building = { x: bx + ox, z: bz + (rnd() - 0.5) * 4, w, d, h, color: pick(pal), style, ruin: rnd(), rot: 0 };
          L.buildings.push(b);
          solid(b.x, b.z, b.w, b.d, b.h);
        }
      }
    }
    // street dressing
    for (let i = 0; i < 44; i++) {
      const alongX = rnd() < 0.5;
      const line = pick([-84, -42, 0, 42, 84]);
      const t = (rnd() * 2 - 1) * 82;
      const off = (rnd() - 0.5) * 7;
      const x = alongX ? t : line + off;
      const z = alongX ? line + off : t;
      if (!free(L, x, z, 3) || Math.hypot(x - def.spawn.x, z - def.spawn.z) < 6) continue;
      L.props.push({ type: "car", x, z, rot: (alongX ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.5, s: 1, color: pick(["#7a2e2e", "#2e4a7a", "#d0c9b0", "#3b3b3b", "#7a6a2e", "#4a6a4e"]) });
      col(x, z, 1.7, 1.8);
    }
    for (let i = 0; i < 30; i++) {
      const x = (rnd() * 2 - 1) * 84, z = (rnd() * 2 - 1) * 84;
      if (!free(L, x, z, 2)) continue;
      L.props.push({ type: pick(["barrel", "rubble", "lamp", "sandbag"] as const), x, z, rot: rnd() * 6, s: 0.8 + rnd() * 0.8, color: "#7a7468" });
    }
    if (region === 3) {
      for (let i = 0; i < 26; i++) {
        const x = (rnd() * 2 - 1) * 64, z = (rnd() * 2 - 1) * 84;
        if (!free(L, x, z, 2)) continue;
        L.props.push({ type: "palm", x, z, rot: rnd() * 6, s: 0.9 + rnd() * 0.5, color: "#3f7a3a" });
        col(x, z, 0.5, 10);
      }
    }
    if (region === 0) {
      for (let i = 0; i < 10; i++) {
        const x = (rnd() * 2 - 1) * 84, z = (rnd() * 2 - 1) * 84;
        if (!free(L, x, z, 2)) continue;
        L.props.push({ type: "deadtree", x, z, rot: rnd() * 6, s: 1 + rnd() * 0.6, color: "#4d4338" });
        col(x, z, 0.6, 7);
      }
    }
  } else {
    // swamp: pools, cypress, stilt shacks, mushrooms
    for (let i = 0; i < 16; i++) {
      const x = (rnd() * 2 - 1) * 76, z = (rnd() * 2 - 1) * 76;
      const r = 6 + rnd() * 9;
      if (ex.some((e) => Math.hypot(x - e.x, z - e.z) < r + e.r + 6)) continue;
      if (L.landmarks.some((m) => Math.hypot(x - m.x, z - m.z) < r + 14)) continue;
      L.water.push({ x, z, r, h: 0 });
    }
    for (let i = 0; i < 70; i++) {
      const x = (rnd() * 2 - 1) * 86, z = (rnd() * 2 - 1) * 86;
      if (!free(L, x, z, 2) || Math.hypot(x - def.spawn.x, z - def.spawn.z) < 7) continue;
      L.props.push({ type: "cypress", x, z, rot: rnd() * 6, s: 0.8 + rnd() * 0.9, color: "#3d4a2a" });
      col(x, z, 0.9, 12);
    }
    for (let i = 0; i < 30; i++) {
      const x = (rnd() * 2 - 1) * 86, z = (rnd() * 2 - 1) * 86;
      if (!free(L, x, z, 1.5)) continue;
      L.props.push({ type: pick(["mushroom", "wreck", "barrel", "rubble"] as const), x, z, rot: rnd() * 6, s: 0.8 + rnd() * 1, color: "#8a6bd0" });
    }
    for (const [x, z, w, d] of [[-60, 40, 8, 7], [-20, 55, 7, 7], [10, -50, 8, 8], [-10, -10, 7, 7], [70, 50, 7, 7]] as const) {
      L.buildings.push({ x, z, w, d, h: 4, color: "#6b5a40", style: "stilt", ruin: rnd(), rot: 0 });
      solid(x, z, w, d, 6);
    }
  }

  // ── loot spots: free ground, spread out ──
  let guard = 0;
  while (L.lootSpots.length < 40 && guard++ < 4000) {
    const x = (rnd() * 2 - 1) * 82, z = (rnd() * 2 - 1) * 82;
    if (!free(L, x, z, 1.5)) continue;
    if (inWater(L, x, z)) continue;
    if (Math.hypot(x - def.spawn.x, z - def.spawn.z) < 10) continue;
    if (L.lootSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 12)) continue;
    L.lootSpots.push({ x, z });
  }
  return L;
}

function free(L: Layout, x: number, z: number, m: number) {
  for (const b of L.boxes) if (Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m) return false;
  for (const c of L.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return false;
  return true;
}

export function inWater(L: Layout, x: number, z: number) {
  for (const w of L.water) if (Math.hypot(x - w.x, z - w.z) < w.r) return true;
  return false;
}

/** Push a circle of radius `rad` out of every solid and back inside the play area. */
export function resolve(L: Layout, pos: Pt, rad: number): Pt {
  let { x, z } = pos;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of L.boxes) {
      const hx = b.w / 2 + rad, hz = b.d / 2 + rad;
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = b.x + Math.sign(dx || 1) * hx;
        else z = b.z + Math.sign(dz || 1) * hz;
      }
    }
    for (const c of L.circles) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const m = c.r + rad;
      if (d < m) {
        const k = d > 1e-4 ? m / d : 0;
        if (k) { x = c.x + dx * k; z = c.z + dz * k; } else x = c.x + m;
      }
    }
  }
  const lim = L.half - rad;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}

/** Distance along a 3D ray (direction need not be normalised) to the first solid, or `max`. */
export function rayBlock(L: Layout, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  let best = max;
  for (const b of L.boxes) {
    let t0 = 0, t1 = best;
    const axes: Array<[number, number, number, number]> = [
      [ox, dx, b.x - b.w / 2, b.x + b.w / 2],
      [oy, dy, 0, b.h],
      [oz, dz, b.z - b.d / 2, b.z + b.d / 2],
    ];
    let ok = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-6) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 < best) best = t0;
  }
  for (const c of L.circles) {
    // horizontal circle test, then check height at the hit
    const fx = ox - c.x, fz = oz - c.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) continue;
    const bq = fx * dx + fz * dz;
    const disc = bq * bq - a * (fx * fx + fz * fz - c.r * c.r);
    if (disc < 0) continue;
    const t = (-bq - Math.sqrt(disc)) / a;
    if (t > 0 && t < best && oy + dy * t >= 0 && oy + dy * t <= c.h) best = t;
  }
  if (dy < 0) {
    const t = -oy / dy; // ground
    if (t > 0 && t < best) best = t;
  }
  return best;
}
