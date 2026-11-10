import { bus } from "./shim-core.ts";
type Ent = { get(t: unknown): unknown };
type Repl = { traits: Record<string, { trait: unknown }> };
/** Solo: server and client share one world, so "replication" is just reading the entity's own traits. */
export function replicateClient(_ctx: unknown, repl: Repl, _opts?: unknown) {
  const read = (e: Ent, key: string) => e.get(repl.traits[key]!.trait);
  return {
    apply: () => {},
    publish: () => {},
    owns: (e: unknown) => e === bus.owned,
    entity: () => undefined,
    current: read,
    display: read,
    drawnTick: () => bus.tick, displayTick: () => bus.tick,
    valueAt: read,
    history: () => [],
    onChange: () => {},
    on: (ev: string, h: (d: unknown, t: number) => void) => { (bus.events.get(ev) ?? bus.events.set(ev, []).get(ev)!).push(h); },
  };
}
