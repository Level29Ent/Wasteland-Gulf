import * as THREE from "three";
import { FOES } from "../data";

/*
 * Look: chunky flat-shaded low-poly "blocky post-apocalypse" figures. Boxes/cones/ellipsoids on
 * per-limb pivots, dusty desaturated palette with saturated glow accents (eyes, sacs, core).
 * Geometry is shared module-wide; each figure owns a tiny set of cloned materials (hit flash).
 */

export type Figure = {
  group: THREE.Group;
  update(dt: number, speed: number, attacking: boolean, aiming: boolean): void;
  flash(): void;
  setDown(down: boolean): void;
  dispose(): void;
};

// ───────────── shared geometry (never disposed) ─────────────
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
const G_CONE = new THREE.CylinderGeometry(0, 0.5, 1, 5);
const G_BALL = new THREE.SphereGeometry(0.5, 8, 6);

type Col = number;
type Parent = THREE.Object3D;

class Builder {
  mats = new Map<string, THREE.MeshStandardMaterial>();
  flashable: THREE.MeshStandardMaterial[] = [];
  root = new THREE.Group();
  mat(c: Col, glow = 0): THREE.MeshStandardMaterial {
    const k = c + "|" + glow;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, metalness: 0.05 });
      if (glow > 0) {
        m.emissive.setHex(c);
        m.emissiveIntensity = glow;
      } else this.flashable.push(m);
      this.mats.set(k, m);
    }
    return m;
  }
  private put(g: THREE.BufferGeometry, p: Parent, w: number, h: number, d: number, c: Col, x: number, y: number, z: number, glow = 0) {
    const m = new THREE.Mesh(g, this.mat(c, glow));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    p.add(m);
    return m;
  }
  box(p: Parent, w: number, h: number, d: number, c: Col, x = 0, y = 0, z = 0, glow = 0) {
    return this.put(G_BOX, p, w, h, d, c, x, y, z, glow);
  }
  cyl(p: Parent, w: number, h: number, d: number, c: Col, x = 0, y = 0, z = 0, glow = 0) {
    return this.put(G_CYL, p, w, h, d, c, x, y, z, glow);
  }
  cone(p: Parent, w: number, h: number, d: number, c: Col, x = 0, y = 0, z = 0, glow = 0) {
    return this.put(G_CONE, p, w, h, d, c, x, y, z, glow);
  }
  ball(p: Parent, w: number, h: number, d: number, c: Col, x = 0, y = 0, z = 0, glow = 0) {
    return this.put(G_BALL, p, w, h, d, c, x, y, z, glow);
  }
  pivot(p: Parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    p.add(g);
    return g;
  }
  /** pivot at top, box hangs down */
  limb(p: Parent, x: number, y: number, z: number, w: number, len: number, d: number, c: Col) {
    const pv = this.pivot(p, x, y, z);
    this.box(pv, w, len, d, c, 0, -len / 2, 0);
    return pv;
  }
}

type S = { t: number; ph: number; amp: number; speed: number; atk: number; wind: number; strike: number; aim: number; u: number };
type Anim = (s: S) => void;
type Built = { anim: Anim; period?: number; down?: number };

type Core = Figure & { _b: Builder };

function make(scale: number, build: (b: Builder) => Built, freq = 1.6): Core {
  const b = new Builder();
  const group = new THREE.Group();
  const inner = b.root;
  group.add(inner);
  group.scale.setScalar(scale);
  const built = build(b);
  const period = built.period ?? 0.9;
  const s: S = { t: Math.random() * 10, ph: Math.random() * 6, amp: 0, speed: 0, atk: 0, wind: 0, strike: 0, aim: 0, u: 0 };
  let atkT = 0, flashT = 0, down = 0, downTarget = 0;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    group,
    _b: b,
    update(dt, speed, attacking, aiming) {
      dt = Math.min(dt, 0.1);
      s.t += dt;
      s.speed = speed;
      s.ph += dt * (2 + speed * freq);
      s.amp += (clamp01(speed / 3) - s.amp) * Math.min(1, dt * 8);
      s.atk += ((attacking ? 1 : 0) - s.atk) * Math.min(1, dt * 12);
      atkT = attacking ? atkT + dt : 0;
      s.u = (atkT % period) / period;
      const w = s.u < 0.55 ? s.u / 0.55 : clamp01(1 - (s.u - 0.55) / 0.1);
      s.wind = w * s.atk;
      s.strike = (s.u >= 0.55 ? 1 - (s.u - 0.55) / 0.45 : 0) * s.atk;
      s.aim += ((aiming ? 1 : 0) - s.aim) * Math.min(1, dt * 10);
      down += (downTarget - down) * Math.min(1, dt * 6);
      const dw = 1 - down;
      s.amp *= dw;
      s.wind *= dw;
      s.strike *= dw;
      built.anim(s);
      inner.position.z = s.strike * 0.25;
      inner.rotation.x = -down * Math.PI / 2;
      inner.position.y = down * 0.2;
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt);
        const f = flashT / 0.16;
        for (const m of b.flashable) m.emissive.setRGB(f, f * 0.45, f * 0.4), (m.emissiveIntensity = 1);
      }
    },
    flash() {
      flashT = 0.16;
      for (const m of b.flashable) m.emissive.setRGB(1, 0.45, 0.4), (m.emissiveIntensity = 1);
    },
    setDown(d) {
      downTarget = d ? 1 : 0;
    },
    dispose() {
      for (const m of b.mats.values()) m.dispose();
      b.mats.clear();
      group.removeFromParent();
    },
  };
}

