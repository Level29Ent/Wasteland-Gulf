import type { Entity } from "koota";
import type { z } from "zod";
import * as THREE from "three";
import { defineClient } from "@trhs/wildwood/client";
import { withPageAudio } from "@trhs/wildwood/audio";
import { createControls } from "@trhs/wildwood/controls";
import { follow } from "@trhs/wildwood/follow";
import { replicateClient } from "@trhs/wildwood/replicate/client";
import { DAY_LENGTH, FOES, REGIONS, WEAPONS } from "./data.ts";
import { Body, type BodyShape, KIND_CRATE, KIND_FOE, KIND_PLAYER, KIND_TURRET, Mover, Net, Pose, Sync, game } from "./game.ts";
import { createHud, objective, type Store } from "./hud.ts";
import { createCrateMesh, createFoeFigure, createPlayerFigure, createTurretMesh, type Figure } from "./world/figures.ts";
import { makeLayouts, inWater, rayBlock, resolve } from "./world/layout.ts";
import { createScenery, type Scenery } from "./world/scenery.ts";

const WALK = 5.2;
const SPRINT = 8.2;
const LOOK = 0.0035;
const CAM_DIST = 4.6;
const SHOULDER = 0.8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
type P = { x: number; z: number; heading: number; speed: number; aim: boolean };
const lerpPose = (a: P, b: P, t: number): P => ({
  x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: lerpAngle(a.heading, b.heading, t), speed: b.speed, aim: b.aim,
});

