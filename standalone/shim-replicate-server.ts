import { bus } from "./shim-core.ts";
export function replicateServer() {
  return {
    replicate: (e: unknown) => e,
    setOwner: (e: unknown) => { bus.owned = e; },
    entity: () => undefined,
    publish: () => {},
    emit: (ev: string, data: unknown) => { for (const h of bus.events.get(ev) ?? []) h(data, bus.tick); },
  };
}