// ───────────── humanoid rig ─────────────
type HOpts = { sw?: number; tH?: number; tD?: number; legL?: number; legW?: number; armL?: number; armW?: number; head?: number; skin: Col; shirt: Col; pants: Col; shoe: Col };
type Hum = { torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; o: Required<HOpts>; torsoMesh: THREE.Mesh; headMesh: THREE.Mesh };

function humanoid(b: Builder, o0: HOpts): Hum {
  const o = { sw: 0.5, tH: 0.65, tD: 0.3, legL: 0.85, legW: 0.2, armL: 0.7, armW: 0.16, head: 0.3, ...o0 } as Required<HOpts>;
  const torso = b.pivot(b.root, 0, o.legL, 0);
  const torsoMesh = b.box(torso, o.sw, o.tH, o.tD, o.shirt, 0, o.tH / 2, 0);
  const sx = o.sw / 2 + o.armW / 2 + 0.02;
  const armL = b.limb(torso, -sx, o.tH - 0.08, 0, o.armW, o.armL * 0.78, o.armW, o.shirt);
  b.box(armL, o.armW * 0.95, o.armL * 0.24, o.armW * 0.95, o.skin, 0, -o.armL * 0.78 - o.armL * 0.12, 0);
  const armR = b.limb(torso, sx, o.tH - 0.08, 0, o.armW, o.armL * 0.78, o.armW, o.shirt);
  b.box(armR, o.armW * 0.95, o.armL * 0.24, o.armW * 0.95, o.skin, 0, -o.armL * 0.78 - o.armL * 0.12, 0);
  const head = b.pivot(torso, 0, o.tH, 0);
  const headMesh = b.box(head, o.head, o.head, o.head * 0.95, o.skin, 0, o.head / 2 + 0.03, 0);
  const lx = o.sw / 4 + 0.02;
  const mkLeg = (x: number) => {
    const l = b.limb(b.root, x, o.legL, 0, o.legW, o.legL - 0.1, o.legW, o.pants);
    b.box(l, o.legW + 0.04, 0.12, o.legW + 0.16, o.shoe, 0, -o.legL + 0.06, 0.05);
    return l;
  };
  return { torso, head, armL, armR, legL: mkLeg(-lx), legR: mkLeg(lx), o, torsoMesh, headMesh };
}

function gait(h: Hum, s: S, legAmt = 0.8) {
  const sw = Math.sin(s.ph) * s.amp;
  h.legL.rotation.x = sw * legAmt;
  h.legR.rotation.x = -sw * legAmt;
  return sw;
}
const breathe = (s: S) => Math.sin(s.t * 2) * 0.015;
const eyes = (b: Builder, head: Parent, hs: number, col: Col, glow = 2, z = 0.5) => {
  b.box(head, hs * 0.18, hs * 0.12, 0.03, col, -hs * 0.22, hs * 0.58, hs * z, glow);
  b.box(head, hs * 0.18, hs * 0.12, 0.03, col, hs * 0.22, hs * 0.58, hs * z, glow);
};
const smooth = (a: number, b: number, k: number) => a + (b - a) * k;

// ───────────── weapons (barrel along +z, grip at origin) ─────────────
function buildGun(b: Builder, i: number): THREE.Group {
  const g = new THREE.Group();
  const dark = 0x2b2d30, steel = 0x6b6f75, wood = 0x6a4a2a;
  if (i === 0) {
    b.box(g, 0.06, 0.1, 0.07, wood, 0, -0.04, -0.03);
    b.box(g, 0.06, 0.08, 0.16, steel, 0, 0.04, 0.05);
    b.cyl(g, 0.08, 0.1, 0.08, dark, 0, 0.04, 0.1).rotation.x = Math.PI / 2;
    b.box(g, 0.04, 0.05, 0.22, dark, 0, 0.05, 0.22);
  } else if (i === 1) {
    b.box(g, 0.07, 0.1, 0.3, wood, 0, -0.01, -0.22);
    b.box(g, 0.07, 0.09, 0.28, steel, 0, 0.03, 0.1);
    b.box(g, 0.06, 0.06, 0.4, dark, 0, 0.03, 0.42);
    b.box(g, 0.09, 0.07, 0.18, wood, 0, -0.03, 0.35);
  } else {
    b.box(g, 0.07, 0.12, 0.34, dark, 0, 0.02, -0.18);
    b.box(g, 0.08, 0.12, 0.4, 0x4a5240, 0, 0.04, 0.12);
    b.box(g, 0.05, 0.2, 0.08, dark, 0, -0.12, 0.1);
    b.box(g, 0.04, 0.04, 0.4, dark, 0, 0.05, 0.5);
    b.box(g, 0.03, 0.05, 0.05, dark, 0, 0.11, 0.55);
  }
  return g;
}