export default defineClient(game, {
  simulate(ctx) {
    const replica = replicateClient(ctx, Sync, {
      smoothing: {
        pose: { type: "interpolate", delayMs: 100, lerp: lerpPose },
        mover: { type: "interpolate", delayMs: 100, lerp: lerpPose },
      },
    });
    const controls = createControls({
      move: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"] },
      look: true,
      buttons: {
        fire: { keys: [], mouse: 0, label: "Fire" },
        sprint: { keys: ["ShiftLeft", "ShiftRight"], label: "Sprint" },
        melee: { keys: ["KeyV"], label: "Machete" },
        interact: { keys: ["KeyE"], label: "Loot" },
        medkit: { keys: ["KeyH"], label: "Medkit" },
        food: { keys: ["KeyF"], label: "Eat" },
        water: { keys: ["KeyG"], label: "Drink" },
        turret: { keys: ["KeyB"], label: "Turret" },
        w1: { keys: ["Digit1"], label: "1" },
        w2: { keys: ["Digit2"], label: "2" },
        w3: { keys: ["Digit3"], label: "3" },
        menu: { keys: ["KeyM", "Tab"], label: "Menu" },
      },
    });
    const getLayout = makeLayouts();
    const store: Store = {
      st: null, menu: null, toasts: [], fx: [], local: { x: 0, z: 75, heading: Math.PI, speed: 0 }, yaw: Math.PI, pitch: -0.15,
      hitMarker: 0, hurtFlash: 0, lastTp: -1, bossBar: null,
    };
    const dt = 1 / ctx.tickRate;
    let fireT = 0;
    let aimT = 0;
    let lastTab = "missions";
    let shown = false;

    ctx.onMessage(Net.toClient.state, (s) => {
      store.st = s;
      if (s.tpN !== store.lastTp) {
        store.lastTp = s.tpN;
        store.local.x = s.tpX; store.local.z = s.tpZ; store.yaw = Math.PI;
      }
      if (!shown) { shown = true; store.menu = "regions"; }
    });
    ctx.onMessage(Net.toClient.toast, ({ text }) => store.toasts.push({ text, age: 0 }));
    replica.on("shot", (e) => store.fx.push({ t: "shot", ...e }));
    replica.on("hit", (e) => store.fx.push({ t: "hit", ...e }));
    replica.on("died", (e) => store.fx.push({ t: "died", ...e }));
    replica.on("crate", (e) => store.fx.push({ t: "crate", ...e }));
    replica.on("hurt", (e) => store.fx.push({ t: "hurt", ...e }));

    const ownEntity = (): Entity | undefined => {
      for (const e of ctx.world.query(Pose)) if (replica.owns(e)) return e;
      return undefined;
    };
    /** Third-person camera: position, aim origin, forward. */
    const camera = () => {
      const { yaw, pitch } = store;
      const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
      const tx = store.local.x - Math.cos(yaw) * SHOULDER, ty = 1.65, tz = store.local.z + Math.sin(yaw) * SHOULDER;
      const L = getLayout(store.st?.region ?? 0);
      const hit = rayBlock(L, tx, ty, tz, -fx, -fy, -fz, CAM_DIST);
      const d = Math.max(0.6, Math.min(CAM_DIST, hit - 0.4));
      return { pos: { x: tx - fx * d, y: Math.max(0.35, ty - fy * d), z: tz - fz * d }, target: { x: tx, y: ty, z: tz }, dir: { x: fx, y: fy, z: fz } };
    };
    const go = (a: "interact" | "medkit" | "food" | "water" | "turret") => ctx.send(Net.toServer.act, { a });
    const setMenu = (m: string | null) => {
      if (m) lastTab = m;
      store.menu = m;
    };

    ctx.onStep(() => {
      replica.apply();
      const look = controls.look();
      const press = (b: Parameters<typeof controls.pressed>[0]) => controls.pressed(b);
      const [mel, inter, med, food, water, tur, w1, w2, w3, menu] = [
        press("melee"), press("interact"), press("medkit"), press("food"), press("water"), press("turret"), press("w1"), press("w2"), press("w3"), press("menu"),
      ];
      press("fire"); press("sprint");
      const st = store.st;
      if (menu) setMenu(store.menu ? null : lastTab);
      const me = ownEntity();
      const active = !store.menu && st && !st.down;
      if (!store.menu) {
        store.yaw -= look.x * LOOK;
        store.pitch = clamp(store.pitch - look.y * LOOK, -1.0, 0.6);
      }
      fireT -= dt; aimT -= dt;
      let speed = 0;
      if (active && me) {
        const mv = controls.move();
        const len = Math.hypot(mv.x, mv.y);
        const sc = len > 1 ? 1 / len : 1;
        const fx = Math.sin(store.yaw), fz = Math.cos(store.yaw);
        let v = (controls.held("sprint") ? SPRINT : WALK);
        const L = getLayout(st.region);
        if (inWater(L, store.local.x, store.local.z)) v *= 0.6;
        const vx = (fx * mv.y - fz * mv.x) * sc * v, vz = (fz * mv.y + fx * mv.x) * sc * v;
        const r = resolve(L, { x: store.local.x + vx * dt, z: store.local.z + vz * dt }, 0.45);
        speed = Math.hypot(r.x - store.local.x, r.z - store.local.z) / dt;
        store.local.x = r.x; store.local.z = r.z;
        if (mel) ctx.send(Net.toServer.melee, {});
        if (inter) go("interact");
        if (med) go("medkit");
        if (food) go("food");
        if (water) go("water");
        if (tur) go("turret");
        if (w1) ctx.send(Net.toServer.weapon, { i: 0 });
        if (w2) ctx.send(Net.toServer.weapon, { i: 1 });
        if (w3) ctx.send(Net.toServer.weapon, { i: 2 });
        if (controls.held("fire") && fireT <= 0) {
          fireT = WEAPONS[st.weapon]!.cooldown;
          aimT = 0.6;
          const c = camera();
          ctx.send(Net.toServer.fire, { ox: c.pos.x, oy: c.pos.y, oz: c.pos.z, dx: c.dir.x, dy: c.dir.y, dz: c.dir.z });
        }
        store.local.heading = store.yaw;
      }
      store.local.speed = speed;
      if (me) me.set(Pose, { x: store.local.x, z: store.local.z, heading: store.local.heading, speed, aim: aimT > 0 });
      replica.publish();
    });

    return {
      store, replica, controls, camera, getLayout,
      setMenu,
      actions: {
        travel(r: number) { ctx.send(Net.toServer.travel, { region: r }); setMenu(null); },
        craft(id: string) { ctx.send(Net.toServer.craft, { id }); },
        job(id: string) { ctx.send(Net.toServer.job, { id }); },
        daily() { ctx.send(Net.toServer.daily, {}); },
        close() { setMenu(null); },
        open(tab: string) { setMenu(tab); },
      },
      aiming: () => aimT > 0,
    };
  },

  present(ctx, sim) {
    const { store, replica } = sim;
    sim.controls.attach(ctx);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
    ctx.element.prepend(renderer.domElement);
    ctx.element.style.position = "relative";

    const scene = new THREE.Scene();
    const view = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 500);
    const hemi = new THREE.HemisphereLight("#cfe4ff", "#4a4a3a", 1.2);
    const sun = new THREE.DirectionalLight("#fff0d0", 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
    sun.shadow.bias = -0.0004;
    scene.add(hemi, sun, sun.target);

    // Audio
    let actx: AudioContext | null = null;
    withPageAudio(ctx.signal, (c) => { actx = c; });
    const noise = (vol: number, dur: number, freq: number, q = 0.8) => {
      const a = actx;
      if (!a || vol < 0.01) return;
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (ctx.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = "lowpass"; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
      src.connect(f).connect(g).connect(a.destination);
      src.start();
    };
    const tone = (vol: number, f0: number, f1: number, dur: number, type: OscillatorType = "sine") => {
      const a = actx;
      if (!a || vol < 0.01) return;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, a.currentTime); o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    };
    const vol = (x: number, z: number) => clamp(1 - Math.hypot(x - store.local.x, z - store.local.z) / 60, 0, 1);

    // Particles & tracers
    const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const pMats = { blood: new THREE.MeshBasicMaterial({ color: "#a01818" }), spark: new THREE.MeshBasicMaterial({ color: "#ffd25a" }), goo: new THREE.MeshBasicMaterial({ color: "#7be04a" }), gold: new THREE.MeshBasicMaterial({ color: "#ffe27a" }) };
    const parts: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
    const burst = (x: number, y: number, z: number, mat: keyof typeof pMats, n: number, force: number) => {
      for (let i = 0; i < n && parts.length < 220; i++) {
        const m = new THREE.Mesh(pGeo, pMats[mat]);
        m.position.set(x, y, z);
        scene.add(m);
        parts.push({ m, v: new THREE.Vector3((ctx.random() - 0.5) * force, ctx.random() * force * 0.9, (ctx.random() - 0.5) * force), life: 0.5 + ctx.random() * 0.4 });
      }
    };
    const tracerMat = new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.9 });
    const tracerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 4);
    tracerGeo.rotateX(Math.PI / 2);
    const tracers: { m: THREE.Mesh; life: number }[] = [];
    const flashMat = new THREE.MeshBasicMaterial({ color: "#fff2a0" });
    const flashes: { m: THREE.Mesh; life: number }[] = [];

    // Scenery per region
    let sceneryRegion = -1;
    let scenery: Scenery | null = null;
    const setRegion = (r: number) => {
      if (scenery) { scene.remove(scenery.group); scenery.dispose(); }
      scenery = createScenery(r);
      scene.add(scenery.group);
      sceneryRegion = r;
    };

    // Entities
    type Rec = { obj: THREE.Object3D; fig: Figure | null; kind: number; sub: number; lastHp: number; down: boolean; label: THREE.Sprite | null; turret: (THREE.Object3D & { aim(h: number): void }) | null; t: number };
    const makeLabel = (text: string, color: string) => {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 64;
      const g = c.getContext("2d")!;
      g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.fillStyle = color; g.strokeStyle = "#000"; g.lineWidth = 6;
      g.strokeText(text, 128, 44); g.fillText(text, 128, 44);
      const tex = new THREE.CanvasTexture(c);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      s.scale.set(2.4, 0.6, 1);
      s.renderOrder = 10;
      return s;
    };
    const ents = follow<z.output<typeof BodyShape>, Rec>(
      ctx.world,
      Body,
      {
        enter: (_e, b) => {
          const rec: Rec = { obj: new THREE.Group(), fig: null, kind: b.kind, sub: b.sub, lastHp: b.hp, down: false, label: null, turret: null, t: ctx.random() * 6 };
          if (b.kind === KIND_PLAYER) {
            const f = createPlayerFigure(b.color, b.sub);
            rec.fig = f; rec.obj = f.group;
            rec.label = makeLabel(b.name, b.color);
            rec.label.position.y = 2.5;
            rec.obj.add(rec.label);
          } else if (b.kind === KIND_FOE) {
            const f = createFoeFigure(b.sub);
            rec.fig = f; rec.obj = f.group;
          } else if (b.kind === KIND_CRATE) {
            const g = new THREE.Group();
            g.add(createCrateMesh(b.sub === 3 ? 2 : b.sub));
            if (b.sub === 3) {
              g.scale.setScalar(1.8);
              const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 70, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
              beam.position.y = 35; beam.scale.setScalar(1 / 1.8);
              g.add(beam);
            }
            rec.obj = g;
          } else {
            const t = createTurretMesh();
            rec.turret = t; rec.obj = t;
          }
          rec.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow === false && rec.kind !== KIND_CRATE) (o as THREE.Mesh).castShadow = true; });
          scene.add(rec.obj);
          return rec;
        },
        change: (_e, _b, rec) => rec,
        exit: (_e, rec) => {
          scene.remove(rec.obj);
          rec.fig?.dispose();
          if (rec.label) { rec.label.material.map?.dispose(); rec.label.material.dispose(); }
        },
      },
      ctx.signal,
    );

    // Objective beacon
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 90, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: "#46e0ff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beacon.position.y = 45;
    beacon.visible = false;
    scene.add(beacon);

    // HUD
    const hud = createHud(ctx.element, store, sim.actions, ctx.signal);
    const mmc = hud.canvas.getContext("2d")!;
    let mmT = 0;
    const mmPts: { x: number; z: number; c: string; r: number }[] = [];

    // Environment
    const skyDay = new THREE.Color(), skyNight = new THREE.Color("#070b18"), skyNow = new THREE.Color();
    const SKY = ["#a8cdf0", "#7f9a80", "#b7c9d6", "#f0c394"];
    const nightFactor = (frac: number) => (frac < 0.55 ? 0 : frac < 0.65 ? (frac - 0.55) / 0.1 : frac < 0.92 ? 1 : 1 - (frac - 0.92) / 0.08);
    let clock = 0;
    let prevMenu: string | null = null;

    ctx.signal.addEventListener("abort", () => {
      scenery?.dispose();
      pGeo.dispose(); tracerGeo.dispose(); tracerMat.dispose(); flashMat.dispose();
      Object.values(pMats).forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    }, { once: true });

    let pw = -1, ph = -1, pr = 0;
    return {
      render(frame) {
        const dt = Math.min(frame.dt, 0.1);
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        if (ratio !== pr) { renderer.setPixelRatio(ratio); pr = ratio; pw = -1; }
        const { clientWidth: w, clientHeight: h } = ctx.element;
        if (w !== pw || h !== ph) { renderer.setSize(w, h, false); view.aspect = w / Math.max(h, 1); view.updateProjectionMatrix(); pw = w; ph = h; }
        const st = store.st;
        const region = st?.region ?? 0;
        if (region !== sceneryRegion) setRegion(region);
        if (st) clock = Math.abs(st.time - clock) > 2 ? st.time : clock + dt;
        if (store.menu && !prevMenu && document.pointerLockElement) document.exitPointerLock();
        prevMenu = store.menu;

        // time of day
        const frac = (clock % DAY_LENGTH) / DAY_LENGTH;
        const night = nightFactor(frac);
        skyDay.set(SKY[region]!);
        skyNow.copy(skyDay).lerp(skyNight, night);
        scene.background = skyNow;
        const fogNear = region === 1 ? 10 : 25, fogFar = (region === 1 ? 95 : 180) * (1 - night * 0.35);
        scene.fog = new THREE.Fog(skyNow.clone().lerp(new THREE.Color(region === 1 ? "#5d7a5a" : "#7c8794"), (1 - night) * 0.35), fogNear, fogFar);
        hemi.intensity = 1.25 - night * 0.95;
        const ang = clamp(frac / 0.62, 0, 1) * Math.PI;
        sun.intensity = (1 - night) * 2.6 + night * 0.35;
        sun.color.set(night > 0.5 ? "#8fa8ff" : region === 3 ? "#ffd2a0" : "#fff0d0");
        scenery?.update(dt, night);

        const L = sim.getLayout(region);
        // entities
        mmPts.length = 0;
        let boss: { name: string; hp: number; max: number } | null = null;
        for (const e of ctx.world.query(Body)) {
          const rec = ents.get(e);
          if (!rec) continue;
          const b = e.get(Body)!;
          const own = replica.owns(e);
          let p: P;
          if (own) p = { x: store.local.x, z: store.local.z, heading: store.yaw, speed: store.local.speed, aim: sim.aiming() };
          else if (b.kind === KIND_PLAYER && e.has(Pose)) p = replica.display(e, "pose");
          else if (e.has(Mover)) p = replica.display(e, "mover");
          else continue;
          rec.obj.position.set(p.x, 0, p.z);
          if (b.kind === KIND_CRATE) {
            rec.t += dt;
            rec.obj.position.y = Math.sin(rec.t * 2) * 0.08 + (b.sub === 3 ? 0.1 : 0);
            rec.obj.rotation.y += dt * 0.5;
            mmPts.push({ x: p.x, z: p.z, c: b.sub === 3 ? "#ffd24a" : "#9ad06a", r: b.sub === 3 ? 4 : 2.5 });
          } else if (b.kind === KIND_TURRET) {
            rec.turret?.aim(p.heading);
            mmPts.push({ x: p.x, z: p.z, c: "#46e0ff", r: 3 });
          } else if (rec.fig) {
            rec.obj.rotation.y = p.heading;
            const dying = b.state === 2;
            if (rec.down !== dying) { rec.down = dying; (rec.fig as Figure).setDown(dying); }
            if (b.hp < rec.lastHp - 0.1) rec.fig.flash();
            rec.lastHp = b.hp;
            rec.fig.update(dt, p.speed, b.kind === KIND_FOE ? b.state === 1 : false, b.kind === KIND_PLAYER && p.aim);
            if (rec.label) rec.label.visible = !own;
            if (b.kind === KIND_FOE) {
              mmPts.push({ x: p.x, z: p.z, c: b.sub === 6 ? "#ff3030" : "#d04a3a", r: b.sub === 6 ? 5 : 2.5 });
              if (b.sub === 6 && Math.hypot(p.x - store.local.x, p.z - store.local.z) < 90) boss = { name: REGIONS[region]!.bossName, hp: b.hp, max: b.maxHp };
            } else if (!own) mmPts.push({ x: p.x, z: p.z, c: "#5aa0ff", r: 3.5 });
          }
        }
        store.bossBar = boss;

        // objective beacon
        const obj = objective(st);
        if (obj.target) { beacon.visible = true; beacon.position.x = obj.target.x; beacon.position.z = obj.target.z; beacon.scale.set(Math.max(1, ((obj.target as { r?: number }).r ?? 6) / 6), 1, Math.max(1, ((obj.target as { r?: number }).r ?? 6) / 6)); }
        else beacon.visible = false;

        // fx
        for (const f of store.fx.splice(0)) {
          if (f.t === "shot") {
            const v = vol(f.x, f.z);
            const a = new THREE.Vector3(f.x, f.y, f.z), b = new THREE.Vector3(f.tx, f.ty, f.tz);
            const len = a.distanceTo(b);
            const m = new THREE.Mesh(tracerGeo, tracerMat);
            m.position.copy(a).lerp(b, 0.5); m.scale.set(1, 1, Math.max(0.1, len)); m.lookAt(b);
            scene.add(m); tracers.push({ m, life: 0.06 });
            const fm = new THREE.Mesh(pGeo, flashMat);
            fm.scale.setScalar(2.6); fm.position.copy(a);
            scene.add(fm); flashes.push({ m: fm, life: 0.05 });
            burst(f.tx, f.ty, f.tz, "spark", 2, 3);
            if (f.w === 0) { noise(0.25 * v, 0.2, 1800); tone(0.12 * v, 300, 80, 0.1, "square"); }
            else if (f.w === 1) noise(0.5 * v, 0.35, 1400);
            else if (f.w === 2) noise(0.3 * v, 0.14, 2600);
            else if (f.w === 3) noise(0.22 * v, 0.2, 2200);
            else tone(0.16 * v, 500, 140, 0.18, "sawtooth");
          } else if (f.t === "hit") {
            burst(f.x, f.y, f.z, "blood", f.crit ? 8 : 4, 4);
            if (Math.hypot(f.x - store.local.x, f.z - store.local.z) < 60) store.hitMarker = 0.15;
            tone(0.12 * vol(f.x, f.z), f.crit ? 900 : 500, 200, 0.08, "triangle");
          } else if (f.t === "died") {
            burst(f.x, f.y, f.z, f.kind === 3 || f.kind === 4 ? "goo" : "blood", f.kind === 6 ? 40 : 14, f.kind === 6 ? 8 : 5);
            noise(0.35 * vol(f.x, f.z), f.kind === 6 ? 1.0 : 0.3, f.kind === 6 ? 300 : 700);
          } else if (f.t === "crate") {
            burst(f.x, 0.8, f.z, "gold", 14, 4);
            tone(0.16, 600, 1200, 0.18, "triangle");
          } else if (f.t === "hurt") {
            if (Math.hypot(f.x - store.local.x, f.z - store.local.z) < 1.5) { store.hurtFlash = 1; noise(0.4, 0.2, 500); }
          }
        }
        for (let i = tracers.length - 1; i >= 0; i--) { tracers[i]!.life -= dt; if (tracers[i]!.life <= 0) { scene.remove(tracers[i]!.m); tracers.splice(i, 1); } }
        for (let i = flashes.length - 1; i >= 0; i--) { flashes[i]!.life -= dt; if (flashes[i]!.life <= 0) { scene.remove(flashes[i]!.m); flashes.splice(i, 1); } }
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i]!;
          q.life -= dt; q.v.y -= 14 * dt;
          q.m.position.addScaledVector(q.v, dt);
          if (q.m.position.y < 0.05) { q.m.position.y = 0.05; q.v.multiplyScalar(0.3); }
          if (q.life <= 0) { scene.remove(q.m); parts.splice(i, 1); }
        }

        ents.update();

        // camera
        const c = sim.camera();
        view.position.set(c.pos.x, c.pos.y, c.pos.z);
        view.lookAt(c.pos.x + c.dir.x * 20, c.pos.y + c.dir.y * 20, c.pos.z + c.dir.z * 20);
        sun.position.set(store.local.x + Math.cos(ang) * -50, 20 + Math.sin(ang) * 60, store.local.z + 25);
        sun.target.position.set(store.local.x, 0, store.local.z);
        renderer.render(scene, view);

        hud.update(dt);
        mmT -= dt;
        if (mmT <= 0) {
          mmT = 0.1;
          const S = 300, k = S / 180, ox = S / 2, oz = S / 2;
          mmc.clearRect(0, 0, S, S);
          mmc.fillStyle = "rgba(120,130,140,.55)";
          for (const bx of L.boxes) mmc.fillRect(ox + (bx.x - bx.w / 2) * k, oz + (bx.z - bx.d / 2) * k, bx.w * k, bx.d * k);
          mmc.fillStyle = "rgba(60,150,200,.35)";
          for (const wt of L.water) { mmc.beginPath(); mmc.arc(ox + wt.x * k, oz + wt.z * k, wt.r * k, 0, 7); mmc.fill(); }
          for (const q of mmPts) { mmc.fillStyle = q.c; mmc.beginPath(); mmc.arc(ox + q.x * k, oz + q.z * k, q.r, 0, 7); mmc.fill(); }
          if (obj.target) { mmc.strokeStyle = "#46e0ff"; mmc.lineWidth = 2; mmc.beginPath(); mmc.arc(ox + obj.target.x * k, oz + obj.target.z * k, 8, 0, 7); mmc.stroke(); }
          mmc.save();
          mmc.translate(ox + store.local.x * k, oz + store.local.z * k);
          mmc.rotate(-store.yaw + Math.PI);
          mmc.fillStyle = "#fff"; mmc.beginPath(); mmc.moveTo(0, -8); mmc.lineTo(5, 6); mmc.lineTo(-5, 6); mmc.closePath(); mmc.fill();
          mmc.restore();
        }
        void FOES;
      },
    };
  },
});
