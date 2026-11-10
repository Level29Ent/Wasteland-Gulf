import * as THREE from "three";
import { buildLayout as getLayout, type Building, type Landmark, type Prop } from "./layout.ts";

export type Scenery = { group: THREE.Group; update(dt: number, night: number): void; dispose(): void };

type Col = string | number | THREE.Color;
type Batch = { geo: THREE.BufferGeometry; mat: THREE.Material; items: Array<{ m: THREE.Matrix4; c: THREE.Color }> };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUND = ["#6d7a4c", "#35472a", "#837d70", "#cdb98a"];
const SKY_SIL = ["#56627a", "#2d3b2c", "#5d6677", "#7d7f95"];

const LETTERS: Record<string, string[]> = {
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
};

export function createScenery(region: number): Scenery {
  const L = getLayout(region);
  const group = new THREE.Group();
  group.name = "scenery";
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const colCache = new Map<string, THREE.Color>();
  const color = (c: Col): THREE.Color => {
    if (c instanceof THREE.Color) return c;
    const k = String(c);
    let v = colCache.get(k);
    if (!v) { v = new THREE.Color(c as string); colCache.set(k, v); }
    return v;
  };
  const shade = (c: Col, k: number) => color(c).clone().multiplyScalar(k);
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geos.push(g); return g; };
  const mat = <T extends THREE.Material>(m: T): T => { mats.push(m); return m; };

  // ───────── textures ─────────
  const canvas = (n: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    return c;
  };
  const tex = (c: HTMLCanvasElement, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texs.push(t);
    return t;
  };
  const windowTex = (seed: number, dense: boolean) => {
    const r = rng(seed);
    const a = canvas(128), e = canvas(128);
    const ca = a.getContext("2d")!, ce = e.getContext("2d")!;
    ca.fillStyle = "#ffffff"; ca.fillRect(0, 0, 128, 128);
    ce.fillStyle = "#000"; ce.fillRect(0, 0, 128, 128);
    const n = dense ? 8 : 4, s = 128 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * s + s * 0.2, y = j * s + s * 0.22, w = s * 0.6, h = s * 0.52;
      const roll = r();
      ca.fillStyle = "#b9b4aa"; ca.fillRect(x - 1, y + h, w + 2, 2);
      ca.fillStyle = roll < 0.12 ? "#4a3a2c" : "#223040"; ca.fillRect(x, y, w, h);
      if (roll > 0.12 && roll < 0.42) { ce.fillStyle = r() < 0.2 ? "#9fe0ff" : "#ffd27a"; ce.fillRect(x, y, w, h); }
    }
    return [tex(a), tex(e)] as const;
  };
  const winTex = [windowTex(11, false), windowTex(23, false), windowTex(37, true)];

  const waterTex = (rep: number) => {
    const c = canvas(64), g = c.getContext("2d")!;
    g.fillStyle = "#cfe"; g.fillRect(0, 0, 64, 64);
    const r = rng(99);
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 18; i++) g.fillRect(r() * 56, r() * 64, 6 + r() * 10, 2);
    g.fillStyle = "#8fb8b8";
    for (let i = 0; i < 14; i++) g.fillRect(r() * 56, r() * 64, 6 + r() * 10, 2);
    const t = tex(c);
    t.repeat.set(rep, rep);
    return t;
  };

  // ───────── batched instancing ─────────
  const batches: Batch[] = [];
  const mkBatch = (g: THREE.BufferGeometry, m: THREE.Material): Batch => {
    geo(g); mat(m);
    const b: Batch = { geo: g, mat: m, items: [] };
    batches.push(b);
    return b;
  };
  const lam = () => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const bBox = mkBatch(new THREE.BoxGeometry(1, 1, 1), lam());
  const bCyl = mkBatch(new THREE.CylinderGeometry(1, 1, 1, 10), lam());
  const bCone = mkBatch(new THREE.ConeGeometry(1, 1, 10), lam());
  const bSph = mkBatch(new THREE.SphereGeometry(1, 10, 8), lam());
  const bDome = mkBatch(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam());
  const basic = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
  const gBox = mkBatch(new THREE.BoxGeometry(1, 1, 1), basic());
  const gSph = mkBatch(new THREE.SphereGeometry(1, 8, 6), basic());
  const gDome = mkBatch(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), basic());
  const gFire = mkBatch(new THREE.ConeGeometry(1, 1, 7), basic());
  const glowMats = [gBox.mat, gSph.mat, gDome.mat] as THREE.MeshBasicMaterial[];
  const fireMat = gFire.mat as THREE.MeshBasicMaterial;

  const dummy = new THREE.Object3D();
  dummy.rotation.order = "YXZ";
  const put = (b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: Col, ry = 0, rz = 0, rx = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    b.items.push({ m: dummy.matrix.clone(), c: color(c) });
  };

  /** Local frame: positions are local (lx, lz) about (ox, oz) turned by rot; y is base height (sphere: centre). */
  const F = (ox: number, oz: number, rot: number) => {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const wx = (lx: number, lz: number) => ox + lx * cs + lz * sn;
    const wz = (lx: number, lz: number) => oz - lx * sn + lz * cs;
    return {
      ox, oz, rot, wx, wz,
      box: (lx: number, y: number, lz: number, w: number, h: number, d: number, c: Col, ry = 0, rz = 0, rx = 0) =>
        put(bBox, wx(lx, lz), y + h / 2, wz(lx, lz), w, h, d, c, rot + ry, rz, rx),
      cyl: (lx: number, y: number, lz: number, r: number, h: number, c: Col, ry = 0, rz = 0, rx = 0) =>
        put(bCyl, wx(lx, lz), y + h / 2, wz(lx, lz), r, h, r, c, rot + ry, rz, rx),
      cone: (lx: number, y: number, lz: number, r: number, h: number, c: Col) =>
        put(bCone, wx(lx, lz), y + h / 2, wz(lx, lz), r, h, r, c, rot),
      sph: (lx: number, y: number, lz: number, r: number, c: Col) => put(bSph, wx(lx, lz), y, wz(lx, lz), r, r, r, c, rot),
      dome: (lx: number, y: number, lz: number, rx_: number, h: number, rz_: number, c: Col) =>
        put(bDome, wx(lx, lz), y, wz(lx, lz), rx_, h, rz_, c, rot),
      gbox: (lx: number, y: number, lz: number, w: number, h: number, d: number, c: Col, ry = 0) =>
        put(gBox, wx(lx, lz), y + h / 2, wz(lx, lz), w, h, d, c, rot + ry),
      gsph: (lx: number, y: number, lz: number, r: number, c: Col) => put(gSph, wx(lx, lz), y, wz(lx, lz), r, r, r, c, rot),
      gdome: (lx: number, y: number, lz: number, rx_: number, h: number, rz_: number, c: Col) =>
        put(gDome, wx(lx, lz), y, wz(lx, lz), rx_, h, rz_, c, rot),
      fire: (lx: number, y: number, lz: number, r: number, h: number, c: Col) =>
        put(gFire, wx(lx, lz), y + h / 2, wz(lx, lz), r, h, r, c, rot),
    };
  };
  type Fr = ReturnType<typeof F>;
  const W = F(0, 0, 0);

  // window-textured building mesh
  const facMats = new Map<string, THREE.MeshLambertMaterial>();
  const facList: Array<{ m: THREE.MeshLambertMaterial; v: number }> = [];
  const facade = (f: Fr, lx: number, y: number, lz: number, w: number, d: number, h: number, c: Col, variant: number, glass = false) => {
    const key = `${color(c).getHexString()}|${variant}|${glass}`;
    let m = facMats.get(key);
    if (!m) {
      const t = winTex[variant]!;
      m = mat(new THREE.MeshLambertMaterial({
        color: glass ? shade(c, 0.8) : color(c), map: t[0], emissive: 0xffffff, emissiveMap: t[1], emissiveIntensity: 0, flatShading: true,
      }));
      facMats.set(key, m);
      facList.push({ m, v: variant });
    }
    const g = geo(new THREE.BoxGeometry(w, h, d));
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const cell = variant === 2 ? 16 : 16;
    const sc = [d, d, 0, 0, w, w];
    for (let face = 0; face < 6; face++) {
      if (face === 2 || face === 3) continue;
      for (let i = 0; i < 4; i++) {
        const k = face * 4 + i;
        uv.setXY(k, uv.getX(k) * (sc[face]! / cell), uv.getY(k) * (h / cell));
      }
    }
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(f.wx(lx, lz), y + h / 2, f.wz(lx, lz));
    mesh.rotation.y = f.rot;
    group.add(mesh);
    return mesh;
  };

  // ───────── ground, roads, ocean ─────────
  const gcol = GROUND[region]!;
  {
    const g = geo(new THREE.PlaneGeometry(800, 800));
    const m = mat(new THREE.MeshLambertMaterial({ color: gcol }));
    const p = new THREE.Mesh(g, m);
    p.rotation.x = -Math.PI / 2;
    group.add(p);
  }
  const lines = [-84, -42, 0, 42, 84];
  if (region !== 1) {
    const road = region === 2 ? "#4a4a4e" : "#38383d";
    for (const l of lines) {
      W.box(0, 0, l, 200, 0.1, 9, road);
      W.box(l, 0, 0, 9, 0.1, 200, road, 0);
    }
    const kerb = region === 3 ? "#d8cdb0" : "#8d8a82";
    for (const l of lines) {
      for (const s of [-1, 1]) {
        W.box(0, 0, l + s * 5, 200, 0.16, 1.0, kerb);
        W.box(l + s * 5, 0, 0, 1.0, 0.16, 200, kerb);
      }
    }
    for (const l of lines) for (let t = -96; t <= 96; t += 8) {
      if (lines.some((o) => Math.abs(t - o) < 6)) continue;
      W.box(t, 0.1, l, 3.2, 0.03, 0.3, "#d9b83a");
      W.box(l, 0.1, t, 0.3, 0.03, 3.2, "#d9b83a");
    }
  } else {
    // muddy tracks
    W.box(0, 0, 70, 6, 0.05, 40, "#4b3d2a");
    for (let i = 0; i < 12; i++) W.cyl(-80 + i * 14.5, 0, 90, 5, 0.06, "#2c3a22");
  }

  let oceanMat: THREE.MeshLambertMaterial | null = null;
  let oceanTex: THREE.Texture | null = null;
  if (region === 3) {
    W.box(62.5, 0, 0, 7, 0.12, 200, "#e6d6a2");
    const g = geo(new THREE.PlaneGeometry(340, 800));
    oceanTex = waterTex(40);
    oceanMat = mat(new THREE.MeshLambertMaterial({ color: "#2a86b8", map: oceanTex, transparent: true, opacity: 0.9 }));
    const o = new THREE.Mesh(g, oceanMat);
    o.rotation.x = -Math.PI / 2;
    o.position.set(66 + 170, 0.2, 0);
    group.add(o);
  }

  // ───────── water pools ─────────
  const pools: Array<{ m: THREE.MeshLambertMaterial; ring: THREE.Mesh; rm: THREE.MeshBasicMaterial; r: number }> = [];
  {
    const dg = geo(new THREE.CircleGeometry(1, 28));
    const rg = geo(new THREE.RingGeometry(0.78, 0.86, 28));
    const pt = waterTex(2);
    texs.push(pt);
    L.water.forEach((w) => {
      const m = mat(new THREE.MeshLambertMaterial({ color: "#2f8f86", map: pt, transparent: true, opacity: 0.68 }));
      const d = new THREE.Mesh(dg, m);
      d.rotation.x = -Math.PI / 2;
      d.position.set(w.x, 0.08, w.z);
      d.scale.setScalar(w.r);
      group.add(d);
      const rm = mat(new THREE.MeshBasicMaterial({ color: "#bff3e6", transparent: true, opacity: 0.35 }));
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(w.x, 0.1, w.z);
      ring.scale.setScalar(w.r);
      group.add(ring);
      pools.push({ m, ring, rm, r: w.r });
    });
  }

  // ───────── lights ─────────
  const lights: Array<{ l: THREE.PointLight; k: number; fire: boolean }> = [];
  const addLight = (x: number, y: number, z: number, c: number, k: number, fire: boolean) => {
    if (lights.length >= 6) return;
    const l = new THREE.PointLight(c, 0, 26, 1.6);
    l.position.set(x, y, z);
    group.add(l);
    lights.push({ l, k, fire });
  };

  // ───────── distant skyline ─────────
  {
    const r = rng(500 + region);
    const sil = SKY_SIL[region]!;
    for (let i = 0; i < 70; i++) {
      const side = i % 4;
      if (region === 3 && side === 1) continue; // ocean to the east
      const along = (r() * 2 - 1) * 240;
      const dist = 130 + r() * 70;
      const x = side === 0 ? along : side === 1 ? dist : side === 2 ? along : -dist;
      const z = side === 0 ? -dist : side === 1 ? along : side === 2 ? dist : along;
      if (region === 1) {
        const h = 10 + r() * 14;
        put(bCone, x, h / 2, z, 5 + r() * 4, h, 5 + r() * 4, shade(sil, 0.8 + r() * 0.4));
      } else {
        const tall = region === 2 ? 50 : region === 3 ? 22 : 28;
        const h = 12 + r() * tall, w = 8 + r() * 14;
        put(bBox, x, h / 2, z, w, h, 8 + r() * 12, shade(sil, 0.8 + r() * 0.4));
      }
    }
  }

  // ───────── buildings ─────────
  const rubbleAt = (f: Fr, lx: number, lz: number, s: number, seed: number, c: Col = "#6d6a63") => {
    const r = rng(seed);
    for (let i = 0; i < 5; i++) {
      const sz = s * (0.4 + r() * 0.6);
      f.box(lx + (r() - 0.5) * 2.2 * s, 0, lz + (r() - 0.5) * 2.2 * s, sz, sz * 0.7, sz * (0.6 + r() * 0.6), shade(c, 0.8 + r() * 0.5), r() * 3, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6);
    }
  };

  L.buildings.forEach((b: Building, i) => {
    const f = F(b.x, b.z, b.rot);
    const r = rng(i * 131 + region);
    const st = b.style;
    const variant = st === "tower" ? 2 : i % 2;
    if (st === "stilt") {
      const pc = "#4a3a28";
      const ph = 2.6;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(sx * (b.w / 2 - 0.5), 0, sz * (b.d / 2 - 0.5), 0.28, ph + 0.2, pc);
      f.box(0, ph, 0, b.w, 0.3, b.d, "#6e5a3c");
      const ch = 3.0;
      f.box(0, ph + 0.3, -0.4, b.w - 1.4, ch, b.d - 2, b.color);
      f.box(0, ph + 0.3 + ch, -0.4, b.w - 0.4, 0.2, b.d - 1, "#7a8588", 0, 0.0, 0.18);
      f.box(0, ph + 0.3 + ch + 0.2, -0.4, b.w - 0.4, 0.2, b.d - 1, "#8a9496", 0, 0, -0.18);
      f.gbox((r() - 0.5) * 2, ph + 1.3, b.d / 2 - 0.95, 0.9, 0.9, 0.1, "#ffcf70");
      f.box(0, 0, b.d / 2 - 0.2, 0.9, ph, 0.2, "#5a4630", 0, 0, 0.35);
      if (b.ruin > 0.5) rubbleAt(f, 0, b.d / 2 + 1.5, 0.8, i);
      return;
    }
    facade(f, 0, 0, 0, b.w, b.d, b.h, b.color, variant, st === "tower");
    const top = b.h;
    if (st === "balcony") {
      for (let y = 4; y < b.h - 2; y += 4) {
        f.box(0, y, b.d / 2 + 0.6, b.w * 0.85, 0.25, 1.3, "#2f2b28");
        f.box(0, y + 0.25, b.d / 2 + 1.2, b.w * 0.85, 0.9, 0.12, "#1f1d1c");
        f.box(-b.w * 0.42, y + 0.25, b.d / 2 + 0.6, 0.12, 0.9, 1.2, "#1f1d1c");
        f.box(b.w * 0.42, y + 0.25, b.d / 2 + 0.6, 0.12, 0.9, 1.2, "#1f1d1c");
      }
      f.box(0, top, 0, b.w + 0.6, 0.5, b.d + 0.6, shade(b.color, 0.6));
      const rc = r() < 0.5 ? "#7d3a30" : "#4a5a6a";
      f.box(0, top + 0.5, 0, b.w * 0.9, 1.2, b.d * 0.9, rc);
       } else if (st === "tower") {
      f.box(0, top, 0, b.w * 0.6, 3, b.d * 0.6, shade(b.color, 0.7));
      f.cyl(b.w * 0.15, top + 3, 0, 0.12, 6 + r() * 4, "#222");
      f.gsph(b.w * 0.15, top + 9.5, 0, 0.3, "#ff3030");
      for (let y = 8; y < b.h; y += 8) f.box(0, y, 0, b.w + 0.3, 0.4, b.d + 0.3, shade(b.color, 0.5));
    } else if (st === "warehouse") {
      f.box(0, top, 0, b.w + 0.4, 0.3, b.d + 0.4, "#5b5f63");
      f.box(-b.w * 0.25, top, 0, b.w * 0.55, 1.1, b.d + 0.4, "#9a5a34", 0, 0.14);
      f.box(b.w * 0.25, top, 0, b.w * 0.55, 1.1, b.d + 0.4, "#8a4f2e", 0, -0.14);
      f.box(-b.w * 0.2, top + 0.2, b.d * 0.2, 1.2, 1.5, 1.2, "#555");
      f.box(0, 0, b.d / 2 + 0.05, Math.min(6, b.w * 0.4), 4.2, 0.2, "#2a2d31");
      f.box(0, 4.2, b.d / 2 + 0.2, Math.min(6.4, b.w * 0.4 + 0.4), 0.6, 0.5, "#c8892a");
    } else if (st === "shack") {
      f.box(0, top, 0, b.w + 0.8, 0.2, b.d + 0.8, "#8a9496", 0, 0, 0.12);
    } else {
      f.box(0, top, 0, b.w + 0.4, 0.5, b.d + 0.4, shade(b.color, 0.65));
      if (region === 3) { f.box(-b.w * 0.2, top + 0.5, 0, b.w * 0.25, 2.2, b.d * 0.25, shade(b.color, 0.9)); }
      else f.box(b.w * 0.2, top + 0.5, b.d * 0.15, 1.4, 1.4, 1.4, "#575757");
    }
    // entrance + awning (plain/balcony/warehouse door done above)
    if (st !== "warehouse" && st !== "tower") {
      f.box(0, 0, b.d / 2 + 0.05, 1.8, 2.6, 0.2, "#2a2420");
      const aw = ["#b0382c", "#2d6a8a", "#c79a2a"][i % 3]!;
      f.box(0, 2.7, b.d / 2 + 0.6, 3.6, 0.2, 1.4, aw, 0, 0, 0.25);
    } else if (st === "tower") {
      f.box(0, 0, b.d / 2 + 0.05, 3.2, 3.4, 0.2, "#1d2630");
    }
    // ruin: broken roofline, rubble, burn scar
    if (b.ruin > 0.5) {
      f.box(b.w * 0.25, top - 1, b.d * 0.2, b.w * 0.5, 2, b.d * 0.6, shade(b.color, 0.35), 0.2, 0.15, 0.1);
      for (let k = 0; k < 4; k++) f.cyl((r() - 0.5) * b.w * 0.7, top, (r() - 0.5) * b.d * 0.7, 0.07, 1.5 + r() * 2, "#5a3a2a", 0, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      rubbleAt(f, (r() - 0.5) * b.w * 0.6, b.d / 2 + 2, 1.2 + r(), i + 5);
    }
    if (b.ruin > 0.78) f.box(-b.w * 0.2, b.h * 0.35, b.d / 2 + 0.06, b.w * 0.3, b.h * 0.5, 0.12, "#1a1614");
  });

  // ───────── props ─────────
  let fireCount = 0, lampCount = 0, mushCount = 0;
  const barrelCols = ["#8a3b2a", "#2f5a8a", "#6b6b2a"];
  L.props.forEach((p: Prop, i) => {
    const f = F(p.x, p.z, p.rot);
    const s = p.s;
    const r = rng(i * 977 + 3);
    switch (p.type) {
      case "car": {
        const c = p.color;
        f.box(0, 0.35, 0, 1.9, 0.8, 4.2, c);
        f.box(0, 1.15, -0.2, 1.7, 0.7, 2.2, shade(c, 0.7));
        f.box(0, 1.2, -0.2, 1.74, 0.45, 2.0, "#1f2a33");
        for (const sx of [-0.95, 0.95]) for (const sz of [-1.3, 1.4]) f.cyl(sx, 0.05, sz, 0.38, 0.3, "#151515", 0, Math.PI / 2);
        if (r() < 0.4) f.box(0.2, 1.5, -0.3, 1.2, 0.1, 1.4, "#6a3a22");
        break;
      }
      case "lamp": {
        f.cyl(0, 0, 0, 0.12, 5.2, "#2c2f33");
        f.box(0.5, 5.1, 0, 1.1, 0.12, 0.12, "#2c2f33");
        f.gsph(1.0, 4.95, 0, 0.32, "#ffd88a");
        if (lampCount++ < 2) addLight(f.wx(1, 0), 4.8, f.wz(1, 0), 0xffc878, 6, false);
        break;
      }
      case "rubble": rubbleAt(f, 0, 0, s, i, p.color); break;
      case "barrel": {
        f.cyl(0, 0, 0, 0.45, 1.1, barrelCols[i % 3]!);
        f.cyl(0, 0.55, 0, 0.47, 0.1, "#222");
        if (i % 3 === 0) {
          f.fire(0, 1.1, 0, 0.38, 1.1, "#ff8a1e");
          f.fire(0, 1.1, 0, 0.2, 1.6, "#ffd24a");
          if (fireCount++ < 2) addLight(p.x, 2, p.z, 0xff8a30, 7, true);
        }
        break;
      }
      case "deadtree": {
        f.cyl(0, 0, 0, 0.3 * s, 5 * s, p.color);
        for (let k = 0; k < 4; k++) {
          const a = k * 1.6 + r();
          f.box(Math.cos(a) * 0.5 * s, (2.5 + k * 0.7) * s, Math.sin(a) * 0.5 * s, 0.14, 2.2 * s, 0.14, p.color, a, 0.9, 0);
        }
        break;
      }
      case "cypress": {
        f.cone(0, 0, 0, 1.1 * s, 7 * s, "#5a4632");
        f.cone(0, 4.5 * s, 0, 3.3 * s, 5 * s, shade(p.color, 0.9 + r() * 0.3));
        f.cone(0, 7.5 * s, 0, 2.4 * s, 4 * s, shade(p.color, 1.1 + r() * 0.3));
        f.cone(0, 10 * s, 0, 1.5 * s, 3 * s, shade(p.color, 1.25));
        for (let k = 0; k < 3; k++) {
          const a = r() * 6.28;
          f.box(Math.cos(a) * 2 * s, 3 * s, Math.sin(a) * 2 * s, 0.1, 2.2, 0.1, "#9aa886");
        }
        break;
      }
      case "palm": {
        const h = 9 * s;
        f.cyl(0, 0, 0, 0.26, h, "#8a6a44", 0, 0.07);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          f.box(Math.cos(a) * 1.3, h - 0.2, -Math.sin(a) * 1.3, 3.2, 0.12, 0.8, shade(p.color, 0.85 + (k % 2) * 0.3), a, -0.35);
        }
        f.sph(0, h - 0.3, 0, 0.35, "#5a4228");
        break;
      }
      case "mushroom": {
        const sc = s * 1.3;
        f.cyl(0, 0, 0, 0.22 * sc, 1.3 * sc, "#d8d2c0");
        f.gdome(0, 1.2 * sc, 0, 1.1 * sc, 0.8 * sc, 1.1 * sc, p.color);
        f.gdome(1.3 * sc, 0, 0.5 * sc, 0.5 * sc, 0.4 * sc, 0.5 * sc, "#4be0c8");
        if (mushCount++ < 2) addLight(p.x, 1.6 * sc, p.z, 0x9a6bff, 6, false);
        break;
      }
      case "wreck": {
        f.box(0, 0.2, 0, 1.7 * s, 0.8, 4 * s, "#5f4030", 0, 0.12);
        f.box(0, 0.9, -0.6 * s, 1.2 * s, 0.9, 1.4 * s, "#3d3a36", 0, 0.12);
        f.cyl(0, 0.8, 1.6 * s, 0.8 * s, 0.15, "#2a2a2a", 0, 0, Math.PI / 2);
        f.box(0.4, 0.2, 0.4, 0.2, 1.8, 0.2, "#7a4a2a", 0, 0.3, 0);
        break;
      }
      case "sandbag": {
        for (let k = 0; k < 3; k++) f.box((k - 1) * 1.0, 0, 0, 1.0, 0.4, 0.6, "#a79868");
        for (let k = 0; k < 2; k++) f.box((k - 0.5) * 1.0, 0.4, 0, 1.0, 0.4, 0.6, "#b0a272");
        break;
      }
      case "bench": {
        f.box(0, 0.45, 0, 1.8, 0.1, 0.5, "#6a4a2c");
        f.box(0, 0.8, -0.25, 1.8, 0.5, 0.08, "#6a4a2c");
        f.box(-0.8, 0, 0, 0.1, 0.45, 0.45, "#2c2c2c");
        f.box(0.8, 0, 0, 0.1, 0.45, 0.45, "#2c2c2c");
        break;
      }
    }
  });

  // ───────── landmarks ─────────
  let ferris: { wheel: THREE.Group; gondolas: THREE.Object3D[] } | null = null;

  const dome = (f: Fr, r: number, wallH: number, domeH: number, wall: Col, roof: Col, band: Col) => {
    f.cyl(0, 0, 0, r, wallH, wall);
    f.cyl(0, wallH * 0.55, 0, r + 0.15, 1.4, band);
    f.cyl(0, wallH * 0.3, 0, r + 0.1, 0.5, shade(band, 0.7));
    f.dome(0, wallH, 0, r, domeH, r, roof);
    f.cyl(0, wallH + domeH - 0.2, 0, 3, 1.2, shade(roof, 0.8));
    // lit window ring (glows at night)
    f.cyl(0, wallH * 0.75, 0, r + 0.05, 0.5, "#ffd68a");
    f.box(0, 0, r, 8, 6, 1, "#2a2a2e");
    f.gbox(0, 5.5, r + 0.6, 6, 0.4, 0.2, "#ffd88a");
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      f.box(Math.cos(a) * r, 0, Math.sin(a) * r, 1.2, wallH, 1.2, shade(wall, 0.8), -a);
    }
  };

  const landmark = (m: Landmark) => {
    const f = F(m.x, m.z, m.rot);
    switch (m.type) {
      case "cathedral": {
        facade(f, 0, 0, 0, 26, 22, 14, "#ddd0b0", 0);
        facade(f, 0, 0, 11.5, 10, 4, 18, "#e8dcc0", 1);
        facade(f, 0, 14, 4, 8, 8, 8, "#e0d4b4", 1);
        f.cone(0, 22, 4, 4.4, 7, "#3a4a5a");
        f.cone(0, 29, 4, 0.5, 2.2, "#d4a838");
        for (const sx of [-1, 1]) {
          facade(f, sx * 7.5, 0, 12, 4.2, 4.2, 20, "#dacda8", 1);
          f.cone(sx * 7.5, 20, 12, 3.2, 8, "#3a4a5a");
          f.box(sx * 7.5, 28, 12, 0.2, 1.4, 0.2, "#d4a838");
        }
        f.box(0, 0, 13.55, 4, 5, 0.3, "#2a1d16");
        f.box(0, 14.5, 13.7, 7, 2.6, 0.5, "#cfc19c", 0, 0, 0.0);
        f.gsph(0, 12, 13.8, 1.5, "#ffb46a");
        f.box(0, 18, 13.6, 0.8, 3.0, 0.5, "#c9a232");
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) f.box(sx * (4 + k * 3.4), 0, 11.2, 0.5, 5, 0.5, "#cfc3a0");
        f.box(0, 14, 0, 26.6, 0.8, 22.6, "#8b7a60");
        f.box(5, 14.8, -3, 12, 2, 8, "#4a5a6a", 0, 0, 0.0);
        f.box(0, 0, 14.5, 12, 0.4, 3, "#bfb393");
        rubbleAt(f, 9, 15, 1.4, 31);
        break;
      }
      case "square": {
        f.box(0, 0, 0, 28, 0.2, 28, "#a89f8a");
        f.box(0, 0.2, 0, 24, 0.05, 24, "#b9b09a");
        f.box(0, 0.2, 0, 3.2, 1.8, 3.2, "#7a756a");
        f.box(0, 2.0, 0, 2.4, 1.5, 2.4, "#8a857a");
        f.box(0, 3.5, 0, 1.9, 0.3, 1.9, "#6d695f");
        f.box(0, 3.8, 0, 0.9, 0.8, 2.4, "#3f7a5f");
        f.box(0, 4.6, 0.8, 0.7, 0.9, 0.5, "#3f7a5f");
        f.box(0, 4.4, 1.4, 0.3, 0.8, 0.6, "#3f7a5f", 0, 0.3);
        f.box(0, 3.8, -0.8, 0.2, 0.5, 0.2, "#3f7a5f");
        f.box(0, 5.0, -0.1, 0.5, 1.1, 0.5, "#4a8a6a");
        f.sph(0, 6.4, -0.1, 0.3, "#4a8a6a");
        f.box(0, 5.4, -0.1, 0.9, 0.2, 0.9, "#4a8a6a");
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          f.box(sx * 13.5, 0.2, sz * 13.5, 0.4, 2.6, 0.4, "#25282b");
          f.gsph(sx * 13.5, 3.0, sz * 13.5, 0.38, "#ffd88a");
        }
        for (let k = -6; k <= 6; k++) {
          f.box(k * 2, 0.2, 14, 0.12, 1.4, 0.12, "#1f2224");
          f.box(k * 2, 0.2, -14, 0.12, 1.4, 0.12, "#1f2224");
          f.box(14, 0.2, k * 2, 0.12, 1.4, 0.12, "#1f2224");
          f.box(-14, 0.2, k * 2, 0.12, 1.4, 0.12, "#1f2224");
        }
        // lamp at (0,+8) local
        f.cyl(0, 0.2, 8, 0.12, 3.8, "#25282b");
        f.gsph(0, 4.2, 8, 0.35, "#ffd88a");
        for (const sx of [-6, 6]) f.box(sx, 0.2, 5, 2, 0.9, 0.5, "#5b4a38");
        break;
      }
      case "superdome": {
        dome(f, 22, 12, 11, "#cfc9bd", "#c6a45a", "#2e8a9a");
        f.dome(0, 12 + 10.7, 0, 3.5, 1.4, 3.5, "#e8e2d4");
        break;
      }
      case "astrodome": {
        dome(f, 22, 10, 12, "#d6d8d8", "#b9c2c6", "#e0702a");
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI;
          f.box(0, 10, 0, 44, 0.5, 0.5, "#8a949a", a, 0, 0);
        }
        f.box(0, 0, 22.4, 10, 3, 0.5, "#e0702a");
        break;
      }
      case "streetcar": {
        f.box(0, 0.5, 0, 9.4, 2.4, 2.6, "#2f7a4a");
        f.box(0, 2.9, 0, 9.6, 0.3, 2.8, "#e8dfbe");
        f.box(0, 1.9, 0, 9.5, 0.35, 2.65, "#e8dfbe");
        for (const sz of [-1, 1]) f.gbox(0, 1.1, sz * 1.31, 8.4, 0.75, 0.06, "#ffe0a0");
        f.box(0, 0.2, 0, 8, 0.3, 2, "#222");
        for (const sx of [-3.4, 3.4, -2.0, 2.0]) for (const sz of [-1, 1]) f.cyl(sx, 0.05, sz * 1.0, 0.45, 0.2, "#191919", 0, 0, Math.PI / 2);
        f.box(0, 3.2, 0, 0.1, 1.3, 0.1, "#333");
        f.box(0, 3.2, 0, 3, 0.1, 0.1, "#333", 0, 0, 0.5);
        f.gbox(-4.8, 1.2, 0, 0.1, 0.5, 0.6, "#fff2c0");
        f.box(-3, 3.3, 0, 2.4, 0.5, 0.2, "#b0382c");
        break;
      }
      case "stilts": {
        const spots: Array<[number, number, number]> = [[26, 17, 6], [35, 23, 6], [26, 26, 5]];
        for (const [x, z, w] of spots) {
          const g = F(x, z, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(sx * (w / 2 - 0.4), 0, sz * (w / 2 - 0.4), 0.25, 2.5, "#4a3a28");
          g.box(0, 2.4, 0, w, 0.3, w, "#6e5a3c");
          g.box(0, 2.7, -0.3, w - 1.2, 2.5, w - 1.5, "#7f8c6a");
          g.box(0, 5.2, -0.3, w + 0.5, 0.2, w - 0.8, "#8f6a40", 0, 0, 0.2);
          g.box(0, 5.2, -0.3, w + 0.5, 0.2, w - 0.8, "#7d5a36", 0, 0, -0.2);
          g.gbox(0, 3.4, w / 2 - 0.8, 0.8, 0.8, 0.08, "#ffcf70");
          g.box(0, 0.1, w / 2 + 0.6, 0.9, 0.2, 2.4, "#5a4630", 0, 0, 0.6);
          g.cyl(w / 2 - 0.6, 2.7, w / 2 - 0.4, 0.05, 1.2, "#333");
        }
        // plank walkways
        f.box(-0.5, 2.55, -2.5, 8.5, 0.15, 1.1, "#6e5a3c", 0.5);
        f.box(3.5, 2.55, 3.0, 1.1, 0.15, 6.5, "#6e5a3c", 0.0);
        break;
      }
      case "hut": {
        f.box(0, 0, 0, 10, 6.2, 10, "#6b5a40");
        for (let k = 0; k < 6; k++) f.box(-4.5 + k * 1.8, 0, 5.05, 0.15, 6.2, 0.1, "#4d3f2c");
        f.box(0, 6.2, 0, 11.6, 0.3, 10.6, "#8a9496", 0, 0, 0.16);
        f.box(0, 6.2, 0, 11.6, 0.3, 10.6, "#74807f", 0, 0, -0.16);
        f.box(0, 0, 5.1, 2, 3.6, 0.2, "#2a1f16");
        f.gbox(-3, 3, 5.15, 1.4, 1.2, 0.12, "#ffc060");
        f.gbox(3, 3, 5.15, 1.4, 1.2, 0.12, "#ffc060");
        f.box(0, 0, 6.6, 8, 0.5, 3, "#6e5a3c");
        f.cyl(3.6, 6.4, -2, 0.4, 2.6, "#4a4038");
        f.cyl(-3.6, 0, 6.8, 0.15, 3.2, "#4a3a28");
        f.cyl(3.6, 0, 6.8, 0.15, 3.2, "#4a3a28");
        f.gsph(-3.6, 3.2, 6.8, 0.3, "#ffd070");
        f.box(0, 4.4, 5.3, 3.4, 0.9, 0.12, "#a8382c");
        addLight(f.wx(0, 7), 3, f.wz(0, 7), 0xffc060, 6, false);
        break;
      }
      case "dock": {
        f.gbox(0, 0.0, 0, 0, 0, 0, "#000");
        f.box(0, 0.8, 0, 14, 0.3, 4.2, "#7a6444");
        for (let k = -3; k <= 3; k++) f.box(k * 2, 0.8, 0, 0.1, 0.32, 4.2, "#4d3f2c");
        for (let k = -3; k <= 3; k++) for (const sz of [-1, 1]) f.cyl(k * 2, 0, sz * 1.9, 0.18, 1.6, "#3d2f20");
        f.box(5.5, 0.8, 4, 2.4, 0.3, 6, "#7a6444");
        for (const sz of [-1, 1]) f.cyl(6.6, 0, 2 + sz * 2, 0.18, 1.6, "#3d2f20");
        // water apron
        put(bBox, f.wx(0, 3), 0.12, f.wz(0, 3), 15, 0.04, 10, "#24505a", f.rot);
        // airboat (matches solid 6 x 2.5 at x-2)
        f.box(-2, 0.35, 0, 6, 0.7, 2.4, "#b0382c");
        f.box(-2, 0.7, 0, 5, 0.2, 2.0, "#8a2a22");
        f.box(-3.2, 1.0, 0, 1.0, 0.8, 1.0, "#d8d2c0");
        f.box(-4.6, 0.8, 0, 0.2, 2.6, 2.6, "#3a3a3a");
        f.cyl(-4.9, 2.1, 0, 1.3, 0.12, "#2a2a2a", 0, 0, Math.PI / 2);
        f.cyl(-4.5, 1.0, 0, 0.1, 1.6, "#333");
        f.box(6, 0.8, 3.8, 0.1, 2.4, 0.1, "#3d2f20");
        f.gsph(6, 3.4, 3.8, 0.28, "#ffd070");
        addLight(f.wx(6, 3.8), 3.2, f.wz(6, 3.8), 0xffc060, 5, false);
        break;
      }
      case "rocket": {
        const cx = 0, cz = 0;
        f.box(cx, 0, cz, 14, 0.5, 14, "#8d8d88");
        f.box(cx, 0.5, cz, 6.4, 0.4, 6.4, "#5a5a58");
        f.cyl(cx, 0.9, cz, 3, 11, "#f4f4f0");
        f.cyl(cx, 3.4, cz, 3.04, 1.6, "#1a1a1a");
        f.cyl(cx, 6.4, cz, 3.04, 1.6, "#1a1a1a");
        f.cyl(cx, 11.9, cz, 3, 9, "#f4f4f0");
        f.cyl(cx, 13.7, cz, 3.04, 1.8, "#1a1a1a");
        f.cyl(cx, 20.9, cz, 2.6, 8, "#f4f4f0");
        f.cyl(cx, 23.2, cz, 2.64, 1.8, "#1a1a1a");
        f.cyl(cx, 28.9, cz, 2.0, 5, "#ececE6");
        f.cyl(cx, 33.9, cz, 2.0, 1.2, "#c84a2a");
        f.cone(cx, 35.1, cz, 2.0, 5, "#f4f4f0");
        f.cyl(cx, 40, cz, 0.08, 5, "#2a2a2a");
        f.cone(cx, 37, cz, 0.5, 4, "#1a1a1a");
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          f.box(Math.cos(a) * 3.6, 0.9, Math.sin(a) * 3.6, 0.3, 4.5, 3, "#1a1a1a", -a + Math.PI / 2);
          f.cyl(Math.cos(a) * 1.4, 0.4, Math.sin(a) * 1.4, 0.9, 0.6, "#333");
        }
        f.gsph(cx, 41, cz, 0.28, "#ff3030");
        // orange gantry (x = -8 local)
        const gx = -8, H = 38;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(gx + sx * 0.9, 0, sz * 5.5, 0.35, H, 0.35, "#e0661c");
        for (let y = 0; y < H; y += 4) {
          for (const sz of [-1, 1]) f.box(gx, y, sz * 5.5, 2.2, 0.25, 0.25, "#e0661c");
          f.box(gx, y, 0, 0.25, 0.25, 11.4, "#e0661c");
          f.box(gx - 0.9, y, 0, 0.2, 0.2, 11.4, "#c8541a");
          for (const sz of [-1, 1]) f.box(gx, y, sz * 5.5, 0.2, 4.6, 0.2, "#d85a18", 0, 0.0, 0.0);
        }
        for (const y of [10, 18, 26, 33]) f.box(-4.8, y, 0, 6.6, 0.4, 1.4, "#e0661c");
        f.box(gx, H, 0, 3, 0.5, 12, "#c8541a");
        f.gsph(gx, H + 1, 0, 0.3, "#ff3030");
        f.box(-3, 0, 6, 4, 2.5, 3, "#7d8083");
        f.gbox(-3, 1.2, 7.55, 2.2, 0.7, 0.1, "#ffd88a");
        break;
      }
      case "towers": {
        facade(f, -4, 0, -4, 9, 9, 50, "#3d5870", 2, true);
        f.box(-4, 50, -4, 6, 3, 6, "#2f4558");
        f.cyl(-4, 53, -4, 0.2, 9, "#222");
        f.gsph(-4, 62.5, -4, 0.35, "#ff3030");
        facade(f, 6, 0, 4, 8, 8, 34, "#6c7886", 2, true);
        f.box(7, 34, 5, 5, 4, 5, "#2a3440", 0.3, 0.2, 0.1);
        facade(f, -6, 0, 7, 7, 7, 24, "#8a6a58", 2, true);
        f.box(-6, 24, 7, 5, 1.5, 5, "#3a3a3a", 0.5, 0.1, 0.2);
        f.box(1, 20, 1, 8, 1.4, 1.4, "#4a5560", 0.4); // sky bridge
        rubbleAt(f, 0, 11, 2, 77);
        break;
      }
      case "freeway": {
        const y = 8.6;
        f.box(0, y - 0.1, 0, 176, 1.0, 12, "#505054");
        f.box(0, y + 0.9, 5.8, 176, 0.9, 0.5, "#8d8a82");
        f.box(0, y + 0.9, -5.8, 176, 0.9, 0.5, "#8d8a82");
        for (let x = -86; x <= 86; x += 8) f.box(x, y + 0.9, 0, 3.4, 0.05, 0.3, "#e8d44a");
        for (let x = -80; x <= 80; x += 16) {
          f.cyl(x, 0, 0, 1.1, y, "#7c7a74");
          f.box(x, y - 1.1, 0, 3.2, 1, 11, "#6a6862");
        }
        for (let x = -72; x <= 72; x += 36) {
          f.cyl(x, y + 0.9, 5.7, 0.09, 4.5, "#2c2f33");
          f.gsph(x, y + 5.4, 5.7, 0.3, "#ffd88a");
        }
        const cars = [-60, -34, -10, 22, 48, 70];
        cars.forEach((x, k) => {
          const c = ["#7a2e2e", "#2e4a7a", "#c9b04a", "#4a6a4e", "#3b3b3b", "#d0c9b0"][k]!;
          const z = (k % 2 ? 2.6 : -2.6);
          f.box(x, y + 0.9, z, 4.2, 0.8, 1.9, c, k * 0.1);
          f.box(x - 0.2, y + 1.6, z, 2.2, 0.7, 1.7, shade(c, 0.6), k * 0.1);
        });
        f.box(-92 + 4, y - 0.1, 0, 8, 1, 12, "#3f3f43"); // broken stub ends
        f.box(88, y - 0.1, 0, 4, 1, 12, "#3f3f43");
        f.box(30, y + 0.9, 5.8, 10, 0.9, 0.5, "#2a2a2a", 0.0, 0.0, 0.5);
        break;
      }
      case "hollywood": {
        // hill behind (centre z = -26 local → -118 world)
        const hz = -118;
        put(bDome, 0, 0, hz, 62, 16, 30, "#9a8f4f");
        put(bDome, -48, 0, hz + 6, 28, 10, 20, "#8a8048");
        put(bDome, 50, 0, hz + 4, 26, 9, 18, "#8f8650");
        for (let k = 0; k < 18; k++) {
          const r = rng(k * 17 + 4);
          const x = (r() * 2 - 1) * 55, z = hz + 10 + r() * 14;
          put(bCone, x, 3, z, 1.8, 6, 1.8, "#4f6a34");
        }
        const word = "HOLLYWOOD";
        const cell = 0.9, step = 7.6;
        for (let li = 0; li < word.length; li++) {
          const rows = LETTERS[word[li]!]!;
          const lx = (li - 4) * step;
          for (let rr = 0; rr < 7; rr++) for (let cc = 0; cc < 5; cc++) {
            if (rows[rr]![cc] !== "1") continue;
            put(bBox, lx + (cc - 2) * cell, 11.2 + (6 - rr) * cell + cell / 2, -98, cell, cell, 1.1, "#fbfbf6");
          }
          put(bBox, lx, 4.5, -98.4, 0.5, 8, 0.5, "#9a9a96");
          put(bBox, lx - 1.8, 4.5, -98.4, 0.35, 8, 0.35, "#9a9a96");
        }
        break;
      }
      case "observatory": {
        facade(f, 0, 0, 0, 14, 12, 9, "#f2efe6", 1);
        facade(f, -9, 0, 0, 5, 10, 7, "#efece2", 1);
        facade(f, 9, 0, 0, 5, 10, 7, "#efece2", 1);
        f.cyl(0, 9, 0, 5.2, 1.6, "#f2efe6");
        f.dome(0, 10.6, 0, 5, 4.4, 5, "#c0703c");
        f.cyl(0, 10.5, 0, 5.15, 0.3, "#3fa58a");
        f.box(0, 12, 0, 0.9, 3.6, 0.5, "#1a1a1a");
        for (const sx of [-9, 9]) {
          f.cyl(sx, 7, 0, 3.2, 1.2, "#f2efe6");
          f.dome(sx, 8.2, 0, 3.2, 3.2, 3.2, "#b8683a");
          f.box(sx, 8.8, 3.1, 0.7, 2, 0.3, "#1a1a1a");
        }
        for (let k = -3; k <= 3; k++) f.cyl(k * 1.8, 0.4, 6.8, 0.35, 8.4, "#fafaf4");
        f.box(0, 8.8, 6.8, 13, 0.7, 1.6, "#f2efe6");
        f.box(0, 0, 7.2, 14, 0.4, 3, "#d8d2c0");
        f.box(0, 0, 0.0, 14.4, 0.15, 12.4, "#cfc9b8");
        f.box(0, 0, 6.2, 3, 4, 0.3, "#23282e");
        f.gbox(0, 6, 6.5, 6, 0.3, 0.1, "#ffe8b0");
        break;
      }
      case "pier": {
        f.box(0, 1.4, 0, 24, 0.35, 12, "#8b6a42");
        for (let k = -11; k <= 11; k++) f.box(k, 1.4, 0, 0.08, 0.37, 12, "#5d4630");
        for (let x = -11; x <= 11; x += 3) for (const sz of [-1, 1]) f.cyl(x, 0, sz * 5.4, 0.25, 1.6, "#3d2f20");
        for (let x = -11.5; x <= 11.5; x += 2.3) for (const sz of [-1, 1]) f.box(x, 1.75, sz * 5.8, 0.12, 1.0, 0.12, "#d8d2c0");
        for (const sz of [-1, 1]) f.box(0, 2.6, sz * 5.8, 24, 0.1, 0.1, "#d8d2c0");
        f.box(8, 1.75, 0, 5, 3, 5, "#2f8a9a");
        f.box(8, 4.75, 0, 6, 0.3, 6, "#c8442c", 0, 0, 0.0);
        f.gbox(8, 3.0, 2.55, 3, 0.9, 0.1, "#ffe0a0");
        for (const x of [-9, -3, 3]) {
          f.cyl(x, 1.75, 4.5, 0.08, 3.6, "#2c2f33");
          f.gsph(x, 5.5, 4.5, 0.32, "#ffe0a0");
        }
        f.box(-11.5, 1.75, 0, 0.3, 2.6, 4, "#d8442c");
        addLight(f.wx(-3, 4.5), 5, f.wz(-3, 4.5), 0xffe0a0, 6, false);
        break;
      }
      case "ferris": {
        const R = 8.2, hub = 10.4;
        const cols = ["#e0402a", "#f0c02a", "#2a9ad8", "#3ac060"];
        const grp = new THREE.Group();
        grp.position.set(f.wx(0, 0), hub, f.wz(0, 0));
        grp.rotation.y = f.rot;
        const wheel = new THREE.Group();
        grp.add(wheel);
        const bm = mat(new THREE.MeshLambertMaterial({ color: "#d8d8d2", flatShading: true }));
        const spokeG = geo(new THREE.BoxGeometry(0.18, R * 2, 0.18));
        const rimG = geo(new THREE.BoxGeometry(0.3, 2 * R * Math.sin(Math.PI / 24) + 0.1, 0.3));
        const gonG = geo(new THREE.BoxGeometry(1.5, 1.3, 1.3));
        const bulbG = geo(new THREE.SphereGeometry(0.2, 6, 4));
        const bulbM = mat(new THREE.MeshBasicMaterial({ color: "#ffe9a8" }));
        glowMats.push(bulbM);
        for (let k = 0; k < 6; k++) {
          for (const z of [-0.7, 0.7]) {
            const s = new THREE.Mesh(spokeG, bm);
            s.rotation.z = (k / 6) * Math.PI;
            s.position.z = z;
            wheel.add(s);
          }
        }
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          for (const z of [-0.7, 0.7]) {
            const rim = new THREE.Mesh(rimG, bm);
            rim.position.set(Math.cos(a) * R, Math.sin(a) * R, z);
            rim.rotation.z = a;
            wheel.add(rim);
          }
          const bulb = new THREE.Mesh(bulbG, bulbM);
          bulb.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.9);
          wheel.add(bulb);
        }
        const gondolas: THREE.Object3D[] = [];
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const gm = mat(new THREE.MeshLambertMaterial({ color: cols[k % 4]!, flatShading: true }));
          const g = new THREE.Mesh(gonG, gm);
          g.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.7, 0);
          wheel.add(g);
          gondolas.push(g);
        }
        const hubM = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.8, 0.8, 2, 10)), bm);
        hubM.rotation.x = Math.PI / 2;
        wheel.add(hubM);
        group.add(grp);
        ferris = { wheel, gondolas };
        // A-frame supports
        for (const z of [-1.6, 1.6]) for (const s of [-1, 1]) {
          f.box(s * 2.6, 0, z, 0.5, 11.2, 0.5, "#6b6e72", 0, s * 0.24);
        }
        f.box(0, 0, 0, 7, 0.4, 5, "#5a5a58");
        f.cyl(0, 0, -2.6, 0.2, 0.01, "#000");
        f.box(0, 0, 3.5, 3, 2.4, 2, "#c8442c");
        f.gbox(0, 1.3, 4.55, 2, 0.6, 0.1, "#ffe0a0");
        addLight(f.wx(0, 4), 5, f.wz(0, 4), 0xffd890, 8, false);
        break;
      }
    }
  };
  L.landmarks.forEach(landmark);

  // ───────── build instanced meshes ─────────
  const instMeshes: THREE.InstancedMesh[] = [];
  for (const b of batches) {
    if (!b.items.length) continue;
    const im = new THREE.InstancedMesh(b.geo, b.mat, b.items.length);
    b.items.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    group.add(im);
    instMeshes.push(im);
  }

  // ───────── update ─────────
  let t = 0;
  const flick = (k: number) => 0.5 + 0.25 * Math.sin(t * 11 + k) + 0.15 * Math.sin(t * 23.7 + k * 3) + 0.1 * Math.sin(t * 5.3);
  const update = (dt: number, night: number) => {
    t += dt;
    const n = Math.max(0, Math.min(1, night));
    for (const fm of facList) fm.m.emissiveIntensity = n * (fm.v === 1 ? 1.0 + 0.12 * Math.sin(t * 6) : 1.25);
    const gl = 0.3 + 0.7 * n;
    for (const m of glowMats) m.color.setScalar(gl);
    fireMat.color.setScalar(0.75 + 0.25 * flick(0));
    for (const [i, li] of lights.entries()) {
      li.l.intensity = li.fire ? (0.4 + n * 0.8) * li.k * (0.7 + 0.5 * flick(i)) : n * li.k;
    }
    pools.forEach((p, i) => {
      p.m.opacity = 0.66 + 0.08 * Math.sin(t * 1.3 + i);
      p.m.color.setHSL(0.48 + 0.01 * Math.sin(t * 0.7 + i), 0.5, 0.3 + 0.04 * Math.sin(t * 1.1 + i * 2) + n * -0.08);
      const ph = (t * 0.25 + i * 0.37) % 1;
      p.ring.scale.setScalar(p.r * (0.55 + 0.45 * ph));
      p.rm.opacity = 0.35 * (1 - ph);
      if (p.m.map) p.m.map.offset.set(t * 0.01, t * 0.006);
    });
    if (oceanMat && oceanTex) {
      oceanTex.offset.set(t * 0.012, t * 0.008);
      oceanMat.color.setHSL(0.56 + 0.01 * Math.sin(t * 0.5), 0.6, 0.38 - n * 0.14 + 0.03 * Math.sin(t * 0.9));
    }
    const fw = ferris as { wheel: THREE.Group; gondolas: THREE.Object3D[] } | null;
    if (fw) {
      fw.wheel.rotation.z += dt * 0.18;
      for (const g of fw.gondolas) g.rotation.z = -fw.wheel.rotation.z;
    }
  };

  const dispose = () => {
    group.removeFromParent();
    for (const im of instMeshes) im.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const x of texs) x.dispose();
    for (const li of lights) li.l.dispose();
    geos.length = mats.length = texs.length = 0;
    group.clear();
  };

  update(0, 0);
  return { group, update, dispose };
}