// ───────────── player ─────────────
export function createPlayerFigure(bodyColor: string, weapon: number): Figure & { setWeapon(i: number): void } {
  const jacket = new THREE.Color(bodyColor).getHex();
  const guns: THREE.Group[] = [];
  let cur = weapon;
  const fig = make(1, (b) => {
    const h = humanoid(b, { skin: 0xd9a77e, shirt: jacket, pants: 0x3b4251, shoe: 0x33261c, sw: 0.52, head: 0.3 });
    // head: bandana + cap
    b.box(h.head, 0.33, 0.09, 0.32, 0xb8302a, 0, 0.12, 0);
    b.box(h.head, 0.08, 0.08, 0.06, 0xb8302a, 0.1, 0.1, -0.2);
    b.box(h.head, 0.34, 0.07, 0.33, 0x2e3a2c, 0, 0.35, 0);
    b.box(h.head, 0.3, 0.03, 0.14, 0x2e3a2c, 0, 0.32, 0.22);
    b.box(h.head, 0.05, 0.04, 0.03, 0x1a1a1a, -0.07, 0.2, 0.15);
    b.box(h.head, 0.05, 0.04, 0.03, 0x1a1a1a, 0.07, 0.2, 0.15);
    // jacket details
    b.box(h.torso, 0.54, 0.08, 0.32, 0x2a2118, 0, 0.05, 0);
    b.box(h.torso, 0.2, 0.2, 0.06, 0x3a3328, 0, 0.35, 0.17);
    b.box(h.torso, 0.55, 0.1, 0.34, 0x3a3328, 0, 0.58, 0);
    // backpack + bedroll
    b.box(h.torso, 0.4, 0.5, 0.22, 0x5b6b3a, 0, 0.36, -0.26);
    b.box(h.torso, 0.3, 0.14, 0.06, 0x3c4726, 0, 0.3, -0.39);
    b.cyl(h.torso, 0.14, 0.46, 0.14, 0x8a7a55, 0, 0.66, -0.28).rotation.z = Math.PI / 2;
    // weapons in right hand
    const hand = b.pivot(h.armR, 0, -h.o.armL + 0.02, 0.02);
    for (let i = 0; i < 3; i++) {
      const g = buildGun(b, i);
      g.visible = i === cur;
      hand.add(g);
      guns.push(g);
    }
    return {
      anim(s) {
        const sw = gait(h, s, 0.8);
        const a = s.aim;
        h.armR.rotation.x = smooth(0.5 * sw - 0.4, -Math.PI / 2 + 0.05, a);
        h.armR.rotation.z = smooth(0, 0.03, a);
        h.armL.rotation.x = smooth(-0.8 * sw, -1.35, a);
        h.armL.rotation.z = smooth(0, -0.32, a);
        const phi = h.armR.rotation.x + Math.PI / 2;
        for (const g of guns) g.rotation.x = Math.PI / 2 - phi * 0.6;
        h.torso.rotation.y = a * 0.25;
        h.torso.rotation.x = 0.04 + s.amp * 0.08;
        h.torso.scale.y = 1 + breathe(s);
        h.head.rotation.y = -a * 0.25;
        h.torso.position.y = h.o.legL + Math.abs(Math.sin(s.ph)) * 0.04 * s.amp;
      },
    };
  }, 1.2) as Core & { setWeapon(i: number): void };
  fig.setWeapon = (i: number) => {
    cur = i;
    guns.forEach((g, k) => (g.visible = k === i));
  };
  return fig;
}

// ───────────── foes ─────────────
function walker(b: Builder): Built {
  const h = humanoid(b, { skin: 0x7f8c6c, shirt: 0x6b5a45, pants: 0x3a3e4a, shoe: 0x2a2420, sw: 0.5, head: 0.3 });
  eyes(b, h.head, 0.3, 0xd8d8a0, 0.6);
  b.box(h.head, 0.12, 0.08, 0.04, 0x3a1010, 0.05, 0.12, 0.15);
  b.box(h.torso, 0.18, 0.3, 0.32, 0x4d3f30, -0.22, 0.2, 0.01); // torn flap
  b.box(h.torso, 0.14, 0.12, 0.31, 0x7a1d1d, 0.12, 0.3, 0.01); // blood
  b.box(h.legL, 0.22, 0.2, 0.22, 0x5a2a2a, 0, -0.5, 0.02);
  return {
    anim(s) {
      const sw = gait(h, s, 0.55);
      h.torso.rotation.x = 0.4 + Math.sin(s.t * 1.3) * 0.04 + s.wind * -0.25 + s.strike * 0.4;
      h.head.rotation.x = 0.25 + Math.sin(s.t * 0.9) * 0.1;
      h.head.rotation.z = Math.sin(s.t * 0.7) * 0.18;
      const lift = -1.3 - s.wind * 0.5 + s.strike * 0.35;
      h.armL.rotation.x = lift + sw * 0.15;
      h.armR.rotation.x = lift - sw * 0.15 + Math.sin(s.t * 1.1) * 0.08;
      h.armL.rotation.z = 0.12;
      h.armR.rotation.z = -0.12;
      h.legR.rotation.x *= 0.7;
    },
  };
}

