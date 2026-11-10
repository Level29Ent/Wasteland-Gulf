import client from "../client.ts";
import server from "../server.ts";
import { bus, TICK_RATE, world } from "./shim-core.ts";
import { startServer } from "./shim-server.ts";

const element = document.getElementById("game") as HTMLElement;
const abort = new AbortController();
const stepHandlers = bus.clientStep;

startServer(server as never);

const cctx = {
  world, playerId: bus.player.id, tickRate: TICK_RATE, signal: abort.signal, element,
  get tick() { return bus.tick; },
  clock: { gameTime: () => performance.now() },
  network: {},
  page: { touch: false, occlusions: [], visible: true, onChange: () => {}, publicUrl: "" },
  send: (m: unknown, d: unknown) => bus.toServer.get(m)?.(bus.player, d),
  onStep: (h: () => void) => stepHandlers.push(h),
  onMessage: (m: unknown, h: (d: unknown) => void) => bus.toClient.set(m, h),
  onEffect: () => {},
  random: () => Math.random(),
  requireEachStep: () => {},
};
const def = client as unknown as {
  simulate(c: unknown): unknown;
  present(c: unknown, s: unknown): { render(f: unknown): void };
};
const sim = def.simulate(cctx);
for (const h of bus.joinHandlers) h(bus.player);
const pres = def.present(cctx, sim);

const stepMs = 1000 / TICK_RATE;
let acc = 0;
let last = performance.now();
const frame = (now: number) => {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt * 1000;
  let n = 0;
  while (acc >= stepMs && n++ < 5) {
    acc -= stepMs;
    bus.tick++;
    for (const h of bus.stepHandlers) h();
    for (const h of stepHandlers) h();
  }
  if (n > 5) acc = 0;
  pres.render({ time: now, dt, tick: bus.tick, alpha: acc / stepMs });
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
addEventListener("beforeunload", () => { for (const h of bus.leaveHandlers) h(bus.player); });
