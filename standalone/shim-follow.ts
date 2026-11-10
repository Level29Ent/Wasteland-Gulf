import type { Entity, World } from "koota";

/** Calls enter/change/exit as entities gain, change, or lose `trait`. Nothing runs until update(). */
export function follow<T, R>(
  world: World,
  trait: any,
  h: { enter(e: Entity, v: T): R; change(e: Entity, v: T, prev: R): R; exit(e: Entity, prev: R): void },
  signal: AbortSignal,
) {
  const recs = new Map<Entity, R>();
  const update = () => {
    const live = new Set<Entity>(world.query(trait));
    for (const e of live) {
      const v = e.get(trait) as T;
      if (!recs.has(e)) recs.set(e, h.enter(e, v));
      else recs.set(e, h.change(e, v, recs.get(e) as R));
    }
    for (const [e, r] of [...recs]) if (!live.has(e)) { h.exit(e, r); recs.delete(e); }
  };
  signal.addEventListener("abort", () => { for (const [e, r] of recs) h.exit(e, r); recs.clear(); });
  return { update, get: (e: Entity) => recs.get(e) };
}