function runner(b: Builder): Built {
  const h = humanoid(b, { skin: 0xb0b8a0, shirt: 0x8a3a30, pants: 0x4a4a52, shoe: 0x3a3a3a, sw: 0.38, tD: 0.22, legW: 0.15, armW: 0.11, armL: 0.78, head: 0.27, legL: 0.9, tH: 0.62 });
  eyes(b, h.head, 0.27, 0xffe21a, 3);
  b.box(h.head, 0.16, 0.07, 0.04, 0x2a0a0a, 0, 0.1, 0.13); // open jaw
  for (let i = 0; i < 3; i++) b.box(h.torso, 0.4, 0.025, 0.24, 0x2a2a2a, 0, 0.18 + i * 0.12, 0); // ribs
  return {
    anim(s) {
      const sw = gait(h, s, 1.2);
      const run = s.amp;
      h.torso.rotation.x = 0.25 + run * 0.4 + s.wind * -0.3 + s.strike * 0.3;
      h.head.rotation.x = -run * 0.3 + Math.sin(s.t * 12) * 0.05 * run;
      h.armL.rotation.x = -sw * 1.3 - 0.2 - s.wind * 1.0 - s.strike * 0.5;
      h.armR.rotation.x = sw * 1.3 - 0.2 - s.wind * 1.0 - s.strike * 0.5;
      h.armL.rotation.z = 0.15;
      h.armR.rotation.z = -0.15;
      h.torso.position.y = h.o.legL + Math.abs(Math.sin(s.ph)) * 0.06 * run;
      h.torso.rotation.z = Math.sin(s.ph) * 0.08 * run;
    },
  };
}

function brute(b: Builder): Built {
  const h = humanoid(b, { skin: 0x8a7a6a, shirt: 0x5a5148, pants: 0x3a3430, shoe: 0x241f1b, sw: 0.85, tH: 0.7, tD: 0.5, legL: 0.75, legW: 0.3, armW: 0.24, armL: 0.7, head: 0.24 });
  eyes(b, h.head, 0.24, 0xff5a1a, 2.5);
  b.box(h.head, 0.26, 0.07, 0.04, 0x1a1210, 0, 0.1, 0.12);
  // scrap plates
  const rust = 0x7a4a2a, metal = 0x6a6e72;
  b.box(h.torso, 0.5, 0.4, 0.06, metal, -0.1, 0.38, 0.28);
  b.box(h.torso, 0.3, 0.3, 0.06, rust, 0.2, 0.25, 0.28).rotation.z = 0.2;
  b.box(h.torso, 0.9, 0.3, 0.1, rust, 0, 0.5, -0.27);
  b.box(h.torso, 0.35, 0.14, 0.4, metal, -0.55, 0.64, 0);
  b.box(h.torso, 0.35, 0.14, 0.4, rust, 0.55, 0.64, 0);
  b.cone(h.torso, 0.1, 0.25, 0.1, 0x3a3a3a, -0.55, 0.78, 0);
  // tumours
  b.ball(h.torso, 0.3, 0.26, 0.28, 0xb06a68, 0.34, 0.12, 0.2);
  b.ball(h.torso, 0.22, 0.22, 0.22, 0x9a5a7a, -0.38, 0.5, -0.2);
  b.ball(h.head, 0.16, 0.14, 0.16, 0xb06a68, -0.1, 0.25, 0.05);
  // oversized right arm: scale the whole pivot
  h.armR.scale.set(1.9, 1.35, 1.9);
  h.armR.position.x += 0.18;
  b.ball(h.armR, 0.34, 0.34, 0.34, 0x7a5a50, 0, -0.9, 0);
  b.box(h.armR, 0.32, 0.12, 0.32, metal, 0, -0.1, 0);
  return {
    period: 1.3,
    anim(s) {
      const sw = gait(h, s, 0.5);
      h.torso.rotation.x = 0.25 + s.wind * -0.25 + s.strike * 0.5;
      h.torso.rotation.z = Math.sin(s.ph) * 0.05 * s.amp;
      h.torso.scale.y = 1 + breathe(s) * 2;
      h.head.rotation.x = 0.2;
      h.armL.rotation.x = -sw * 0.5 - 0.15;
      h.armR.rotation.x = sw * 0.3 - 0.05 + s.wind * -2.9 + s.strike * 3.0;
      h.armR.rotation.z = -0.1 + s.wind * 0.1;
      h.torso.position.y = h.o.legL + Math.abs(Math.sin(s.ph)) * 0.05 * s.amp;
    },
  };
}

