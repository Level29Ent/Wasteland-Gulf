/** Local stand-ins for the engine's core and replication definitions (traits, protocols, game). */
import { trait } from "koota";

export type UserId = string;
export const UserId = undefined; // server.ts imports it only as a type

type Shape = Record<string, { def: { type: string } }>;
export function defineTrait(_name: string, schema: { shape: Shape }) {
  const defaults: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema.shape)) {
    const t = v.def.type;
    defaults[k] = t === "number" ? 0 : t === "boolean" ? false : "";
  }
  return trait(defaults as never) as any;
}

/** Each message type is a unique object; the server and client look handlers up by that identity. */
export function defineProtocol(name: string, def: { toServer: Record<string, unknown>; toClient: Record<string, unknown> }) {
  const make = (dir: string, src: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(src).map((k) => [k, { id: `${name}.${dir}.${k}` }]));
  return { toServer: make("toServer", def.toServer), toClient: make("toClient", def.toClient) } as any;
}

export function defineGame<T>(def: T): T { return def; }

export function defineReplication(_name: string, traits: Record<string, { trait: unknown }>, events: Record<string, unknown>) {
  return { protocol: {}, traits, events } as any;
}
export function replicated(t: unknown, opts?: unknown) { return { trait: t, opts }; }
