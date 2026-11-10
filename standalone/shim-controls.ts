/** Keyboard + mouse controls (click the game to lock the mouse; Esc releases it). */
type Btn = { keys: readonly string[]; mouse?: number; label: string };
type Opts<B extends string> = {
  move?: { left: readonly string[]; right: readonly string[]; up?: readonly string[]; down?: readonly string[] };
  look?: true;
  buttons?: Record<B, Btn>;
};

export function createControls<B extends string = never>(o: Opts<B>) {
  const keys = new Set<string>();
  const mouse = new Set<number>();
  const latched = new Set<string>();
  const forced = new Map<string, boolean>();
  let forcedMove: { x: number; y: number } | null = null;
  let lx = 0, ly = 0;
  const btns = (o.buttons ?? {}) as Record<string, Btn>;
  const any = (list?: readonly string[]) => !!list && list.some((k) => keys.has(k));

  const held = (b: B) => {
    const d = btns[b];
    if (forced.has(b)) return forced.get(b)!;
    return !!d && (any(d.keys) || (d.mouse !== undefined && mouse.has(d.mouse) && !!document.pointerLockElement));
  };
  return {
    move() {
      if (forcedMove) return forcedMove;
      const m = o.move;
      if (!m) return { x: 0, y: 0 };
      return { x: (any(m.right) ? 1 : 0) - (any(m.left) ? 1 : 0), y: (any(m.up) ? 1 : 0) - (any(m.down) ? 1 : 0) };
    },
    look() { const r = { x: lx, y: ly }; lx = ly = 0; return r; },
    held,
    pressed(b: B) { return latched.delete(b); },
    set(s: { move?: { x: number; y: number }; held?: Partial<Record<B, boolean>> }) {
      if (s.move) forcedMove = s.move;
      for (const [k, v] of Object.entries(s.held ?? {})) {
        if (v && !forced.get(k)) latched.add(k);
        forced.set(k, !!v);
      }
    },
    attach(ctx: { element: HTMLElement; signal: AbortSignal }) {
      const { signal } = ctx;
      const press = (pred: (d: Btn) => boolean) => { for (const [n, d] of Object.entries(btns)) if (pred(d)) latched.add(n); };
      const used = new Set(Object.values(btns).flatMap((d) => d.keys).concat(o.move ? [...o.move.left, ...o.move.right, ...(o.move.up ?? []), ...(o.move.down ?? [])] : []));
      addEventListener("keydown", (e) => {
        if (used.has(e.code)) e.preventDefault();
        if (e.repeat) return;
        keys.add(e.code);
        press((d) => d.keys.includes(e.code));
      }, { signal });
      addEventListener("keyup", (e) => { keys.delete(e.code); }, { signal });
      addEventListener("blur", () => { keys.clear(); mouse.clear(); }, { signal });
      ctx.element.addEventListener("mousedown", (e) => {
        if (!document.pointerLockElement) {
          if ((e.target as HTMLElement).tagName === "CANVAS") void (e.target as HTMLElement).requestPointerLock?.();
          return;
        }
        mouse.add(e.button);
        press((d) => d.mouse === e.button);
      }, { signal });
      addEventListener("mouseup", (e) => { mouse.delete(e.button); }, { signal });
      addEventListener("mousemove", (e) => {
        if (o.look && document.pointerLockElement) { lx += e.movementX; ly += e.movementY; }
      }, { signal });
      ctx.element.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
    },
  };
}