function spitter(b: Builder): Built {
  const h = humanoid(b, { skin: 0x4f7a3a, shirt: 0x3a4a2a, pants: 0x2a3a2a, shoe: 0x1d2a1a, sw: 0.46, tD: 0.28, head: 0.3 });
  eyes(b, h.head, 0.3, 0xb6ff3a, 2.5);
  const sac = b.ball(h.head, 0.34, 0.34, 0.3, 0x7dff4a, 0, -0.04, 0.14, 1.4);
  const sacGlow = b.mat(0x7dff4a, 1.4);
  b.ball(h.head, 0.12, 0.12, 0.12, 0xd0ff90, 0.08, 0.0, 0.3, 1.8);
  // tendrils
  const tend: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const t = b.limb(h.head, -0.12 + i * 0.08, 0.02, 0.15, 0.04, 0.35, 0.04, 0x2f5a2a);
    tend.push(t);
  }
  // spore pods on back
  for (let i = 0; i < 3; i++) b.ball(h.torso, 0.2, 0.2, 0.2, 0xa8e050, -0.14 + i * 0.14, 0.35 + (i % 2) * 0.15, -0.22, 0.9);
  b.ball(h.torso, 0.22, 0.2, 0.2, 0x6a8a3a, 0.2, 0.55, -0.1);
  return {
    period: 1.6,
    anim(s) {
      const sw = gait(h, s, 0.6);
      h.torso.rotation.x = 0.35 - s.wind * 0.75 + s.strike * 0.6;
      h.head.rotation.x = 0.1 - s.wind * 0.5 + s.strike * 0.7;
      h.armL.rotation.x = -0.4 - sw * 0.4 - s.wind * 0.6;
      h.armR.rotation.x = -0.4 + sw * 0.4 - s.wind * 0.6;
      h.armL.rotation.z = 0.25;
      h.armR.rotation.z = -0.25;
      const pulse = 1 + Math.sin(s.t * 3) * 0.06 + s.wind * 0.5;
      sac.scale.set(0.34 * pulse, 0.34 * pulse, 0.3 * pulse);
      sacGlow.emissiveIntensity = 1.2 + s.wind * 1.8 + Math.sin(s.t * 3) * 0.3;
      tend.forEach((t, i) => {
        t.rotation.x = Math.sin(s.t * 3 + i) * 0.35 + s.amp * 0.3;
        t.rotation.z = Math.cos(s.t * 2.3 + i * 1.7) * 0.3;
      });
    },
  };
}

function gator(b: Builder): Built {
  const dk = 0x1f3a22, gr = 0x3f6a34, belly = 0x8a9a5a;
  const body = b.pivot(b.root, 0, 0, 0);
  b.box(body, 0.62, 0.34, 0.8, gr, 0, 0.53, 0);
  b.box(body, 0.5, 0.06, 0.78, dk, 0, 0.72, 0);
  b.box(body, 0.54, 0.08, 0.7, belly, 0, 0.35, 0);
  for (let i = 0; i < 4; i++) b.cone(body, 0.1, 0.12, 0.1, dk, 0, 0.8, -0.28 + i * 0.2);
  const neck = b.pivot(body, 0, 0.55, 0.4);
  b.box(neck, 0.4, 0.26, 0.3, gr, 0, 0, 0.1);
  b.box(neck, 0.34, 0.15, 0.62, gr, 0, 0.04, 0.4); // upper jaw
  for (let i = 0; i < 4; i++) b.cone(neck, 0.04, 0.07, 0.04, 0xeeeedd, i % 2 ? 0.15 : -0.15, -0.06, 0.28 + i * 0.1).rotation.x = Math.PI;
  b.box(neck, 0.12, 0.1, 0.12, dk, -0.14, 0.14, 0.2);
  b.box(neck, 0.12, 0.1, 0.12, dk, 0.14, 0.14, 0.2);
  b.box(neck, 0.07, 0.07, 0.07, 0xffdd1a, -0.15, 0.17, 0.25, 3);
  b.box(neck, 0.07, 0.07, 0.07, 0xffdd1a, 0.15, 0.17, 0.25, 3);
  const jaw = b.pivot(neck, 0, -0.06, 0.12);
  b.box(jaw, 0.32, 0.08, 0.58, belly, 0, -0.02, 0.28);
  for (let i = 0; i < 4; i++) b.cone(jaw, 0.04, 0.07, 0.04, 0xeeeedd, i % 2 ? 0.14 : -0.14, 0.05, 0.2 + i * 0.1);
  const tail: THREE.Group[] = [];
  let par: Parent = body;
  let pz = -0.4;
  for (let i = 0; i < 3; i++) {
    const t = b.pivot(par, 0, i === 0 ? 0.5 : 0, pz);
    const w = 0.5 - i * 0.14;
    b.box(t, w, 0.28 - i * 0.07, 0.38, i % 2 ? dk : gr, 0, 0, -0.17);
    b.cone(t, 0.08, 0.1, 0.08, dk, 0, 0.17 - i * 0.04, -0.17);
    tail.push(t);
    par = t;
    pz = -0.35;
  }
  const legs: THREE.Group[] = [];
  const spots: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  for (const [sx, sz] of spots) {
    const l = b.limb(b.root, sx * 0.36, 0.42, sz * 0.26, 0.14, 0.42, 0.16, gr);
    b.box(l, 0.18, 0.06, 0.26, dk, 0, -0.4, 0.06);
    l.rotation.z = sx * 0.4;
    legs.push(l);
  }
  return {
    anim(s) {
      const sp = Math.min(s.speed / 4, 1.3);
      const ph = s.ph * 1.6;
      legs.forEach((l, i) => {
        const dir = i === 0 || i === 2 ? 1 : -1;
        l.rotation.x = Math.sin(ph) * dir * 0.9 * s.amp;
        l.rotation.z = spots[i]![0] * (0.4 + Math.max(0, Math.cos(ph) * dir) * 0.2 * s.amp);
      });
      body.position.y = Math.abs(Math.sin(ph)) * 0.03 * s.amp - s.wind * 0.08;
      body.rotation.y = Math.sin(ph) * 0.07 * sp;
      neck.rotation.x = -s.wind * 0.3 + s.strike * 0.2 + Math.sin(s.t * 1.5) * 0.03;
      tail.forEach((t, i) => {
        t.rotation.y = Math.sin(s.t * (2 + sp * 4) - i * 0.9) * (0.28 + sp * 0.25);
      });
      const snap = s.atk > 0.1 ? (s.u < 0.55 ? s.wind * 0.9 : 0.05) : Math.max(0, Math.sin(s.t * 0.7) - 0.9) * 2;
      jaw.rotation.x = snap;
    },
  };
}

