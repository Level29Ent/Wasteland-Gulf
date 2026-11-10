/** In-page stand-ins for the Wildwood server/client runtime so the same game code runs solo with no server. */
import { createWorld } from "koota";

export const world = createWorld();
export const bus = {
  stepHandlers: [] as Array<() => void>,
  clientStep: [] as Array<() => void>,
  toServer: new Map<unknown, (player: unknown, d: unknown) => void>(),
  toClient: new Map<unknown, (d: unknown) => void>(),
  events: new Map<string, Array<(d: unknown, t: number) => void>>(),
  joinHandlers: [] as Array<(p: unknown) => void>,
  leaveHandlers: [] as Array<(p: unknown) => unknown>,
  tick: 0,
  owned: null as unknown,
  player: { id: "local-player", userId: "local-user" },
};
export const TICK_RATE = 30;

const PREFIX = "wasteland-gulf:";
const store = (key: string) => ({
  async read() { const s = localStorage.getItem(PREFIX + key); return s ? JSON.parse(s) : {}; },
  async write(d: unknown) { localStorage.setItem(PREFIX + key, JSON.stringify(d)); },
  async update(f: (d: unknown) => unknown) { const n = f(await this.read()); await this.write(n); return n; },
});
export const platform = { data: { user: (id: string) => store("user:" + id), game: store("game"), server: store("server") } };
