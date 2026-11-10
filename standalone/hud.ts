import type { z } from "zod";
import {
  ACHIEVEMENTS, CHALLENGES, DAILY_REWARDS, DAY_LENGTH, JOBS, MISSIONS, RECIPES, REGIONS, WEAPONS, challengesForDay, isNight, xpNeed,
  type Pt,
} from "./data.ts";
import type { StateMsg } from "./game.ts";

export type FxItem =
  | { t: "shot"; x: number; y: number; z: number; tx: number; ty: number; tz: number; w: number }
  | { t: "hit"; x: number; y: number; z: number; n: number; crit: boolean }
  | { t: "died"; x: number; y: number; z: number; kind: number }
  | { t: "crate"; x: number; z: number }
  | { t: "hurt"; x: number; y: number; z: number };

export type Store = {
  st: z.output<typeof StateMsg> | null;
  menu: string | null;
  toasts: { text: string; age: number }[];
  fx: FxItem[];
  local: { x: number; z: number; heading: number; speed: number };
  yaw: number;
  pitch: number;
  hitMarker: number;
  hurtFlash: number;
  lastTp: number;
  bossBar: { name: string; hp: number; max: number } | null;
};
export type Actions = {
  travel(r: number): void;
  craft(id: string): void;
  job(id: string): void;
  daily(): void;
  close(): void;
  open(tab: string): void;
};

export type Objective = { text: string; target: Pt | null };
export function objective(st: Store["st"]): Objective {
  if (!st) return { text: "", target: null };
  const r = st.region;
  const j = st.profile.job && JOBS.find((x) => x.id === st.profile.job!.id);
  if (j && j.region === r) {
    return { text: `Job: ${j.title} (${st.profile.job!.have}/${j.need})`, target: j.kind === "rescue" ? (j.target ?? null) : null };
  }
  const stage = MISSIONS[r]![st.profile.main[r] ?? 0];
  if (!stage) return { text: `${REGIONS[r]!.name} story complete. Hunt for loot and rank up!`, target: null };
  const prog = st.profile.mainProg[r] ?? 0;
  const count = stage.n > 1 ? ` (${prog}/${stage.n})` : "";
  const target = stage.kind === "boss" ? REGIONS[r]!.boss : (stage.target ?? null);
  return { text: `${stage.title}: ${stage.desc}${count}`, target };
}

const css = `
.gw{position:absolute;inset:0;pointer-events:none;font:600 13px system-ui,sans-serif;color:#f3efe6;text-shadow:0 1px 3px #000}
.gw *{box-sizing:border-box}
.gw .panel{background:rgba(12,14,16,.62);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 10px}
.gw .bar{height:10px;border-radius:5px;background:rgba(0,0,0,.55);overflow:hidden;margin:3px 0}
.gw .bar i{display:block;height:100%}
.gw .tl{position:absolute;left:14px;top:12px;width:240px}
.gw .bl{position:absolute;left:14px;bottom:14px}
.gw .tc{position:absolute;left:50%;top:12px;transform:translateX(-50%);text-align:center;max-width:460px}
.gw .tr{position:absolute;right:14px;top:12px;text-align:right}
.gw .br{position:absolute;right:14px;bottom:14px;text-align:right;font-weight:500;opacity:.8;font-size:12px;line-height:1.5}
.gw .cross{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid rgba(255,255,255,.75);border-radius:50%}
.gw .cross:after{content:"";position:absolute;left:8px;top:8px;width:2px;height:2px;background:#fff}
.gw .toasts{position:absolute;left:50%;top:22%;transform:translateX(-50%);text-align:center;font-size:15px}
.gw .toast{margin:4px 0;padding:6px 12px;background:rgba(12,14,16,.7);border-radius:6px;border-left:3px solid #f2b84b}
.gw .boss{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);width:420px;text-align:center}
.gw .menu{position:absolute;inset:0;background:rgba(5,7,9,.82);pointer-events:auto;display:flex;align-items:center;justify-content:center}
.gw .sheet{width:min(940px,94%);max-height:88%;overflow:auto;background:#14181c;border:1px solid #3a444d;border-radius:12px;padding:16px 20px}
.gw h2{margin:0 0 10px;font-size:20px;letter-spacing:.04em}
.gw .tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.gw button{pointer-events:auto;cursor:pointer;font:inherit;color:#f3efe6;background:#2a3238;border:1px solid #46525c;border-radius:6px;padding:6px 12px}
.gw button:hover:not(:disabled){background:#3a464f}
.gw button.on{background:#b5651d;border-color:#e08a3c}
.gw button:disabled{opacity:.4;cursor:default}
.gw .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.gw .card{background:#1d2328;border:1px solid #3a444d;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;font-weight:500}
.gw .card b{font-size:15px}
.gw .row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #2a3238;font-weight:500}
.gw .dim{opacity:.6}.gw .ok{color:#7fd67f}
.gw .dead{position:absolute;inset:0;background:radial-gradient(transparent,rgba(120,0,0,.55));display:flex;align-items:center;justify-content:center;font-size:34px;letter-spacing:.1em}
.gw .hurt{position:absolute;inset:0;box-shadow:inset 0 0 120px rgba(200,0,0,.8);opacity:0}
.gw canvas.mm{width:150px;height:150px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(10,12,14,.55);display:block;margin-left:auto}
.gw .hint{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font-weight:500;opacity:.75;font-size:12px}
`;