function raider(b: Builder): Built {
  const h = humanoid(b, { skin: 0xc09070, shirt: 0x5c4630, pants: 0x3c3226, shoe: 0x1f1a16, sw: 0.56, tH: 0.66, head: 0.3 });
  const leather = 0x2e241c, spike = 0xa8aab0;
  // mask: hockey (odd) vs gas (even) chosen at random per instance
  if (Math.random() < 0.5) {
    b.box(h.head, 0.32, 0.34, 0.1, 0xe8e8e0, 0, 0.2, 0.15);
    b.box(h.head, 0.06, 0.04, 0.02, 0x111111, -0.07, 0.24, 0.21);
    b.box(h.head, 0.06, 0.04, 0.02, 0x111111, 0.07, 0.24, 0.21);
    b.box(h.head, 0.03, 0.03, 0.02, 0xaa2222, 0.09, 0.3, 0.21);
  } else {
    b.box(h.head, 0.32, 0.3, 0.12, 0x45483f, 0, 0.2, 0.15);
    b.cyl(h.head, 0.14, 0.16, 0.14, 0x2a2c28, 0, 0.12, 0.27).rotation.x = Math.PI / 2;
    b.box(h.head, 0.09, 0.07, 0.03, 0xff8a1a, -0.08, 0.26, 0.22, 1.2);
    b.box(h.head, 0.09, 0.07, 0.03, 0xff8a1a, 0.08, 0.26, 0.22, 1.2);
  }
  b.box(h.head, 0.33, 0.1, 0.3, leather, 0, 0.38, -0.02);
  b.box(h.torso, 0.58, 0.5, 0.34, leather, 0, 0.36, 0);
  b.box(h.torso, 0.1, 0.5, 0.36, 0x8a6a3a, 0.15, 0.36, 0);
  b.box(h.torso, 0.6, 0.08, 0.36, 0x1a1a1a, 0, 0.06, 0);
  for (const sx of [-1, 1]) {
    b.box(h.torso, 0.3, 0.12, 0.34, leather, sx * 0.36, 0.64, 0);
    b.cone(h.torso, 0.1, 0.3, 0.1, spike, sx * 0.4, 0.82, 0);
    b.cone(h.torso, 0.08, 0.22, 0.08, spike, sx * 0.3, 0.76, 0.14).rotation.x = 0.9;
    b.cone(h.torso, 0.08, 0.22, 0.08, spike, sx * 0.3, 0.76, -0.14).rotation.x = -0.9;
  }
  b.box(h.legL, 0.24, 0.3, 0.24, 0x1f1b17, 0, -0.5, 0);
  b.box(h.legR, 0.24, 0.3, 0.24, 0x1f1b17, 0, -0.5, 0);
  // rifle on right hand
  const hand = b.pivot(h.armR, 0, -h.o.armL + 0.02, 0.02);
  const gun = buildGun(b, 2);
  gun.scale.setScalar(1.05);
  hand.add(gun);
  const flash = b.box(gun, 0.2, 0.2, 0.2, 0xffd060, 0, 0.05, 0.85, 3);
  flash.visible = false;
  return {
    period: 1.1,
    anim(s) {
      const sw = gait(h, s, 0.75);
      const fire = s.atk > 0.3;
      const a = fire ? 1 : 0;
      h.armR.rotation.x = smooth(0.4 * sw - 0.5, -Math.PI / 2 + 0.05, s.atk);
      h.armL.rotation.x = smooth(-0.5 * sw, -1.4, s.atk);
      h.armL.rotation.z = smooth(0, -0.3, s.atk);
      const phi = h.armR.rotation.x + Math.PI / 2;
      gun.rotation.x = Math.PI / 2 - phi * 0.6;
      h.torso.rotation.y = s.atk * 0.3;
      h.torso.rotation.x = 0.1 + s.amp * 0.08 - s.strike * 0.08;
      h.head.rotation.y = -s.atk * 0.3;
      h.torso.position.y = h.o.legL + Math.abs(Math.sin(s.ph)) * 0.04 * s.amp;
      flash.visible = a > 0 && s.strike > 0.7;
      flash.rotation.z = s.t * 40;
    },
  };
}

