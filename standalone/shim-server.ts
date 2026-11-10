import { bus, platform, world, TICK_RATE } from "./shim-core.ts";
export function defineServer(_game: unknown, setup: (ctx: unknown) => void) { return { setup }; }
export function startServer(def: { setup: (ctx: unknown) => void }) {
  const ctx = {
    world, platform, seed: (Date.now() & 0xffffffff) >>> 0, tickRate: TICK_RATE,
    get tick() { return bus.tick; },
    dt: 1 / TICK_RATE,
    players: new Map([[bus.player.id, bus.player]]),
    onStep: (h: () => void) => bus.stepHandlers.push(h),
    onPlayerJoin: (h: (p: unknown) => void) => bus.joinHandlers.push(h),
    onPlayerLeave: (h: (p: unknown) => unknown) => bus.leaveHandlers.push(h),
    onPlayerConnection: () => {},
    onMessage: (m: unknown, h: (p: unknown, d: unknown) => void) => bus.toServer.set(m, h),
    send: (_p: unknown, m: unknown, d: unknown) => bus.toClient.get(m)?.(d),
    broadcast: (m: unknown, d: unknown) => bus.toClient.get(m)?.(d),
    isConnected: () => true,
    disconnect: () => {},
  };
  def.setup(ctx);
  for (const h of bus.joinHandlers) h(bus.player);
}