const bar = (v: number, max: number, color: string) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%;background:${color}"></i></div>`;
const esc = (s: string) => s.replace(/[<>&]/g, "");

export function createHud(root: HTMLElement, store: Store, act: Actions, signal: AbortSignal) {
  const style = document.createElement("style");
  style.textContent = css;
  const el = document.createElement("div");
  el.className = "gw";
  el.innerHTML = `
  <div class="tl panel"><div id="lv"></div><div id="xpb"></div><div id="hpb"></div><div id="hu"></div></div>
  <div class="tc panel" id="obj"></div>
  <div class="tr"><canvas class="mm" width="300" height="300"></canvas><div id="clock" style="margin-top:4px"></div></div>
  <div class="bl panel" id="inv"></div>
  <div class="br" id="help">WASD move · Shift sprint · Mouse aim · Click fire · V machete<br>E loot · H medkit · F eat · G drink · B turret · 1-3 weapon · M menu</div>
  <div class="cross" id="cross"></div>
  <div class="toasts" id="toasts"></div>
  <div class="boss panel" id="boss" style="display:none"></div>
  <div class="hurt" id="hurt"></div>
  <div class="dead" id="dead" style="display:none"></div>
  <div class="menu" id="menu" style="display:none"></div>
  <div class="hint" id="hint"></div>`;
  root.append(style, el);
  signal.addEventListener("abort", () => { style.remove(); el.remove(); }, { once: true });
  for (const ev of ["pointerdown", "mousedown", "mouseup", "click", "wheel"] as const) {
    el.querySelector("#menu")!.addEventListener(ev, (e) => e.stopPropagation());
  }
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>("#" + id)!;
  const mm = el.querySelector<HTMLCanvasElement>("canvas.mm")!;
  const menu = $("menu");
  menu.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.tab) act.open(d.tab);
    else if (d.travel) act.travel(+d.travel);
    else if (d.craft) act.craft(d.craft);
    else if (d.job !== undefined) act.job(d.job);
    else if (d.daily) act.daily();
    else if (d.close) act.close();
  });
  let menuKey = "";
  let slow = 0;
  const TABS: [string, string][] = [["regions", "Hub map"], ["missions", "Missions"], ["jobs", "Side jobs"], ["craft", "Craft"], ["challenges", "Challenges"], ["achievements", "Achievements"], ["daily", "Daily reward"]];

  const menuHtml = (st: NonNullable<Store["st"]>, tab: string) => {
    const pr = st.profile;
    let h = `<div class="sheet"><div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${n}${k === "daily" && st.canClaim ? " ●" : ""}</button>`).join("")}<span style="flex:1"></span><button data-close="1">Close (M)</button></div>`;
    if (tab === "regions") {
      h += `<h2>Choose a region</h2><div class="grid">` + REGIONS.map((r) => {
        const locked = pr.level < r.minLevel;
        const stage = pr.main[r.id] ?? 0;
        const done = stage >= MISSIONS[r.id]!.length;
        return `<div class="card"><b>${r.name}</b><span class="dim">${r.tagline}</span><span>Story: ${done ? "<span class='ok'>complete</span>" : `stage ${stage + 1}/${MISSIONS[r.id]!.length}`}</span><span>Landmarks: ${r.landmarks.map((l) => l.name).join(", ")}</span><span>Boss: ${r.bossName}</span><button data-travel="${r.id}" ${locked ? "disabled" : ""}>${locked ? `Requires level ${r.minLevel}` : st.region === r.id ? "Respawn here" : "Travel"}</button></div>`;
      }).join("") + `</div><p class="dim">Everyone in a region shares one persistent world: team up on bosses, race for crates and airdrops. Playing alone works too.</p>`;
    } else if (tab === "missions") {
      h += `<h2>${REGIONS[st.region]!.name} story</h2>` + MISSIONS[st.region]!.map((m, i) => {
        const cur = pr.main[st.region] ?? 0;
        const state = i < cur ? "<span class='ok'>done</span>" : i === cur ? `${m.n > 1 ? `${pr.mainProg[st.region] ?? 0}/${m.n}` : "active"}` : "<span class='dim'>locked</span>";
        return `<div class="row"><div><b>${m.title}</b><br><span class="dim">${m.desc}</span></div><div>${state}<br><span class="dim">+${m.xp} XP, +${m.scrap} scrap</span></div></div>`;
      }).join("");
    } else if (tab === "jobs") {
      h += `<h2>Side jobs in ${REGIONS[st.region]!.name}</h2>` + JOBS.filter((j) => j.region === st.region).map((j) => {
        const active = pr.job?.id === j.id;
        return `<div class="row"><div><b>${j.title}</b><br><span class="dim">${j.desc} Reward: ${j.xp} XP, ${j.scrap} scrap, ${j.ammo} rounds</span></div><div>${active ? `${pr.job!.have}/${j.need} <button data-job="">Abandon</button>` : `<button data-job="${j.id}">Accept</button>`}</div></div>`;
      }).join("") + `<p class="dim">One job at a time. Rescue jobs show a marker on your minimap.</p>`;
    } else if (tab === "craft") {
      h += `<h2>Workbench</h2><p>Scrap ${pr.scrap} · Rounds ${pr.ammo}</p>` + RECIPES.map((r) => {
        const can = pr.scrap >= r.cost.scrap && pr.ammo >= (r.cost.ammo ?? 0);
        return `<div class="row"><div><b>${r.name}</b><br><span class="dim">${r.desc}</span></div><button data-craft="${r.id}" ${can ? "" : "disabled"}>Craft</button></div>`;
      }).join("");
    } else if (tab === "challenges") {
      h += `<h2>Daily challenges</h2>` + challengesForDay(st.today).map((ci, i) => {
        const c = CHALLENGES[ci]!;
        const done = pr.chDone.includes(i);
        return `<div class="row"><div><b>${c.text}</b><br><span class="dim">+${c.xp} XP, +${c.scrap} scrap</span></div><div>${done ? "<span class='ok'>done</span>" : `${pr.chProg[i] ?? 0}/${c.need}`}</div></div>`;
      }).join("") + `<p class="dim">New challenges every day.</p>`;
    } else if (tab === "achievements") {
      h += `<h2>Achievements ${pr.achievements.length}/${ACHIEVEMENTS.length}</h2>` + ACHIEVEMENTS.map((a) => {
        const got = pr.achievements.includes(a.id);
        return `<div class="row"><div><b class="${got ? "ok" : "dim"}">${a.name}</b><br><span class="dim">${a.desc}</span></div><div>${got ? "<span class='ok'>✔</span>" : ""}</div></div>`;
      }).join("");
    } else if (tab === "daily") {
      h += `<h2>Daily login rewards · streak ${pr.daily.streak}</h2>` + DAILY_REWARDS.map((r, i) => {
        const next = st.canClaim ? (pr.daily.last === st.today - 1 ? pr.daily.streak : 0) % DAILY_REWARDS.length : -1;
        return `<div class="row"><div><b>Day ${i + 1}</b> <span class="dim">${r.label}</span></div><div>${i === next ? "<span class='ok'>next</span>" : ""}</div></div>`;
      }).join("") + `<p><button data-daily="1" ${st.canClaim ? "" : "disabled"}>${st.canClaim ? "Claim today's reward" : "Come back tomorrow"}</button></p>`;
    }
    return h + "</div>";
  };

  return {
    canvas: mm,
    update(dt: number) {
      const st = store.st;
      $("hurt").style.opacity = String(Math.min(1, store.hurtFlash));
      store.hurtFlash = Math.max(0, store.hurtFlash - dt * 2);
      $("cross").style.opacity = store.menu || st?.down ? "0" : "1";
      $("cross").style.borderColor = store.hitMarker > 0 ? "#ff5a4a" : "rgba(255,255,255,.75)";
      store.hitMarker = Math.max(0, store.hitMarker - dt);
      for (const t of store.toasts) t.age += dt;
      store.toasts = store.toasts.filter((t) => t.age < 5);
      slow -= dt;
      if (!st) { $("hint").textContent = "Connecting..."; return; }
      if (slow <= 0) {
        slow = 0.12;
        const pr = st.profile;
        $("lv").innerHTML = `Level ${pr.level} · <span class="dim">${pr.xp}/${xpNeed(pr.level)} XP</span>`;
        $("xpb").innerHTML = bar(pr.xp, xpNeed(pr.level), "#7a8cff");
        $("hpb").innerHTML = `HP ${Math.ceil(st.hp)}/${st.maxHp}` + bar(st.hp, st.maxHp, st.hp < st.maxHp * 0.3 ? "#e03a2e" : "#58c25a");
        $("hu").innerHTML = `Food ${bar(st.hunger, 100, "#d9a03f")}Water ${bar(st.thirst, 100, "#4aa8e0")}`;
        const w = WEAPONS[st.weapon]!;
        $("inv").innerHTML = `<b>${w.name}</b> · ${pr.ammo} rounds<br>Scrap ${pr.scrap} · Medkits ${pr.medkits} · Rations ${pr.food} · Water ${pr.water} · Turrets ${pr.turrets}`;
        const o = objective(st);
        $("obj").innerHTML = `<b>${REGIONS[st.region]!.name}</b> · ${esc(o.text)}`;
        const dayT = (st.time % DAY_LENGTH) / DAY_LENGTH;
        const hh = Math.floor(((dayT * 24 + 6) % 24));
        $("clock").innerHTML = `${isNight(st.time) ? "🌙 Night" : "☀ Day"} ${String(hh).padStart(2, "0")}:00 · ${st.players} survivor${st.players === 1 ? "" : "s"} here`;
        const dead = $("dead");
        dead.style.display = st.down ? "flex" : "none";
        if (st.down) dead.textContent = `YOU DIED · respawning in ${Math.ceil(st.respawnIn)}`;
        $("hint").textContent = store.menu ? "" : "Click the game to aim. M opens the menu.";
        const bb = store.bossBar;
        const bossEl = $("boss");
        bossEl.style.display = bb ? "block" : "none";
        if (bb) bossEl.innerHTML = `${esc(bb.name)}${bar(bb.hp, bb.max, "#c0392b")}`;
        $("toasts").innerHTML = store.toasts.map((t) => `<div class="toast">${esc(t.text)}</div>`).join("");
        const show = store.menu !== null;
        menu.style.display = show ? "flex" : "none";
        if (show) {
          const key = store.menu + JSON.stringify(pr) + st.region + st.canClaim;
          if (key !== menuKey) { menuKey = key; menu.innerHTML = menuHtml(st, store.menu!); }
        } else menuKey = "";
      }
    },
  };
}