function boss(b: Builder): Built {
  const h = humanoid(b, { skin: 0x6a5a66, shirt: 0x3e3a40, pants: 0x2a2630, shoe: 0x1a171c, sw: 1.0, tH: 0.8, tD: 0.55, legL: 0.8, legW: 0.34, armW: 0.3, armL: 0.8, head: 0.3 });
  const metal = 0x55585e, rust = 0x7a4a2a;
  eyes(b, h.head, 0.3, 0xff2a1a, 3);
  b.box(h.head, 0.34, 0.07, 0.04, 0x1a0a0a, 0, 0.1, 0.14);
  for (const sx of [-1, 1]) {
    const hn = b.cone(h.head, 0.12, 0.45, 0.12, 0xd8d0b8, sx * 0.17, 0.4, 0);
    hn.rotation.z = -sx * 0.7;
  }
  // exposed core
  b.box(h.torso, 0.4, 0.4, 0.06, 0x1a0808, 0, 0.42, 0.28);
  const core = b.ball(h.torso, 0.3, 0.3, 0.2, 0xff2a1a, 0, 0.42, 0.3, 2.2);
  const coreMat = b.mat(0xff2a1a, 2.2);
  b.box(h.torso, 0.3, 0.1, 0.12, metal, 0.2, 0.65, 0.28).rotation.z = 0.3;
  b.box(h.torso, 0.3, 0.1, 0.12, metal, -0.2, 0.2, 0.28).rotation.z = 0.3;
  // spines
  for (let i = 0; i < 5; i++) b.cone(h.torso, 0.12, 0.4 - i * 0.04, 0.12, 0xd8d0b8, 0, 0.7 - i * 0.14, -0.33).rotation.x = -0.9;
  // mismatched arms
  h.armL.scale.set(1.6, 1.25, 1.6);
  h.armL.position.x -= 0.18;
  b.ball(h.armL, 0.4, 0.38, 0.4, 0x7a4c52, 0, -1.0, 0);
  b.box(h.armL, 0.34, 0.14, 0.34, rust, 0, -0.12, 0);
  h.armR.scale.set(0.9, 1.55, 0.9);
  h.armR.position.x += 0.1;
  b.box(h.armR, 0.4, 0.14, 0.4, metal, 0, -0.25, 0);
  for (let i = 0; i < 3; i++) b.cone(h.armR, 0.07, 0.18, 0.07, 0xd8d0b8, -0.08 + i * 0.08, -1.05, 0.06).rotation.x = Math.PI;
  b.box(h.torso, 0.5, 0.2, 0.6, rust, -0.65, 0.78, 0);
  b.box(h.torso, 0.3, 0.1, 0.4, metal, 0.6, 0.78, 0);
  // chains
  const chains: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const c = b.pivot(h.torso, -0.4 + i * 0.4, 0.7, 0.3);
    for (let k = 0; k < 4; k++) b.box(c, 0.07, 0.1, 0.07, 0x8a8c90, 0, -k * 0.12 - 0.05, 0);
    chains.push(c);
  }
  return {
    period: 1.6,
    anim(s) {
      const sw = gait(h, s, 0.55);
      const stomp = Math.abs(Math.sin(s.ph)) * s.amp;
      h.torso.position.y = h.o.legL - stomp * 0.08;
      h.torso.rotation.x = 0.12 + s.wind * -0.35 + s.strike * 0.6;
      h.torso.rotation.z = Math.sin(s.ph) * 0.07 * s.amp;
      h.torso.scale.y = 1 + breathe(s) * 2;
      h.head.rotation.x = 0.15 + s.strike * 0.2;
      const up = -s.wind * 3.0 + s.strike * 3.2;
      h.armL.rotation.x = -sw * 0.4 - 0.1 + up;
      h.armR.rotation.x = sw * 0.4 - 0.1 + up * 0.95;
      h.armL.rotation.z = 0.12;
      h.armR.rotation.z = -0.08;
      coreMat.emissiveIntensity = 1.8 + Math.sin(s.t * 4) * 0.6 + s.wind * 1.5;
      core.scale.setScalar(1 + Math.sin(s.t * 4) * 0.05);
      chains.forEach((c, i) => {
        c.rotation.x = Math.sin(s.t * 2 + i) * 0.1 + stomp * 0.4;
        c.rotation.z = Math.sin(s.ph + i) * 0.2 * s.amp;
      });
    },
  };
}

export function createFoeFigure(kind: number): Figure {
  const builders = [walker, runner, brute, spitter, gator, raider, boss];
  const k = Math.max(0, Math.min(builders.length - 1, kind | 0));
  const scale = FOES[k]?.scale ?? 1;
  const freq = [1.5, 1.1, 1.0, 1.2, 1.0, 1.2, 0.9][k]!;
  return make(scale, builders[k]!, freq);
}

