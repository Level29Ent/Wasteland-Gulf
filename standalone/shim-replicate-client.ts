  import { bus } from "./shim-core.ts";
type Ent = { get(t: unknown): unknown };
export function replicateClient(_ctx: unknown, repl: { traits?: Record<string, { trait?: unknown }> } & Record<string, unknown>) {
  return {
    apply: () => {},
    publish: () => {},
    owns: (e: unknown) => e === bus.owned,
    entity: () => undefined,
    current: (e: Ent, key: string) => e.get(traitFor(repl, key)),
    display: (e: Ent, key: string) => e.get(traitFor(repl, key)),
    drawnTick: () => bus.tick, displayTick: () => bus.tick,
    valueAt: (e: Ent, key: string) => e.get(traitFor(repl, key)),
    history: () => [],
    onChange: () => {},
    on: (ev: string, h: (d: unknown, t: number) => void) => { (bus.events.get(ev) ?? bus.events.set(ev, []).get(ev)!).push(h); },
  };
}
// The game's Sync object declares traits as `replicated(Trait, ...)`; we find the trait by key from a registry the entry file fills.
export const registry: Record<string, unknown> = {};
function traitFor(_r: unknown, key: string) { return registry[key]; }