// ───────────── crates ─────────────
const sharedMats = new Map<number, THREE.MeshStandardMaterial>();
function sm(c: number, glow = 0) {
  const k = c * 10 + glow;
  let m = sharedMats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85 });
    if (glow) {
      m.emissive.setHex(c);
      m.emissiveIntensity = glow;
    }
    sharedMats.set(k, m);
  }
  return m;
}
function sbox(p: Parent, g: THREE.BufferGeometry, w: number, h: number, d: number, c: number, x: number, y: number, z: number, glow = 0) {
  const m = new THREE.Mesh(g, sm(c, glow));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  p.add(m);
  return m;
}

export function createCrateMesh(kind: number): THREE.Object3D {
  const g = new THREE.Group();
  const B = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, glow = 0) => sbox(g, G_BOX, w, h, d, c, x, y, z, glow);
  const k = ((kind | 0) + 3) % 3;
  if (k === 0) {
    B(0.9, 0.7, 0.9, 0x9a7440, 0, 0.35, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.1, 0.74, 0.1, 0x6a4c26, sx * 0.4, 0.37, sz * 0.4);
    B(0.94, 0.08, 0.94, 0x6a4c26, 0, 0.7, 0);
    B(0.94, 0.08, 0.94, 0x6a4c26, 0, 0.04, 0);
    B(0.1, 0.02, 0.96, 0x6a4c26, 0, 0.74, 0).rotation.y = 0;
    B(0.93, 0.07, 0.93, 0xc8b078, 0, 0.35, 0); // rope band
    B(0.1, 0.12, 0.12, 0xc8b078, 0.2, 0.35, 0.47);
  } else if (k === 1) {
    B(0.9, 0.55, 0.55, 0xe8ece8, 0, 0.35, 0);
    B(0.7, 0.1, 0.12, 0xc8ccc8, 0, 0.67, 0);
    B(0.3, 0.1, 0.06, 0x5a5e5a, 0, 0.62, 0.3);
    B(0.26, 0.08, 0.02, 0xd02828, 0, 0.35, 0.28);
    B(0.08, 0.26, 0.02, 0xd02828, 0, 0.35, 0.28);
    B(0.26, 0.08, 0.02, 0xd02828, 0, 0.35, -0.28);
    B(0.08, 0.26, 0.02, 0xd02828, 0, 0.35, -0.28);
  } else {
    B(0.9, 0.45, 0.5, 0x4a5a38, 0, 0.3, 0);
    B(0.92, 0.1, 0.52, 0x3a4a2a, 0, 0.55, 0);
    B(0.3, 0.06, 0.1, 0x2a3220, 0, 0.62, 0);
    B(0.06, 0.1, 0.52, 0x2a3220, -0.3, 0.3, 0);
    B(0.06, 0.1, 0.52, 0x2a3220, 0.3, 0.3, 0);
    B(0.3, 0.12, 0.02, 0xd8c050, -0.1, 0.34, 0.26);
  }
  // loot glow: thin additive halo, own material so it can pulse (userData.glow)
  const gm = new THREE.MeshBasicMaterial({ color: [0xffc060, 0x60ff90, 0x80d0ff][k]!, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(G_BOX, gm);
  halo.scale.set(1.08, 0.86, 1.08);
  halo.position.y = 0.4;
  g.add(halo);
  g.userData.glow = gm;
  return g;
}

// ───────────── turret ─────────────
export function createTurretMesh(): THREE.Object3D & { aim(heading: number): void } {
  const g = new THREE.Group() as THREE.Group & { aim(heading: number): void };
  const steel = 0x5a5f66, dark = 0x2a2d32, olive = 0x4a5a3a;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Group();
    leg.position.set(0, 0.7, 0);
    leg.rotation.y = a;
    const m = sbox(leg, G_BOX, 0.07, 0.8, 0.07, dark, 0, -0.32, 0.22);
    m.rotation.x = 0.55;
    g.add(leg);
    sbox(g, G_BOX, 0.16, 0.04, 0.16, steel, Math.sin(a) * 0.5, 0.02, Math.cos(a) * 0.5);
  }
  sbox(g, G_CYL, 0.22, 0.12, 0.22, steel, 0, 0.7, 0);
  const head = new THREE.Group();
  head.position.y = 0.88;
  g.add(head);
  sbox(head, G_BOX, 0.3, 0.2, 0.34, olive, 0, 0, 0);
  sbox(head, G_BOX, 0.34, 0.06, 0.2, dark, 0, 0.12, -0.05);
  sbox(head, G_BOX, 0.06, 0.06, 0.06, 0xff3a2a, 0, 0.18, 0.1, 2);
  sbox(head, G_BOX, 0.1, 0.16, 0.2, steel, 0, -0.02, -0.25); // ammo box
  for (const sx of [-1, 1]) {
    sbox(head, G_BOX, 0.06, 0.06, 0.55, dark, sx * 0.1, 0, 0.4);
    sbox(head, G_BOX, 0.09, 0.09, 0.08, steel, sx * 0.1, 0, 0.66);
  }
  g.aim = (heading: number) => {
    head.rotation.y = heading;
  };
  return g;
}
